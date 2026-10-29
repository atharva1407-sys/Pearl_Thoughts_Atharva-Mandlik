"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { bookingSchema } from "@/lib/validators";
import { checkRequestedSlot, hasAppointmentStarted } from "@/lib/booking-rules";
import {
  getPaymentProvider,
  formatPaise,
  generateReceiptNo,
  getPaymentHoldMinutes,
} from "@/lib/payments";
import { computeRefund, buildRefundIdempotencyKey } from "@/lib/refund-policy";
import {
  scheduleAppointmentReminders,
  updateRescheduledReminders,
  cancelAppointmentReminders,
  processDueNotifications,
} from "@/lib/notifications";

function runInBackground(fn: () => Promise<any>) {
  try {
    if (typeof after === "function") {
      after(fn);
      return;
    }
  } catch {
    // Outside Next.js request context (e.g. CLI or unit test runner)
  }
  fn().catch((err) => console.error("[BACKGROUND_JOB_ERROR]", err));
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
  } else {
    const patient = await dbRepo.getPatientById(patientId);
    if (patient) {
      patientName = `${patient.firstName} ${patient.lastName}`;
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
    await dbRepo.createNotification({
      id: `notif-${crypto.randomUUID()}`,
      userId: user.userId,
      appointmentId: result.appointment.id,
      channel: "EMAIL",
      template: "BOOKING_CONFIRMATION",
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
      status: "PENDING",
      scheduledFor: new Date(),
      attempts: 0,
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
      success: true,
      requiresPayment: false,
      message: result.message,
      appointmentId: result.appointment.id,
      tokenNumber: result.appointment.tokenNumber,
    };
  }

  // Case 2: Paid appointment -> create seat hold and payment order
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
  const provider = getPaymentProvider();
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
    // Release hold if order creation failed
    await dbRepo.updateAppointmentStatus(appointment.id, "EXPIRED", {
      cancelledBy: "SYSTEM",
      cancelReason: `Payment order creation failed: ${err.message}`,
    });
    return { success: false, error: `Could not initiate payment: ${err.message}` };
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

  return {
    success: true,
    requiresPayment: true,
    provider: provider.name,
    keyId: provider.keyId,
    orderId: order.id,
    amountPaise,
    amountRupees: feeRupees,
    currency: "INR",
    paymentId: payment.id,
    appointmentId: appointment.id,
    holdExpiresAt: holdExpiresAt.toISOString(),
    receiptNo,
    doctorName: `${doctor.firstName} ${doctor.lastName}`,
    specialization: doctor.specialization,
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    patientName,
    patientEmail,
    patientPhone: doctor.phone || "+91 98765 43210",
  };
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

  const provider = getPaymentProvider();

  // 1. Verify HMAC SHA-256 signature
  const isValid = provider.verifyCheckoutSignature({
    orderId: data.providerOrderId,
    paymentId: data.providerPaymentId,
    signature: data.signature,
  });

  if (!isValid) {
    const payment = await dbRepo.getPaymentById(data.paymentId);
    if (payment) {
      await dbRepo.updatePaymentStatus(payment.id, "FAILED", {
        failureReason: "HMAC signature verification failed. Possible forgery attempt.",
      });
    }
    return { success: false, error: "Payment verification failed. Invalid signature." };
  }

  // 2. Confirm booking and mark payment PAID in an atomic transaction
  const confirmResult = await dbRepo.confirmPaymentAndBookAppointment({
    appointmentId: data.appointmentId,
    paymentId: data.paymentId,
    providerPaymentId: data.providerPaymentId,
  });

  if (!confirmResult.success) {
    // Edge case: Hold expired while patient was completing checkout and slot was taken
    if (confirmResult.refundNeeded && confirmResult.payment) {
      const payment = confirmResult.payment;
      let refundStatus: "PROCESSED" | "FAILED" = "PROCESSED";
      let providerRefundId: string | null = null;
      let failureReason: string | null = null;

      try {
        const refundResult = await provider.createRefund({
          paymentId: data.providerPaymentId,
          amountPaise: payment.amountPaise,
          reason: "Seat hold expired and slot was claimed by another patient",
        });
        providerRefundId = refundResult.id;
      } catch (err: any) {
        refundStatus = "FAILED";
        failureReason = err.message;
      }

      await dbRepo.createRefund({
        id: `ref-${crypto.randomUUID()}`,
        paymentId: payment.id,
        appointmentId: data.appointmentId,
        amountPaise: payment.amountPaise,
        reason: "Hold expired and slot taken - 100% automatic refund",
        status: refundStatus,
        providerRefundId,
        idempotencyKey: buildRefundIdempotencyKey(payment.id, data.appointmentId, "AUTO_REFUND_EXPIRED_SLOT"),
        failureReason,
      });

      // Notify patient of automatic refund
      await dbRepo.createNotification({
        id: `notif-${crypto.randomUUID()}`,
        userId: user.userId,
        appointmentId: data.appointmentId,
        channel: "EMAIL",
        template: "REFUND_NOTIFICATION",
        recipient: user.email,
        payload: {
          patientName: "Patient",
          appointmentDate: confirmResult.appointment?.appointmentDate || "Scheduled Date",
          refundAmountFormatted: formatPaise(payment.amountPaise),
          refundPercentage: 100,
          reason: "Your payment hold expired and the slot was taken. A full refund has been initiated.",
          status: refundStatus,
        },
        status: "PENDING",
        scheduledFor: new Date(),
        attempts: 0,
        dedupeKey: `refund-auto-${payment.id}`,
      });

      runInBackground(async () => {
        await processDueNotifications(dbRepo);
      });

      return {
        success: false,
        error: `Your 10-minute hold expired before payment completed and the slot was taken. A 100% automatic refund of ${formatPaise(payment.amountPaise)} has been initiated to your original payment method.`,
      };
    }

    return { success: false, error: confirmResult.message };
  }

  const appointment = confirmResult.appointment!;
  const payment = confirmResult.payment!;
  const doctor = await dbRepo.getDoctorById(appointment.doctorId);
  const patient = await dbRepo.getPatientById(appointment.patientId);
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Patient";

  // 3. Queue confirmation notification & reminders
  await dbRepo.createNotification({
    id: `notif-${crypto.randomUUID()}`,
    userId: user.userId,
    appointmentId: appointment.id,
    channel: "EMAIL",
    template: "BOOKING_CONFIRMATION",
    recipient: user.email,
    payload: {
      patientName,
      doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : "Doctor",
      specialization: doctor?.specialization || "Specialist",
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      tokenNumber: appointment.tokenNumber,
      receiptNo: payment.receiptNo,
      amountFormatted: formatPaise(payment.amountPaise),
    },
    status: "PENDING",
    scheduledFor: new Date(),
    attempts: 0,
    dedupeKey: `confirm-${appointment.id}`,
  });

  if (doctor) {
    await scheduleAppointmentReminders(
      dbRepo,
      appointment,
      user.email,
      user.userId,
      patientName,
      doctor
    );
  }

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
    paymentId: payment.id,
    receiptNo: payment.receiptNo,
  };
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
  await dbRepo.createNotification({
    id: `notif-${crypto.randomUUID()}`,
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
    status: "PENDING",
    scheduledFor: new Date(),
    attempts: 0,
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

  // Update status to CANCELLED
  const success = await dbRepo.updateAppointmentStatus(appointmentId, "CANCELLED", {
    cancelledBy: user.role,
    cancelReason: `Cancelled by ${user.role.toLowerCase()}`,
  });
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  // Cancel any pending reminders
  await cancelAppointmentReminders(dbRepo, appointmentId);

  // Check for paid payment and process refund
  let refundMessage = "";
  const payment = await dbRepo.getPaymentByAppointmentId(appointmentId);

  if (payment && payment.status === "PAID") {
    const existingRefunds = await dbRepo.getRefundsByPaymentId(payment.id);
    const alreadyRefundedPaise = existingRefunds
      .filter((r) => r.status === "PROCESSED" || r.status === "PENDING" || r.status === "REQUESTED")
      .reduce((sum, r) => sum + r.amountPaise, 0);

    const refundCalc = computeRefund({
      cancelledBy: user.role === "DOCTOR" ? "DOCTOR" : "PATIENT",
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      amountPaidPaise: payment.amountPaise,
      alreadyRefundedPaise,
    });

    if (refundCalc.eligible && refundCalc.refundAmountPaise > 0) {
      const idempotencyKey = buildRefundIdempotencyKey(payment.id, appointment.id, "CANCELLATION");
      let refund = await dbRepo.getRefundByIdempotencyKey(idempotencyKey);

      if (!refund) {
        const provider = getPaymentProvider();
        let refundStatus: "PROCESSED" | "FAILED" = "PROCESSED";
        let providerRefundId: string | null = null;
        let failureReason: string | null = null;

        try {
          if (payment.providerPaymentId) {
            const providerResult = await provider.createRefund({
              paymentId: payment.providerPaymentId,
              amountPaise: refundCalc.refundAmountPaise,
              reason: refundCalc.reason,
            });
            providerRefundId = providerResult.id;
          }
        } catch (err: any) {
          refundStatus = "FAILED";
          failureReason = err.message;
        }

        refund = await dbRepo.createRefund({
          id: `ref-${crypto.randomUUID()}`,
          paymentId: payment.id,
          appointmentId: appointment.id,
          amountPaise: refundCalc.refundAmountPaise,
          reason: refundCalc.reason,
          status: refundStatus,
          providerRefundId,
          idempotencyKey,
          failureReason,
        });

        // Queue refund notification
        await dbRepo.createNotification({
          id: `notif-${crypto.randomUUID()}`,
          userId: user.userId,
          appointmentId: appointment.id,
          channel: "EMAIL",
          template: "REFUND_NOTIFICATION",
          recipient: user.email,
          payload: {
            patientName: "Patient",
            appointmentDate: appointment.appointmentDate,
            refundAmountFormatted: formatPaise(refundCalc.refundAmountPaise),
            refundPercentage: refundCalc.refundPercentage,
            reason: refundCalc.reason,
            status: refundStatus,
          },
          status: "PENDING",
          scheduledFor: new Date(),
          attempts: 0,
          dedupeKey: `refund-notif-${refund.id}`,
        });

        refundMessage = ` Refund of ${formatPaise(refundCalc.refundAmountPaise)} initiated (${refundCalc.refundPercentage}% policy).`;
      }
    } else {
      refundMessage = ` No refund applicable according to the cancellation policy (<2h notice).`;
    }
  }

  // Queue appointment cancellation notification
  await dbRepo.createNotification({
    id: `notif-${crypto.randomUUID()}`,
    userId: user.userId,
    appointmentId: appointment.id,
    channel: "EMAIL",
    template: "APPOINTMENT_CANCELLED",
    recipient: user.email,
    payload: {
      patientName: "Patient",
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      cancelledBy: user.role,
    },
    status: "PENDING",
    scheduledFor: new Date(),
    attempts: 0,
    dedupeKey: `cancel-notif-${appointment.id}`,
  });

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

