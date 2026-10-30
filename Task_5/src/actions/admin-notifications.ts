"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { processDueNotifications } from "@/lib/notifications/dispatcher";
import { isAdminUser } from "@/lib/admin";

export async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user.email)) {
    notFound();
  }
  return user;
}

export async function requeueNotificationAction(notificationId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user.email)) {
    return { success: false, error: "Forbidden: Administrative access required." };
  }

  try {
    const success = await dbRepo.requeueNotification(notificationId);
    if (!success) {
      return { success: false, error: "Notification not found or not in failed state." };
    }

    revalidatePath("/admin/notifications");
    return { success: true, message: "Notification requeued for immediate retry." };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to requeue notification." };
  }
}

export async function triggerManualDispatchAction() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user.email)) {
    return { success: false, error: "Forbidden: Administrative access required." };
  }

  try {
    const res = await processDueNotifications(dbRepo, 50);
    revalidatePath("/admin/notifications");
    return {
      success: true,
      message: `Processed: ${res.processed}, Sent: ${res.sent}, Failed: ${res.failed}, Skipped: ${res.skipped}`,
      stats: res,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Manual dispatch failed." };
  }
}
