// Force the in-memory repository even if a real DATABASE_URL is in the shell.
process.env.DATABASE_URL = "disabled-for-local-test";

import assert from "node:assert";
import crypto from "crypto";
import { dbRepo, type AppointmentEntity } from "./db/repo";
import type { MedicalProfileData } from "./db/repositories/types";
import {
  EMPTY_MEDICAL_PROFILE,
  diffMedicalProfile,
  profileToData,
  resolveRecordAccess,
  splitVisits,
} from "./domain/medical-history";
import { ageFromDateOfBirth, getPatientRecordAccess, loadVisitHistory, resolveOwnPatientId } from "./domain/patient-record";
import { medicalProfileDataSchema, saveMedicalProfileSchema, visitRecordSchema } from "./lib/validators";

console.log("🧪 Running Task 9 Medical History & Visit History Test Suite...\n");

let passed = 0;
let failed = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(err);
    failed++;
  }
}

const docA = "doc_ananya_sharma";
const docB = "doc_rohan_mehta";

function profile(overrides: Partial<MedicalProfileData> = {}): MedicalProfileData {
  return { ...EMPTY_MEDICAL_PROFILE, allergies: [], conditions: [], ...overrides };
}

async function makePatient(label: string) {
  const userId = `usr_mh_${label}_${crypto.randomUUID().slice(0, 6)}`;
  const patientId = `pat_mh_${label}_${crypto.randomUUID().slice(0, 6)}`;
  await dbRepo.createUser({ id: userId, email: `${userId}@example.test`, passwordHash: "x", role: "PATIENT", isActive: true });
  await dbRepo.createPatient({ id: patientId, userId, firstName: label, lastName: "Patient", phone: "9999999999" });
  return { userId, patientId };
}

function addAppointment(overrides: Partial<AppointmentEntity> & { patientId: string }): AppointmentEntity {
  const appt: AppointmentEntity = {
    id: `apt_mh_${crypto.randomUUID().slice(0, 8)}`,
    doctorId: docA,
    sessionId: "session_test",
    appointmentDate: "2026-01-10",
    startTime: "10:00",
    endTime: "10:15",
    status: "COMPLETED",
    tokenNumber: 1,
    reason: "Checkup",
    holdExpiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  dbRepo.mem.appointments.push(appt);
  return appt;
}

const patientActor = (userId: string) => ({ userId, role: "PATIENT" as const, name: "Pat Ient" });
const doctorActor = { userId: "usr_docA", role: "DOCTOR" as const, name: "Dr. Ananya Sharma" };

async function run() {
  console.log("--- 1. Profile diff ---");

  await it("An empty profile compared with a filled one lists exactly the fields that changed", () => {
    const after = profile({
      bloodGroup: "O+",
      allergies: [{ name: "Penicillin", severity: "SEVERE", reaction: "Rash" }],
      notes: "Carries an inhaler",
    });
    const changes = diffMedicalProfile(profile(), after);
    assert.deepStrictEqual(changes.map((c) => c.field).sort(), ["allergies", "bloodGroup", "notes"]);
    const allergy = changes.find((c) => c.field === "allergies")!;
    assert.strictEqual(allergy.from, "None");
    assert.strictEqual(allergy.to, "Penicillin (severe) – Rash");
    assert.strictEqual(allergy.label, "Allergies");
  });

  await it("No change, or the same allergies in a different order, is not a change", () => {
    const a = profile({
      allergies: [
        { name: "Penicillin", severity: "SEVERE" },
        { name: "Peanuts", severity: "MILD" },
      ],
    });
    const reordered = profile({ allergies: [...a.allergies].reverse() });
    assert.strictEqual(diffMedicalProfile(a, a).length, 0);
    assert.strictEqual(diffMedicalProfile(a, reordered).length, 0);
  });

  await it("Changing only an allergy's severity, or a condition's status, is reported", () => {
    const before = profile({
      allergies: [{ name: "Dust", severity: "MILD" }],
      conditions: [{ name: "Asthma", status: "ACTIVE" }],
    });
    const after = profile({
      allergies: [{ name: "Dust", severity: "SEVERE" }],
      conditions: [{ name: "Asthma", status: "MANAGED" }],
    });
    assert.deepStrictEqual(diffMedicalProfile(before, after).map((c) => c.field).sort(), ["allergies", "conditions"]);
  });

  await it("Clearing a value is reported as a change to 'None'", () => {
    const changes = diffMedicalProfile(profile({ heightCm: 170 }), profile());
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].from, "170 cm");
    assert.strictEqual(changes[0].to, "None");
  });

  console.log("\n--- 2. Access rules ---");

  await it("A patient can view and edit their own record; a doctor needs a treating relationship; a receptionist never", () => {
    assert.deepStrictEqual(resolveRecordAccess({ role: "PATIENT" }, { isOwnRecord: true, doctorHasTreated: false }), { canView: true, canEdit: true });
    assert.deepStrictEqual(resolveRecordAccess({ role: "PATIENT" }, { isOwnRecord: false, doctorHasTreated: false }), { canView: false, canEdit: false });
    assert.deepStrictEqual(resolveRecordAccess({ role: "DOCTOR" }, { isOwnRecord: false, doctorHasTreated: true }), { canView: true, canEdit: true });
    assert.deepStrictEqual(resolveRecordAccess({ role: "DOCTOR" }, { isOwnRecord: false, doctorHasTreated: false }), { canView: false, canEdit: false });
    assert.deepStrictEqual(resolveRecordAccess({ role: "RECEPTIONIST" }, { isOwnRecord: true, doctorHasTreated: true }), { canView: false, canEdit: false });
    assert.deepStrictEqual(resolveRecordAccess(null, { isOwnRecord: true, doctorHasTreated: true }), { canView: false, canEdit: false });
  });

  await it("A patient claiming ANOTHER patient's id is refused; a doctor is allowed only after a real booking", async () => {
    const alice = await makePatient("Alice");
    const bob = await makePatient("Bob");
    const aliceSession = { role: "PATIENT" as const, profileId: alice.patientId, userId: alice.userId };

    assert.strictEqual((await getPatientRecordAccess(aliceSession, alice.patientId)).canEdit, true);
    assert.strictEqual((await getPatientRecordAccess(aliceSession, bob.patientId)).canView, false);

    const doctorSession = { role: "DOCTOR" as const, profileId: docA, userId: "usr_docA" };
    assert.strictEqual((await getPatientRecordAccess(doctorSession, alice.patientId)).canView, false, "no booking yet");
    addAppointment({ patientId: alice.patientId, doctorId: docA, status: "BOOKED" });
    assert.strictEqual((await getPatientRecordAccess(doctorSession, alice.patientId)).canEdit, true, "booked with this doctor");
    assert.strictEqual((await getPatientRecordAccess(doctorSession, bob.patientId)).canView, false, "other patient still hidden");

    const receptionist = { role: "RECEPTIONIST" as const, profileId: "rec_1", userId: "usr_rec_1" };
    assert.strictEqual((await getPatientRecordAccess(receptionist, alice.patientId)).canView, false);
  });

  await it("Cancelled, expired and unpaid bookings do not give a doctor access; completed ones do", async () => {
    const carol = await makePatient("Carol");
    for (const status of ["CANCELLED", "EXPIRED", "PENDING_PAYMENT", "NO_SHOW"] as const) {
      addAppointment({ patientId: carol.patientId, doctorId: docB, status });
    }
    assert.strictEqual(await dbRepo.doctorHasTreatedPatient(docB, carol.patientId), false);
    addAppointment({ patientId: carol.patientId, doctorId: docB, status: "COMPLETED" });
    assert.strictEqual(await dbRepo.doctorHasTreatedPatient(docB, carol.patientId), true);
    assert.strictEqual(await dbRepo.doctorHasTreatedPatient(docA, carol.patientId), false, "a different doctor");
  });

  await it("A doctor who is also a patient resolves their own patient record", async () => {
    const userId = "usr_doc_as_patient";
    await dbRepo.createUser({ id: userId, email: "docpatient@example.test", passwordHash: "x", role: "DOCTOR", isActive: true });
    await dbRepo.createPatient({ id: "pat_doc_as_patient", userId, firstName: "Doc", lastName: "Patient", phone: "1" });
    const session = { role: "DOCTOR" as const, profileId: docA, userId };
    assert.strictEqual(await resolveOwnPatientId(session), "pat_doc_as_patient");
    assert.strictEqual((await getPatientRecordAccess(session, "pat_doc_as_patient")).isOwnRecord, true);
  });

  console.log("\n--- 3. Saving a profile and its update history ---");

  const dana = await makePatient("Dana");
  const erin = await makePatient("Erin");

  await it("The first save creates version 1 and one history entry naming who made it", async () => {
    const res = await dbRepo.saveMedicalProfile({
      patientId: dana.patientId,
      expectedVersion: 0,
      data: profile({ bloodGroup: "A+", allergies: [{ name: "Penicillin", severity: "SEVERE" }] }),
      changeNote: "Self-reported at registration",
      actor: patientActor(dana.userId),
    });
    assert.ok(res.success && res.changed);
    if (!res.success || !res.changed) return;
    assert.strictEqual(res.profile.version, 1);
    assert.strictEqual(res.log.version, 1);
    assert.strictEqual(res.log.changedByRole, "PATIENT");
    assert.strictEqual(res.log.changeNote, "Self-reported at registration");

    const stored = await dbRepo.getMedicalProfile(dana.patientId);
    assert.strictEqual(stored?.bloodGroup, "A+");
    assert.strictEqual(stored?.updatedByName, "Pat Ient");
  });

  await it("A doctor's update bumps the version, keeps the earlier entry and records the doctor", async () => {
    const res = await dbRepo.saveMedicalProfile({
      patientId: dana.patientId,
      expectedVersion: 1,
      data: profile({
        bloodGroup: "A+",
        allergies: [{ name: "Penicillin", severity: "SEVERE" }],
        conditions: [{ name: "Hypertension", status: "ACTIVE" }],
      }),
      actor: doctorActor,
    });
    assert.ok(res.success && res.changed);
    const log = await dbRepo.getMedicalHistoryLog(dana.patientId);
    assert.strictEqual(log.length, 2);
    assert.deepStrictEqual(log.map((l) => l.version), [2, 1], "newest first");
    assert.strictEqual(log[0].changedByRole, "DOCTOR");
    assert.strictEqual(log[0].changedByName, "Dr. Ananya Sharma");
    assert.deepStrictEqual(log[0].changes.map((c) => c.field), ["conditions"], "only the changed field is logged");
    assert.strictEqual(log[1].changedByRole, "PATIENT", "the first entry is untouched");
  });

  await it("Saving identical data changes nothing and writes no history entry", async () => {
    const current = await dbRepo.getMedicalProfile(dana.patientId);
    const res = await dbRepo.saveMedicalProfile({
      patientId: dana.patientId,
      expectedVersion: current!.version,
      data: profileToData(current),
      actor: patientActor(dana.userId),
    });
    assert.ok(res.success && !res.changed);
    assert.strictEqual((await dbRepo.getMedicalHistoryLog(dana.patientId)).length, 2);
    assert.strictEqual((await dbRepo.getMedicalProfile(dana.patientId))!.version, 2);
  });

  await it("An edit made from a stale copy is refused and nothing is overwritten", async () => {
    const res = await dbRepo.saveMedicalProfile({
      patientId: dana.patientId,
      expectedVersion: 1, // someone already saved version 2
      data: profile({ bloodGroup: "B-" }),
      actor: patientActor(dana.userId),
    });
    assert.strictEqual(res.success, false);
    if (!res.success) assert.strictEqual(res.error, "CONFLICT");
    assert.strictEqual((await dbRepo.getMedicalProfile(dana.patientId))!.bloodGroup, "A+");
    assert.strictEqual((await dbRepo.getMedicalHistoryLog(dana.patientId)).length, 2);
  });

  await it("A first save that claims an existing version is refused, and an empty first save creates nothing", async () => {
    const stale = await dbRepo.saveMedicalProfile({
      patientId: erin.patientId,
      expectedVersion: 3,
      data: profile({ bloodGroup: "O-" }),
      actor: patientActor(erin.userId),
    });
    assert.strictEqual(stale.success, false);

    const empty = await dbRepo.saveMedicalProfile({
      patientId: erin.patientId,
      expectedVersion: 0,
      data: profile(),
      actor: patientActor(erin.userId),
    });
    assert.ok(empty.success && !empty.changed);
    assert.strictEqual(await dbRepo.getMedicalProfile(erin.patientId), undefined);
  });

  await it("Profiles and histories are isolated per patient, and returned copies cannot corrupt the store", async () => {
    assert.strictEqual((await dbRepo.getMedicalHistoryLog(erin.patientId)).length, 0);
    const copy = await dbRepo.getMedicalProfile(dana.patientId);
    copy!.allergies.push({ name: "Injected", severity: "MILD" });
    copy!.bloodGroup = "AB-";
    const fresh = await dbRepo.getMedicalProfile(dana.patientId);
    assert.strictEqual(fresh!.allergies.length, 1);
    assert.strictEqual(fresh!.bloodGroup, "A+");
  });

  console.log("\n--- 4. Input validation ---");

  const validData = {
    bloodGroup: "O+",
    heightCm: 172,
    weightKg: 68,
    allergies: [{ name: " Peanuts ", severity: "MODERATE", reaction: "" }],
    conditions: [{ name: "Asthma", status: "MANAGED" }],
    currentMedications: "",
    pastSurgeries: "  Appendectomy 2015 ",
    familyHistory: null,
    notes: undefined,
  };

  await it("Valid data is trimmed and blanks become null", () => {
    const r = medicalProfileDataSchema.parse(validData);
    assert.strictEqual(r.allergies[0].name, "Peanuts");
    assert.strictEqual(r.allergies[0].reaction, undefined);
    assert.strictEqual(r.currentMedications, null);
    assert.strictEqual(r.pastSurgeries, "Appendectomy 2015");
    assert.strictEqual(r.familyHistory, null);
    assert.strictEqual(r.notes, null);
    assert.strictEqual(medicalProfileDataSchema.parse({ ...validData, bloodGroup: "", heightCm: null }).bloodGroup, null);
  });

  await it("Bad blood group, impossible height, blank or duplicate allergy names and bad severity are rejected", () => {
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, bloodGroup: "Z+" }).success, false);
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, heightCm: 5 }).success, false);
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, weightKg: 12.5 }).success, false);
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, allergies: [{ name: "  ", severity: "MILD" }] }).success, false);
    assert.strictEqual(
      medicalProfileDataSchema.safeParse({
        ...validData,
        allergies: [{ name: "Dust", severity: "MILD" }, { name: "dust", severity: "SEVERE" }],
      }).success,
      false
    );
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, allergies: [{ name: "Dust", severity: "HUGE" }] }).success, false);
    assert.strictEqual(medicalProfileDataSchema.safeParse({ ...validData, notes: "x".repeat(1001) }).success, false);
  });

  await it("The save payload needs a patient id and a non-negative integer version; visit records need a diagnosis", () => {
    assert.strictEqual(saveMedicalProfileSchema.safeParse({ patientId: "", expectedVersion: 0, data: validData }).success, false);
    assert.strictEqual(saveMedicalProfileSchema.safeParse({ patientId: "p", expectedVersion: -1, data: validData }).success, false);
    assert.strictEqual(saveMedicalProfileSchema.safeParse({ patientId: "p", expectedVersion: 0, data: validData }).success, true);
    assert.strictEqual(visitRecordSchema.safeParse({ appointmentId: "a", diagnosis: "   " }).success, false);
    const ok = visitRecordSchema.parse({ appointmentId: "a", diagnosis: " Viral fever ", symptoms: "", followUp: "Review in 1 week" });
    assert.strictEqual(ok.diagnosis, "Viral fever");
    assert.strictEqual(ok.symptoms, null);
  });

  console.log("\n--- 5. Visit history ---");

  await it("Visits split into upcoming (soonest first), completed (newest first) and other (newest first)", () => {
    const mk = (id: string, date: string, time: string, status: AppointmentEntity["status"]) => ({
      id,
      appointmentDate: date,
      startTime: time,
      status,
    });
    const { upcoming, completed, other } = splitVisits([
      mk("u2", "2099-02-01", "09:00", "BOOKED"),
      mk("c1", "2026-01-01", "09:00", "COMPLETED"),
      mk("u1", "2099-01-01", "11:00", "CHECKED_IN"),
      mk("x1", "2026-03-01", "09:00", "CANCELLED"),
      mk("c2", "2026-02-01", "09:00", "COMPLETED"),
      mk("c3", "2026-02-01", "14:00", "COMPLETED"),
      mk("x2", "2026-04-01", "09:00", "NO_SHOW"),
      mk("u0", "2099-01-01", "08:00", "IN_CONSULTATION"),
      mk("p1", "2026-05-01", "09:00", "PENDING_PAYMENT"),
    ]);
    assert.deepStrictEqual(upcoming.map((v) => v.id), ["u0", "u1", "u2"]);
    assert.deepStrictEqual(completed.map((v) => v.id), ["c3", "c2", "c1"]);
    assert.deepStrictEqual(other.map((v) => v.id), ["p1", "x2", "x1"]);
  });

  await it("Visit records are one per appointment: saving again edits it, and it is private to its patient", async () => {
    const frank = await makePatient("Frank");
    const appt = addAppointment({ patientId: frank.patientId, doctorId: docA, status: "COMPLETED" });

    const first = await dbRepo.upsertVisitRecord({
      appointmentId: appt.id,
      doctorId: docA,
      patientId: frank.patientId,
      diagnosis: "Viral fever",
      symptoms: "Fever, cough",
    });
    const second = await dbRepo.upsertVisitRecord({
      appointmentId: appt.id,
      doctorId: docA,
      patientId: frank.patientId,
      diagnosis: "Viral fever, resolving",
      followUp: "Review in 1 week",
    });
    assert.strictEqual(second.id, first.id);
    const records = await dbRepo.getVisitRecordsByPatientId(frank.patientId);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].diagnosis, "Viral fever, resolving");
    assert.strictEqual(records[0].symptoms, null, "an edit replaces the whole record");
    assert.strictEqual(records[0].followUp, "Review in 1 week");
    assert.strictEqual((await dbRepo.getVisitRecordsByPatientId(dana.patientId)).length, 0);
  });

  await it("loadVisitHistory attaches the doctor, the visit record and the prescription to each appointment", async () => {
    const gina = await makePatient("Gina");
    const done = addAppointment({ patientId: gina.patientId, doctorId: docA, status: "COMPLETED", appointmentDate: "2026-02-02" });
    const cancelled = addAppointment({ patientId: gina.patientId, doctorId: docB, status: "CANCELLED", appointmentDate: "2026-03-03" });
    await dbRepo.upsertVisitRecord({ appointmentId: done.id, doctorId: docA, patientId: gina.patientId, diagnosis: "Migraine" });
    await dbRepo.upsertPrescription({
      appointmentId: done.id,
      doctorId: docA,
      patientId: gina.patientId,
      medicines: [{ name: "Paracetamol", dosage: "500 mg", frequency: "Twice a day", duration: "3 days" }],
    });

    const items = await loadVisitHistory(gina.patientId);
    assert.strictEqual(items.length, 2);
    const doneItem = items.find((i) => i.appointment.id === done.id)!;
    assert.strictEqual(doneItem.appointment.doctor.id, docA);
    assert.strictEqual(doneItem.record?.diagnosis, "Migraine");
    assert.strictEqual(doneItem.prescription?.medicines[0].name, "Paracetamol");
    const cancelledItem = items.find((i) => i.appointment.id === cancelled.id)!;
    assert.strictEqual(cancelledItem.appointment.doctor.id, docB);
    assert.strictEqual(cancelledItem.record, undefined);
    assert.strictEqual(cancelledItem.prescription, undefined);
  });

  await it("Age is computed from a birth date and ignores missing or invalid ones", () => {
    const now = new Date(2026, 5, 15); // 15 June 2026
    assert.strictEqual(ageFromDateOfBirth("2000-06-15", now), 26);
    assert.strictEqual(ageFromDateOfBirth("2000-06-16", now), 25);
    assert.strictEqual(ageFromDateOfBirth(null, now), null);
    assert.strictEqual(ageFromDateOfBirth("not a date", now), null);
    assert.strictEqual(ageFromDateOfBirth("2030-01-01", now), null);
  });

  console.log("\n--- 6. Account deletion ---");

  await it("Deleting a patient account removes their profile, update history and visit records", async () => {
    const hank = await makePatient("Hank");
    const appt = addAppointment({ patientId: hank.patientId, status: "COMPLETED" });
    await dbRepo.saveMedicalProfile({
      patientId: hank.patientId,
      expectedVersion: 0,
      data: profile({ bloodGroup: "B+" }),
      actor: patientActor(hank.userId),
    });
    await dbRepo.upsertVisitRecord({ appointmentId: appt.id, doctorId: docA, patientId: hank.patientId, diagnosis: "Checkup" });

    assert.strictEqual(await dbRepo.deleteUserComplete(hank.userId), true);
    assert.strictEqual(await dbRepo.getMedicalProfile(hank.patientId), undefined);
    assert.strictEqual((await dbRepo.getMedicalHistoryLog(hank.patientId)).length, 0);
    assert.strictEqual((await dbRepo.getVisitRecordsByPatientId(hank.patientId)).length, 0);
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
