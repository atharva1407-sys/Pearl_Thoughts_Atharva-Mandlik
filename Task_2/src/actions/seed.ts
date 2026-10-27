"use server";

import { dbRepo } from "@/db/repo";
import { revalidatePath } from "next/cache";

export async function restoreTestDataAction() {
  dbRepo.seed();
  revalidatePath("/");
  revalidatePath("/doctors");
  revalidatePath("/queue");
  revalidatePath("/schedule");
  return { success: true, message: "Test data restored successfully!" };
}

export async function clearTestDataAction() {
  dbRepo.clearAll();
  revalidatePath("/");
  revalidatePath("/doctors");
  revalidatePath("/queue");
  revalidatePath("/schedule");
  return { success: true, message: "All test data cleared!" };
}
