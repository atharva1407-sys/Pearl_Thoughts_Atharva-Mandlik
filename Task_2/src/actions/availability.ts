"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { availabilitySchema } from "@/lib/validators";

export async function getDoctorSlotsAction(doctorId: string, date: string) {
  try {
    const slots = dbRepo.computeAvailableSlots(doctorId, date);
    return { success: true, slots };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to calculate slots" };
  }
}

export async function updateAvailabilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return { success: false, error: "Only doctors can update availability." };
  }

  const raw = {
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    slotDurationMinutes: formData.get("slotDurationMinutes"),
    isActive: formData.get("isActive") === "true",
  };

  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  dbRepo.updateDoctorAvailability(user.profileId, parsed.data.dayOfWeek, {
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    slotDurationMinutes: parsed.data.slotDurationMinutes,
    isActive: parsed.data.isActive,
  });

  revalidatePath("/doctor/dashboard");
  revalidatePath("/doctor/availability");
  return { success: true, message: "Availability updated successfully!" };
}
