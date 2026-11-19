"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { getPatientRecordAccess } from "@/domain/patient-record";
import { saveMedicalProfileSchema, visitRecordSchema } from "@/lib/validators";

function revalidateRecordPages(patientId: string) {
  revalidatePath("/patient/history");
  revalidatePath("/patient/dashboard");
  revalidatePath(`/doctor/patients/${patientId}`);
  revalidatePath("/doctor/patients");
}

/**
 * Saves a patient's medical profile (allergies, conditions, ...).
 *
 * Allowed for the patient themselves and for a doctor who is treating that patient. The server decides that from the
 * session and the bookings, never from anything the browser claims. Each real change also writes a history entry
 * naming who made it; nothing is ever overwritten without a trace.
 */
export async function saveMedicalProfileAction(input: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role === "RECEPTIONIST") {
    return { success: false as const, error: "You do not have access to medical records." };
  }

  const parsed = saveMedicalProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }
  const { patientId, expectedVersion, changeNote, data } = parsed.data;

  const patient = await dbRepo.getPatientById(patientId);
  const access = await getPatientRecordAccess(user, patientId);
  // Same message for "no such patient" and "not yours", so a patient id cannot be probed.
  if (!patient || !access.canEdit) {
    return { success: false as const, error: "You do not have access to this patient's record." };
  }

  try {
    const result = await dbRepo.saveMedicalProfile({
      patientId,
      data,
      expectedVersion,
      changeNote,
      actor: { userId: user.userId, role: user.role, name: user.name },
    });

    if (!result.success) {
      return {
        success: false as const,
        conflict: true as const,
        error: "This record was updated by someone else while you were editing. Reload to see the latest version, then re-apply your change.",
      };
    }
    if (!result.changed) {
      return { success: true as const, changed: false as const, message: "No changes to save.", version: result.profile?.version ?? 0 };
    }
    revalidateRecordPages(patientId);
    return {
      success: true as const,
      changed: true as const,
      message: `Medical information updated (${result.log.changes.length} ${result.log.changes.length === 1 ? "field" : "fields"} changed).`,
      version: result.profile.version,
    };
  } catch (err) {
    console.error("[MEDICAL_PROFILE_SAVE_ERROR]", (err as Error).message);
    return { success: false as const, error: "Could not save the medical information. Please try again." };
  }
}

/**
 * The treating doctor records the findings of one of their OWN completed consultations.
 * Patient and doctor ids always come from the stored appointment, never from the browser.
 */
export async function saveVisitRecordAction(input: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false as const, error: "Only doctors can record visit details." };
  }

  const parsed = visitRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const appointment = await dbRepo.getAppointmentById(parsed.data.appointmentId);
  if (!appointment || appointment.doctorId !== user.profileId) {
    return { success: false as const, error: "You can only record details for your own consultations." };
  }
  if (appointment.status !== "COMPLETED") {
    return { success: false as const, error: "Mark the consultation as completed before recording visit details." };
  }

  try {
    await dbRepo.upsertVisitRecord({
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      diagnosis: parsed.data.diagnosis,
      symptoms: parsed.data.symptoms,
      notes: parsed.data.notes,
      followUp: parsed.data.followUp,
    });
  } catch (err) {
    console.error("[VISIT_RECORD_SAVE_ERROR]", (err as Error).message);
    return { success: false as const, error: "Could not save the visit details. Please try again." };
  }

  revalidateRecordPages(appointment.patientId);
  return { success: true as const, message: "Visit details saved. The patient can now see them." };
}
