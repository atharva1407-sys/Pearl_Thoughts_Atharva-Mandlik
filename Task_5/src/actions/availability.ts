"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { sessionSchema } from "@/lib/validators";

/** Reads the OPD session form: timing, scheduling type, per-slot capacity and when the session runs. */
function readSessionForm(formData: FormData) {
  const rawIsActive = formData.get("isActive");
  return {
    name: formData.get("name") || "OPD Session",
    recurrence: formData.get("recurrence"),
    dayOfWeek: formData.get("dayOfWeek"),
    dayOfMonth: formData.get("dayOfMonth"),
    specificDate: formData.get("specificDate"),
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    slotDurationMinutes: formData.get("slotDurationMinutes") || 30,
    isActive: rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1",
    schedulingType: formData.get("schedulingType") || "STREAM",
    patientsPerWave: formData.get("patientsPerWave") || 1,
  };
}

export async function getDoctorSessionsAction(doctorId: string, date: string) {
  try {
    const data = await dbRepo.computeSessionGroups(doctorId, date);
    return {
      success: true,
      isLeave: data.isLeave,
      leaveReason: data.leaveReason,
      groups: data.groups,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to calculate sessions",
      isLeave: false,
      leaveReason: undefined,
      groups: [],
    };
  }
}

export async function getDoctorSlotsAction(doctorId: string, date: string) {
  try {
    const slots = await dbRepo.computeAvailableSlots(doctorId, date);
    return { success: true, slots };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to calculate slots" };
  }
}

export async function createSessionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can create sessions." };
  }

  const raw = readSessionForm(formData);
  // A one-date session may be created on several dates at once (repeated specificDate fields).
  const allDates = formData.getAll("specificDate").map(String).filter(Boolean);
  if (allDates.length > 0) raw.specificDate = allDates[0];

  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    if (parsed.data.recurrence === "ONE_TIME" && allDates.length > 1) {
      const sessions = await dbRepo.createSessionsForDates(
        {
          doctorId: user.profileId,
          name: parsed.data.name,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          slotDurationMinutes: parsed.data.slotDurationMinutes,
          isActive: parsed.data.isActive,
          schedulingType: parsed.data.schedulingType,
          patientsPerWave: parsed.data.patientsPerWave,
        },
        allDates
      );
      revalidatePath("/doctor/dashboard");
      revalidatePath("/doctor/availability");
      revalidatePath(`/doctors/${user.profileId}`);
      return { success: true, message: `${sessions.length} one-date sessions created.`, session: sessions[0] };
    }

    const session = await dbRepo.createAvailabilitySession({
      doctorId: user.profileId,
      name: parsed.data.name,
      recurrence: parsed.data.recurrence,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      dayOfMonth: parsed.data.dayOfMonth ?? null,
      specificDate: parsed.data.specificDate ?? null,
      validFrom: parsed.data.validFrom ?? null,
      validUntil: parsed.data.validUntil ?? null,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      slotDurationMinutes: parsed.data.slotDurationMinutes,
      isActive: parsed.data.isActive,
      schedulingType: parsed.data.schedulingType,
      patientsPerWave: parsed.data.patientsPerWave,
    });

    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/availability");
    revalidatePath(`/doctors/${user.profileId}`);
    return { success: true, message: "OPD Session created successfully!", session };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create session." };
  }
}

export async function updateSessionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can update sessions." };
  }

  const sessionId = formData.get("sessionId") as string;
  if (!sessionId) {
    return { success: false, error: "Session ID is required." };
  }

  const raw = readSessionForm(formData);

  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    // Scoped to the signed-in doctor: another doctor's session id is treated as not found.
    const session = await dbRepo.updateAvailabilitySession(user.profileId, sessionId, {
      name: parsed.data.name,
      recurrence: parsed.data.recurrence,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      dayOfMonth: parsed.data.dayOfMonth ?? null,
      specificDate: parsed.data.specificDate ?? null,
      validFrom: parsed.data.validFrom ?? null,
      validUntil: parsed.data.validUntil ?? null,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      slotDurationMinutes: parsed.data.slotDurationMinutes,
      isActive: parsed.data.isActive,
      schedulingType: parsed.data.schedulingType,
      patientsPerWave: parsed.data.patientsPerWave,
    });

    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/availability");
    revalidatePath(`/doctors/${user.profileId}`);
    return { success: true, message: "OPD Session updated successfully!", session };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update session." };
  }
}

export async function deleteSessionAction(sessionId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can delete sessions." };
  }

  try {
    const deleted = await dbRepo.deleteAvailabilitySession(user.profileId, sessionId);
    if (!deleted) {
      return { success: false, error: "Session not found." };
    }

    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/availability");
    revalidatePath(`/doctors/${user.profileId}`);
    return { success: true, message: "OPD Session deleted successfully!" };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete session." };
  }
}

export async function addDoctorLeaveAction(leaveDate: string, reason?: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can set leave dates." };
  }

  if (!leaveDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
    return { success: false, error: "Invalid leave date format (YYYY-MM-DD)." };
  }

  try {
    const leave = await dbRepo.addDoctorLeave(user.profileId, leaveDate, reason);
    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/availability");
    revalidatePath(`/doctors/${user.profileId}`);
    return { success: true, message: `Clinical leave booked for ${leaveDate}.`, leave };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to add clinical leave." };
  }
}

export async function removeDoctorLeaveAction(leaveDate: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can remove leave dates." };
  }

  try {
    await dbRepo.removeDoctorLeave(user.profileId, leaveDate);
    revalidatePath("/doctor/dashboard");
    revalidatePath("/doctor/availability");
    revalidatePath(`/doctors/${user.profileId}`);
    return { success: true, message: `Clinical leave removed for ${leaveDate}.` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to remove clinical leave." };
  }
}
