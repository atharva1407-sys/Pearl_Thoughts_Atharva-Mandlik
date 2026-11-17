import type { AppointmentEntity, PaymentEntity } from "@/db/repo";
import type { FetchOrderResult } from "./types";

/** `pending` means "not wrong, just not settled yet": the bank may still be confirming, so do not call it fraud. */
export type BindingResult = { ok: true } | { ok: false; reason: string; pending?: boolean };

/**
 * A browser-reported payment may only confirm the appointment it was created for, for the patient
 * who created it. Without this, a valid payment (even a cheap one) could be replayed against any
 * other pending booking.
 */
export function checkPaymentBinding(input: {
  payment: PaymentEntity | undefined;
  appointment: AppointmentEntity | undefined;
  patientId: string;
  providerName: "RAZORPAY" | "MOCK";
  appointmentId: string;
  providerOrderId: string;
  providerPaymentId: string;
}): BindingResult {
  const { payment, appointment, patientId, providerName, appointmentId, providerOrderId, providerPaymentId } = input;

  if (!payment) return { ok: false, reason: "Payment record not found." };
  if (!appointment) return { ok: false, reason: "Appointment not found." };
  if (payment.appointmentId !== appointmentId || appointment.id !== appointmentId) {
    return { ok: false, reason: "Payment does not belong to this appointment." };
  }
  if (payment.patientId !== patientId || appointment.patientId !== patientId) {
    return { ok: false, reason: "Payment does not belong to the signed-in patient." };
  }
  if (payment.provider !== providerName) {
    return { ok: false, reason: "Payment was created with a different provider." };
  }
  if (!providerOrderId || payment.providerOrderId !== providerOrderId) {
    return { ok: false, reason: "Order does not match this payment." };
  }
  if (!providerPaymentId) {
    return { ok: false, reason: "Missing payment reference." };
  }
  if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) {
    return { ok: false, reason: "Payment was already settled with a different payment reference." };
  }
  return { ok: true };
}

/**
 * Checks the gateway's own record of the order: it must be fully paid for at least the amount we
 * charged, and (when the gateway lists attempts) the reported payment must be a successful one.
 */
export function checkOrderSettled(
  order: FetchOrderResult,
  payment: Pick<PaymentEntity, "amountPaise" | "currency" | "providerOrderId">,
  providerPaymentId: string
): BindingResult {
  if (order.id !== payment.providerOrderId) return { ok: false, reason: "Gateway returned a different order." };
  if (order.currency !== payment.currency) return { ok: false, reason: "Currency mismatch." };
  if (order.amount !== payment.amountPaise) return { ok: false, reason: "Order amount does not match the fee charged." };
  if (order.status !== "paid" || order.amountPaid < payment.amountPaise) {
    return { ok: false, reason: "Gateway has not received the full payment for this order.", pending: true };
  }
  if (order.payments && order.payments.length > 0) {
    const match = order.payments.find((p) => p.id === providerPaymentId);
    if (!match) return { ok: false, reason: "Reported payment is not part of this order." };
    if (match.status !== "captured" && match.status !== "authorized") {
      return { ok: false, reason: "Reported payment was not successful." };
    }
  }
  return { ok: true };
}

/** Picks the successful payment id from an order's payment attempts, if there is one. */
export function findSuccessfulPaymentId(order: FetchOrderResult): string | undefined {
  return order.payments?.find((p) => p.status === "captured")?.id ?? order.payments?.find((p) => p.status === "authorized")?.id;
}
