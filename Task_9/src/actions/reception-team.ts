"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import {
  assignExistingReceptionist,
  createReceptionistForDoctor,
  resetReceptionistPassword,
  revokeReceptionistFromDoctor,
} from "@/domain/reception-team";

/** Only a signed-in doctor may manage a front-desk team, and only their own. */
async function requireDoctor() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") return null;
  return user;
}

const UNAUTHORIZED = { success: false as const, error: "Unauthorized: only doctors can manage their reception team." };

function refresh() {
  revalidatePath("/doctor/reception-team");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/queue");
  revalidatePath("/reception");
}

export async function createReceptionistAction(formData: FormData) {
  const user = await requireDoctor();
  if (!user) return UNAUTHORIZED;

  const result = await createReceptionistForDoctor(user.profileId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (result.success) refresh();
  // The new account's details are not echoed back beyond what the page re-reads from the server.
  return result.success ? { success: true as const, message: result.message } : result;
}

export async function assignReceptionistAction(email: string) {
  const user = await requireDoctor();
  if (!user) return UNAUTHORIZED;

  const result = await assignExistingReceptionist(user.profileId, String(email ?? ""));
  if (result.success) refresh();
  return result.success ? { success: true as const, message: result.message } : result;
}

export async function revokeReceptionistAction(receptionistId: string) {
  const user = await requireDoctor();
  if (!user) return UNAUTHORIZED;

  const result = await revokeReceptionistFromDoctor(user.profileId, String(receptionistId ?? ""));
  if (result.success) refresh();
  return result;
}

export async function resetReceptionistPasswordAction(receptionistId: string, newPassword: string) {
  const user = await requireDoctor();
  if (!user) return UNAUTHORIZED;

  return resetReceptionistPassword(user.profileId, String(receptionistId ?? ""), String(newPassword ?? ""));
}
