import crypto from "crypto";
import { MedrellaRepository } from "../../db/repo";
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationItem,
  NotificationPayload,
  NotificationPreferencesEntity,
} from "./types";

export interface CreateNotificationInput {
  userId: string;
  appointmentId?: string | null;
  channel?: NotificationChannelType;
  category?: NotificationCategory;
  template: string;
  recipient: string;
  payload?: NotificationPayload | null;
  scheduledFor?: Date;
  dedupeKey?: string | null;
}

/**
 * Determines whether an email should be sent based on category and patient preferences.
 * Operational messages (booking, cancellation, payments, refunds, reminders) are mandatory for service delivery.
 * Promotional messages (newsletters, health tips) require explicit user opt-in.
 */
export function shouldSend(
  category: NotificationCategory,
  preferences?: NotificationPreferencesEntity | null
): boolean {
  if (category === "operational") {
    return true;
  }
  return preferences?.emailPromotional === true;
}

/**
 * Central path for creating any notification in Medrella Healthcare.
 * Enforces preference gating, deterministic idempotency, and fail-safe exception wrapping.
 * Failures here NEVER bubble up to roll back appointments or payments.
 */
export async function createNotification(
  repo: MedrellaRepository,
  input: CreateNotificationInput
): Promise<NotificationItem | null> {
  try {
    const category: NotificationCategory =
      input.category || (input.template.startsWith("PROMOTIONAL_") ? "promotional" : "operational");

    // Check user preferences
    const prefs = await repo.getNotificationPreferences(input.userId);
    if (!shouldSend(category, prefs)) {
      // User has not opted in for optional promotional updates; safely skip
      return null;
    }

    const id = `notif-${crypto.randomUUID()}`;
    const dedupeKey = input.dedupeKey ?? `${input.template}-${input.userId}-${input.appointmentId || "gen"}`;

    const item = await repo.createNotification({
      id,
      userId: input.userId,
      appointmentId: input.appointmentId ?? null,
      channel: input.channel || "EMAIL",
      category,
      template: input.template,
      recipient: input.recipient,
      payload: input.payload || {},
      status: "PENDING",
      scheduledFor: input.scheduledFor || new Date(),
      attempts: 0,
      dedupeKey,
    });

    return item as NotificationItem;
  } catch (err: any) {
    // A notification creation failure must never break clinical booking or payment operations
    console.warn(`[NOTIFICATION_CREATION_FAILED] ${err?.message?.slice(0, 150) || "Unknown error"}`);
    return null;
  }
}
