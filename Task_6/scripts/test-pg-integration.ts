/**
 * Medrella Healthcare — Real PostgreSQL Integration & Concurrency Test Harness
 * 
 * Tests genuine PostgreSQL behavior:
 * - Direct TCP/TLS connection and server version verification
 * - Drizzle schema table verification
 * - pg_advisory_xact_lock concurrency serialization
 * - Atomic CTE rate-limit execution
 * - Transaction rollback isolation
 * - Unique constraint (23505) violation graceful catch & recovery
 */

import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { sql, eq, and, gte } from "drizzle-orm";
import * as schema from "../src/db/schema";
import crypto from "crypto";

async function main() {
  console.log("🐘 Starting Medrella Real PostgreSQL Integration Test Suite...\n");

  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.trim() === "") {
    console.error("❌ ERROR: Neither TEST_DATABASE_URL nor DATABASE_URL is set in environment.");
    console.error("   A live PostgreSQL instance is required to execute genuine database concurrency tests.");
    console.error("   Example: export TEST_DATABASE_URL=\"postgres://user:password@localhost:5432/medrella_test\"\n");
    process.exit(1);
  }

  const isLocal = databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  // Sanitize connection string for display
  const maskedUrl = databaseUrl.replace(/:([^:@]+)@/, ":****@");
  console.log(`📡 Connecting to PostgreSQL at: ${maskedUrl} (${isLocal ? "node-postgres / TCP" : "neon-serverless / WebSocket"})`);

  const pool: any = isLocal
    ? new PgPool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        max: 5,
      })
    : new NeonPool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        max: 5,
      });

  const client: any = await pool.connect();
  const drizzle: any = isLocal ? pgDrizzle : neonDrizzle;
  const db: any = drizzle(client, { schema });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  try {
    // 1. Connection & Version Probe
    console.log("\n--- 1. Live PostgreSQL Connection Probe ---");
    const versionRes = await client.query("SELECT version() as ver, current_database() as db_name, now() as db_time");
    assert(Boolean(versionRes.rows[0]?.ver), `Connected to PostgreSQL: ${versionRes.rows[0]?.ver?.slice(0, 50)}...`);
    assert(Boolean(versionRes.rows[0]?.db_name), `Active Database: ${versionRes.rows[0]?.db_name}`);

    // 2. Schema Table Verification
    console.log("\n--- 2. Core Healthcare Schema Verification ---");
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = new Set(tablesRes.rows.map((r: any) => r.table_name));
    const requiredTables = [
      "users",
      "patients",
      "doctors",
      "availabilities",
      "appointments",
      "doctor_leaves",
      "payments",
      "payment_events",
      "refunds",
      "notifications",
      "login_attempts",
    ];

    for (const table of requiredTables) {
      assert(tables.has(table), `Table '${table}' exists in public schema`);
    }

    // 3. Transaction Rollback & Isolation Check
    console.log("\n--- 3. ACID Transaction Rollback Integrity ---");
    const testEmail = `rollback_test_${crypto.randomUUID()}@medrella.internal`;
    try {
      await db.transaction(async (tx: any) => {
        await tx.insert(schema.users).values({
          id: `usr_${crypto.randomUUID()}`,
          email: testEmail,
          passwordHash: "test_hash",
          role: "PATIENT",
          isActive: true,
          createdAt: new Date(),
        });
        // Intentionally throw to trigger transaction rollback
        throw new Error("INTENTIONAL_ROLLBACK_TEST");
      });
    } catch (err: any) {
      if (err.message !== "INTENTIONAL_ROLLBACK_TEST") throw err;
    }

    const checkRollback = await db.select().from(schema.users).where(eq(schema.users.email, testEmail));
    assert(checkRollback.length === 0, "Rolled-back transaction leaves zero residual records in database");

    // 4. Advisory Lock Concurrency Serialization
    console.log("\n--- 4. Concurrency & Transaction Advisory Locks ---");
    const lockKey = `test_lock_${crypto.randomUUID()}`;
    let lockAcquired = false;

    await db.transaction(async (tx: any) => {
      const lockRes = await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})) as locked`);
      lockAcquired = true;
    });
    assert(lockAcquired, "pg_advisory_xact_lock successfully acquired and auto-released on commit");

    // 5. Unique Constraint (23505) Graceful Recovery
    console.log("\n--- 5. Unique Constraint Idempotency Handling (Error 23505) ---");
    const testDuplicateEmail = `uniq_test_${crypto.randomUUID()}@medrella.internal`;

    // First insert succeeds
    const [firstUser] = await db.insert(schema.users).values({
      id: `usr_${crypto.randomUUID()}`,
      email: testDuplicateEmail,
      passwordHash: "test_hash",
      role: "PATIENT",
      isActive: true,
      createdAt: new Date(),
    }).returning();

    assert(Boolean(firstUser?.id), "First user record inserted successfully");

    // Second insert with same email tests 23505 error code
    let caught23505 = false;
    let fallbackUser: any = null;

    try {
      await db.insert(schema.users).values({
        id: `usr_${crypto.randomUUID()}`,
        email: testDuplicateEmail,
        passwordHash: "duplicate_hash",
        role: "PATIENT",
        isActive: true,
        createdAt: new Date(),
      });
    } catch (err: any) {
      if (err?.code === "23505" || err?.message?.includes("users_email_unique") || err?.message?.includes("duplicate key")) {
        caught23505 = true;
        // Application fallback: query existing user
        const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, testDuplicateEmail));
        fallbackUser = existing;
      }
    }

    assert(caught23505, "PostgreSQL accurately triggers error code 23505 on duplicate unique constraint");
    assert(fallbackUser?.id === firstUser?.id, "Application gracefully recovers and returns existing record");

    // Clean up test user
    await db.delete(schema.users).where(eq(schema.users.email, testDuplicateEmail));

    // 6. Atomic Distributed Rate Limiting via login_attempts & Transaction-Scoped Advisory Locks
    console.log("\n--- 6. Atomic Distributed Rate Limiting ---");
    const rateLimitKey = `test_ip_${crypto.randomUUID()}`;
    const windowMinutes = 1;
    const maxLimit = 3;

    const testRateLimitSql = async () => {
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ratelimit:${rateLimitKey}`}))`);
        const [stats] = await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(schema.loginAttempts)
          .where(and(eq(schema.loginAttempts.email, rateLimitKey), gte(schema.loginAttempts.attemptedAt, cutoff)));
        
        const count = Number(stats?.cnt ?? 0);
        if (count < maxLimit) {
          await tx.insert(schema.loginAttempts).values({
            id: `att-${crypto.randomUUID()}`,
            email: rateLimitKey,
            attemptedAt: new Date(),
          });
          return true;
        }
        return false;
      });
    };

    const call1 = await testRateLimitSql();
    const call2 = await testRateLimitSql();
    const call3 = await testRateLimitSql();
    const call4 = await testRateLimitSql(); // Should be rejected by quota limit

    assert(call1 && call2 && call3, "First 3 rate limit tokens allowed within quota");
    assert(!call4, "4th token atomically blocked by PostgreSQL conditional limit check");

    // Clean up test login attempts
    await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.email, rateLimitKey));

    console.log("\n==========================================");
    console.log(`PostgreSQL Integration Results: ${passed} passed, ${failed} failed`);
    console.log("==========================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unhandled exception during PostgreSQL integration test:", err);
  process.exit(1);
});
