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
    const isProduction = process.env.NODE_ENV === "production";
    const apiKey = this.apiKey || process.env.RESEND_API_KEY?.trim();

    // When no API key is provided:
    if (!apiKey) {
      if (isProduction) {
        // Fail closed in production: do NOT mark messages SENT without a real provider!
        return {
          success: false,
          error: "Email delivery failed: RESEND_API_KEY is not configured in production environment (fail closed).",
        };
      }
      // In development and testing, fall back safely to the console logger
      return this.fallbackConsole.send(notification);
    }

    const formatted = formatNotification(notification);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        // Sanitize error text to avoid leaking secrets in logs or database
        const cleanErr = errText.replace(/Bearer\s+[A-Za-z0-9_\-]+/gi, "Bearer [REDACTED]");
        return {
          success: false,
          error: `Resend HTTP ${res.status}: ${cleanErr.slice(0, 255)}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.id,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ? String(err.message).slice(0, 255) : "Network error while connecting to email provider",
      };
    }
  }
}
