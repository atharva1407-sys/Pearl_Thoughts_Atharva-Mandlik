"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { bookingSchema } from "@/lib/validators";

export async function bookAppointmentAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") {
    return { success: false, error: "You must be signed in as a patient to book an appointment." };
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

  const result = dbRepo.createAppointment({
    patientId: user.profileId,
    doctorId: parsed.data.doctorId,
    appointmentDate: parsed.data.appointmentDate,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    reason: parsed.data.reason,
  });

  if (!result.success) {
    return { success: false, error: result.message };
  }

  revalidatePath("/patient/dashboard");
  revalidatePath("/doctor/dashboard");
  revalidatePath(`/doctors/${parsed.data.doctorId}`);

  return { success: true, message: result.message, appointmentId: result.appointment?.id };
}

export async function cancelAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const success = dbRepo.updateAppointmentStatus(appointmentId, "CANCELLED");
  if (!success) {
    return { success: false, error: "Appointment not found." };
  }

  revalidatePath("/patient/dashboard");
  revalidatePath("/doctor/dashboard");
  return { success: true, message: "Appointment cancelled." };
}

export async function completeAppointmentAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Only doctors can complete appointments." };
  }

  const success = dbRepo.updateAppointmentStatus(appointmentId, "COMPLETED");
  if (!success) {
    return { success: false, error: "Appointment not found." };
  }

  revalidatePath("/doctor/dashboard");
  return { success: true, message: "Appointment marked as completed." };
}
