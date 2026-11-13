import { z } from "zod";
import type { AppointmentEntity, DoctorEntity, MedrellaRepository, PatientEntity } from "@/db/repo";
import { MAX_BOOKING_DAYS_AHEAD, checkRequestedSlot } from "../booking-rules";
import { formatPaise, rupeesToPaise } from "../payments";
import { refundLabel } from "../payments/labels";
import { computeRefund } from "../refund-policy";
import { addDaysToDate, describeSchedule, isRealDate, sessionAppliesOnDate, weekdayOfDate } from "../session-schedule";
import { buildInstantFromKolkataTime, istDateString, getKolkataMonthStart } from "../time";
import { signConfirmation, type ConfirmAction } from "./confirmation";
import { detectConflicts, summarizeStatuses } from "./doctor-insights";
import type { LlmTool } from "./llm";
import { findAlternativeSlots, listOpenSlotsOnDate, type OpenSlot } from "./slots";

export type AgentRole = "PATIENT" | "DOCTOR";

/** What the chat UI renders under an assistant message. Cards never perform actions on their own. */
export interface AgentCard {
  /** CONFIRM asks the user to approve a prepared action; SLOTS offers tappable times; INFO is read-only. */
  kind: "CONFIRM" | "SLOTS" | "INFO";
  title: string;
  lines: string[];
  /** In-app link the user may open for more detail. */
  href?: string;
  linkLabel?: string;
  confirm?: {
    token: string;
    action: ConfirmAction["type"];
    label: string;
    /** ISO time after which the confirmation no longer works. */
    expiresAt: string;
    destructive?: boolean;
  };
  options?: { label: string; message: string }[];
}

interface BaseContext {
  repo: MedrellaRepository;
  userId: string;
  now: Date;
}
export interface PatientToolContext extends BaseContext {
  role: "PATIENT";
  patient: PatientEntity;
}
export interface DoctorToolContext extends BaseContext {
  role: "DOCTOR";
  doctor: DoctorEntity;
}
export type ToolContext = PatientToolContext | DoctorToolContext;

export interface ToolOutput {
  data: unknown;
  cards?: AgentCard[];
}

interface ToolDefinition<C extends ToolContext> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  run: (ctx: C, args: any) => Promise<ToolOutput>;
}

const dateField = z.string().refine(isRealDate, "Use a real date as YYYY-MM-DD");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const idField = z.string().min(1).max(80);

function dateProblem(date: string, now: Date): string | null {
  const today = istDateString(now);
  if (date < today) return "That date is in the past.";
  const max = istDateString(new Date(now.getTime() + MAX_BOOKING_DAYS_AHEAD * 24 * 3600 * 1000));
  if (date > max) return `Appointments can only be booked up to ${MAX_BOOKING_DAYS_AHEAD} days ahead.`;
  return null;
}

const doctorLabel = (d: { firstName: string; lastName: string }) => `Dr. ${d.firstName} ${d.lastName}`;
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
const WEEKDAY_NAMES: Record<string, string> = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const dayLabel = (date: string) => `${WEEKDAY_NAMES[weekdayOfDate(date)]} ${date}`;

function slotsCard(doctor: DoctorEntity, slots: OpenSlot[], title: string): AgentCard {
  return {
    kind: "SLOTS",
    title,
    lines: ["Tap a time to continue. Nothing is booked until you confirm."],
    options: slots.map((s) => ({
      label: `${dayLabel(s.date)} · ${s.startTime}`,
      message: `Book ${doctorLabel(doctor)} on ${s.date} at ${s.startTime}`,
    })),
  };
}

/** What a patient would get back if they cancelled now, or null when nothing was paid. */
async function refundPreview(repo: MedrellaRepository, appointment: AppointmentEntity, now: Date) {
  const payment = await repo.getPaymentByAppointmentId(appointment.id);
  if (!payment || (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED")) return null;
  const existing = await repo.getRefundsByPaymentId(payment.id);
  const alreadyRefundedPaise = existing
    .filter((r) => r.status === "PROCESSED" || r.status === "PENDING" || r.status === "REQUESTED")
    .reduce((sum, r) => sum + r.amountPaise, 0);
  return computeRefund({
    cancelledBy: "PATIENT",
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    amountPaidPaise: payment.amountPaise,
    alreadyRefundedPaise,
    now,
  });
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const tooLateToChange = (a: { appointmentDate: string; startTime: string }, now: Date) =>
  buildInstantFromKolkataTime(a.appointmentDate, a.startTime).getTime() - now.getTime() < ONE_HOUR_MS;

const ACTIVE_FOR_PATIENT = new Set(["BOOKED", "PENDING_PAYMENT"]);

// ============================================================================================
// Patient tools
// ============================================================================================

export const PATIENT_TOOLS: ToolDefinition<PatientToolContext>[] = [
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
      properties: { doctorId: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["doctorId", "date"],
    },
    schema: z.object({ doctorId: idField, date: dateField }),
    async run(ctx, args: { doctorId: string; date: string }) {
      const problem = dateProblem(args.date, ctx.now);
      if (problem) return { data: { error: problem } };
      const doctor = await ctx.repo.getDoctorById(args.doctorId);
      if (!doctor) return { data: { error: "Doctor not found." } };
      const { onLeave, slots } = await listOpenSlotsOnDate(ctx.repo, doctor.id, args.date, ctx.now);
      if (onLeave) {
        return { data: { doctor: doctorLabel(doctor), date: args.date, note: "The doctor is on leave that day.", slots: [] } };
      }
      const shown = slots.slice(0, 12);
      return {
        data: {
          doctor: doctorLabel(doctor),
          date: args.date,
          totalOpen: slots.length,
          slots: shown.map((s) => ({ startTime: s.startTime, endTime: s.endTime, session: s.session, seatsLeft: s.seatsLeft })),
        },
        cards: shown.length ? [slotsCard(doctor, shown.slice(0, 8), `${doctorLabel(doctor)} · open on ${dayLabel(args.date)}`)] : undefined,
      };
    },
  },
  {
    name: "suggest_alternative_slots",
    description:
      "Use when the slot the patient asked for is taken, or when they want other times. Finds the open slots closest to the preferred date and time (same day first, then the next days).",
    parameters: {
      type: "object",
      properties: {
        doctorId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD the patient asked for" },
        preferredTime: { type: "string", description: "HH:mm the patient asked for, if any" },
      },
      required: ["doctorId", "date"],
    },
    schema: z.object({ doctorId: idField, date: dateField, preferredTime: timeField.optional() }),
    async run(ctx, args: { doctorId: string; date: string; preferredTime?: string }) {
      const doctor = await ctx.repo.getDoctorById(args.doctorId);
      if (!doctor) return { data: { error: "Doctor not found." } };
      if (args.date > istDateString(new Date(ctx.now.getTime() + MAX_BOOKING_DAYS_AHEAD * 24 * 3600 * 1000))) {
        return { data: { error: `Appointments can only be booked up to ${MAX_BOOKING_DAYS_AHEAD} days ahead.` } };
      }
      const slots = await findAlternativeSlots(ctx.repo, {
        doctorId: doctor.id,
        date: args.date,
        preferredTime: args.preferredTime,
        now: ctx.now,
        limit: 6,
      });
      if (slots.length === 0) {
        return { data: { doctor: doctorLabel(doctor), note: "No open slots in the next 7 days.", slots: [] } };
      }
      return {
        data: { doctor: doctorLabel(doctor), slots: slots.map((s) => ({ date: s.date, startTime: s.startTime, session: s.session })) },
        cards: [slotsCard(doctor, slots, `Other times with ${doctorLabel(doctor)}`)],
      };
    },
  },
  {
    name: "list_my_appointments",
    description:
      "List the signed-in patient's appointments. scope: upcoming (default), past (completed, cancelled, no-show) or all. At most 8.",
    parameters: {
      type: "object",
      properties: { scope: { type: "string", enum: ["upcoming", "past", "all"] } },
    },
    schema: z.object({ scope: z.enum(["upcoming", "past", "all"]).optional() }),
    async run(ctx, args: { scope?: "upcoming" | "past" | "all" }) {
      const scope = args.scope ?? "upcoming";
      const today = istDateString(ctx.now);
      const all = (await ctx.repo.getAppointmentsByPatientId(ctx.patient.id)).filter((a) => a.status !== "EXPIRED");
      const isUpcoming = (a: AppointmentEntity) => ACTIVE_FOR_PATIENT.has(a.status) && a.appointmentDate >= today;
      const key = (a: AppointmentEntity) => a.appointmentDate + a.startTime;
      let rows = all;
      if (scope === "upcoming") rows = all.filter(isUpcoming).sort((a, b) => key(a).localeCompare(key(b)));
      else if (scope === "past") rows = all.filter((a) => !isUpcoming(a)).sort((a, b) => key(b).localeCompare(key(a)));
      else rows = [...all].sort((a, b) => key(b).localeCompare(key(a)));
      const shown = rows.slice(0, 8).map((a) => ({
        appointmentId: a.id,
        doctor: doctorLabel((a as AppointmentEntity & { doctor: DoctorEntity }).doctor),
        date: a.appointmentDate,
        startTime: a.startTime,
        status: a.status,
      }));
      return { data: { scope, count: shown.length, appointments: shown } };
    },
  },
  {
    name: "propose_booking",
    description:
      "Prepare a booking for the patient after you found the doctor and an OPEN slot. It does NOT book anything: it shows the patient a Confirm button. Tell them to press Confirm to go ahead (payment follows when the doctor charges a fee).",
    parameters: {
      type: "object",
      properties: {
        doctorId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:mm, one of the open slot start times" },
        reason: { type: "string", description: "Short reason for the visit if the patient mentioned one" },
      },
      required: ["doctorId", "date", "startTime"],
    },
    schema: z.object({ doctorId: idField, date: dateField, startTime: timeField, reason: z.string().max(200).optional() }),
    async run(ctx, args: { doctorId: string; date: string; startTime: string; reason?: string }) {
      const problem = dateProblem(args.date, ctx.now);
      if (problem) return { data: { error: problem } };
      const check = await checkRequestedSlot(args.doctorId, args.date, args.startTime, ctx.now);
      if (!check.ok) return { data: { error: check.error } };

      const { slots } = await listOpenSlotsOnDate(ctx.repo, check.doctor.id, args.date, ctx.now);
      if (!slots.some((s) => s.startTime === args.startTime)) {
        const alternatives = await findAlternativeSlots(ctx.repo, {
          doctorId: check.doctor.id,
          date: args.date,
          preferredTime: args.startTime,
          now: ctx.now,
          limit: 6,
        });
        return {
          data: {
            error: "That slot is not open any more.",
            alternatives: alternatives.map((s) => ({ date: s.date, startTime: s.startTime })),
          },
          cards: alternatives.length ? [slotsCard(check.doctor, alternatives, `Other times with ${doctorLabel(check.doctor)}`)] : undefined,
        };
      }

      const mine = await ctx.repo.getAppointmentsByPatientId(ctx.patient.id);
      if (mine.some((a) => a.doctorId === check.doctor.id && a.appointmentDate === args.date && ACTIVE_FOR_PATIENT.has(a.status))) {
        return { data: { error: `You already have an appointment with ${doctorLabel(check.doctor)} on ${args.date}.` } };
      }

      const reason = (args.reason?.trim() || "Consultation booked through the assistant").slice(0, 200).padEnd(3, ".");
      const fee = formatPaise(rupeesToPaise(check.doctor.consultationFee));
      const { token, expiresAt } = signConfirmation(
        ctx.userId,
        { type: "BOOK", doctorId: check.doctor.id, date: args.date, startTime: args.startTime, reason },
        ctx.now
      );
      return {
        data: {
          prepared: true,
          awaitingConfirmation: true,
          doctor: doctorLabel(check.doctor),
          date: args.date,
          startTime: args.startTime,
          fee,
        },
        cards: [
          {
            kind: "CONFIRM",
            title: `Book ${doctorLabel(check.doctor)} · ${check.doctor.specialization}`,
            lines: [
              `${dayLabel(args.date)} at ${args.startTime}`,
              check.doctor.consultationFee > 0 ? `Consultation fee: ${fee}. You pay right after confirming.` : "No consultation fee.",
              `Reason: ${reason}`,
            ],
            confirm: { token, action: "BOOK", label: "Confirm booking", expiresAt: expiresAt.toISOString() },
          },
        ],
      };
    },
  },
  {
    name: "propose_cancel_appointment",
    description:
      "Prepare the cancellation of one of the patient's own upcoming appointments. It does NOT cancel anything: it shows the refund amount and a Confirm button.",
    parameters: {
      type: "object",
      properties: { appointmentId: { type: "string" } },
      required: ["appointmentId"],
    },
    schema: z.object({ appointmentId: idField }),
    async run(ctx, args: { appointmentId: string }) {
      const appointment = await ctx.repo.getAppointmentById(args.appointmentId);
      if (!appointment || appointment.patientId !== ctx.patient.id) return { data: { error: "Appointment not found." } };
      if (!ACTIVE_FOR_PATIENT.has(appointment.status)) {
        return { data: { error: `This appointment is ${appointment.status.toLowerCase().replace("_", " ")}, so it cannot be cancelled.` } };
      }
      if (appointment.status === "BOOKED" && tooLateToChange(appointment, ctx.now)) {
        return { data: { error: "Appointments can only be cancelled up to 1 hour before they start. Please call the clinic desk on +91 20 6645 5100." } };
      }
      const doctor = await ctx.repo.getDoctorById(appointment.doctorId);
      const refund = await refundPreview(ctx.repo, appointment, ctx.now);
      const refundLine = refund
        ? refund.refundAmountPaise > 0
          ? `Refund: ${formatPaise(refund.refundAmountPaise)} (${refund.refundPercentage}%)`
          : "No refund applies under the cancellation policy."
        : "Nothing was paid, so there is no refund.";
      const { token, expiresAt } = signConfirmation(ctx.userId, { type: "CANCEL", appointmentId: appointment.id }, ctx.now);
      return {
        data: {
          prepared: true,
          awaitingConfirmation: true,
          action: "cancel",
          date: appointment.appointmentDate,
          startTime: appointment.startTime,
          refund: refundLine,
        },
        cards: [
          {
            kind: "CONFIRM",
            title: `Cancel ${doctor ? doctorLabel(doctor) : "your appointment"}`,
            lines: [`${dayLabel(appointment.appointmentDate)} at ${appointment.startTime}`, refundLine],
            confirm: { token, action: "CANCEL", label: "Yes, cancel it", expiresAt: expiresAt.toISOString(), destructive: true },
          },
        ],
      };
    },
  },
  {
    name: "propose_reschedule_appointment",
    description:
      "Prepare moving one of the patient's own booked appointments to a new open slot with the same doctor. It does NOT change anything: it shows a Confirm button. Check the new slot with get_open_slots first.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        newDate: { type: "string", description: "YYYY-MM-DD" },
        newStartTime: { type: "string", description: "HH:mm" },
      },
      required: ["appointmentId", "newDate", "newStartTime"],
    },
    schema: z.object({ appointmentId: idField, newDate: dateField, newStartTime: timeField }),
    async run(ctx, args: { appointmentId: string; newDate: string; newStartTime: string }) {
      const appointment = await ctx.repo.getAppointmentById(args.appointmentId);
      if (!appointment || appointment.patientId !== ctx.patient.id) return { data: { error: "Appointment not found." } };
      if (appointment.status !== "BOOKED") {
        return { data: { error: `This appointment is ${appointment.status.toLowerCase().replace("_", " ")}, so it cannot be rescheduled.` } };
      }
      if (tooLateToChange(appointment, ctx.now)) {
        return { data: { error: "Appointments can only be rescheduled at least 1 hour before they start." } };
      }
      const problem = dateProblem(args.newDate, ctx.now);
      if (problem) return { data: { error: problem } };
      if (appointment.appointmentDate === args.newDate && appointment.startTime === args.newStartTime) {
        return { data: { error: "That is the time the appointment already has." } };
      }
      const check = await checkRequestedSlot(appointment.doctorId, args.newDate, args.newStartTime, ctx.now);
      if (!check.ok) return { data: { error: check.error } };

      const { slots } = await listOpenSlotsOnDate(ctx.repo, appointment.doctorId, args.newDate, ctx.now);
      if (!slots.some((s) => s.startTime === args.newStartTime)) {
        const alternatives = await findAlternativeSlots(ctx.repo, {
          doctorId: appointment.doctorId,
          date: args.newDate,
          preferredTime: args.newStartTime,
          exclude: { date: appointment.appointmentDate, startTime: appointment.startTime },
          now: ctx.now,
          limit: 6,
        });
        return {
          data: {
            error: "That slot is not open.",
            alternatives: alternatives.map((s) => ({ date: s.date, startTime: s.startTime })),
          },
          cards: alternatives.length ? [slotsCard(check.doctor, alternatives, `Other times with ${doctorLabel(check.doctor)}`)] : undefined,
        };
      }

      const { token, expiresAt } = signConfirmation(
        ctx.userId,
        { type: "RESCHEDULE", appointmentId: appointment.id, newDate: args.newDate, newStartTime: args.newStartTime },
        ctx.now
      );
      return {
        data: {
          prepared: true,
          awaitingConfirmation: true,
          action: "reschedule",
          from: `${appointment.appointmentDate} ${appointment.startTime}`,
          to: `${args.newDate} ${args.newStartTime}`,
        },
        cards: [
          {
            kind: "CONFIRM",
            title: `Reschedule with ${doctorLabel(check.doctor)}`,
            lines: [
              `From ${dayLabel(appointment.appointmentDate)} at ${appointment.startTime}`,
              `To ${dayLabel(args.newDate)} at ${args.newStartTime}`,
              "Rescheduling is free; your payment stays with the appointment.",
            ],
            confirm: { token, action: "RESCHEDULE", label: "Confirm new time", expiresAt: expiresAt.toISOString() },
          },
        ],
      };
    },
  },
  {
    name: "list_my_payments",
    description:
      "Show the patient's payment history with the status of each payment and of any refund (refund requested, in progress, refunded or failed). At most 8, newest first.",
    parameters: { type: "object", properties: {} },
    schema: z.object({}),
    async run(ctx) {
      const payments = (await ctx.repo.getPaymentsByPatientId(ctx.patient.id)).slice(0, 8);
      const rows = await Promise.all(
        payments.map(async (p) => {
          const refunds = await ctx.repo.getRefundsByPaymentId(p.id);
          return {
            receiptNo: p.receiptNo,
            doctor: doctorLabel(p.doctor),
            appointmentDate: p.appointment.appointmentDate,
            amount: formatPaise(p.amountPaise),
            paymentStatus: p.status,
            paidAt: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : null,
            refunds: refunds.map((r) => ({ amount: formatPaise(r.amountPaise), status: refundLabel(r.status) })),
          };
        })
      );
      return {
        data: { count: rows.length, payments: rows },
        cards: rows.length ? [{ kind: "INFO", title: "Payments & receipts", lines: ["Open the full list with downloadable receipts."], href: "/patient/payments", linkLabel: "Open payments" }] : undefined,
      };
    },
  },
  {
    name: "list_my_prescriptions",
    description:
      "Show the prescriptions the patient's doctors wrote (medicines, dosage, frequency, duration, notes). Read them out as written; never explain or change them.",
    parameters: { type: "object", properties: {} },
    schema: z.object({}),
    async run(ctx) {
      const all = (await ctx.repo.getPrescriptionsByPatientId(ctx.patient.id)).slice(0, 5);
      const rows = all.map((rx) => ({
        doctor: doctorLabel(rx.doctor),
        visitDate: rx.appointment.appointmentDate,
        medicines: rx.medicines,
        notes: rx.notes ?? null,
      }));
      return {
        data: { count: rows.length, prescriptions: rows, note: rows.length === 0 ? "No prescriptions have been written yet." : undefined },
        cards: rows.length ? [{ kind: "INFO", title: "Prescriptions", lines: ["Open your prescriptions in the portal."], href: "/patient/prescriptions", linkLabel: "Open prescriptions" }] : undefined,
      };
    },
  },
];

// ============================================================================================
// Doctor tools: every query is scoped to the signed-in doctor, ids never come from the model.
// ============================================================================================

const MAX_RANGE_DAYS = 62;

/** Turns optional date arguments into a bounded inclusive range. */
function resolveRange(
  args: { date?: string; startDate?: string; endDate?: string },
  fallbackStart: string,
  fallbackEnd: string
): { start: string; end: string } | { error: string } {
  let start = args.date ?? args.startDate ?? fallbackStart;
  let end = args.date ?? args.endDate ?? (args.startDate ? args.startDate : fallbackEnd);
  if (end < start) [start, end] = [end, start];
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  if (days > MAX_RANGE_DAYS) return { error: `Please ask for at most ${MAX_RANGE_DAYS} days at a time.` };
  return { start, end };
}

const rangeProps = {
  date: { type: "string", description: "A single date, YYYY-MM-DD" },
  startDate: { type: "string", description: "Range start, YYYY-MM-DD" },
  endDate: { type: "string", description: "Range end, YYYY-MM-DD" },
};
const rangeSchema = { date: dateField.optional(), startDate: dateField.optional(), endDate: dateField.optional() };

export const DOCTOR_TOOLS: ToolDefinition<DoctorToolContext>[] = [
  {
    name: "get_my_appointments",
    description:
      "List the doctor's own appointments for today (default), one date, or a date range. Optional status filter. Returns patient name, time, token and status (no contact details).",
    parameters: {
      type: "object",
      properties: {
        ...rangeProps,
        status: { type: "string", enum: ["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING_PAYMENT"] },
      },
    },
    schema: z.object({ ...rangeSchema, status: z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING_PAYMENT"]).optional() }),
    async run(ctx, args: { date?: string; startDate?: string; endDate?: string; status?: string }) {
      const today = istDateString(ctx.now);
      const range = resolveRange(args, today, today);
      if ("error" in range) return { data: range };
      const all = await ctx.repo.getAppointmentsByDoctorId(ctx.doctor.id);
      const inRange = all
        .filter((a) => a.appointmentDate >= range.start && a.appointmentDate <= range.end && a.status !== "EXPIRED")
        .filter((a) => !args.status || a.status === args.status)
        .sort((a, b) => (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime));
      const rows = inRange.slice(0, 30).map((a) => ({
        appointmentId: a.id,
        date: a.appointmentDate,
        startTime: a.startTime,
        endTime: a.endTime,
        patient: fullName(a.patient),
        token: a.tokenNumber,
        status: a.status,
      }));
      return {
        data: { range, total: inRange.length, shown: rows.length, summary: summarizeStatuses(inRange), appointments: rows },
        cards: [
          {
            kind: "INFO",
            title: range.start === range.end ? `Appointments on ${dayLabel(range.start)}` : `Appointments ${range.start} to ${range.end}`,
            lines: [`${inRange.length} appointment${inRange.length === 1 ? "" : "s"} found`],
            href: "/doctor/dashboard",
            linkLabel: "Open dashboard",
          },
        ],
      };
    },
  },
  {
    name: "get_appointment_stats",
    description:
      "Counts of the doctor's appointments by status (booked, completed, cancelled, no-show, pending payment) for a date range. Defaults to the current month.",
    parameters: { type: "object", properties: { startDate: rangeProps.startDate, endDate: rangeProps.endDate } },
    schema: z.object({ startDate: dateField.optional(), endDate: dateField.optional() }),
    async run(ctx, args: { startDate?: string; endDate?: string }) {
      const today = istDateString(ctx.now);
      const monthStart = getKolkataMonthStart(today);
      const range = resolveRange(args, monthStart, addDaysToDate(monthStart, 30));
      if ("error" in range) return { data: range };
      const all = await ctx.repo.getAppointmentsByDoctorId(ctx.doctor.id);
      const inRange = all.filter((a) => a.appointmentDate >= range.start && a.appointmentDate <= range.end);
      const stats = summarizeStatuses(inRange);
      return {
        data: { range, stats },
        cards: [
          {
            kind: "INFO",
            title: `Statistics ${range.start} to ${range.end}`,
            lines: [
              `Total ${stats.total} · Booked ${stats.booked} · Completed ${stats.completed}`,
              `Cancelled ${stats.cancelled} · No-show ${stats.noShow} · Pending payment ${stats.pendingPayment}`,
            ],
          },
        ],
      };
    },
  },
  {
    name: "get_my_schedule",
    description:
      "The doctor's working hours: active shifts (time, slot length, patients per slot, repeat pattern) and upcoming leaves. Pass a date to see whether that day is a working day or a leave day.",
    parameters: { type: "object", properties: { date: rangeProps.date } },
    schema: z.object({ date: dateField.optional() }),
    async run(ctx, args: { date?: string }) {
      const today = istDateString(ctx.now);
      const [sessions, leaves] = await Promise.all([
        ctx.repo.getAvailabilitiesByDoctorId(ctx.doctor.id),
        ctx.repo.getDoctorLeaves(ctx.doctor.id),
      ]);
      const upcomingLeaves = leaves
        .filter((l) => l.leaveDate >= today)
        .sort((a, b) => a.leaveDate.localeCompare(b.leaveDate))
        .slice(0, 10)
        .map((l) => ({ date: l.leaveDate, reason: l.reason ?? null }));
      const shifts = sessions
        .filter((s) => s.isActive)
        .slice(0, 20)
        .map((s) => ({
          name: s.name,
          hours: `${s.startTime}-${s.endTime}`,
          slotMinutes: s.slotDurationMinutes,
          patientsPerSlot: s.patientsPerWave,
          type: s.schedulingType,
          repeats: describeSchedule(s),
        }));
      const day = args.date
        ? {
            date: args.date,
            onLeave: leaves.some((l) => l.leaveDate === args.date),
            workingSessions: sessions.filter((s) => sessionAppliesOnDate(s, args.date!)).map((s) => ({ name: s.name, hours: `${s.startTime}-${s.endTime}` })),
          }
        : undefined;
      return {
        data: { shifts, pausedShifts: sessions.filter((s) => !s.isActive).length, upcomingLeaves, day },
        cards: [
          {
            kind: "INFO",
            title: "Working hours & leaves",
            lines: [`${shifts.length} active shift${shifts.length === 1 ? "" : "s"} · ${upcomingLeaves.length} upcoming leave${upcomingLeaves.length === 1 ? "" : "s"}`],
            href: "/doctor/availability",
            linkLabel: "Manage shifts",
          },
        ],
      };
    },
  },
  {
    name: "find_schedule_conflicts",
    description:
      "Check the doctor's upcoming appointments for scheduling conflicts: overlapping visits, too many patients in one slot, visits on leave days, visits outside working hours. Defaults to the next 14 days.",
    parameters: { type: "object", properties: { startDate: rangeProps.startDate, endDate: rangeProps.endDate } },
    schema: z.object({ startDate: dateField.optional(), endDate: dateField.optional() }),
    async run(ctx, args: { startDate?: string; endDate?: string }) {
      const today = istDateString(ctx.now);
      const range = resolveRange(args, today, addDaysToDate(today, 14));
      if ("error" in range) return { data: range };
      const [appointments, sessions, leaves] = await Promise.all([
        ctx.repo.getAppointmentsByDoctorId(ctx.doctor.id),
        ctx.repo.getAvailabilitiesByDoctorId(ctx.doctor.id),
        ctx.repo.getDoctorLeaves(ctx.doctor.id),
      ]);
      const conflicts = detectConflicts({
        appointments: appointments
          .filter((a) => a.appointmentDate >= range.start && a.appointmentDate <= range.end)
          .map((a) => ({ ...a, patientName: fullName(a.patient) })),
        sessions: sessions.filter((s) => s.isActive),
        leaveDates: leaves.map((l) => l.leaveDate),
        now: ctx.now,
      });
      return {
        data: {
          range,
          conflictCount: conflicts.length,
          conflicts: conflicts.slice(0, 15),
          note: conflicts.length === 0 ? "No conflicts found." : "Use suggest_reschedule_slots to find new times for an affected appointment.",
        },
        cards: [
          {
            kind: "INFO",
            title: conflicts.length ? `${conflicts.length} scheduling conflict${conflicts.length === 1 ? "" : "s"}` : "No scheduling conflicts",
            lines: conflicts.length ? conflicts.slice(0, 4).map((c) => c.description) : [`Checked ${range.start} to ${range.end}.`],
            href: "/doctor/dashboard",
            linkLabel: "Open dashboard",
          },
        ],
      };
    },
  },
  {
    name: "get_my_open_slots",
    description:
      "The doctor's open (still bookable) slots on one date, with seats left in each. Use it to check availability on a specific day. Also says when the day is a leave day or not a working day.",
    parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    schema: z.object({ date: dateField }),
    async run(ctx, args: { date: string }) {
      const problem = dateProblem(args.date, ctx.now);
      if (problem) return { data: { error: problem } };
      const { onLeave, slots } = await listOpenSlotsOnDate(ctx.repo, ctx.doctor.id, args.date, ctx.now);
      if (onLeave) {
        return {
          data: { date: args.date, onLeave: true, totalOpen: 0, slots: [] },
          cards: [{ kind: "INFO", title: `Leave on ${dayLabel(args.date)}`, lines: ["This day is marked as leave, so no slots are open."], href: "/doctor/availability", linkLabel: "Manage leaves" }],
        };
      }
      const shown = slots.slice(0, 20);
      return {
        data: {
          date: args.date,
          onLeave: false,
          totalOpen: slots.length,
          slots: shown.map((s) => ({ startTime: s.startTime, endTime: s.endTime, session: s.session, seatsLeft: s.seatsLeft })),
          note: slots.length === 0 ? "No open slots that day (not a working day, or fully booked)." : undefined,
        },
        cards: [
          {
            kind: "INFO",
            title: `Open slots on ${dayLabel(args.date)}`,
            lines: slots.length
              ? [`${slots.length} open slot${slots.length === 1 ? "" : "s"}`, ...shown.slice(0, 6).map((s) => `${s.startTime}-${s.endTime} · ${s.seatsLeft} seat${s.seatsLeft === 1 ? "" : "s"} left`)]
              : ["No open slots that day."],
            href: "/doctor/availability",
            linkLabel: "Manage shifts",
          },
        ],
      };
    },
  },
  {
    name: "get_next_available_slot",
    description: "The doctor's next open appointment slots, starting from today or a given date. Returns up to 3.",
    parameters: { type: "object", properties: { fromDate: { type: "string", description: "YYYY-MM-DD, default today" } } },
    schema: z.object({ fromDate: dateField.optional() }),
    async run(ctx, args: { fromDate?: string }) {
      const from = args.fromDate ?? istDateString(ctx.now);
      const slots = await findAlternativeSlots(ctx.repo, { doctorId: ctx.doctor.id, date: from, now: ctx.now, limit: 3, searchDays: MAX_BOOKING_DAYS_AHEAD });
      if (slots.length === 0) return { data: { note: `No open slots in the next ${MAX_BOOKING_DAYS_AHEAD} days.`, slots: [] } };
      return {
        data: { next: slots[0], slots },
        cards: [
          {
            kind: "INFO",
            title: "Next available slots",
            lines: slots.map((s) => `${dayLabel(s.date)} at ${s.startTime}`),
            href: "/doctor/availability",
            linkLabel: "Manage shifts",
          },
        ],
      };
    },
  },
  {
    name: "suggest_reschedule_slots",
    description:
      "Suggest open slots to move one of the doctor's own appointments to. Optionally prefer a date. This only suggests; rescheduling itself is done from the dashboard.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        preferredDate: { type: "string", description: "YYYY-MM-DD, default the appointment's own date" },
      },
      required: ["appointmentId"],
    },
    schema: z.object({ appointmentId: idField, preferredDate: dateField.optional() }),
    async run(ctx, args: { appointmentId: string; preferredDate?: string }) {
      const appointment = await ctx.repo.getAppointmentById(args.appointmentId);
      if (!appointment || appointment.doctorId !== ctx.doctor.id) return { data: { error: "Appointment not found." } };
      if (appointment.status !== "BOOKED") {
        return { data: { error: `This appointment is ${appointment.status.toLowerCase().replace("_", " ")}, so it cannot be rescheduled.` } };
      }
      const patient = await ctx.repo.getPatientById(appointment.patientId);
      const slots = await findAlternativeSlots(ctx.repo, {
        doctorId: ctx.doctor.id,
        date: args.preferredDate ?? appointment.appointmentDate,
        preferredTime: appointment.startTime,
        exclude: { date: appointment.appointmentDate, startTime: appointment.startTime },
        now: ctx.now,
        limit: 6,
        searchDays: 14,
      });
      return {
        data: {
          appointment: {
            appointmentId: appointment.id,
            patient: patient ? fullName(patient) : "Patient",
            date: appointment.appointmentDate,
            startTime: appointment.startTime,
          },
          suggestions: slots.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, session: s.session })),
          note: slots.length === 0 ? "No open slots found in the next 14 days." : undefined,
        },
        cards: slots.length
          ? [
              {
                kind: "INFO",
                title: `Slots to move ${patient ? fullName(patient) : "the patient"}`,
                lines: slots.slice(0, 5).map((s) => `${dayLabel(s.date)} at ${s.startTime}`),
                href: "/doctor/dashboard",
                linkLabel: "Reschedule on dashboard",
              },
            ]
          : undefined,
      };
    },
  },
];

// ============================================================================================
// Lookup
// ============================================================================================

const toLlmTools = (tools: ToolDefinition<any>[]): LlmTool[] =>
  tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));

export const PATIENT_LLM_TOOLS = toLlmTools(PATIENT_TOOLS);
export const DOCTOR_LLM_TOOLS = toLlmTools(DOCTOR_TOOLS);

export function llmToolsFor(role: AgentRole): LlmTool[] {
  return role === "DOCTOR" ? DOCTOR_LLM_TOOLS : PATIENT_LLM_TOOLS;
}

/** A tool by name, from the tool set of that role only: a doctor can never reach a patient tool or the reverse. */
export function findTool(name: string, role: AgentRole): ToolDefinition<any> | undefined {
  return (role === "DOCTOR" ? DOCTOR_TOOLS : PATIENT_TOOLS).find((t) => t.name === name);
}
