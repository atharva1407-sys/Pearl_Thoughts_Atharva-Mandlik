import crypto from "crypto";
import type { MedrellaRepository, PaymentEntity, RefundEntity, RefundStatus } from "@/db/repo";
import { buildRefundIdempotencyKey } from "@/lib/refund-policy";
import { formatPaise, getPaymentProvider } from "./index";
import type { PaymentProvider } from "./types";

/** A refund request that never reached the gateway is retried after this long. */
export const STUCK_REFUND_AFTER_MS = 2 * 60 * 1000;

const ACTIVE_REFUND_STATES: RefundStatus[] = ["REQUESTED", "PENDING", "PROCESSED"];

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").slice(0, 180);
}

export interface PrepareRefundInput {
  payment: PaymentEntity;
  appointmentId: string;
  amountPaise: number;
  reason: string;
  /** Stable name for why this refund exists, e.g. "CANCELLATION"; part of the idempotency key. */
  purpose: string;
}

export interface PreparedRefund {
  refund?: RefundEntity;
  /** True when the gateway still has to be called (new row, or a retry of a failed/unsent one). */
  needsExecution: boolean;
  skippedReason?: string;
}

/**
 * Step 1: durably record the refund (status REQUESTED) BEFORE talking to the gateway or finishing
 * the cancellation. Idempotent per payment + appointment + purpose, capped so refunds never
 * exceed what was paid.
 */
export async function prepareRefund(repo: MedrellaRepository, input: PrepareRefundInput): Promise<PreparedRefund> {
  const { payment, appointmentId, amountPaise, reason, purpose } = input;
  const key = buildRefundIdempotencyKey(payment.id, appointmentId, purpose);
  const existing = await repo.getRefundByIdempotencyKey(key);

  if (existing) {
    // Already sent (or settled): never send it twice. A refund with a gateway id is only reconciled.
    if (existing.status === "PENDING" || existing.status === "PROCESSED") {
      return { refund: existing, needsExecution: false };
    }
    return { refund: existing, needsExecution: !existing.providerRefundId };
  }

  const all = await repo.getRefundsByPaymentId(payment.id);
  const alreadyCommitted = all
    .filter((r) => ACTIVE_REFUND_STATES.includes(r.status))
    .reduce((sum, r) => sum + r.amountPaise, 0);
  const allowed = Math.max(0, payment.amountPaise - alreadyCommitted);
  const amount = Math.min(amountPaise, allowed);
  if (amount <= 0) {
    return { needsExecution: false, skippedReason: "No refundable balance remaining on this payment." };
  }

  const refund = await repo.createRefund({
    id: `ref-${crypto.randomUUID()}`,
    paymentId: payment.id,
    appointmentId,
    amountPaise: amount,
    reason,
    status: "REQUESTED",
    providerRefundId: null,
    idempotencyKey: key,
    failureReason: null,
  });
  return { refund, needsExecution: true };
}

/**
 * Step 2: ask the gateway for the refund and record what it actually answered. A refund is only
 * PROCESSED if the gateway says "processed"; otherwise it stays PENDING until its webhook arrives.
 */
export async function executeRefund(
  repo: MedrellaRepository,
  refund: RefundEntity,
  payment: PaymentEntity,
  provider: PaymentProvider = getPaymentProvider()
): Promise<RefundEntity> {
  if (!payment.providerPaymentId) {
    return applyRefundStatus(repo, refund, "FAILED", {
      failureReason: "No payment reference on file; this refund must be issued manually.",
    });
  }

  try {
    const result = await provider.createRefund({
      paymentId: payment.providerPaymentId,
      amountPaise: refund.amountPaise,
      reason: refund.reason || undefined,
      receipt: refund.id,
      notes: { refundId: refund.id, appointmentId: refund.appointmentId },
    });
    const status: RefundStatus =
      result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING";
    return applyRefundStatus(repo, refund, status, {
      providerRefundId: result.id,
      failureReason: status === "FAILED" ? "The payment gateway rejected the refund." : null,
    });
  } catch (err) {
    return applyRefundStatus(repo, refund, "FAILED", { failureReason: shortError(err) });
  }
}

/** Prepare + execute in one call, for flows where cancellation can't be interrupted (e.g. webhooks). */
export async function issueRefund(
  repo: MedrellaRepository,
  input: PrepareRefundInput,
  provider: PaymentProvider = getPaymentProvider()
): Promise<{ refund?: RefundEntity; skippedReason?: string }> {
  const prepared = await prepareRefund(repo, input);
  if (!prepared.refund) return { skippedReason: prepared.skippedReason };
  if (!prepared.needsExecution) return { refund: prepared.refund };
  const refund = await executeRefund(repo, prepared.refund, input.payment, provider);
  return { refund };
}

/**
 * Moves a refund to a new status and keeps everything consistent:
 *  - a PROCESSED refund is final and is never downgraded;
 *  - the payment becomes REFUNDED / PARTIALLY_REFUNDED only once refunds are PROCESSED;
 *  - the patient is told exactly once per status.
 */
export async function applyRefundStatus(
  repo: MedrellaRepository,
  refund: RefundEntity,
  status: RefundStatus,
  extra: { providerRefundId?: string | null; failureReason?: string | null } = {}
): Promise<RefundEntity> {
  const current = (await repo.getRefundsByPaymentId(refund.paymentId)).find((r) => r.id === refund.id) ?? refund;
  if (current.status === "PROCESSED") return current;

  await repo.updateRefundStatus(current.id, status, {
    providerRefundId: extra.providerRefundId ?? current.providerRefundId ?? null,
    failureReason: status === "FAILED" ? extra.failureReason ?? "Refund failed." : null,
  });
  const updated: RefundEntity = {
    ...current,
    status,
    providerRefundId: extra.providerRefundId ?? current.providerRefundId ?? null,
    failureReason: status === "FAILED" ? extra.failureReason ?? "Refund failed." : null,
  };

  await recomputePaymentRefundState(repo, updated.paymentId);
  await notifyRefund(repo, updated);
  return updated;
}

/** REFUNDED only when processed refunds cover the whole payment; otherwise PARTIALLY_REFUNDED. */
export async function recomputePaymentRefundState(repo: MedrellaRepository, paymentId: string): Promise<void> {
  const payment = await repo.getPaymentById(paymentId);
  if (!payment || !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) return;

  const processed = (await repo.getRefundsByPaymentId(paymentId))
    .filter((r) => r.status === "PROCESSED")
    .reduce((sum, r) => sum + r.amountPaise, 0);

  const next = processed >= payment.amountPaise ? "REFUNDED" : processed > 0 ? "PARTIALLY_REFUNDED" : "PAID";
  if (next !== payment.status) {
    await repo.updatePaymentStatus(paymentId, next);
  }
}

async function notifyRefund(repo: MedrellaRepository, refund: RefundEntity): Promise<void> {
  if (refund.status === "REQUESTED") return;

  const payment = await repo.getPaymentById(refund.paymentId);
  if (!payment) return;
  const patient = await repo.getPatientById(payment.patientId);
  const user = patient ? await repo.getUserById(patient.userId) : undefined;
  if (!patient || !user) return;
  const appointment = await repo.getAppointmentById(refund.appointmentId);
  const doctor = appointment ? await repo.getDoctorById(appointment.doctorId) : undefined;

  const template =
    refund.status === "PROCESSED" ? "REFUND_PROCESSED" : refund.status === "FAILED" ? "REFUND_FAILED" : "REFUND_INITIATED";

  await repo.createNotification({
    id: `notif-${crypto.randomUUID()}`,
    userId: user.id,
    appointmentId: refund.appointmentId,
    channel: "EMAIL",
    template,
    recipient: user.email,
    payload: {
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : "your doctor",
      appointmentDate: appointment?.appointmentDate,
      startTime: appointment?.startTime,
      refundAmountFormatted: formatPaise(refund.amountPaise),
      receiptNo: payment.receiptNo,
      reason: refund.reason ?? undefined,
    },
    status: "PENDING",
    scheduledFor: new Date(),
    attempts: 0,
    dedupeKey: `refund-${refund.id}-${refund.status}`,
  });
}

/**
 * Retries refund requests that were recorded but never reached the gateway (for example a crash
 * between cancelling and calling Razorpay). Only refunds whose appointment really was cancelled
 * or released are sent; anything else is closed as FAILED.
 */
export async function retryStuckRefunds(
  repo: MedrellaRepository,
  provider: PaymentProvider = getPaymentProvider(),
  now: Date = new Date()
): Promise<{ retried: number; abandoned: number }> {
  const stuck = await repo.getRefundsByStatuses(["REQUESTED"], new Date(now.getTime() - STUCK_REFUND_AFTER_MS));
  let retried = 0;
  let abandoned = 0;

  for (const refund of stuck) {
    const payment = await repo.getPaymentById(refund.paymentId);
    const appointment = await repo.getAppointmentById(refund.appointmentId);
    if (!payment || !appointment) continue;

    if (["BOOKED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
      // The cancellation this refund was prepared for never happened.
      await repo.updateRefundStatus(refund.id, "FAILED", {
        failureReason: "The appointment was not cancelled, so no refund was issued.",
      });
      abandoned++;
      continue;
    }
    await executeRefund(repo, refund, payment, provider);
    retried++;
  }
  return { retried, abandoned };
}
