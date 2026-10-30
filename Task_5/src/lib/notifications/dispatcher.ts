import { MedrellaRepository } from "../../db/repo";
import { NotificationChannel, NotificationItem } from "./types";
import { EmailChannel } from "./email-channel";
import { BrevoChannel } from "./brevo-channel";
import { buildInstantFromKolkataTime } from "../time";

/**
 * Picks the email provider. EMAIL_PROVIDER=brevo|resend wins; otherwise Brevo is used when a Brevo
 * key exists, else Resend (which falls back to the console channel in development only).
 */
export function selectEmailChannel(): NotificationChannel {
  const choice = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (choice === "brevo") return new BrevoChannel();
  if (choice === "resend") return new EmailChannel();
  return process.env.BREVO_API_KEY?.trim() ? new BrevoChannel() : new EmailChannel();
}

export class NotificationDispatcher {
  private emailChannel: NotificationChannel;
  private repo: MedrellaRepository;

  constructor(repo?: MedrellaRepository) {
    this.repo = repo || new MedrellaRepository();
    this.emailChannel = selectEmailChannel();
  }

  private getChannel(channelType: string): NotificationChannel | null {
    return channelType === "EMAIL" ? this.emailChannel : null;
  }

  /**
   * Processes due notifications from the outbox atomically.
   * Uses claimPendingNotifications (FOR UPDATE SKIP LOCKED in Postgres, memory lock in-memory)
   * so overlapping cron runs never process the same notification twice.
   * Re-checks appointment status right before sending reminders.
   */
  public async processDueNotifications(limit: number = 25): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const now = new Date();
    const dueItems = await this.repo.claimPendingNotifications(now, limit);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of dueItems) {
      // For reminders, re-check appointment status right before sending
      if (item.template === "APPOINTMENT_REMINDER" && item.appointmentId) {
        try {
          const appointment = await this.repo.getAppointmentById(item.appointmentId);
          if (!appointment || appointment.status !== "BOOKED") {
            // Appointment is cancelled, completed, expired, or not booked -> Cancel reminder
            await this.repo.updateNotificationStatus(item.id, "CANCELLED", {
              lastError: `Cancelled because appointment status is ${appointment?.status || "NOT_FOUND"}`,
            });
            skipped++;
            continue;
          }

          // If appointment start time has already passed in Asia/Kolkata, cancel the reminder
          const startInstant = buildInstantFromKolkataTime(appointment.appointmentDate, appointment.startTime);
          if (startInstant.getTime() <= now.getTime()) {
            await this.repo.updateNotificationStatus(item.id, "CANCELLED", {
              lastError: "Cancelled because appointment start time has already passed",
            });
            skipped++;
            continue;
          }
        } catch (err: any) {
          // Can't confirm the appointment is still valid: do not risk a stale reminder; retry later.
          console.error(`[dispatcher] Error validating appointment for reminder notification ${item.id}:`, err?.message || err);
          await this.repo.updateNotificationStatus(item.id, "PENDING", {
            lastError: "Could not verify appointment status; will retry",
            scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
          });
          skipped++;
          continue;
        }
      }

      const channel = this.getChannel(item.channel);
      try {
        const res = channel
          ? await channel.send(item as NotificationItem)
          : { success: false, error: `Unsupported notification channel: ${item.channel}` };

        if (res.success) {
          await this.repo.updateNotificationStatus(item.id, "SENT", {
            sentAt: new Date(),
            providerMessageId: res.messageId,
          });
          sent++;
        } else {
          const attempts = (item.attempts || 0) + 1;
          const newStatus = attempts >= 3 ? "FAILED" : "PENDING";
          const backoffMinutes = attempts === 1 ? 5 : 15;
          const nextTry = new Date(Date.now() + backoffMinutes * 60 * 1000);

          await this.repo.updateNotificationStatus(item.id, newStatus, {
            attempts,
            lastError: (res.error || "Delivery failed").slice(0, 500),
            scheduledFor: nextTry,
          });
          failed++;
        }
      } catch (err: any) {
        const errorMsg = String(err?.message || err || "Unexpected dispatcher error").slice(0, 500);
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= 3 ? "FAILED" : "PENDING";
        const backoffMinutes = attempts === 1 ? 5 : 15;
        const nextTry = new Date(Date.now() + backoffMinutes * 60 * 1000);

        await this.repo.updateNotificationStatus(item.id, newStatus, {
          attempts,
          lastError: errorMsg,
          scheduledFor: nextTry,
        });
        failed++;
      }
    }

    return {
      processed: dueItems.length,
      sent,
      failed,
      skipped,
    };
  }
}

export async function processDueNotifications(
  repo?: MedrellaRepository,
  limit: number = 25
): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const dispatcher = new NotificationDispatcher(repo);
  return dispatcher.processDueNotifications(limit);
}
