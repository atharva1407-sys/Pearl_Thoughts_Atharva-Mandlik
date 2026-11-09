"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dbRepo } from "@/db/repo";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import { formatNotification } from "@/lib/notifications/templates";

const updatePreferencesSchema = z.object({
  emailPromotional: z.boolean(),
});

export async function getNotificationPreferencesAction() {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  try {
    const preferences = await dbRepo.getNotificationPreferences(user.userId);
    return {
      success: true,
      preferences: preferences || {
        userId: user.userId,
        emailPromotional: false,
        consentedAt: null,
        updatedAt: new Date(),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to load notification preferences",
    };
  }
}

export interface InboxItem {
  id: string;
  subject: string;
  preview: string;
  status: string;
  createdAt: string;
}

/** The signed-in user's most recent messages, for the bell menu in the top bar. */
export async function getMyNotificationsAction(): Promise<{ success: true; items: InboxItem[] } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Please sign in." };
  try {
    const all = await dbRepo.getNotificationsByUserId(user.userId);
    const items = all
      .filter((n) => n.status !== "CANCELLED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map((n) => {
        const { subject, bodyText } = formatNotification(n);
        const preview = bodyText.replace(/\s+/g, " ").trim().slice(0, 160);
        return { id: n.id, subject, preview, status: n.status, createdAt: new Date(n.createdAt).toISOString() };
      });
    return { success: true, items };
  } catch {
    return { success: false, error: "Could not load messages." };
  }
}

export async function updateNotificationPreferencesAction(data: { emailPromotional: boolean }) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const parsed = updatePreferencesSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const consentedAt = parsed.data.emailPromotional ? new Date() : null;
    const preferences = await dbRepo.upsertNotificationPreferences({
      userId: user.userId,
      emailPromotional: parsed.data.emailPromotional,
      consentedAt,
    });

    revalidatePath("/settings");
    revalidatePath("/patient/dashboard");

    return {
      success: true,
      message: parsed.data.emailPromotional
        ? "Promotional email notifications enabled."
        : "Promotional email notifications disabled.",
      preferences,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to save notification preferences",
    };
  }
}

export async function unsubscribeWithTokenAction(token: string) {
  const verification = verifyUnsubscribeToken(token);
  if (!verification.valid || !verification.userId) {
    if (verification.error === "expired") {
      return {
        success: false,
        error: "This unsubscribe link has expired. Please sign in to update your notification settings.",
      };
    }
    return {
      success: false,
      error: "Invalid or tampered unsubscribe link. Please verify the link or sign in.",
    };
  }

  try {
    await dbRepo.upsertNotificationPreferences({
      userId: verification.userId,
      emailPromotional: false,
      consentedAt: null,
    });

    return {
      success: true,
      message: "You have been successfully unsubscribed from optional promotional emails.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to process unsubscribe request.",
    };
  }
}
