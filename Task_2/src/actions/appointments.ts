"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { bookingSchema } from "@/lib/validators";
import { checkRequestedSlot } from "@/lib/booking-rules";

export async function bookAppointmentAction(formData: FormData) {
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

  // Shared with rescheduling: date window, leave, session match, alignment and notice rules.
  const slot = await checkRequestedSlot(parsed.data.doctorId, parsed.data.appointmentDate, parsed.data.startTime);
  if (!slot.ok) {
    return { success: false, error: slot.error };
  }
  const { session: matchedSession, endTime: serverEndTime } = slot;

  let patientId = user.profileId;
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
  }

  const result = await dbRepo.createAppointment({
    patientId,
    doctorId: parsed.data.doctorId,
    sessionId: matchedSession.id,
    appointmentDate: parsed.data.appointmentDate,
    startTime: parsed.data.startTime,
    endTime: serverEndTime,
    reason: parsed.data.reason,
  });

  if (!result.success) {
    return { success: false, error: result.message };
  }

  revalidatePath("/", "layout");
  revalidatePath("/patient/dashboard");
  revalidatePath("/doctor/dashboard");
  revalidatePath(`/doctors/${parsed.data.doctorId}`);

  return {
    success: true,
    message: result.message,
    appointmentId: result.appointment?.id,
    tokenNumber: result.appointment?.tokenNumber,
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

  // Same rules as a new booking. The end time and session come from the doctor's schedule,
  // not from the browser (newEndTime / newSessionId in the form are ignored).
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

  if (!result.success) {
    return { success: false, error: result.message };
  }

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

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "CANCELLED");
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  revalidatePath("/patient/dashboard");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");
  return { success: true, message: "Appointment cancelled successfully." };
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

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "COMPLETED");
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

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

  const success = await dbRepo.updateAppointmentStatus(appointmentId, "NO_SHOW");
  if (!success) {
    return { success: false, error: "Failed to update appointment status." };
  }

  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reports");
  return { success: true, message: "Appointment marked as No-Show." };
}
