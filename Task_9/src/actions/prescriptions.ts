"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { prescriptionSchema } from "@/lib/validators";

/**
 * A doctor writes (or edits) the prescription for one of their OWN completed consultations.
 * The patient and doctor ids always come from the stored appointment, never from the browser.
 */
export async function savePrescriptionAction(input: {
  appointmentId: string;
  medicines: { name: string; dosage: string; frequency: string; duration: string }[];
  notes?: string;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false as const, error: "Only doctors can write prescriptions." };
  }

  const parsed = prescriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const appointment = await dbRepo.getAppointmentById(parsed.data.appointmentId);
  if (!appointment || appointment.doctorId !== user.profileId) {
    return { success: false as const, error: "You can only prescribe for your own consultations." };
  }
  if (appointment.status !== "COMPLETED") {
    return { success: false as const, error: "Mark the consultation as completed before writing a prescription." };
  }

  try {
    await dbRepo.upsertPrescription({
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      medicines: parsed.data.medicines,
      notes: parsed.data.notes || null,
    });
  } catch (err) {
    console.error("[PRESCRIPTION_SAVE_ERROR]", (err as Error).message);
    return { success: false as const, error: "Could not save the prescription. Please try again." };
  }

  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/prescriptions");
  return { success: true as const, message: "Prescription saved. The patient can now see it." };
}

/** Existing prescription for one of the doctor's own consultations, used to pre-fill the edit form. */
export async function getPrescriptionForEditAction(appointmentId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") return { success: false as const, error: "Unauthorized." };
  const appointment = await dbRepo.getAppointmentById(appointmentId);
  if (!appointment || appointment.doctorId !== user.profileId) {
    return { success: false as const, error: "Appointment not found." };
  }
  const rx = await dbRepo.getPrescriptionByAppointmentId(appointmentId);
  return { success: true as const, medicines: rx?.medicines ?? [], notes: rx?.notes ?? "" };
}
