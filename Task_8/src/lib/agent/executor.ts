import {
  cancelAppointmentAction,
  createBookingHoldAction,
  rescheduleAppointmentAction,
} from "@/actions/appointments";
import type { ActionExecutor, BookOutcome } from "./confirm";

/**
 * The production executor: it goes through the SAME server actions as the Doctors page and the
 * dashboard, so assistant bookings get the same validation, double-booking guard, payment orders,
 * refunds, emails and reminders. Those actions also re-check the signed-in session.
 *
 * Kept out of the barrel file (index.ts) because the actions need the Next.js runtime.
 */
export const serverActionExecutor: ActionExecutor = {
  async book(input): Promise<BookOutcome> {
    const form = new FormData();
    form.set("doctorId", input.doctorId);
    form.set("appointmentDate", input.date);
    form.set("startTime", input.startTime);
    form.set("endTime", input.endTime);
    form.set("reason", input.reason);
    const res = await createBookingHoldAction(form);
    if (!res.success) return { ok: false, error: "error" in res ? res.error : "The booking could not be completed." };

    if (res.requiresPayment) {
      return {
        ok: true,
        payment: {
          provider: res.provider as "RAZORPAY" | "MOCK",
          keyId: res.keyId,
          orderId: res.orderId,
          amountPaise: res.amountPaise,
          amountRupees: res.amountRupees,
          currency: res.currency,
          paymentId: res.paymentId,
          appointmentId: res.appointmentId,
          holdExpiresAt: res.holdExpiresAt,
          receiptNo: res.receiptNo,
          doctorName: res.doctorName,
          appointmentDate: res.appointmentDate,
          startTime: res.startTime,
          patientName: res.patientName,
          patientEmail: res.patientEmail,
          patientPhone: res.patientPhone,
        },
      };
    }
    return { ok: true, message: res.message, appointmentId: res.appointmentId, tokenNumber: res.tokenNumber };
  },

  async cancel(appointmentId) {
    const res = await cancelAppointmentAction(appointmentId);
    return res.success ? { ok: true, message: res.message } : { ok: false, error: res.error };
  },

  async reschedule(appointmentId, newDate, newStartTime) {
    const form = new FormData();
    form.set("appointmentId", appointmentId);
    form.set("newDate", newDate);
    form.set("newStartTime", newStartTime);
    const res = await rescheduleAppointmentAction(form);
    return res.success
      ? { ok: true, message: `Your appointment was moved to ${newDate} at ${newStartTime}. A confirmation email is on its way.` }
      : { ok: false, error: res.error };
  },
};
