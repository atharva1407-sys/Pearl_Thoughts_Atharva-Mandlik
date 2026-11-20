import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool } from "@neondatabase/serverless";

const MIGRATION_TAG = "0010_patient_medical_history";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !connectionString.startsWith("postgres")) {
    console.error("❌ ERROR: DATABASE_URL is not set or not a postgres connection string in .env.local");
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, "migrations", `${MIGRATION_TAG}.sql`);
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found at: ${migrationPath}`);
    process.exit(1);
  }

  const journalPath = path.join(__dirname, "migrations", "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
    entries: { tag: string; when: number }[];
  };
  const entry = journal.entries.find((e) => e.tag === MIGRATION_TAG);
  if (!entry) {
    console.error(`❌ ${MIGRATION_TAG} is missing from migrations/meta/_journal.json`);
    process.exit(1);
  }

  const rawSql = fs.readFileSync(migrationPath, "utf-8");
  // Drizzle identifies an applied migration by the sha256 of its SQL file.
  const hash = crypto.createHash("sha256").update(rawSql).digest("hex");
  // Split by drizzle statement breakpoints
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`🚀 Connecting to Neon PostgreSQL and applying migration 0010 (${statements.length} statements)...`);
  const host = new URL(connectionString).hostname;
  console.log(`   Target database host: ${host.split(".")[0]} (check this is the database you intend to change)`);
  const pool = new Pool({ connectionString });
  // One checked-out connection, so every statement shares a single transaction.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // A failed statement aborts a Postgres transaction, so each one runs inside a savepoint
      // that can be rolled back on its own when the object already exists.
      await client.query("SAVEPOINT migration_stmt");
      try {
        await client.query(stmt);
        await client.query("RELEASE SAVEPOINT migration_stmt");
        console.log(`  ✅ [${i + 1}/${statements.length}] Executed statement`);
      } catch (err: any) {
        // If column, table, or index already exists, log and continue safely
        if (err.code === "42701" || err.code === "42P07" || err.code === "42710") {
          await client.query("ROLLBACK TO SAVEPOINT migration_stmt");
          console.log(`  ℹ️ [${i + 1}/${statements.length}] Already applied (skipping): ${err.message}`);
        } else {
          throw err;
        }
      }
    }

    // Record the migration in Drizzle's history table so `npm run db:migrate` does not re-run it.
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query(
      'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'
    );
    const existing = await client.query('SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = $1', [hash]);
    if (existing.rows.length === 0) {
      await client.query('INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)', [
        hash,
        entry.when,
      ]);
      console.log("  📝 Recorded 0010 in drizzle.__drizzle_migrations");
    } else {
      console.log("  ℹ️ 0010 was already recorded in drizzle.__drizzle_migrations");
    }

    await client.query("COMMIT");
    console.log("🎉 Migration 0010 applied successfully to Neon database!");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection already gone; nothing to roll back
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
