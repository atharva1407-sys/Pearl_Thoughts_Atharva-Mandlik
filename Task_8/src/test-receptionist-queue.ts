// Force the in-memory repository even if a real DATABASE_URL is in the shell.
process.env.DATABASE_URL = "disabled-for-local-test";

import assert from "node:assert";
import crypto from "crypto";
import { dbRepo, type AppointmentEntity } from "./db/repo";
import { computeDoctorQueue } from "./lib/queue";
import { istDateString } from "./lib/time";
import { canManageAppointment, AppointmentLifecycle, DomainError } from "./domain/appointment-lifecycle";

console.log("🧪 Running Task 8 Receptionist Front-Desk & Queue Test Suite...\n");

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

// Helpers
const docA = "doc_ananya_sharma";
const docB = "doc_rohan_mehta";
const patA = "pat_test_1";
const patB = "pat_test_2";
const recepUserId = "usr_reception_test";

function createMemoryAppt(overrides: Partial<AppointmentEntity> = {}): AppointmentEntity {
  const today = istDateString(new Date());
  const appt: AppointmentEntity = {
    id: `apt_test_${crypto.randomUUID().slice(0, 8)}`,
    patientId: overrides.patientId || patA,
    doctorId: overrides.doctorId || docA,
    sessionId: overrides.sessionId || "session_test",
    appointmentDate: overrides.appointmentDate || today,
    startTime: overrides.startTime || "10:00",
    endTime: overrides.endTime || "10:15",
    status: overrides.status || "BOOKED",
    tokenNumber: overrides.tokenNumber ?? 1,
    reason: overrides.reason || "General Consultation",
    holdExpiresAt: null,
    checkedInAt: overrides.checkedInAt || null,
    checkedInBy: overrides.checkedInBy || null,
    consultationStartedAt: overrides.consultationStartedAt || null,
    createdAt: new Date(),
    ...overrides,
  };
  dbRepo.mem.appointments.push(appt);
  return appt;
}

async function runReceptionistQueueTests() {
  const today = istDateString(new Date());

  console.log("--- 1. Role Authorization Matrix (canManageAppointment) ---");

  await it("Receptionist can perform CHECK_IN only for same-day appointments", () => {
    const todayAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const tomorrowAppt = { doctorId: docA, patientId: patA, appointmentDate: "2099-01-01" };
    const receptionist = { role: "RECEPTIONIST" as const, profileId: recepUserId, userId: recepUserId };

    assert.strictEqual(canManageAppointment(receptionist, todayAppt, "CHECK_IN"), true);
    assert.strictEqual(canManageAppointment(receptionist, tomorrowAppt, "CHECK_IN"), false);
  });

  await it("Receptionist can perform UNAVAILABLE, RESCHEDULE, CANCEL, NO_SHOW, VIEW_QUEUE for any doctor", () => {
    const appt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const receptionist = { role: "RECEPTIONIST" as const, profileId: recepUserId, userId: recepUserId };

    assert.strictEqual(canManageAppointment(receptionist, appt, "UNAVAILABLE"), true);
    assert.strictEqual(canManageAppointment(receptionist, appt, "RESCHEDULE"), true);
    assert.strictEqual(canManageAppointment(receptionist, appt, "CANCEL"), true);
    assert.strictEqual(canManageAppointment(receptionist, appt, "NO_SHOW"), true);
    assert.strictEqual(canManageAppointment(receptionist, appt, "VIEW_QUEUE"), true);
  });

  await it("Receptionist is strictly forbidden from starting (CALL) or completing consultations", () => {
    const appt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const receptionist = { role: "RECEPTIONIST" as const, profileId: recepUserId, userId: recepUserId };

    assert.strictEqual(canManageAppointment(receptionist, appt, "CALL"), false);
    assert.strictEqual(canManageAppointment(receptionist, appt, "COMPLETE"), false);
  });

  await it("Doctor can only manage appointments assigned to their own schedule", () => {
    const ownAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const otherAppt = { doctorId: docB, patientId: patA, appointmentDate: today };
    const doctor = { role: "DOCTOR" as const, profileId: docA, userId: "usr_docA" };

    assert.strictEqual(canManageAppointment(doctor, ownAppt, "CHECK_IN"), true);
    assert.strictEqual(canManageAppointment(doctor, ownAppt, "UNAVAILABLE"), true);
    assert.strictEqual(canManageAppointment(doctor, ownAppt, "CALL"), true);
    assert.strictEqual(canManageAppointment(doctor, ownAppt, "COMPLETE"), true);

    // Other doctor's patient -> forbidden
    assert.strictEqual(canManageAppointment(doctor, otherAppt, "CHECK_IN"), false);
    assert.strictEqual(canManageAppointment(doctor, otherAppt, "UNAVAILABLE"), false);
    assert.strictEqual(canManageAppointment(doctor, otherAppt, "CALL"), false);
    assert.strictEqual(canManageAppointment(doctor, otherAppt, "COMPLETE"), false);
  });

  await it("Patient can only CANCEL and RESCHEDULE their own appointments", () => {
    const ownAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const otherAppt = { doctorId: docA, patientId: patB, appointmentDate: today };
    const patient = { role: "PATIENT" as const, profileId: patA, userId: "usr_patA" };

    assert.strictEqual(canManageAppointment(patient, ownAppt, "RESCHEDULE"), true);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "CANCEL"), true);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "CHECK_IN"), false);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "UNAVAILABLE"), false);

    // Cannot manage someone else's appointment
    assert.strictEqual(canManageAppointment(patient, otherAppt, "RESCHEDULE"), false);
    assert.strictEqual(canManageAppointment(patient, otherAppt, "CANCEL"), false);
  });

  console.log("\n--- 2. markPatientUnavailable State Machine & Repository Logic ---");

  await it("Successfully marks CHECKED_IN patient unavailable and resets status to BOOKED", async () => {
    const checkInTime = new Date(Date.now() - 10 * 60_000);
    const appt = createMemoryAppt({
      status: "CHECKED_IN",
      tokenNumber: 4,
      checkedInAt: checkInTime,
      checkedInBy: "Reception: Front Desk Staff",
    });

    const res = await dbRepo.markPatientUnavailable(appt.id);
    assert.strictEqual(res.success, true);
    assert.ok(res.appointment);
    assert.strictEqual(res.appointment.status, "BOOKED");
    assert.strictEqual(res.appointment.checkedInAt, null);
    assert.strictEqual(res.appointment.checkedInBy, null);
    assert.strictEqual(res.appointment.tokenNumber, 4, "Permanent token number must be preserved");

    // Verify stored entity
    const updated = await dbRepo.getAppointmentById(appt.id);
    assert.strictEqual(updated?.status, "BOOKED");
    assert.strictEqual(updated?.checkedInAt, null);
    assert.strictEqual(updated?.checkedInBy, null);
  });

  await it("Enforces doctor scope when marking unavailable", async () => {
    const appt = createMemoryAppt({
      doctorId: docA,
      status: "CHECKED_IN",
      checkedInAt: new Date(),
      checkedInBy: "Reception: Front Desk Staff",
    });

    // Calling with mismatched doctorId fails
    const resForbidden = await dbRepo.markPatientUnavailable(appt.id, docB);
    assert.strictEqual(resForbidden.success, false);
    assert.ok(resForbidden.error?.includes("Forbidden"));

    // Calling with correct doctorId succeeds
    const resOk = await dbRepo.markPatientUnavailable(appt.id, docA);
    assert.strictEqual(resOk.success, true);
  });

  await it("Rejects marking unavailable if patient is IN_CONSULTATION", async () => {
    const appt = createMemoryAppt({
      status: "IN_CONSULTATION",
      consultationStartedAt: new Date(),
    });

    const res = await dbRepo.markPatientUnavailable(appt.id);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("consultation"));
  });

  await it("Rejects marking unavailable if appointment is COMPLETED", async () => {
    const appt = createMemoryAppt({
      status: "COMPLETED",
    });

    const res = await dbRepo.markPatientUnavailable(appt.id);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("completed"));
  });

  await it("Rejects marking unavailable if patient is not checked in (BOOKED)", async () => {
    const appt = createMemoryAppt({
      status: "BOOKED",
    });

    const res = await dbRepo.markPatientUnavailable(appt.id);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("CHECKED_IN"));
  });

  await it("Atomic CAS guard: concurrent/duplicate unavailable calls safely reject", async () => {
    const appt = createMemoryAppt({
      status: "CHECKED_IN",
      checkedInAt: new Date(),
    });

    const [first, second] = await Promise.all([
      dbRepo.markPatientUnavailable(appt.id),
      dbRepo.markPatientUnavailable(appt.id),
    ]);

    // Exactly one should succeed and the other should fail cleanly
    const successes = [first, second].filter((r) => r.success).length;
    assert.strictEqual(successes, 1, "Only one atomic unavailable transition must succeed");
  });

  console.log("\n--- 3. Queue Gap-Closing & Tail Re-Entry Invariants ---");

  await it("Closing queue gaps: removing unavailable patient closes positions 1..N contiguously", () => {
    const baseTime = Date.now();
    const appt1 = createMemoryAppt({
      tokenNumber: 1,
      status: "CHECKED_IN",
      checkedInAt: new Date(baseTime - 30 * 60_000),
    });
    const appt2 = createMemoryAppt({
      tokenNumber: 2,
      status: "CHECKED_IN",
      checkedInAt: new Date(baseTime - 20 * 60_000),
    });
    const appt3 = createMemoryAppt({
      tokenNumber: 3,
      status: "CHECKED_IN",
      checkedInAt: new Date(baseTime - 10 * 60_000),
    });

    // 1. Initial queue with 3 waiting patients
    const q1 = computeDoctorQueue([appt1, appt2, appt3], { targetDate: today, slotDurationMinutes: 15 });
    assert.strictEqual(q1.waiting.length, 3);
    assert.strictEqual(q1.waiting[0].appointment.id, appt1.id);
    assert.strictEqual(q1.waiting[0].queuePosition, 1);
    assert.strictEqual(q1.waiting[1].appointment.id, appt2.id);
    assert.strictEqual(q1.waiting[1].queuePosition, 2);
    assert.strictEqual(q1.waiting[2].appointment.id, appt3.id);
    assert.strictEqual(q1.waiting[2].queuePosition, 3);

    // 2. Mark appt2 unavailable (status becomes BOOKED)
    appt2.status = "BOOKED";
    appt2.checkedInAt = null;

    // 3. Queue recomputes: appt3 must smoothly become Position #2 with no gap
    const q2 = computeDoctorQueue([appt1, appt2, appt3], { targetDate: today, slotDurationMinutes: 15 });
    assert.strictEqual(q2.waiting.length, 2);
    assert.strictEqual(q2.waiting[0].appointment.id, appt1.id);
    assert.strictEqual(q2.waiting[0].queuePosition, 1);
    assert.strictEqual(q2.waiting[1].appointment.id, appt3.id);
    assert.strictEqual(q2.waiting[1].queuePosition, 2);
    assert.strictEqual(q2.notArrived.length, 1);
    assert.strictEqual(q2.notArrived[0].id, appt2.id);
  });

  await it("Tail re-entry: re-checking in a previously unavailable patient moves them to the end of the line", () => {
    const baseTime = Date.now();
    const appt1 = createMemoryAppt({
      tokenNumber: 1,
      status: "CHECKED_IN",
      checkedInAt: new Date(baseTime - 30 * 60_000),
    });
    const appt2 = createMemoryAppt({
      tokenNumber: 2,
      status: "BOOKED", // was marked unavailable
      checkedInAt: null,
    });
    const appt3 = createMemoryAppt({
      tokenNumber: 3,
      status: "CHECKED_IN",
      checkedInAt: new Date(baseTime - 10 * 60_000),
    });

    // Patient 2 returns and checks in at new current time
    appt2.status = "CHECKED_IN";
    appt2.checkedInAt = new Date(baseTime + 5 * 60_000);

    const q = computeDoctorQueue([appt1, appt2, appt3], { targetDate: today, slotDurationMinutes: 15 });
    assert.strictEqual(q.waiting.length, 3);
    assert.strictEqual(q.waiting[0].appointment.id, appt1.id);
    assert.strictEqual(q.waiting[0].queuePosition, 1);
    assert.strictEqual(q.waiting[1].appointment.id, appt3.id);
    assert.strictEqual(q.waiting[1].queuePosition, 2);
    assert.strictEqual(q.waiting[2].appointment.id, appt2.id);
    assert.strictEqual(q.waiting[2].queuePosition, 3, "Re-checked in patient must be placed at queue tail");
  });

  console.log("\n--- 4. Receptionist Multi-Doctor Query & Zero N+1 Checks ---");

  await it("getAllAppointmentsForDate returns joined patient and doctor details across all doctors", async () => {
    const queryDate = "2026-11-20";
    dbRepo.mem.appointments = dbRepo.mem.appointments.filter((a) => a.appointmentDate !== queryDate);

    // Doctor A appointment
    createMemoryAppt({
      doctorId: docA,
      patientId: patA,
      appointmentDate: queryDate,
      startTime: "10:00",
      status: "BOOKED",
    });
    // Doctor B appointment
    createMemoryAppt({
      doctorId: docB,
      patientId: patB,
      appointmentDate: queryDate,
      startTime: "11:00",
      status: "BOOKED",
    });

    const all = await dbRepo.getAllAppointmentsForDate(queryDate);
    assert.strictEqual(all.length, 2);

    const docAAppts = all.filter((a) => a.doctorId === docA);
    const docBAppts = all.filter((a) => a.doctorId === docB);
    assert.strictEqual(docAAppts.length, 1);
    assert.strictEqual(docBAppts.length, 1);

    // Verify joined relations exist directly on each item
    assert.ok(docAAppts[0].patient, "Joined patient object must exist");
    assert.ok(docAAppts[0].doctor, "Joined doctor object must exist");
    assert.ok(docBAppts[0].patient, "Joined patient object must exist");
    assert.ok(docBAppts[0].doctor, "Joined doctor object must exist");
  });

  console.log("\n--- 5. Reschedule Workflow after Unavailable ---");

  await it("rescheduleAppointment works with actorRole RECEPTIONIST and assigns new token", async () => {
    const initialDate = "2026-11-25";
    const appt = createMemoryAppt({
      doctorId: docA,
      patientId: patA,
      appointmentDate: initialDate,
      startTime: "09:00",
      endTime: "09:15",
      status: "BOOKED",
      tokenNumber: 1,
    });

    const res = await dbRepo.rescheduleAppointment({
      appointmentId: appt.id,
      newDate: "2026-11-26",
      newStartTime: "10:00",
      newEndTime: "10:15",
      actorUserId: recepUserId,
      actorRole: "RECEPTIONIST",
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.appointment);
    assert.strictEqual(res.appointment.appointmentDate, "2026-11-26");
    assert.strictEqual(res.appointment.startTime, "10:00");
    assert.strictEqual(res.appointment.rescheduledBy, "RECEPTIONIST");
  });

  await it("Unavailable then reschedule keeps the same appointment (so its payment stays attached) and gives a new slot", async () => {
    const t0 = Date.now();
    const appt = createMemoryAppt({
      doctorId: docA,
      patientId: patA,
      appointmentDate: "2026-12-02",
      startTime: "11:00",
      endTime: "11:15",
      status: "CHECKED_IN",
      checkedInAt: new Date(t0),
      checkedInBy: "Reception: Front Desk",
      tokenNumber: 7,
    });

    const un = await dbRepo.markPatientUnavailable(appt.id);
    assert.strictEqual(un.success, true);
    const afterUnavailable = (await dbRepo.getAppointmentById(appt.id))!;
    assert.strictEqual(afterUnavailable.status, "BOOKED");
    assert.strictEqual(afterUnavailable.checkedInAt ?? null, null);

    const res = await dbRepo.rescheduleAppointment({
      appointmentId: appt.id,
      newDate: "2026-12-03",
      newStartTime: "15:30",
      newEndTime: "15:45",
      actorUserId: recepUserId,
      actorRole: "RECEPTIONIST",
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.appointment!.id, appt.id, "same appointment record, so the payment link is preserved");
    assert.strictEqual(res.appointment!.status, "BOOKED");
    assert.strictEqual(res.appointment!.appointmentDate, "2026-12-03");
    assert.strictEqual(res.appointment!.originalAppointmentDate, "2026-12-02");
  });

  console.log("\n--- 6. Demo seed ---");

  // Runs last: re-seeding replaces the in-memory store.
  await it("Demo seed creates no duplicate login emails or duplicate tokens", async () => {
    process.env.DEMO_DATA = "true";
    process.env.DEMO_PATIENT_PASSWORD = "test-patient-password";
    process.env.DEMO_RECEPTION_PASSWORD = "test-reception-password";
    await dbRepo.seed();

    const emails = dbRepo.mem.users.map((u) => u.email);
    const duplicateEmails = emails.filter((e, i) => emails.indexOf(e) !== i);
    assert.deepStrictEqual(duplicateEmails, [], `duplicate emails: ${duplicateEmails.join(", ")}`);

    const tokenKeys = dbRepo.mem.appointments.map((a) => `${a.doctorId}|${a.appointmentDate}|${a.tokenNumber}`);
    const duplicateTokens = tokenKeys.filter((k, i) => tokenKeys.indexOf(k) !== i);
    assert.deepStrictEqual(duplicateTokens, [], `duplicate tokens: ${duplicateTokens.join(", ")}`);

    assert.ok(dbRepo.mem.users.some((u) => u.role === "RECEPTIONIST"), "a receptionist demo account exists");
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runReceptionistQueueTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
