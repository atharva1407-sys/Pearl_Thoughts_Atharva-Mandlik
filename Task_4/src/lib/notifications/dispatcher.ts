import { MedrellaRepository } from "../../db/repo";
import { NotificationChannel, NotificationItem } from "./types";
import { EmailChannel } from "./email-channel";
import { ConsoleChannel } from "./console-channel";

export class NotificationDispatcher {
  private emailChannel: NotificationChannel;
  private consoleChannel: NotificationChannel;
  private repo: MedrellaRepository;

  constructor(repo?: MedrellaRepository) {
    this.repo = repo || new MedrellaRepository();
    this.emailChannel = new EmailChannel();
    this.consoleChannel = new ConsoleChannel();
  }

  private getChannel(channelType: string): NotificationChannel {
    switch (channelType) {
      case "EMAIL":
        return this.emailChannel;
      default:
        return this.consoleChannel;
    }
  }

  /**
   * Processes due notifications from the outbox.
   * Re-checks appointment status before sending reminders.
   */
  public async processDueNotifications(limit: number = 25): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const now = new Date();
    const dueItems = await this.repo.getPendingNotifications(now, limit);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of dueItems) {
      // For reminders, re-check appointment status right before sending
      if (item.template === "APPOINTMENT_REMINDER" && item.appointmentId) {
        const appointment = await this.repo.getAppointmentById(item.appointmentId);
        if (!appointment || appointment.status !== "BOOKED") {
          // Appointment is cancelled, completed, expired, or not booked -> Cancel reminder
          await this.repo.updateNotificationStatus(item.id, "CANCELLED", {
            lastError: `Cancelled because appointment status is ${appointment?.status || "NOT_FOUND"}`,
          });
          skipped++;
          continue;
        }

        // If appointment start time has already passed, skip the reminder
        const startDateTime = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
        if (startDateTime.getTime() <= now.getTime()) {
          await this.repo.updateNotificationStatus(item.id, "CANCELLED", {
            lastError: "Cancelled because appointment start time has already passed",
          });
          skipped++;
          continue;
        }
      }

      const channel = this.getChannel(item.channel);
      const res = await channel.send(item as NotificationItem);

      if (res.success) {
        await this.repo.updateNotificationStatus(item.id, "SENT", {
          sentAt: new Date(),
        });
        sent++;
      } else {
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= 3 ? "FAILED" : "PENDING";
        // Exponential-like backoff for retries: 5m, 15m
        const backoffMinutes = attempts * 5;
        const nextTry = new Date(Date.now() + backoffMinutes * 60 * 1000);

        await this.repo.updateNotificationStatus(item.id, newStatus, {
          attempts,
          lastError: res.error,
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
