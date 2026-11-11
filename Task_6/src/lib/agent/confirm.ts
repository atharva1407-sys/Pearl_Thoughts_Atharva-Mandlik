import crypto from "crypto";
import type { MedrellaRepository, PatientEntity } from "@/db/repo";
import { checkRequestedSlot } from "../booking-rules";
import { consumeNonce, verifyConfirmation, type ConfirmAction } from "./confirmation";
import { findAlternativeSlots, listOpenSlotsOnDate } from "./slots";
import type { AgentCard } from "./tools";

/** What the browser needs to open the payment checkout for a seat that is being held. */
export interface PaymentHold {
  provider: "RAZORPAY" | "MOCK";
  keyId?: string;
  orderId: string;
  amountPaise: number;
  amountRupees: number;
  currency: string;
  paymentId: string;
  appointmentId: string;
  holdExpiresAt: string;
  receiptNo: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
}

export interface BookOutcome {
  ok: boolean;
  error?: string;
  message?: string;
  appointmentId?: string;
  tokenNumber?: number;
  /** Present when the doctor charges a fee: the seat is held and waits for payment. */
  payment?: PaymentHold;
}

export interface SimpleOutcome {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * The side-effecting half, injected so the real server actions (emails, refunds, payment orders) run
 * in production while tests can use a recording fake.
 */
export interface ActionExecutor {
  book(input: { doctorId: string; date: string; startTime: string; endTime: string; reason: string }): Promise<BookOutcome>;
  cancel(appointmentId: string): Promise<SimpleOutcome>;
  reschedule(appointmentId: string, newDate: string, newStartTime: string): Promise<SimpleOutcome>;
}

export type ConfirmCode = "OK" | "INVALID" | "EXPIRED" | "USED" | "NOT_ALLOWED" | "SLOT_TAKEN" | "FAILED";

export interface ConfirmResult {
  ok: boolean;
  code: ConfirmCode;
  message: string;
  payment?: PaymentHold;
  cards?: AgentCard[];
}

const fail = (code: ConfirmCode, message: string, extra?: Partial<ConfirmResult>): ConfirmResult => ({ ok: false, code, message, ...extra });

async function audit(repo: MedrellaRepository, userId: string, tool: string, detail: string) {
  try {
    await repo.createAgentEvent({ id: `agt_${crypto.randomUUID()}`, userId, kind: "ACTION", tool, detail: detail.slice(0, 300) });
  } catch {
    // Auditing must never block the patient.
  }
}

const ACTIVE = new Set(["BOOKED", "PENDING_PAYMENT"]);

/**
 * Runs an action the patient explicitly confirmed. Nothing the model said is trusted here: the token
 * is verified, and everything is checked again against the live database before anything changes.
 */
export async function executeConfirmation(input: {
  repo: MedrellaRepository;
  userId: string;
  patient: PatientEntity;
  token: unknown;
  executor: ActionExecutor;
  now?: Date;
}): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const verified = verifyConfirmation(input.token, input.userId, now);
  if (!verified.ok) {
    if (verified.reason === "EXPIRED") {
      return fail("EXPIRED", "That confirmation expired. Nothing was changed. Ask me again and I will prepare it afresh.");
    }
    return fail("INVALID", "That confirmation is not valid. Nothing was changed.");
  }
  if (!consumeNonce(verified.nonce, verified.expiresAt, now.getTime())) {
    return fail("USED", "That confirmation was already used. Nothing more was changed.");
  }

  const action: ConfirmAction = verified.action;
  const { repo, patient, userId, executor } = input;

  if (action.type === "BOOK") {
    // Revalidate: the slot may have been taken while the card was on screen.
    const check = await checkRequestedSlot(action.doctorId, action.date, action.startTime, now);
    const open = check.ok ? await listOpenSlotsOnDate(repo, action.doctorId, action.date, now) : null;
    if (!check.ok || !open || !open.slots.some((s) => s.startTime === action.startTime)) {
      const alternatives = await findAlternativeSlots(repo, { doctorId: action.doctorId, date: action.date, preferredTime: action.startTime, now, limit: 6 });
      await audit(repo, userId, "confirm_book", "slot no longer open");
      const doctor = await repo.getDoctorById(action.doctorId);
      return fail(
        "SLOT_TAKEN",
        `That slot is no longer available${check.ok ? "" : `: ${check.error}`} Nothing was booked.${alternatives.length ? " Here are the nearest open times." : ""}`,
        {
          cards:
            doctor && alternatives.length
              ? [
                  {
                    kind: "SLOTS",
                    title: `Other times with Dr. ${doctor.firstName} ${doctor.lastName}`,
                    lines: ["Tap a time to continue. Nothing is booked until you confirm."],
                    options: alternatives.map((s) => ({
                      label: `${s.date} · ${s.startTime}`,
                      message: `Book Dr. ${doctor.firstName} ${doctor.lastName} on ${s.date} at ${s.startTime}`,
                    })),
                  },
                ]
              : undefined,
        }
      );
    }

    const outcome = await executor.book({
      doctorId: action.doctorId,
      date: action.date,
      startTime: action.startTime,
      endTime: check.endTime,
      reason: action.reason,
    });
    if (!outcome.ok) {
      await audit(repo, userId, "confirm_book", "booking refused");
      return fail("FAILED", outcome.error || "The booking could not be completed. Nothing was charged.");
    }
    if (outcome.payment) {
      await audit(repo, userId, "confirm_book", `hold placed ${outcome.payment.appointmentId}`);
      return {
        ok: true,
        code: "OK",
        message: `I am holding the slot for you. Please complete the payment of ₹${outcome.payment.amountRupees} below to confirm it.`,
        payment: outcome.payment,
      };
    }
    await audit(repo, userId, "confirm_book", `booked ${outcome.appointmentId ?? ""}`);
    return {
      ok: true,
      code: "OK",
      message: `Your appointment is booked for ${action.date} at ${action.startTime}${outcome.tokenNumber ? ` (token #${outcome.tokenNumber})` : ""}. A confirmation email is on its way.`,
    };
  }

  // CANCEL and RESCHEDULE both act on one of the patient's own appointments.
  const appointment = await repo.getAppointmentById(action.appointmentId);
  if (!appointment || appointment.patientId !== patient.id) {
    return fail("NOT_ALLOWED", "I could not find that appointment on your account. Nothing was changed.");
  }

  if (action.type === "CANCEL") {
    if (!ACTIVE.has(appointment.status)) {
      return fail("FAILED", `That appointment is already ${appointment.status.toLowerCase().replace("_", " ")}. Nothing was changed.`);
    }
    const outcome = await executor.cancel(appointment.id);
    await audit(repo, userId, "confirm_cancel", outcome.ok ? `cancelled ${appointment.id}` : "cancel refused");
    return outcome.ok
      ? { ok: true, code: "OK", message: outcome.message || "Your appointment was cancelled." }
      : fail("FAILED", outcome.error || "The appointment could not be cancelled.");
  }

  // RESCHEDULE
  if (appointment.status !== "BOOKED") {
    return fail("FAILED", `That appointment is ${appointment.status.toLowerCase().replace("_", " ")}, so it cannot be rescheduled. Nothing was changed.`);
  }
  const check = await checkRequestedSlot(appointment.doctorId, action.newDate, action.newStartTime, now);
  const open = check.ok ? await listOpenSlotsOnDate(repo, appointment.doctorId, action.newDate, now) : null;
  if (!check.ok || !open || !open.slots.some((s) => s.startTime === action.newStartTime)) {
    const alternatives = await findAlternativeSlots(repo, {
      doctorId: appointment.doctorId,
      date: action.newDate,
      preferredTime: action.newStartTime,
      exclude: { date: appointment.appointmentDate, startTime: appointment.startTime },
      now,
      limit: 6,
    });
    await audit(repo, userId, "confirm_reschedule", "new slot no longer open");
    const doctor = await repo.getDoctorById(appointment.doctorId);
    return fail("SLOT_TAKEN", `That new time is no longer available. Your appointment stays as it was.${alternatives.length ? " Here are other open times." : ""}`, {
      cards:
        doctor && alternatives.length
          ? [
              {
                kind: "SLOTS",
                title: `Other times with Dr. ${doctor.firstName} ${doctor.lastName}`,
                lines: ["Tap a time and I will prepare the change. Nothing moves until you confirm."],
                options: alternatives.map((s) => ({
                  label: `${s.date} · ${s.startTime}`,
                  message: `Reschedule my appointment on ${appointment.appointmentDate} at ${appointment.startTime} to ${s.date} at ${s.startTime}`,
                })),
              },
            ]
          : undefined,
    });
  }
  const outcome = await executor.reschedule(appointment.id, action.newDate, action.newStartTime);
  await audit(repo, userId, "confirm_reschedule", outcome.ok ? `rescheduled ${appointment.id}` : "reschedule refused");
  return outcome.ok
    ? { ok: true, code: "OK", message: outcome.message || `Your appointment was moved to ${action.newDate} at ${action.newStartTime}.` }
    : fail("FAILED", outcome.error || "The appointment could not be rescheduled.");
}
