"use server";

import { dbRepo } from "@/db/repo";
import { getCurrentUser } from "./auth";
import { revalidatePath } from "next/cache";

export async function restoreTestDataAction() {
  // Security: Completely disabled in production to protect live database
  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      error: "Forbidden: Database seed actions are disabled in production.",
    };
  }

  // Development: Require authenticated doctor session
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return {
      success: false,
      error: "Unauthorized: Only clinical staff can seed development test data.",
    };
  }

  await dbRepo.seed();
  revalidatePath("/");
  revalidatePath("/doctors");
  revalidatePath("/queue");
  revalidatePath("/schedule");
  return { success: true, message: "Test data restored successfully!" };
}

export async function clearTestDataAction() {
  // Security: Completely disabled in production to prevent data wipe
  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      error: "Forbidden: Database wipe actions are strictly disabled in production.",
    };
  }

  // Development: Require authenticated doctor session
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    return {
      success: false,
      error: "Unauthorized: Only clinical staff can clear development test data.",
    };
  }

  await dbRepo.clearAll();
  revalidatePath("/");
  revalidatePath("/doctors");
  revalidatePath("/queue");
  revalidatePath("/schedule");
  return { success: true, message: "All test data cleared!" };
}
