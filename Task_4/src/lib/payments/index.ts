import { PaymentProvider } from "./types";
import { MockProvider } from "./mock-provider";
import { RazorpayProvider } from "./razorpay-provider";

export * from "./types";
export * from "./mock-provider";
export * from "./razorpay-provider";

let cachedProvider: PaymentProvider | null = null;
let mockSingleton: MockProvider | null = null;

export function getMockProvider(): MockProvider {
  if (!mockSingleton) {
    mockSingleton = new MockProvider();
  }
  return mockSingleton;
}

export function getPaymentProvider(): PaymentProvider {
  if (process.env.USE_MOCK_PAYMENTS === "true" || process.env.NODE_ENV === "test") {
    return getMockProvider();
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (keyId && keySecret) {
    if (!cachedProvider || cachedProvider.name !== "RAZORPAY") {
      cachedProvider = new RazorpayProvider(keyId, keySecret, webhookSecret);
    }
    return cachedProvider;
  }

  return getMockProvider();
}

/**
 * Returns the configured payment hold duration in minutes (defaults to 10).
 */
export function getPaymentHoldMinutes(): number {
  const envVal = parseInt(process.env.PAYMENT_HOLD_MINUTES || "10", 10);
  return isNaN(envVal) || envVal <= 0 ? 10 : envVal;
}

/**
 * Converts integer rupees to integer paise.
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise to integer or fractional rupees.
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Formats integer paise to a human-readable rupee string (e.g. "₹800" or "₹800.50").
 */
export function formatPaise(paise: number): string {
  const rs = paise / 100;
  if (Number.isInteger(rs)) {
    return `₹${rs.toLocaleString("en-IN")}`;
  }
  return `₹${rs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generates a unique, human-readable receipt number for an appointment payment.
 */
export function generateReceiptNo(appointmentId?: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = (appointmentId || crypto.randomUUID()).slice(-6).toUpperCase();
  return `RCPT-${dateStr}-${suffix}`;
}
