import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool } from "@neondatabase/serverless";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !connectionString.startsWith("postgres")) {
    console.log("ℹ️ Running in in-memory mode. Simply restarting your dev server resets in-memory data to fresh state!");
    return;
  }

  const pool = new Pool({ connectionString });
  try {
    console.log("🧹 Clearing test payments, refunds, notifications, and appointments from database...");
    await pool.query(`DELETE FROM refunds;`);
    await pool.query(`DELETE FROM payments;`);
    await pool.query(`DELETE FROM payment_events;`);
    await pool.query(`DELETE FROM notifications;`);
    await pool.query(`DELETE FROM appointments;`);
    console.log("✅ All test transactions, payments, holds, and appointments cleared cleanly!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Failed to clear database:", err);
  process.exit(1);
});
