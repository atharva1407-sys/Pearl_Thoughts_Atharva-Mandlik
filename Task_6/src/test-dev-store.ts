/**
 * Local dev store test: a hot reload creates a second repository instance. Accounts registered before the
 * reload must still exist afterwards, otherwise the browser keeps a valid cookie for a user that no longer
 * exists and the assistant answers "Please sign in".
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.ENABLE_SEED_DATA = "true";

import crypto from "crypto";
import { MedrellaRepository, dbRepo } from "./db/repo";

let total = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

async function main() {
  console.log("\n--- Dev in-memory store survives a module reload ---");

  const userId = `usr_${crypto.randomUUID()}`;
  await dbRepo.createUser({ id: userId, email: `reload.${crypto.randomUUID().slice(0, 6)}@example.com`, passwordHash: "x", role: "PATIENT", isActive: true });
  const doctorsBefore = (await dbRepo.getAllDoctors()).length;
  assert(doctorsBefore > 0, "the seeded doctors exist");

  // What a hot reload does: the module is evaluated again and builds a new repository.
  const afterReload = new MedrellaRepository();

  assert(Boolean(await afterReload.getUserById(userId)), "an account created before the reload still exists after it");
  assert((await afterReload.getAllDoctors()).length === doctorsBefore, "doctors are not seeded a second time (no duplicates)");
  assert(afterReload.mem === dbRepo.mem, "both repository copies share one store");

  // Writes through either copy are visible to the other.
  const patient = await afterReload.createPatient({ id: `pat_${crypto.randomUUID()}`, userId, firstName: "Re", lastName: "Load", phone: "+919800000000" });
  assert((await dbRepo.getPatientById(patient.id))?.userId === userId, "data written through the new copy is visible to the old one");

  // An explicit reset still works (used by the dev seed / clear actions).
  await dbRepo.clearAll();
  assert((await afterReload.getAllDoctors()).length === 0, "an explicit clear empties the shared store");
  await dbRepo.seed();
  assert((await afterReload.getAllDoctors()).length === doctorsBefore, "an explicit seed restores the doctors once");

  console.log(`\nDev store tests: ${total - failed} passed, ${failed} failed (of ${total})`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error in dev store test:", err);
  process.exit(1);
});
