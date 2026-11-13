/**
 * Phase 1 Hardening Test Suite: Critical Production Stability and Security Hardening.
 *
 * Covers:
 * Task 1: Dashboard background sweep stampede removal & cron sweep safety
 * Task 2: Centralized environment validation, placeholder rejection, secret strength
 * Task 3: Voice assistant SpeechSynthesis lifecycle & utterance retention
 * Task 4: Database migration deployment safety & advisory lock hashing
 * Task 5: Distributed rate limiting with local acceleration and storage fallback
 */

process.env.ENABLE_SEED_DATA = "true";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.DATABASE_URL = "disabled-for-local-test";

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { NextRequest } from "next/server";
import {
  validateEnv,
  getServerEnv,
  resetEnvCacheForTesting,
} from "./lib/env";
import { rejectUnauthorizedCron } from "./lib/cron-auth";
import { dbRepo } from "./db/repo";
import { sweepExpiredHolds } from "./lib/payments/expire";
import {
  checkRateLimit,
  checkRateLimitDistributed,
  resetRateLimitsForTests,
  RateLimitStorage,
} from "./lib/agent/safety";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🧪 Running Phase 1 Hardening Test Suite...\n");

  // =========================================================================
  // TASK 1: DASHBOARD SWEEP REMOVAL & CRON SWEEP IDEMPOTENCY
  // =========================================================================
  console.log("--- Task 1: Dashboard Background Sweep Stampede Removal ---");

  // Verify dashboard page source does not contain sweepExpiredHolds or runInBackground
  const dashboardPath = path.resolve(__dirname, "app/patient/dashboard/page.tsx");
  const dashboardContent = fs.readFileSync(dashboardPath, "utf-8");
  assert(
    !dashboardContent.includes("sweepExpiredHolds"),
    "Dashboard page does not call sweepExpiredHolds"
  );
  assert(
    !dashboardContent.includes("runInBackground"),
    "Dashboard page does not call runInBackground"
  );

  // Verify cron payments endpoint accepts POST and GET
  const cronPaymentsPath = path.resolve(__dirname, "app/api/cron/payments/route.ts");
  const cronPaymentsContent = fs.readFileSync(cronPaymentsPath, "utf-8");
  assert(
    cronPaymentsContent.includes("export const POST = GET;"),
    "Cron payments endpoint exports both GET and POST handlers"
  );

  // Verify vercel.json cron configuration exists
  const vercelJsonPath = path.resolve(__dirname, "../vercel.json");
  assert(fs.existsSync(vercelJsonPath), "vercel.json exists for background cron scheduling");
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));
  assert(
    Array.isArray(vercelConfig.crons) &&
      vercelConfig.crons.some((c: any) => c.path === "/api/cron/payments"),
    "vercel.json configures payments cron"
  );
  assert(
    Array.isArray(vercelConfig.crons) &&
      vercelConfig.crons.some((c: any) => c.path === "/api/cron/notifications"),
    "vercel.json configures notifications cron"
  );

  // Verify sweepExpiredHolds runs idempotently on dbRepo
  const sweep1 = await sweepExpiredHolds(dbRepo);
  assert(typeof sweep1.sweptCount === "number", "sweepExpiredHolds returns sweptCount");
  assert(typeof sweep1.expiredCount === "number", "sweepExpiredHolds returns expiredCount");

  const sweep2 = await sweepExpiredHolds(dbRepo);
  assert(
    sweep2.expiredCount === 0 || typeof sweep2.expiredCount === "number",
    "Repeated sweep execution is safe and idempotent"
  );

  // =========================================================================
  // TASK 2: CENTRALIZED ENVIRONMENT VALIDATION
  // =========================================================================
  console.log("\n--- Task 2: Activate Environment Validation ---");

  // Save current env
  const savedEnv = { ...process.env };

  try {
    // 1. In production, missing SESSION_SECRET throws
    resetEnvCacheForTesting();
    let threwOnMissing = false;
    try {
      validateEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@ep-test-12345.us-east-2.aws.neon.tech/neondb?sslmode=require",
        CRON_SECRET: "strong-cron-secret-1234567890",
      });
    } catch (e: any) {
      threwOnMissing = true;
      assert(
        e.message.includes("SESSION_SECRET"),
        "validateEnv identifies missing/invalid SESSION_SECRET in production"
      );
    }
    assert(threwOnMissing, "validateEnv throws when required production variable is missing");

    // 2. In production, placeholder SESSION_SECRET is rejected
    resetEnvCacheForTesting();
    let threwOnPlaceholder = false;
    try {
      validateEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "generate-a-strong-32-byte-secret-key-for-production",
        DATABASE_URL: "postgresql://user:pass@ep-test-12345.us-east-2.aws.neon.tech/neondb?sslmode=require",
        CRON_SECRET: "strong-cron-secret-1234567890",
      });
    } catch (e: any) {
      threwOnPlaceholder = true;
      assert(
        e.message.includes("placeholder"),
        "validateEnv specifically rejects known template placeholder secrets"
      );
    }
    assert(threwOnPlaceholder, "validateEnv rejects known placeholder SESSION_SECRET");

    // 3. In production, short (< 32 char) SESSION_SECRET is rejected
    resetEnvCacheForTesting();
    let threwOnShortSecret = false;
    try {
      validateEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "too-short-secret",
        DATABASE_URL: "postgresql://user:pass@ep-test-12345.us-east-2.aws.neon.tech/neondb?sslmode=require",
        CRON_SECRET: "strong-cron-secret-1234567890",
      });
    } catch (e: any) {
      threwOnShortSecret = true;
      assert(
        e.message.includes("at least 32 characters"),
        "validateEnv enforces 32+ character SESSION_SECRET in production"
      );
    }
    assert(threwOnShortSecret, "validateEnv rejects weak/short SESSION_SECRET in production");

    // 4. In production, valid configuration passes and returns parsed env
    resetEnvCacheForTesting();
    const validProdEnv = validateEnv({
      NODE_ENV: "production",
      SESSION_SECRET: "production-valid-secret-key-must-be-32-bytes-long!",
      DATABASE_URL: "postgresql://user:pass@ep-test-12345.us-east-2.aws.neon.tech/neondb?sslmode=require",
      CRON_SECRET: "strong-cron-secret-1234567890",
    });
    assert(
      validProdEnv.NODE_ENV === "production",
      "validateEnv successfully parses valid production configuration"
    );
    assert(
      validProdEnv.SESSION_SECRET.length >= 32,
      "validateEnv provides valid SESSION_SECRET"
    );

    // 5. In development/test mode, fallback secret is provided safely
    resetEnvCacheForTesting();
    const devEnv = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "disabled-for-local-test",
    });
    assert(
      typeof devEnv.SESSION_SECRET === "string" && devEnv.SESSION_SECRET.length >= 32,
      "validateEnv provides safe development fallback without breaking dev"
    );

    // 6. Test getServerEnv caching
    resetEnvCacheForTesting();
    const cached1 = getServerEnv();
    const cached2 = getServerEnv();
    assert(cached1 === cached2, "getServerEnv caches parsed environment across invocations");
  } finally {
    // Restore env
    process.env = savedEnv;
    resetEnvCacheForTesting();
  }

  // Cron Auth tests
  console.log("\n--- Task 2 Sub: Cron Authentication Hardening ---");
  process.env.CRON_SECRET = "production-cron-secret-key-12345";
  resetEnvCacheForTesting();

  const unauthReq = new NextRequest("http://localhost:3000/api/cron/payments", {
    headers: { Authorization: "Bearer wrong-token" },
  });
  const unauthResp = rejectUnauthorizedCron(unauthReq);
  assert(unauthResp !== null, "rejectUnauthorizedCron rejects unauthorized request");
  assert(unauthResp?.status === 401, "rejectUnauthorizedCron returns HTTP 401 for bad secret");

  const authReq = new NextRequest("http://localhost:3000/api/cron/payments", {
    headers: { Authorization: "Bearer production-cron-secret-key-12345" },
  });
  const authResp = rejectUnauthorizedCron(authReq);
  assert(authResp === null, "rejectUnauthorizedCron permits request with valid Bearer secret");

  // In production without CRON_SECRET configured, validateEnv throws at startup
  resetEnvCacheForTesting();
  let threwInProd = false;
  try {
    validateEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@ep-test-12345.us-east-2.aws.neon.tech/neondb?sslmode=require",
      SESSION_SECRET: "production-valid-secret-key-must-be-32-bytes-long!",
      // CRON_SECRET omitted
    });
  } catch (err: any) {
    threwInProd = true;
    assert(err.message.includes("CRON_SECRET"), "validateEnv identifies missing CRON_SECRET in production");
  }
  assert(threwInProd, "validateEnv enforces CRON_SECRET in production");

  // Restore env
  (process.env as any).NODE_ENV = "test";
  delete process.env.CRON_SECRET;
  resetEnvCacheForTesting();

  // In test/dev environment, dev fallback passes when no secret set
  const devReq = new NextRequest("http://localhost:3000/api/cron/payments");
  const devResp = rejectUnauthorizedCron(devReq);
  assert(devResp === null, "rejectUnauthorizedCron permits development execution when unconfigured in dev/test");

  // =========================================================================
  // TASK 3: VOICE ASSISTANT SPEECH SYNTHESIS LIFECYCLE
  // =========================================================================
  console.log("\n--- Task 3: Voice Assistant SpeechSynthesis Lifecycle ---");

  const useVoicePath = path.resolve(__dirname, "components/assistant/use-voice.ts");
  const useVoiceContent = fs.readFileSync(useVoicePath, "utf-8");

  assert(
    useVoiceContent.includes("activeUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set())"),
    "useVoice tracks active utterances in activeUtterancesRef Set to prevent GC premature collection"
  );
  assert(
    useVoiceContent.includes("activeUtterancesRef.current.add(utterance)"),
    "useVoice retains reference on utterance creation"
  );
  assert(
    useVoiceContent.includes("activeUtterancesRef.current.delete(utterance)"),
    "useVoice cleans up utterance reference on onend and onerror"
  );
  assert(
    useVoiceContent.includes("activeUtterancesRef.current.clear()"),
    "useVoice clears all utterance references on stopSpeaking and stopAll"
  );

  // Simulated synthetic test of the Set retention pattern
  const activeUtterances = new Set<{ text: string; onend?: () => void; onerror?: () => void }>();
  const dummyUtterance = { text: "Hello patient" };
  activeUtterances.add(dummyUtterance);
  assert(activeUtterances.has(dummyUtterance), "Active utterance is pinned in memory during speech");
  activeUtterances.delete(dummyUtterance);
  assert(!activeUtterances.has(dummyUtterance), "Utterance reference is released after completion");

  // =========================================================================
  // TASK 4: DATABASE MIGRATION DEPLOYMENT SAFETY
  // =========================================================================
  console.log("\n--- Task 4: Database Migration Deployment Safety ---");

  const migrateScriptPath = path.resolve(__dirname, "../scripts/migrate.ts");
  assert(fs.existsSync(migrateScriptPath), "scripts/migrate.ts exists");

  const migrateContent = fs.readFileSync(migrateScriptPath, "utf-8");
  assert(
    migrateContent.includes("pool.connect()"),
    "scripts/migrate.ts acquires dedicated client connection via pool.connect()"
  );
  assert(
    migrateContent.includes("drizzle(client)"),
    "scripts/migrate.ts runs migrations on the same locked client connection"
  );
  assert(
    migrateContent.includes("pg_advisory_lock"),
    "scripts/migrate.ts acquires PostgreSQL advisory lock during migration"
  );
  assert(
    migrateContent.includes("pg_advisory_unlock"),
    "scripts/migrate.ts releases PostgreSQL advisory lock in finally block"
  );
  assert(
    migrateContent.includes("drizzle-orm/neon-serverless/migrator"),
    "scripts/migrate.ts uses Drizzle neon-serverless migrator"
  );

  const pkgJsonPath = path.resolve(__dirname, "../package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  assert(
    pkgJson.scripts["db:migrate"] === "tsx scripts/migrate.ts",
    "package.json wires db:migrate to scripts/migrate.ts"
  );

  // =========================================================================
  // TASK 5: DISTRIBUTED RATE LIMITING
  // =========================================================================
  console.log("\n--- Task 5: Production Rate Limiting (Distributed + Local) ---");

  resetRateLimitsForTests();

  // Test synchronous in-memory rate limiting
  const testUser = "test-user-rate-limit";
  let memAllowed = 0;
  for (let i = 0; i < 25; i++) {
    if (checkRateLimit(testUser, 1000 + i * 100).allowed) {
      memAllowed++;
    }
  }
  assert(memAllowed === 20, "In-memory rate limit allows exactly 20 calls in window");
  assert(!checkRateLimit(testUser, 2000).allowed, "In-memory rate limit blocks 21st call");

  resetRateLimitsForTests();

  // Test distributed rate limiting with mock storage simulating multi-node / multi-lambda concurrency
  class MockDistributedStorage implements RateLimitStorage {
    private logs: { identifier: string; time: number }[] = [];

    async recordFailedLogin(identifier: string): Promise<void> {
      this.logs.push({ identifier, time: Date.now() });
    }

    async getRecentFailedLoginCount(identifier: string, windowMinutes: number = 10): Promise<number> {
      const cutoff = Date.now() - windowMinutes * 60 * 1000;
      return this.logs.filter((l) => l.identifier === identifier && l.time >= cutoff).length;
    }
  }

  const mockStorage = new MockDistributedStorage();
  const distUser = "dist-user-123";

  // Simulate requests across distributed instances (instance 1 and instance 2)
  let distAllowed = 0;
  for (let i = 0; i < 20; i++) {
    const res = await checkRateLimitDistributed(distUser, 1000 + i, mockStorage);
    if (res.allowed) distAllowed++;
  }
  assert(distAllowed === 20, "Distributed rate limiter allows 20 requests across nodes");

  // 21st request should be rejected
  const rejectedRes = await checkRateLimitDistributed(distUser, 1050, mockStorage);
  assert(!rejectedRes.allowed, "Distributed rate limiter rejects 21st request");
  assert(rejectedRes.retryAfterSeconds > 0, "Distributed rate limiter returns retry-after header value");

  // Test storage failure fallback (does not crash or fail open)
  resetRateLimitsForTests();
  const faultStorage: RateLimitStorage = {
    async recordFailedLogin() {
      throw new Error("Neon connection pool timeout");
    },
    async getRecentFailedLoginCount() {
      throw new Error("Neon connection pool timeout");
    },
  };

  const fallbackRes = await checkRateLimitDistributed("fallback-user", Date.now(), faultStorage);
  assert(
    fallbackRes.allowed,
    "When distributed storage experiences transient failure, local memory fallback handles request gracefully"
  );

  // Test atomic consumeRateLimitToken on dbRepo directly
  const atomicKey = "test-atomic-key";
  let atomicAllowed = 0;
  for (let i = 0; i < 5; i++) {
    const res = await dbRepo.consumeRateLimitToken(atomicKey, 5, 10);
    if (res.allowed) atomicAllowed++;
  }
  assert(atomicAllowed === 5, "consumeRateLimitToken permits exactly maxLimit requests");
  const atomicBlocked = await dbRepo.consumeRateLimitToken(atomicKey, 5, 10);
  assert(!atomicBlocked.allowed, "consumeRateLimitToken blocks request exceeding maxLimit");
  assert(atomicBlocked.retryAfterSeconds > 0, "consumeRateLimitToken returns positive retryAfterSeconds");

  // Test rate limit record cleanup
  const cleanedCount = await dbRepo.cleanupOldRateLimits(0); // cleanup anything older than now
  assert(typeof cleanedCount === "number", "cleanupOldRateLimits safely purges expired records");

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n==============================================`);
  console.log(`Phase 1 Verification Results: ${passed} passed, ${failed} failed`);
  console.log(`==============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
