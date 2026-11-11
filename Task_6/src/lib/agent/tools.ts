import { z } from "zod";
import type { MedrellaRepository, PatientEntity } from "@/db/repo";
import { MAX_BOOKING_DAYS_AHEAD, checkRequestedSlot } from "../booking-rules";
import { istDateString } from "../engagement";
import { formatPaise, rupeesToPaise } from "../payments";
import type { LlmTool } from "./llm";

/** What the chat UI renders under an assistant message. Cards never perform actions on their own. */
export interface AgentCard {
  kind: "BOOKING" | "MANAGE";
  title: string;
  lines: string[];
  /** In-app link the patient opens to continue. */
  href?: string;
}

export interface ToolContext {
  repo: MedrellaRepository;
  userId: string;
  patient: PatientEntity;
  now: Date;
}

export interface ToolOutput {
  data: unknown;
  cards?: AgentCard[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  run: (ctx: ToolContext, args: any) => Promise<ToolOutput>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, "Use YYYY-MM-DD");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

function dateProblem(date: string, now: Date): string | null {
  const today = istDateString(now);
  if (date < today) return "That date is in the past.";
  const max = istDateString(new Date(now.getTime() + MAX_BOOKING_DAYS_AHEAD * 24 * 3600 * 1000));
  if (date > max) return `Appointments can only be booked up to ${MAX_BOOKING_DAYS_AHEAD} days ahead.`;
  return null;
}

const doctorLabel = (d: { firstName: string; lastName: string }) => `Dr. ${d.firstName} ${d.lastName}`;

async function openSlots(repo: MedrellaRepository, doctorId: string, date: string) {
  const data = await repo.computeSessionGroups(doctorId, date);
  if (data.isLeave) return { onLeave: true as const, slots: [] as { startTime: string; endTime: string; session: string; seatsLeft: number }[] };
  const slots = data.groups.flatMap((g) =>
    g.slots
      .filter((s) => !s.isBooked && s.seatsLeft > 0)
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime, session: g.sessionName, seatsLeft: s.seatsLeft }))
  );
  return { onLeave: false as const, slots };
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "search_doctors",
    description:
      "Find doctors at the hospital. Filter by specialty (for example Cardiology) and/or part of the doctor's name. Returns up to 8 doctors with id, specialization and consultation fee.",
    parameters: {
      type: "object",
      properties: {
        specialty: { type: "string", description: "Specialty such as Cardiology, Dermatology, Pediatrics" },
        name: { type: "string", description: "Part of the doctor's name" },
      },
    },
    schema: z.object({ specialty: z.string().max(60).optional(), name: z.string().max(60).optional() }),
    async run(ctx, args: { specialty?: string; name?: string }) {
      const all = await ctx.repo.getAllDoctors();
      const specialty = args.specialty?.trim().toLowerCase();
      const name = args.name?.trim().toLowerCase();
      const matches = all
        .filter((d) => !specialty || d.specialization.toLowerCase().includes(specialty))
        .filter((d) => !name || `${d.firstName} ${d.lastName}`.toLowerCase().includes(name))
        .slice(0, 8)
        .map((d) => ({
          doctorId: d.id,
          name: doctorLabel(d),
          specialization: d.specialization,
          consultationFee: formatPaise(rupeesToPaise(d.consultationFee)),
          experienceYears: d.experienceYears,
        }));
      return { data: { count: matches.length, doctors: matches } };
    },
  },
  {
    name: "get_open_slots",
    description: "List open appointment slots for one doctor on one date (YYYY-MM-DD). Returns at most 12 slots.",
    parameters: {
      type: "object",
      properties: {
        doctorId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["doctorId", "date"],
    },
    schema: z.object({ doctorId: z.string().min(1).max(80), date: dateField }),
    async run(ctx, args: { doctorId: string; date: string }) {
      const problem = dateProblem(args.date, ctx.now);
      if (problem) return { data: { error: problem } };
      const doctor = await ctx.repo.getDoctorById(args.doctorId);
      if (!doctor) return { data: { error: "Doctor not found." } };
      const { onLeave, slots } = await openSlots(ctx.repo, doctor.id, args.date);
      if (onLeave) return { data: { doctor: doctorLabel(doctor), date: args.date, note: "The doctor is on leave that day.", slots: [] } };
      const today = istDateString(ctx.now);
      const nowMinutes = Math.floor(((ctx.now.getTime() / 60000) + 330) % 1440);
      const future = slots.filter((s) => {
        if (args.date !== today) return true;
        const [h, m] = s.startTime.split(":").map(Number);
        return h * 60 + m > nowMinutes + 15;
      });
      return {
        data: {
          doctor: doctorLabel(doctor),
          date: args.date,
          totalOpen: future.length,
          slots: future.slice(0, 12),
        },
      };
    },
  },
  {
    name: "list_my_appointments",
    description: "List the signed-in patient's recent and upcoming appointments (at most 8).",
    parameters: { type: "object", properties: {} },
    schema: z.object({}),
    async run(ctx) {
      const all = await ctx.repo.getAppointmentsByPatientId(ctx.patient.id);
      const rows = all
        .filter((a) => a.status !== "EXPIRED")
        .sort((a, b) => (b.appointmentDate + b.startTime).localeCompare(a.appointmentDate + a.startTime))
        .slice(0, 8)
        .map((a) => ({
          appointmentId: a.id,
          doctor: doctorLabel(a.doctor),
          date: a.appointmentDate,
          startTime: a.startTime,
          status: a.status,
        }));
      return { data: { count: rows.length, appointments: rows } };
    },
  },
  {
    name: "propose_booking",
    description:
      "Prepare a booking for the patient. Use it only after you have found the doctor and an open slot. It does NOT book anything: it gives the patient a link to review the slot and pay.",
    parameters: {
      type: "object",
      properties: {
        doctorId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:mm, one of the open slot start times" },
      },
      required: ["doctorId", "date", "startTime"],
    },
    schema: z.object({ doctorId: z.string().min(1).max(80), date: dateField, startTime: timeField }),
    async run(ctx, args: { doctorId: string; date: string; startTime: string }) {
      const problem = dateProblem(args.date, ctx.now);
      if (problem) return { data: { error: problem } };
      const check = await checkRequestedSlot(args.doctorId, args.date, args.startTime, ctx.now);
      if (!check.ok) return { data: { error: check.error } };
      const { slots } = await openSlots(ctx.repo, args.doctorId, args.date);
      if (!slots.some((s) => s.startTime === args.startTime)) {
        return { data: { error: "That slot is no longer open. Ask for the open slots again." } };
      }
      const fee = formatPaise(rupeesToPaise(check.doctor.consultationFee));
      const href = `/doctors/${check.doctor.id}?date=${args.date}&slot=${args.startTime}`;
      return {
        data: { prepared: true, doctor: doctorLabel(check.doctor), date: args.date, startTime: args.startTime, fee },
        cards: [
          {
            kind: "BOOKING",
            title: `${doctorLabel(check.doctor)} · ${check.doctor.specialization}`,
            lines: [`${args.date} at ${args.startTime}`, `Consultation fee: ${fee}`, "Review and pay on the booking page to confirm."],
            href,
          },
        ],
      };
    },
  },
  {
    name: "propose_manage_appointment",
    description:
      "Help the patient reschedule or cancel one of their upcoming appointments. It does NOT change anything: it points the patient to their dashboard, where the refund amount is shown before they confirm.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        action: { type: "string", enum: ["reschedule", "cancel"] },
      },
      required: ["appointmentId", "action"],
    },
    schema: z.object({ appointmentId: z.string().min(1).max(80), action: z.enum(["reschedule", "cancel"]) }),
    async run(ctx, args: { appointmentId: string; action: "reschedule" | "cancel" }) {
      const appointment = await ctx.repo.getAppointmentById(args.appointmentId);
      if (!appointment || appointment.patientId !== ctx.patient.id) return { data: { error: "Appointment not found." } };
      if (appointment.status !== "BOOKED") return { data: { error: `This appointment is ${appointment.status.toLowerCase()}, so it cannot be changed.` } };
      const doctor = await ctx.repo.getDoctorById(appointment.doctorId);
      const label = args.action === "cancel" ? "Cancel" : "Reschedule";
      return {
        data: { prepared: true, action: args.action, date: appointment.appointmentDate, startTime: appointment.startTime },
        cards: [
          {
            kind: "MANAGE",
            title: `${label}: ${doctor ? doctorLabel(doctor) : "your appointment"}`,
            lines: [
              `${appointment.appointmentDate} at ${appointment.startTime}`,
              args.action === "cancel"
                ? "Open your dashboard and choose Cancel to see your refund amount first."
                : "Open your dashboard and choose Reschedule to pick a new slot.",
            ],
            href: "/patient/dashboard",
          },
        ],
      };
    },
  },
];

export const LLM_TOOLS: LlmTool[] = AGENT_TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export function findTool(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}
