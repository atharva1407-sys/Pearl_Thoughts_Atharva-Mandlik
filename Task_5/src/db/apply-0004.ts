import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "fs";
import path from "path";
import { Pool } from "@neondatabase/serverless";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !connectionString.startsWith("postgres")) {
    console.error("❌ ERROR: DATABASE_URL is not set or not a postgres connection string in .env.local");
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, "migrations", "0004_careful_night_nurse.sql");
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found at: ${migrationPath}`);
    process.exit(1);
  }

  const rawSql = fs.readFileSync(migrationPath, "utf-8");
  // Split by drizzle statement breakpoints
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`🚀 Connecting to Neon PostgreSQL and applying migration 0004 (${statements.length} statements)...`);
  const host = new URL(connectionString).hostname;
  console.log(`   Target database host: ${host.split(".")[0]} (check this is the database you intend to change)`);
  const pool = new Pool({ connectionString });

  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await pool.query(stmt);
        console.log(`  ✅ [${i + 1}/${statements.length}] Executed statement`);
      } catch (err: any) {
        // If column, table, or constraint already exists, log and continue safely
        if (err.code === "42701" || err.code === "42P07" || err.code === "42710") {
          console.log(`  ℹ️ [${i + 1}/${statements.length}] Already applied (skipping): ${err.message}`);
        } else {
          throw err;
        }
      }
    }
    console.log("🎉 Migration 0004 applied successfully to Neon database!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
