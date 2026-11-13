import { z } from "zod";

/** Known insecure placeholder strings from documentation and .env.example files. */
const KNOWN_PLACEHOLDERS = new Set([
  "generate-a-strong-32-byte-secret-key-for-production",
  "dev-local-secret-key-pearl-thoughts-offline-only",
  "choose-a-strong-password",
  "your-login-email@example.com",
  "rzp_test_your_key_id_here",
  "your_test_key_secret_here",
  "your_webhook_secret_here",
  "your_cron_secret_token_here",
  "medrella-deterministic-token-secret-for-test",
]);

function isPlaceholder(val?: string | null): boolean {
  if (!val) return false;
  const clean = val.trim().toLowerCase();
  return KNOWN_PLACEHOLDERS.has(clean) || clean.includes("placeholder") || clean.includes("your_secret");
}

/**
 * Server-only validated environment configuration.
 * Prevents production startup with missing or placeholder credentials.
 */
const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      (val) => (!val || val === "undefined" ? "development" : val),
      z.enum(["development", "test", "production"]).default("development")
    ),
    APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    DATABASE_URL: z.string().optional(),
    SESSION_SECRET: z.string().default("dev-local-secret-key-pearl-thoughts-offline-only"),
    CRON_SECRET: z.string().optional(),
    ADMIN_EMAILS: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    USE_MOCK_PAYMENTS: z.enum(["true", "false"]).optional(),
    BREVO_API_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    SARVAM_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isProduction = data.NODE_ENV === "production";
    if (!isProduction) return; // Development and testing can use fallbacks

    // 1. SESSION_SECRET is mandatory in production (>= 32 chars and not a known placeholder)
    if (!data.SESSION_SECRET || data.SESSION_SECRET.trim().length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be at least 32 characters in production",
      });
    } else if (isPlaceholder(data.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET cannot be a known default/placeholder value",
      });
    }

    // 2. CRON_SECRET is mandatory in production (>= 16 chars and not a known placeholder)
    if (!data.CRON_SECRET || data.CRON_SECRET.trim().length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CRON_SECRET"],
        message: "CRON_SECRET must be at least 16 characters in production to guard background cron endpoints",
      });
    } else if (isPlaceholder(data.CRON_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CRON_SECRET"],
        message: "CRON_SECRET cannot be a default/placeholder value",
      });
    }

    // 3. DATABASE_URL is mandatory in production
    if (!data.DATABASE_URL || !data.DATABASE_URL.startsWith("postgres")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must be a valid PostgreSQL connection string in production",
      });
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validates the runtime environment.
 * Throws a sanitized Error without leaking sensitive values.
 */
export function validateEnv(customEnv: Record<string, string | undefined> = process.env): ValidatedEnv {
  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => ` - [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");

    const message = `\n❌ FATAL SECURITY: Environment validation failed in ${customEnv.NODE_ENV || "development"}:\n${formattedErrors}\n`;

    if (customEnv.NODE_ENV === "production" && customEnv.SKIP_ENV_VALIDATION !== "true") {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }

  return (result.success ? result.data : customEnv) as ValidatedEnv;
}

// Global server-side singleton
let cachedEnv: ValidatedEnv | null = null;

export function getServerEnv(): ValidatedEnv {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

// Reset for testing purposes
export function resetEnvCacheForTesting(): void {
  cachedEnv = null;
}
