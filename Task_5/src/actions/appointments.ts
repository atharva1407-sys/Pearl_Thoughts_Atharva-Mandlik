"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import type { RefundEntity } from "@/db/repo";
import { bookingSchema } from "@/lib/validators";
import { checkRequestedSlot, hasAppointmentStarted } from "@/lib/booking-rules";
import { getPaymentProvider, formatPaise, generateReceiptNo, getPaymentHoldMinutes } from "@/lib/payments";
import type { MockProvider } from "@/lib/payments";
import { checkPaymentBinding, checkOrderSettled } from "@/lib/payments/binding";
import { prepareRefund, executeRefund, issueRefund } from "@/lib/payments/refunds";
import type { PreparedRefund } from "@/lib/payments/refunds";
import { finalizeConfirmedBooking } from "@/lib/payments/finalize";
import { computeRefund } from "@/lib/refund-policy";
import {
  createNotification,
  scheduleAppointmentReminders,
  updateRescheduledReminders,
  cancelAppointmentReminders,
  processDueNotifications,
} from "@/lib/notifications";
import { runInBackground } from "@/lib/background";

/** The patient record that a signed-in user pays and books as (doctors may book as themselves). */
async function resolvePayingPatientId(user: { role: string; profileId: string; userId: string }): Promise<string | undefined> {
  if (user.role === "PATIENT") return user.profileId;
  return (await dbRepo.getPatientByUserId(user.userId))?.id;
}

/** Plain-language refund status for the patient: "initiated" never means "completed". */
function describeRefund(refund: RefundEntity): string {
  const amount = formatPaise(refund.amountPaise);
  if (refund.status === "PROCESSED") return ` Refund of ${amount} has been processed.`;
  if (refund.status === "FAILED") {
    return ` We could not start your refund of ${amount} automatically. Our team has been alerted and will retry it.`;
  }
  return ` Refund of ${amount} initiated. It is not complete yet and usually reaches your account in 5-7 business days.`;
}

/**
 * Initiates an appointment booking:
 * - If doctor consultation fee is 0: books directly as BOOKED.
 * - If doctor fee > 0: places a seat hold (PENDING_PAYMENT) with holdExpiresAt
 *   and creates an order with the configured payment provider (Razorpay or Mock).
 */
export async function createBookingHoldAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be signed in to book an appointment." };
  }

  const raw = {
    doctorId: formData.get("doctorId"),
    appointmentDate: formData.get("appointmentDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason"),
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const slot = await checkRequestedSlot(parsed.data.doctorId, parsed.data.appointmentDate, parsed.data.startTime);
  if (!slot.ok) {
    return { success: false, error: slot.error };
  }
  const { session: matchedSession, endTime: serverEndTime } = slot;

  let patientId = user.profileId;
  let patientEmail = user.email;
  let patientName = "Patient";
  let patientPhone = "";

  if (user.role === "DOCTOR") {
    let patient = await dbRepo.getPatientByUserId(user.userId);
    if (!patient) {
      const doc = await dbRepo.getDoctorById(user.profileId);
      const newPatientId = `pat_${crypto.randomUUID()}`;
      patient = await dbRepo.createPatient({
        id: newPatientId,
        userId: user.userId,
        firstName: doc?.firstName || "Dr.",
        lastName: doc?.lastName || "Staff",
        phone: doc?.phone || "+91 20 6645 5000",
      });
    }
    patientId = patient.id;
    patientName = `${patient.firstName} ${patient.lastName}`;
    patientPhone = patient.phone;
  } else {
    const patient = await dbRepo.getPatientById(patientId);
    if (patient) {
      patientName = `${patient.firstName} ${patient.lastName}`;
      patientPhone = patient.phone;
    }
  }

  const doctor = await dbRepo.getDoctorById(parsed.data.doctorId);
  if (!doctor) {
    return { success: false, error: "Doctor not found." };
  }

  // The consultation fee is strictly read from doctors.consultationFee on the server.
  const feeRupees = doctor.consultationFee ?? 0;
  const amountPaise = feeRupees * 100;

  // Case 1: Free appointment (fee = 0) -> direct booking
  if (amountPaise <= 0) {
    const result = await dbRepo.createAppointment({
      patientId,
      doctorId: parsed.data.doctorId,
      sessionId: matchedSession.id,
      appointmentDate: parsed.data.appointmentDate,
      startTime: parsed.data.startTime,
      endTime: serverEndTime,
      reason: parsed.data.reason,
      status: "BOOKED",
    });

    if (!result.success || !result.appointment) {
      return { success: false, error: result.message };
    }

    // Schedule reminders and confirmation notification
    await createNotification(dbRepo, {
      userId: user.userId,
      appointmentId: result.appointment.id,
      channel: "EMAIL",
      template: "BOOKING_CONFIRMED",
      recipient: patientEmail,
      payload: {
        patientName,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        appointmentDate: result.appointment.appointmentDate,
        startTime: result.appointment.startTime,
        endTime: result.appointment.endTime,
        tokenNumber: result.appointment.tokenNumber,
        receiptNo: "FREE-VISIT",
        amountFormatted: "Free",
      },
      dedupeKey: `confirm-${result.appointment.id}`,
    });

    await scheduleAppointmentReminders(
      dbRepo,
      result.appointment,
      patientEmail,
      user.userId,
      patientName,
      doctor
    );

    runInBackground(async () => {
      await processDueNotifications(dbRepo);
    });

    revalidatePath("/", "layout");
    revalidatePath("/patient/dashboard");
    revalidatePath("/doctor/dashboard");
    revalidatePath(`/doctors/${parsed.data.doctorId}`);

    return {
      success: true as const,
      requiresPayment: false as const,
      message: result.message,
      appointmentId: result.appointment.id,
      tokenNumber: result.appointment.tokenNumber,
    };
  }

  // Case 2: Paid appointment -> create seat hold and payment order
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (err) {
    console.error("[PAYMENT_CONFIG_ERROR]", (err as Error).message);
    return { success: false, error: "Online payments are not available right now. Please try again later." };
  }

  const buildHoldResponse = (
    appointment: { id: string; appointmentDate: string; startTime: string; holdExpiresAt?: Date | null },
    payment: { id: string; providerOrderId: string; receiptNo: string },
    expiresAt: Date
  ) => ({
    success: true as const,
    requiresPayment: true as const,
    provider: provider.name,
    keyId: provider.keyId,
    orderId: payment.providerOrderId,
    amountPaise,
    amountRupees: feeRupees,
    currency: "INR",
    paymentId: payment.id,
    appointmentId: appointment.id,
    holdExpiresAt: (appointment.holdExpiresAt ?? expiresAt).toISOString(),
    receiptNo: payment.receiptNo,
    doctorName: `${doctor.firstName} ${doctor.lastName}`,
    specialization: doctor.specialization,
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    patientName,
    patientEmail,
    patientPhone,
  });

  // The patient's own live hold: reuse it for the same slot (double-click, retry after a failed attempt)
  // so one patient can never hold several seats; release it if they picked a different slot.
  const liveHolds = await dbRepo.findActiveHoldsForPatient(patientId, parsed.data.doctorId, parsed.data.appointmentDate);
  for (const live of liveHolds) {
    if (live.appointment.startTime === parsed.data.startTime && live.payment && live.payment.status !== "PAID") {
      return buildHoldResponse(live.appointment, live.payment, live.appointment.holdExpiresAt ?? new Date());
    }
    await dbRepo.expireAppointmentHold(live.appointment.id);
    if (live.payment && (live.payment.status === "CREATED" || live.payment.status === "PENDING")) {
      await dbRepo.updatePaymentStatus(live.payment.id, "EXPIRED", { failureReason: "Replaced by a new slot selection." });
    }
  }

  const holdMinutes = getPaymentHoldMinutes();
  const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

  const holdResult = await dbRepo.createAppointment({
    patientId,
    doctorId: parsed.data.doctorId,
    sessionId: matchedSession.id,
    appointmentDate: parsed.data.appointmentDate,
    startTime: parsed.data.startTime,
    endTime: serverEndTime,
    reason: parsed.data.reason,
    status: "PENDING_PAYMENT",
    holdExpiresAt,
  });

  if (!holdResult.success || !holdResult.appointment) {
    return { success: false, error: holdResult.message };
  }

  const appointment = holdResult.appointment;
  const receiptNo = generateReceiptNo();

  let order;
  try {
    order = await provider.createOrder({
      amountPaise,
      currency: "INR",
      receipt: receiptNo,
      notes: {
        appointmentId: appointment.id,
        patientId,
        doctorId: doctor.id,
      },
    });
  } catch (err: any) {
    // Release the hold if the order could not be created. Details go to the log, not to the browser.
    console.error("[PAYMENT_ORDER_ERROR]", err?.message);
    await dbRepo.updateAppointmentStatus(appointment.id, "EXPIRED", {
      cancelledBy: "SYSTEM",
      cancelReason: "Payment order creation failed",
    });
    return { success: false, error: "Could not start the payment. Please try again in a moment." };
  }

  const payment = await dbRepo.createPayment({
    id: `pay-${crypto.randomUUID()}`,
    appointmentId: appointment.id,
    patientId,
    provider: provider.name,
    providerOrderId: order.id,
    amountPaise,
    currency: "INR",
    status: "CREATED",
    receiptNo,
    expiresAt: holdExpiresAt,
  });

  revalidatePath("/", "layout");
  revalidatePath(`/doctors/${parsed.data.doctorId}`);

  return buildHoldResponse(appointment, payment, holdExpiresAt);
}

/** Backward compatibility alias for form submissions */
export async function bookAppointmentAction(formData: FormData) {
  return createBookingHoldAction(formData);
}

/**
 * Browser Checkout Signature Verification & Booking Confirmation:
 * Called immediately when Razorpay Checkout returns to the browser.
 * Verifies HMAC signature with timingSafeEqual, confirms booking in a single transaction,
 * schedules reminders and sends confirmation email.
 */
/**
 * Server-side half of "customer paid at the checkout". Everything the browser sends is untrusted:
 * the payment must belong to THIS appointment and THIS patient, the signature must be valid for
 * the order we created, and the gateway itself must report the full amount as paid.
 */
export async function verifyPaymentAndConfirmBookingAction(data: {
  appointmentId: string;
  paymentId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }
  if (
    !data ||
    [data.appointmentId, data.paymentId, data.providerOrderId, data.providerPaymentId, data.signature].some(
      (v) => typeof v !== "string" || !v
    )
  ) {
    return { success: false, error: "Payment verification failed." };
  }

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (err) {
    console.error("[PAYMENT_CONFIG_ERROR]", (err as Error).message);
    return { success: false, error: "Online payments are not available right now." };
  }

  const patientId = await resolvePayingPatientId(user);
  const [payment, appointmentBefore] = await Promise.all([
    dbRepo.getPaymentById(data.paymentId),
    dbRepo.getAppointmentById(data.appointmentId),
  ]);

  // 1. Bind the payment to this appointment and this patient (never trust browser-supplied ids).
  const binding = checkPaymentBinding({
    payment,
    appointment: appointmentBefore,
    patientId: patientId ?? "",
    providerName: provider.name,
    appointmentId: data.appointmentId,
    providerOrderId: data.providerOrderId,
    providerPaymentId: data.providerPaymentId,
  });
  if (!binding.ok || !payment) {
    console.warn("[PAYMENT_BINDING_REJECTED]", binding.ok ? "no payment" : binding.reason, { userId: user.userId });
    return { success: false, error: "Payment verification failed." };
  }

  // 2. The signature must be valid for the order WE created and the payment the gateway reported.
  const signatureOk = provider.verifyCheckoutSignature({
    orderId: payment.providerOrderId,
    paymentId: data.providerPaymentId,
    signature: data.signature,
  });
  if (!signatureOk) {
    await dbRepo.updatePaymentStatus(payment.id, payment.status, { failureReason: "Checkout signature did not verify." });
    return { success: false, error: "Payment verification failed. Invalid signature." };
  }

  // 3. Ask the gateway directly: the order must be paid, for at least the fee we charged.
  let order;
  try {
    order = await provider.fetchOrder(payment.providerOrderId);
  } catch (err) {
    console.error("[PAYMENT_FETCH_ORDER_ERROR]", (err as Error).message);
    return {
      success: false,
      error: "We could not confirm your payment with the bank yet. If you were charged, your booking will be confirmed automatically in a few minutes.",
    };
  }
  const settled = checkOrderSettled(order, payment, data.providerPaymentId);
  if (!settled.ok) {
    if (settled.pending) {
      return {
        success: false,
        error: "Your payment is still being confirmed by the bank. Your seat stays reserved and you will receive a confirmation shortly.",
      };
    }
    console.warn("[PAYMENT_ORDER_REJECTED]", settled.reason, { paymentId: payment.id });
    return { success: false, error: "Payment verification failed." };
  }

  // 4. Confirm the booking and mark the payment PAID in one transaction.
  const confirmResult = await dbRepo.confirmPaymentAndBookAppointment({
    appointmentId: data.appointmentId,
    paymentId: payment.id,
    providerPaymentId: data.providerPaymentId,
  });

  if (!confirmResult.success) {
    // Paid, but the seat is gone (hold expired and was taken, or the booking was cancelled first): refund in full.
    if (confirmResult.refundNeeded && confirmResult.payment) {
      const { refund } = await issueRefund(
        dbRepo,
        {
          payment: { ...confirmResult.payment, providerPaymentId: data.providerPaymentId },
          appointmentId: data.appointmentId,
          amountPaise: confirmResult.payment.amountPaise,
          reason: "This booking could no longer be confirmed after payment. Full refund.",
          purpose: "AUTO_REFUND_EXPIRED_SLOT",
        },
        provider
      );

      runInBackground(async () => {
        await processDueNotifications(dbRepo);
      });

      return {
        success: false,
        error: `Your seat hold ended before the payment completed and the slot is no longer available.${
          refund ? describeRefund(refund) : ""
        }`,
      };
    }
    return { success: false, error: confirmResult.message };
  }

  const appointment = confirmResult.appointment!;
  const confirmedPayment = confirmResult.payment!;

  // 5. Confirmation + receipt emails and reminders (de-duplicated, safe to repeat).
  await finalizeConfirmedBooking(dbRepo, appointment, confirmedPayment);
  runInBackground(async () => {
    await processDueNotifications(dbRepo);
  });

  revalidatePath("/", "layout");
  revalidatePath("/patient/dashboard");
  revalidatePath("/patient/payments");
  revalidatePath("/doctor/dashboard");
  revalidatePath(`/doctors/${appointment.doctorId}`);

  return {
    success: true,
    message: confirmResult.message,
    appointmentId: appointment.id,
    tokenNumber: appointment.tokenNumber,
    paymentId: confirmedPayment.id,
    receiptNo: confirmedPayment.receiptNo,
  };
}

/**
 * Test-gateway only: plays the part of "the customer pays at Razorpay Checkout" ON THE SERVER, so
 * no signing secret ever reaches the browser. Refuses to run in production or with real Razorpay.
 */
export async function simulateMockPaymentAction(data: { appointmentId: string; paymentId: string }) {
  if (process.env.NODE_ENV === "production") {
    return { success: false as const, error: "Not available." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { success: false as const, error: "Unauthorized. Please sign in." };
  }
  let provider;
  try {
    provider = getPaymentProvider();
  } catch {
    return { success: false as const, error: "Payments are not configured." };
  }
  if (provider.name !== "MOCK") {
    return { success: false as const, error: "Simulated payments are only available with the mock gateway." };
  }

  const patientId = await resolvePayingPatientId(user);
  const payment = await dbRepo.getPaymentById(data.paymentId);
  if (!payment || payment.appointmentId !== data.appointmentId || payment.patientId !== patientId) {
    return { success: false as const, error: "Payment not found." };
  }

  try {
    const paid = (provider as MockProvider).simulatePayment(payment.providerOrderId);
    return {
      success: true as const,
      providerOrderId: paid.orderId,
      providerPaymentId: paid.paymentId,
      signature: paid.signature,
    };
  } catch {
    return { success: false as const, error: "Could not simulate the payment." };
  }
}

/**
 * Preview refund calculation for an appointment before cancellation:
 * Shows patient or doctor exact percentage and rupee amount based on ruby hall refund policy.
 */
export async function getRefundPreviewAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment) {
    return { success: false, error: "Appointment not found." };
  }

  const payment = await dbRepo.getPaymentByAppointmentId(appointmentId);
  if (!payment || payment.status !== "PAID") {
    // Unpaid or free appointment: no monetary refund
    return {
      success: true,
      hasPayment: false,
      eligible: false,
      refundPercentage: 0,
      refundAmountPaise: 0,
      refundAmountRupees: 0,
      originalAmountPaise: 0,
      policyTier: "NO_PAYMENT",
      reason: "No paid transaction found for this appointment.",
    };
  }

  const existingRefunds = await dbRepo.getRefundsByPaymentId(payment.id);
  const alreadyRefundedPaise = existingRefunds
    .filter((r) => r.status === "PROCESSED" || r.status === "PENDING" || r.status === "REQUESTED")
    .reduce((sum, r) => sum + r.amountPaise, 0);

  const preview = computeRefund({
    cancelledBy: user.role === "DOCTOR" ? "DOCTOR" : "PATIENT",
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    amountPaidPaise: payment.amountPaise,
    alreadyRefundedPaise,
  });

  return {
    success: true,
    hasPayment: true,
    eligible: preview.eligible,
    refundPercentage: preview.refundPercentage,
    refundAmountPaise: preview.refundAmountPaise,
    refundAmountRupees: preview.refundAmountPaise / 100,
    originalAmountPaise: payment.amountPaise,
    alreadyRefundedPaise,
    policyTier: `${preview.refundPercentage}% refund tier`,
    reason: preview.reason,
    receiptNo: payment.receiptNo,
  };
}

export async function rescheduleAppointmentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const appointmentId = formData.get("appointmentId");
  const newDate = formData.get("newDate");
  const newStartTime = formData.get("newStartTime");

  if (typeof appointmentId !== "string" || typeof newDate !== "string" || typeof newStartTime !== "string" || !appointmentId) {
    return { success: false, error: "Missing required reschedule details." };
  }

  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment) {
    return { success: false, error: "Appointment record not found." };
  }

  const slot = await checkRequestedSlot(appointment.doctorId, newDate, newStartTime);
  if (!slot.ok) {
    return { success: false, error: slot.error };
  }

  const result = await dbRepo.rescheduleAppointment({
    appointmentId,
    newDate,
    newStartTime,
    newEndTime: slot.endTime,
    newSessionId: slot.session.id,
    actorUserId: user.userId,
    actorRole: user.role,
  });

  if (!result.success || !result.appointment) {
    return { success: false, error: result.message };
  }

  const doctor = await dbRepo.getDoctorById(appointment.doctorId);
  const patient = await dbRepo.getPatientById(appointment.patientId);
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";

  // Re-schedule reminders for the new date and time
  if (doctor) {
    await updateRescheduledReminders(
      dbRepo,
      result.appointment,
      user.email,
      user.userId,
      patientName,
      doctor
    );
  }

  // Queue reschedule notification
  await createNotification(dbRepo, {
    userId: user.userId,
    appointmentId: result.appointment.id,
    channel: "EMAIL",
    template: "APPOINTMENT_RESCHEDULED",
    recipient: user.email,
    payload: {
      patientName,
      doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : "Doctor",
      specialization: doctor?.specialization || "Specialist",
      newAppointmentDate: result.appointment.appointmentDate,
      newStartTime: result.appointment.startTime,
      newEndTime: result.appointment.endTime,
      newTokenNumber: result.appointment.tokenNumber,
      previousDate: appointment.appointmentDate,
      previousTime: appointment.startTime,
    },
    dedupeKey: `reschedule-${result.appointment.id}-${result.appointment.appointmentDate}-${result.appointment.startTime}`,
  });

  runInBackground(async () => {
    await processDueNotifications(dbRepo);
  });

  revalidatePath("/", "layout");
  revalidatePath("/patient/dashboard");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");

  return {
    success: true,
    message: result.message,
    appointment: result.appointment,
  };
}

export async function cancelAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment) {
    return { success: false, error: "Appointment not found." };
  }

  const isPatientOwner = user.role === "PATIENT" && appointment.patientId === user.profileId;
  const isDoctorOwner = user.role === "DOCTOR" && appointment.doctorId === user.profileId;

  if (!isPatientOwner && !isDoctorOwner) {
    return {
      success: false,
      error: "Forbidden: You do not have permission to cancel this appointment.",
    };
  }

  if (appointment.status === "COMPLETED") {
    return {
      success: false,
      error: "Cannot cancel an appointment that has already been completed.",
    };
  }

  if (appointment.status === "CANCELLED") {
    return {
      success: false,
      error: "This appointment is already cancelled.",
    };
  }

  // If appointment was only PENDING_PAYMENT or EXPIRED:
  if (appointment.status === "PENDING_PAYMENT" || appointment.status === "EXPIRED") {
    await dbRepo.updateAppointmentStatus(appointmentId, "CANCELLED", {
      cancelledBy: user.role,
      cancelReason: "Cancelled before payment",
    });
    await cancelAppointmentReminders(dbRepo, appointmentId);
    revalidatePath("/patient/dashboard");
    revalidatePath(`/doctors/${appointment.doctorId}`);
    return { success: true, message: "Appointment booking cancelled." };
  }

  // Clinical Rule: Patient cancellations permitted up to 1 hour prior to appointment start time
  if (user.role === "PATIENT") {
    const [year, month, day] = appointment.appointmentDate.split("-").map(Number);
    const [hours, minutes] = appointment.startTime.split(":").map(Number);
    const appointmentDateTime = new Date(year, month - 1, day, hours, minutes);
    const now = new Date();
    const diffMs = appointmentDateTime.getTime() - now.getTime();
    const oneHourMs = 60 * 60 * 1000;

    if (diffMs < oneHourMs) {
      return {
        success: false,
        error: "Cancellations are only permitted up to 1 hour prior to appointment start time. Please contact Ruby Hall clinic desk (+91 20 6645 5100) for late assistance.",
      };
    }
  }

  // Work out any refund and record it BEFORE cancelling, so a crash can never leave a cancelled
  // booking with no refund on file. (A recorded-but-unsent refund is retried by the sweep.)
  const payment = await dbRepo.getPaymentByAppointmentId(appointmentId);
  let refundCalc: ReturnType<typeof computeRefund> | undefined;
  let prepared: PreparedRefund | undefined;

  if (payment && (payment.status === "PAID" || payment.status === "PARTIALLY_REFUNDED")) {
    const existingRefunds = await dbRepo.getRefundsByPaymentId(payment.id);
    const alreadyRefundedPaise = existingRefunds
      .filter((r) => r.status === "PROCESSED" || r.status === "PENDING" || r.status === "REQUESTED")
      .reduce((sum, r) => sum + r.amountPaise, 0);

    refundCalc = computeRefund({
      cancelledBy: user.role === "DOCTOR" ? "DOCTOR" : "PATIENT",
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      amountPaidPaise: payment.amountPaise,
      alreadyRefundedPaise,
    });

    if (refundCalc.eligible && refundCalc.refundAmountPaise > 0) {
      prepared = await prepareRefund(dbRepo, {
        payment,
        appointmentId: appointment.id,
        amountPaise: refundCalc.refundAmountPaise,
        reason: refundCalc.reason,
        purpose: "CANCELLATION",
      });
    }
  }

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "CANCELLED", {
    cancelledBy: user.role,
    cancelReason: `Cancelled by ${user.role.toLowerCase()}`,
  });
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  // Cancel any pending reminders
  await cancelAppointmentReminders(dbRepo, appointmentId);

  // Now ask the gateway. The refund is only "processed" if the gateway says so.
  let refundMessage = "";
  let refundForEmail: RefundEntity | undefined;
  if (payment && refundCalc) {
    if (prepared?.refund) {
      let refund = prepared.refund;
      if (prepared.needsExecution) {
        refund = await executeRefund(dbRepo, refund, payment);
      }
      refundForEmail = refund;
      refundMessage = describeRefund(refund);
    } else if (prepared?.skippedReason) {
      refundMessage = " There is no refundable balance left on this payment.";
    } else {
      refundMessage = " No refund applies under the cancellation policy (less than 2 hours' notice).";
    }
  }

  // Tell the PATIENT (not whoever pressed the button; a doctor may be cancelling).
  const patientRecord = await dbRepo.getPatientById(appointment.patientId);
  const patientUser = patientRecord ? await dbRepo.getUserById(patientRecord.userId) : undefined;
  const doctorRecord = await dbRepo.getDoctorById(appointment.doctorId);
  if (patientRecord && patientUser) {
    const isDoc = user.role === "DOCTOR";
    const cancelTemplate = isDoc ? "APPOINTMENT_CANCELLED_BY_DOCTOR" : "APPOINTMENT_CANCELLED";
    await createNotification(dbRepo, {
      userId: patientUser.id,
      appointmentId: appointment.id,
      channel: "EMAIL",
      template: cancelTemplate,
      recipient: patientUser.email,
      payload: {
        patientName: `${patientRecord.firstName} ${patientRecord.lastName}`,
        doctorName: doctorRecord ? `${doctorRecord.firstName} ${doctorRecord.lastName}` : "your doctor",
        appointmentDate: appointment.appointmentDate,
        startTime: appointment.startTime,
        reason: isDoc ? "Cancelled by doctor / clinical schedule update" : undefined,
        refundAmountFormatted:
          refundForEmail && refundForEmail.status !== "FAILED" ? formatPaise(refundForEmail.amountPaise) : undefined,
      },
      dedupeKey: `cancel-notif-${appointment.id}`,
    });
  }

  runInBackground(async () => {
    await processDueNotifications(dbRepo);
  });

  revalidatePath("/patient/dashboard");
  revalidatePath("/patient/payments");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");

  return {
    success: true,
    message: `Appointment cancelled successfully.${refundMessage}`,
  };
}

export async function completeAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can complete appointments." };
  }

  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment) {
    return { success: false, error: "Appointment not found." };
  }

  if (appointment.doctorId !== user.profileId) {
    return {
      success: false,
      error: "Forbidden: You can only complete consultations assigned to your own schedule.",
    };
  }

  if (appointment.status === "CANCELLED") {
    return {
      success: false,
      error: "Cannot complete a cancelled appointment.",
    };
  }

  if (appointment.status === "COMPLETED") {
    return {
      success: false,
      error: "Appointment is already marked as completed.",
    };
  }

  if (!hasAppointmentStarted(appointment)) {
    return {
      success: false,
      error: "Cannot mark an appointment as completed before its scheduled start time.",
    };
  }

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "COMPLETED");
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  await cancelAppointmentReminders(dbRepo, appointmentId);

  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");
  return { success: true, message: "Appointment marked as completed." };
}

export async function markNoShowAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can mark appointments as No-Show." };
  }

  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment) {
    return { success: false, error: "Appointment not found." };
  }

  if (appointment.doctorId !== user.profileId) {
    return {
      success: false,
      error: "Forbidden: You can only update appointments assigned to your own schedule.",
    };
  }

  if (appointment.status !== "BOOKED") {
    return {
      success: false,
      error: `Cannot mark as No-Show. Current status is ${appointment.status}.`,
    };
  }

  if (!hasAppointmentStarted(appointment)) {
    return {
      success: false,
      error: "Cannot mark a patient as No-Show before the appointment's scheduled start time.",
    };
  }

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "NO_SHOW");
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  await cancelAppointmentReminders(dbRepo, appointmentId);

  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");
  return { success: true, message: "Appointment marked as No-Show." };
}

