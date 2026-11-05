import { NotificationChannel, NotificationItem, SendResult } from "./types";
import { formatNotification } from "./templates";
import { ConsoleChannel } from "./console-channel";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_FROM = "Medrella Healthcare <no-reply@example.com>";

/** Splits "Name <address@host>" (or a bare address) into the parts Brevo expects. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (match) {
    const name = match[1]?.trim();
    return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
  }
  return { email: from.trim() };
}

/**
 * Sends email through Brevo's transactional API. Works for any recipient once the sender address
 * is verified in the Brevo account (no domain needed).
 */
export class BrevoChannel implements NotificationChannel {
  public readonly name = "EMAIL" as const;
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly fallbackConsole = new ConsoleChannel();

  constructor(apiKey?: string, from?: string) {
    this.apiKey = apiKey || process.env.BREVO_API_KEY?.trim();
    this.from = from || process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  }

  public async send(notification: NotificationItem): Promise<SendResult> {
    const apiKey = this.apiKey || process.env.BREVO_API_KEY?.trim();

    if (!apiKey) {
      if (process.env.NODE_ENV === "production") {
        // Fail closed: never mark a message SENT without a real provider.
        return { success: false, error: "Email delivery failed: BREVO_API_KEY is not configured in production." };
      }
      return this.fallbackConsole.send(notification);
    }

    const formatted = formatNotification(notification);

    try {
      const res = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: parseSender(this.from),
          to: [{ email: notification.recipient }],
          subject: formatted.subject,
          textContent: formatted.bodyText,
          htmlContent: formatted.bodyHtml,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const cleanErr = errText.split(apiKey).join("[REDACTED]");
        return { success: false, error: `Brevo HTTP ${res.status}: ${cleanErr.slice(0, 255)}` };
      }

      const data = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { success: true, messageId: data.messageId };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ? String(err.message).slice(0, 255) : "Network error while connecting to Brevo",
      };
    }
  }
}
