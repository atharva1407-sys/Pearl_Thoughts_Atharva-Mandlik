"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { availabilitySchema } from "@/lib/validators";

export async function getDoctorSlotsAction(doctorId: string, date: string) {
  try {
    const slots = await dbRepo.computeAvailableSlots(doctorId, date);
    return { success: true, slots };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to calculate slots" };
  }
}

export async function updateAvailabilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Unauthorized: Only doctors can update availability." };
  }

  // Verify physician profile exists
  const doctor = await dbRepo.getDoctorById(user.profileId);
  if (!doctor) {
    return { success: false, error: "Physician profile not found." };
  }

  const rawIsActive = formData.get("isActive");
  const isActive = rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1";

  const raw = {
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    slotDurationMinutes: formData.get("slotDurationMinutes"),
    isActive,
  };

  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  await dbRepo.updateDoctorAvailability(user.profileId, parsed.data.dayOfWeek, {
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    slotDurationMinutes: parsed.data.slotDurationMinutes,
    isActive: parsed.data.isActive,
  });

  revalidatePath("/doctor/dashboard");
  revalidatePath("/doctor/availability");
  return { success: true, message: "Availability updated successfully!" };
}
