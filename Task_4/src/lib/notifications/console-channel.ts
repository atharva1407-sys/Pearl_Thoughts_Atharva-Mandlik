import { NotificationChannel, NotificationItem, SendResult } from "./types";
import { formatNotification } from "./templates";

export class ConsoleChannel implements NotificationChannel {
  public readonly name = "EMAIL" as const;

  public async send(notification: NotificationItem): Promise<SendResult> {
    const formatted = formatNotification(notification);
    console.log(
      `[NOTIFICATION OUTBOX - CONSOLE] To: ${notification.recipient} | Template: ${notification.template} | Subject: "${formatted.subject}"`
    );
    return {
      success: true,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  }
}
