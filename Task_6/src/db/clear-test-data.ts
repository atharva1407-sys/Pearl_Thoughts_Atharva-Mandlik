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
    console.log("🧹 Clearing test claims, preauth, policies, events, payments, refunds, notifications, appointments, and login attempts from database...");
    await pool.query(`DELETE FROM claims;`);
    await pool.query(`DELETE FROM preauth_requests;`);
    await pool.query(`DELETE FROM insurance_policies;`);
    await pool.query(`DELETE FROM agent_events;`);
    await pool.query(`DELETE FROM refunds;`);
    await pool.query(`DELETE FROM payments;`);
    await pool.query(`DELETE FROM payment_events;`);
    await pool.query(`DELETE FROM notifications;`);
    await pool.query(`DELETE FROM notification_preferences;`);
    await pool.query(`DELETE FROM appointments;`);
    await pool.query(`DELETE FROM login_attempts;`);
    console.log("✅ All test transactions, claims, preauth, policies, events, payments, holds, appointments, and login attempts cleared cleanly!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Failed to clear database:", err);
  process.exit(1);
});
