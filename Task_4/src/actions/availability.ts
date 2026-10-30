"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { sessionSchema } from "@/lib/validators";

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

  const rawIsActive = formData.get("isActive");
  const isActive = rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1";

  const raw = {
    name: formData.get("name") || "OPD Session",
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    slotDurationMinutes: formData.get("slotDurationMinutes") || 30,
    isActive,
    schedulingType: formData.get("schedulingType") || "STREAM",
    patientsPerWave: formData.get("patientsPerWave") || 1,
  };

  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const session = await dbRepo.createAvailabilitySession({
      doctorId: user.profileId,
      name: parsed.data.name,
      dayOfWeek: parsed.data.dayOfWeek,
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

  const rawIsActive = formData.get("isActive");
  const isActive = rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1";

  const raw = {
    name: formData.get("name") || "OPD Session",
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    slotDurationMinutes: formData.get("slotDurationMinutes") || 30,
    isActive,
    schedulingType: formData.get("schedulingType") || "STREAM",
    patientsPerWave: formData.get("patientsPerWave") || 1,
  };

  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    // Scoped to the signed-in doctor: another doctor's session id is treated as not found.
    const session = await dbRepo.updateAvailabilitySession(user.profileId, sessionId, {
      name: parsed.data.name,
      dayOfWeek: parsed.data.dayOfWeek,
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
