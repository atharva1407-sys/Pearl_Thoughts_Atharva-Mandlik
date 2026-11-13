/**
 * One-off cleanup: keep every DOCTOR account and exactly ONE patient account; delete all other
 * patient accounts together with their appointments, payments, refunds, notifications and
 * assistant audit events.
 *
 * It is a DRY RUN unless you pass --apply: it only SELECTs and prints what it would delete.
 *
 *   npx tsx scripts/clean-accounts.ts --keep-patient you@example.com            # dry run
 *   npx tsx scripts/clean-accounts.ts --keep-patient you@example.com --apply    # does it
 *
 * Reads DATABASE_URL from .env.local. Everything runs in one transaction: if anything fails,
 * nothing is deleted. Delete this file when you are done.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool } from "@neondatabase/serverless";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const keepEmail = arg("--keep-patient")?.trim().toLowerCase();
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;

  if (!keepEmail) {
    console.error("Missing --keep-patient <email>. Nothing was done.");
    process.exit(1);
  }
  if (!url || !url.startsWith("postgres")) {
    console.error("DATABASE_URL is not a postgres connection string in .env.local. Nothing was done.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    console.log(`Database: ${new URL(url).hostname.split(".")[0]}   Mode: ${apply ? "APPLY (will delete)" : "dry run (no changes)"}`);

    const patients = (
      await client.query(
        `SELECT p.id, u.id AS user_id, u.email, p.first_name, p.last_name
           FROM patients p JOIN users u ON u.id = p.user_id ORDER BY u.created_at`
      )
    ).rows as { id: string; user_id: string; email: string; first_name: string; last_name: string }[];
    const doctors = (await client.query(`SELECT u.email FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY u.email`)).rows;

    const keep = patients.filter((p) => p.email.toLowerCase() === keepEmail);
    if (keep.length !== 1) {
      console.error(`The patient "${keepEmail}" was not found (or is ambiguous). Patient accounts present:`);
      for (const p of patients) console.error(`  - ${p.email} (${p.first_name} ${p.last_name})`);
      console.error("Nothing was done.");
      process.exit(1);
    }
    const remove = patients.filter((p) => p.id !== keep[0].id);
    const patientIds = remove.map((p) => p.id);
    const userIds = remove.map((p) => p.user_id);

    console.log(`\nKEEPING all ${doctors.length} doctor accounts and 1 patient: ${keep[0].email}`);
    console.log(`DELETING ${remove.length} patient account(s):`);
    for (const p of remove) console.log(`  - ${p.email} (${p.first_name} ${p.last_name})`);

    const count = async (sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0].n as number;
    const apptIds = (await client.query(`SELECT id FROM appointments WHERE patient_id = ANY($1)`, [patientIds])).rows.map((r) => r.id as string);

    const plan: [string, string, unknown[]][] = [
      ["notifications", `SELECT count(*)::int AS n FROM notifications WHERE user_id = ANY($1) OR appointment_id = ANY($2)`, [userIds, apptIds]],
      ["refunds", `SELECT count(*)::int AS n FROM refunds WHERE appointment_id = ANY($1)`, [apptIds]],
      ["payments", `SELECT count(*)::int AS n FROM payments WHERE appointment_id = ANY($1) OR patient_id = ANY($2)`, [apptIds, patientIds]],
      ["appointments", `SELECT count(*)::int AS n FROM appointments WHERE id = ANY($1)`, [apptIds]],
      ["agent_events", `SELECT count(*)::int AS n FROM agent_events WHERE user_id = ANY($1)`, [userIds]],
      ["login_attempts (all)", `SELECT count(*)::int AS n FROM login_attempts`, []],
      ["payment_events (all)", `SELECT count(*)::int AS n FROM payment_events`, []],
    ];
    console.log("\nRows that would be removed:");
    for (const [label, sql, params] of plan) console.log(`  ${label.padEnd(22)} ${await count(sql, params)}`);

    if (!apply) {
      console.log("\nDry run only: nothing was changed. Re-run with --apply to delete.");
      return;
    }

    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM notifications WHERE user_id = ANY($1) OR appointment_id = ANY($2)`, [userIds, apptIds]);
      await client.query(`DELETE FROM refunds WHERE appointment_id = ANY($1)`, [apptIds]);
      await client.query(`DELETE FROM payments WHERE appointment_id = ANY($1) OR patient_id = ANY($2)`, [apptIds, patientIds]);
      await client.query(`DELETE FROM appointments WHERE id = ANY($1)`, [apptIds]);
      await client.query(`DELETE FROM notification_preferences WHERE user_id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM agent_events WHERE user_id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM patients WHERE id = ANY($1)`, [patientIds]);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM login_attempts`);
      await client.query(`DELETE FROM payment_events`);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const left = (await client.query(`SELECT count(*)::int AS n FROM patients`)).rows[0].n;
    const docsLeft = (await client.query(`SELECT count(*)::int AS n FROM doctors`)).rows[0].n;
    console.log(`\nDone. Patients remaining: ${left}. Doctors remaining: ${docsLeft}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed, nothing was deleted:", err?.message ?? err);
  process.exit(1);
});
