"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { bookingSchema } from "@/lib/validators";

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

  // 1. Server-side validation: Date cannot be in the past
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (parsed.data.appointmentDate < todayStr) {
    return { success: false, error: "Cannot schedule appointments for past dates." };
  }

  // 2. Server-side validation: Doctor must exist
  const doctor = await dbRepo.getDoctorById(parsed.data.doctorId);
  if (!doctor) {
    return { success: false, error: "The selected doctor could not be found." };
  }

  // 3. Server-side validation: Verify day of week and active shift
  const aptDate = new Date(parsed.data.appointmentDate + "T00:00:00");
  const dayMap: Array<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"> = [
    "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"
  ];
  const targetDay = dayMap[aptDate.getDay()];

  const availabilities = await dbRepo.getAvailabilitiesByDoctorId(doctor.id);
  const shift = availabilities.find((a) => a.dayOfWeek === targetDay && a.isActive);
  if (!shift) {
    return {
      success: false,
      error: `Dr. ${doctor.lastName} is not scheduled for outpatient consultations on ${targetDay}.`,
    };
  }

  // 4. Server-side recomputation: Parse times, verify slot alignment, and calculate endTime
  const [startH, startM] = parsed.data.startTime.split(":").map(Number);
  if (isNaN(startH) || isNaN(startM) || startH < 0 || startH > 23 || startM < 0 || startM > 59) {
    return { success: false, error: "Invalid appointment slot time format." };
  }
  const startMinutes = startH * 60 + startM;

  const [shiftStartH, shiftStartM] = shift.startTime.split(":").map(Number);
  const [shiftEndH, shiftEndM] = shift.endTime.split(":").map(Number);
  const shiftStartMinutes = shiftStartH * 60 + shiftStartM;
  const shiftEndMinutes = shiftEndH * 60 + shiftEndM;

  if (startMinutes < shiftStartMinutes || startMinutes >= shiftEndMinutes) {
    return {
      success: false,
      error: "Requested time slot is outside of the physician's active consultation hours.",
    };
  }

  if ((startMinutes - shiftStartMinutes) % shift.slotDurationMinutes !== 0) {
    return {
      success: false,
      error: "Requested time slot does not align with the doctor's consultation intervals.",
    };
  }

  // Prevent booking a slot that has already passed earlier today
  if (parsed.data.appointmentDate === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMinutes <= currentMinutes) {
      return { success: false, error: "Cannot book a time slot that has already passed today." };
    }
  }

  // Strictly recompute serverEndTime (do not trust client-supplied endTime)
  const calculatedEndMinutes = startMinutes + shift.slotDurationMinutes;
  if (calculatedEndMinutes > shiftEndMinutes) {
    return {
      success: false,
      error: "Appointment slot exceeds the doctor's shift closing time.",
    };
  }
  const endH = Math.floor(calculatedEndMinutes / 60).toString().padStart(2, "0");
  const endM = (calculatedEndMinutes % 60).toString().padStart(2, "0");
  const serverEndTime = `${endH}:${endM}`;

  let patientId = user.profileId;
  if (user.role === "DOCTOR") {
    let patient = await dbRepo.getPatientByUserId(user.userId);
    if (!patient) {
      const doctor = await dbRepo.getDoctorById(user.profileId);
      const newPatientId = `pat_${crypto.randomUUID()}`;
      patient = await dbRepo.createPatient({
        id: newPatientId,
        userId: user.userId,
        firstName: doctor?.firstName || "Dr.",
        lastName: doctor?.lastName || "Staff",
        phone: doctor?.phone || "+91 20 6645 5000",
      });
    }
    patientId = patient.id;
  }

  const result = await dbRepo.createAppointment({
    patientId,
    doctorId: parsed.data.doctorId,
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

  return { success: true, message: result.message, appointmentId: result.appointment?.id };
}

export async function cancelAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  // Security & Authorization: Verify appointment existence and ownership
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

  // Clinical Rule: Cancellations are permitted up to 1 hour prior to appointment start time
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
  return { success: true, message: "Appointment cancelled successfully." };
}

export async function completeAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can complete appointments." };
  }

  // Security & Authorization: Verify physician ownership of this appointment
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
