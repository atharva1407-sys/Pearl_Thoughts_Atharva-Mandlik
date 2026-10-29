import { NotificationChannel, NotificationItem, SendResult } from "./types";
import { formatNotification } from "./templates";
import { ConsoleChannel } from "./console-channel";

export class EmailChannel implements NotificationChannel {
  public readonly name = "EMAIL" as const;
  private readonly apiKey?: string;
  private readonly fromEmail: string;
  private readonly fallbackConsole: ConsoleChannel;

  constructor(apiKey?: string, fromEmail?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY?.trim();
    this.fromEmail = fromEmail || process.env.EMAIL_FROM?.trim() || "Medrella Healthcare <onboarding@resend.dev>";
    this.fallbackConsole = new ConsoleChannel();
  }

  public async send(notification: NotificationItem): Promise<SendResult> {
    if (!this.apiKey) {
      return this.fallbackConsole.send(notification);
    }

    const formatted = formatNotification(notification);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [notification.recipient],
          subject: formatted.subject,
          text: formatted.bodyText,
          html: formatted.bodyHtml,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: `Resend error (${res.status}): ${errText}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.id,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }
}
