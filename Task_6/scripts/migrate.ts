import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { migrate as neonMigrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool as PgPool } from "pg";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { migrate as pgMigrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { sql } from "drizzle-orm";

const MIGRATION_LOCK_KEY = "medrella_db_migration_lock";

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString || !connectionString.startsWith("postgres")) {
    console.error("❌ [MIGRATE_ERROR]: DATABASE_URL is not configured or not a PostgreSQL connection string.");
    process.exit(1);
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  // Sanitize log: log only hostname, never user or password
  try {
    const parsed = new URL(connectionString);
    console.log(`🔒 [MIGRATE]: Connecting to PostgreSQL host: ${parsed.hostname} (${isLocal ? "node-postgres / TCP" : "neon-serverless / WebSocket"})`);
  } catch {
    console.log("🔒 [MIGRATE]: Connecting to PostgreSQL database...");
  }

  const pool: any = isLocal ? new PgPool({ connectionString }) : new NeonPool({ connectionString });
  const client: any = await pool.connect();
  const drizzle: any = isLocal ? pgDrizzle : neonDrizzle;
  const db = drizzle(client);

  let lockAcquired = false;

  try {
    console.log("🔒 [MIGRATE]: Acquiring deployment advisory lock on dedicated connection...");
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    lockAcquired = true;
    console.log("✅ [MIGRATE]: Advisory lock acquired on dedicated connection.");

    const migrationsFolder = path.resolve(process.cwd(), "src/db/migrations");
    console.log(`🚀 [MIGRATE]: Applying version-controlled migrations from: ${migrationsFolder}`);

    if (isLocal) {
      await pgMigrate(db as any, { migrationsFolder });
    } else {
      await neonMigrate(db as any, { migrationsFolder });
    }

    console.log("🎉 [MIGRATE]: All database migrations applied and verified successfully!");
  } catch (err: any) {
    console.error("❌ [MIGRATE_FAILED]: Migration execution failed:", err?.message || err);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
        console.log("🔓 [MIGRATE]: Advisory lock released.");
      } catch (unlockErr: any) {
        console.warn("⚠️ [MIGRATE_WARN]: Failed to release advisory lock:", unlockErr?.message);
      }
    }
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
