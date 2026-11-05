import { NotificationChannel, NotificationItem, SendResult } from "./types";
import { formatNotification } from "./templates";

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "masked@user";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export class ConsoleChannel implements NotificationChannel {
  public readonly name = "EMAIL" as const;

  public async send(notification: NotificationItem): Promise<SendResult> {
    const isProduction = process.env.NODE_ENV === "production";
    const formatted = formatNotification(notification);

    if (!isProduction) {
      console.log(
        `[NOTIFICATION OUTBOX - CONSOLE] To: ${notification.recipient} | Template: ${notification.template} | Subject: "${formatted.subject}"`
      );
    } else {
      // In production, mask recipient and avoid printing email body to preserve patient confidentiality
      const masked = maskEmail(notification.recipient);
      console.log(
        `[NOTIFICATION OUTBOX] To: ${masked} | Template: ${notification.template}`
      );
    }

    return {
      success: true,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  }
}
