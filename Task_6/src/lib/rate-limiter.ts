import { dbRepo } from "@/db/repo";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  error?: string;
}

/**
 * Centrally configured distributed rate limits across serverless instances.
 * Backed by atomic PostgreSQL CTE counter in production and in-memory storage in test/dev.
 */
export const RATE_LIMIT_RULES = {
  // 5 failed login attempts per 15 minutes
  AUTH_LOGIN: { max: 5, windowMinutes: 15, name: "Login attempts" },
  // 10 account registration attempts per hour
  AUTH_REGISTER: { max: 10, windowMinutes: 60, name: "Registration attempts" },
  // 10 appointment seat holds per 10 minutes per patient
  APPOINTMENT_BOOKING: { max: 10, windowMinutes: 10, name: "Appointment bookings" },
  // 10 payment operations per 5 minutes per user
  PAYMENT_VERIFY: { max: 10, windowMinutes: 5, name: "Payment verifications" },
  // 20 AI assistant messages per 10 minutes
  AI_CHAT: { max: 20, windowMinutes: 10, name: "AI assistant messages" },
  // 10 AI card confirmations per 10 minutes
  AI_CONFIRM: { max: 10, windowMinutes: 10, name: "AI confirmations" },
  // 30 audio transcription requests per 10 minutes
  API_TRANSCRIBE: { max: 30, windowMinutes: 10, name: "Voice transcriptions" },
} as const;

export async function checkRateLimitFor(
  rule: keyof typeof RATE_LIMIT_RULES,
  identifier: string
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_RULES[rule];
  const key = `rl:${rule.toLowerCase()}:${identifier.trim().toLowerCase()}`;

  try {
    const res = await dbRepo.consumeRateLimitToken(key, config.max, config.windowMinutes);
    if (!res.allowed) {
      const waitMin = Math.max(1, Math.ceil(res.retryAfterSeconds / 60));
      return {
        ...res,
        error: `Too many ${config.name.toLowerCase()}. Please wait ${waitMin} minute${waitMin > 1 ? "s" : ""} before trying again.`,
      };
    }
    return res;
  } catch (err) {
    console.warn(`[RATE_LIMIT_ERROR] Failed to check rate limit for ${key}:`, err);
    // Safe fallback: allow request during transient storage outage to avoid total service outage
    return {
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    };
  }
}
