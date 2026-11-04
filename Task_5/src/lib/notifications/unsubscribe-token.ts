import crypto from "crypto";

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.CRON_SECRET || "medrella-deterministic-token-secret-for-test";
  return secret.trim();
}

/**
 * Generates a signed, expiring HMAC-SHA256 unsubscribe token for one-click email opt-out.
 * Default TTL: 30 days (2,592,000 seconds).
 */
export function generateUnsubscribeToken(userId: string, ttlSeconds: number = 30 * 24 * 3600): string {
  if (!userId || typeof userId !== "string") {
    throw new Error("userId is required to generate an unsubscribe token");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex");

  return `${payload}.${signature}`;
}

/**
 * Verifies an unsubscribe token in constant time.
 * Returns the authenticated userId if valid, or an error reason if expired/tampered.
 */
export function verifyUnsubscribeToken(token: string): {
  valid: boolean;
  userId?: string;
  error?: "invalid_format" | "expired" | "tampered";
} {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "invalid_format" };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "invalid_format" };
  }

  const [userId, expiresAtStr, providedSignature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!userId || isNaN(expiresAt) || !providedSignature) {
    return { valid: false, error: "invalid_format" };
  }

  // Check expiration
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds > expiresAt) {
    return { valid: false, error: "expired" };
  }

  // Compute expected HMAC
  const payload = `${userId}.${expiresAt}`;
  const expectedSignature = crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("hex");

  try {
    const bufProvided = Buffer.from(providedSignature, "hex");
    const bufExpected = Buffer.from(expectedSignature, "hex");

    if (bufProvided.length !== bufExpected.length || !crypto.timingSafeEqual(bufProvided, bufExpected)) {
      return { valid: false, error: "tampered" };
    }
  } catch {
    return { valid: false, error: "tampered" };
  }

  return { valid: true, userId };
}

/**
 * Constructs the full unsubscribe URL with a signed token.
 */
export function buildUnsubscribeUrl(userId: string, baseUrl?: string): string {
  const token = generateUnsubscribeToken(userId);
  const base = baseUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/unsubscribe?token=${encodeURIComponent(token)}`;
}
