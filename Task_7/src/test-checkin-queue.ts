// Force the in-memory repository even if a real DATABASE_URL is exported in the shell.
process.env.DATABASE_URL = "disabled-for-local-test";

import assert from "node:assert";
import crypto from "crypto";
import { dbRepo, type AppointmentEntity } from "./db/repo";
import { computeDoctorQueue, computePatientQueueStatus } from "./lib/queue";
import { istDateString, formatKolkataHHMM } from "./lib/time";
import { AppointmentLifecycle, DomainError } from "./domain/appointment-lifecycle";

console.log("🧪 Running Patient Check-in & Queue Management Verification Suite...\n");

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

// Helpers to create test entities in memory
const testDoctorId = "doc-queue-test-1";
const otherDoctorId = "doc-queue-test-2";
const testPatientId = "pat-queue-test-1";

async function createTestAppointment(overrides: Partial<AppointmentEntity> = {}): Promise<AppointmentEntity> {
  const today = istDateString(new Date());
  const id = `apt-${crypto.randomUUID()}`;
  const appt: AppointmentEntity = {
    id,
    patientId: overrides.patientId || testPatientId,
    doctorId: overrides.doctorId || testDoctorId,
    sessionId: overrides.sessionId || "session-test",
    appointmentDate: overrides.appointmentDate || today,
    startTime: overrides.startTime || "10:00",
    endTime: overrides.endTime || "10:20",
    status: overrides.status || "BOOKED",
    tokenNumber: overrides.tokenNumber ?? 1,
    reason: overrides.reason || "Routine Checkup",
    holdExpiresAt: overrides.holdExpiresAt || null,
    checkedInAt: overrides.checkedInAt || null,
    checkedInBy: overrides.checkedInBy || null,
    consultationStartedAt: overrides.consultationStartedAt || null,
    createdAt: new Date(),
    ...overrides,
  };
  dbRepo.mem.appointments.push(appt);
  return appt;
}

async function runCheckinQueueTests() {
  const today = istDateString(new Date());

  console.log("--- 1. Check-In On BOOKED Same-Day Appointment ---");
  await it("Sets checkedInAt, checkedInBy, and updates status to CHECKED_IN", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "BOOKED" });
    const checkInTime = new Date("2026-11-16T10:05:00.000Z");

    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Dr. Sarah Patel", checkInTime);
    assert.strictEqual(res.success, true, "Check-in should succeed");
    assert.strictEqual(res.appointment?.status, "CHECKED_IN");
    assert.strictEqual(res.appointment?.checkedInBy, "Dr. Sarah Patel");
    assert.strictEqual(res.appointment?.checkedInAt?.getTime(), checkInTime.getTime());

    const saved = await dbRepo.getAppointmentById(apt.id);
    assert.strictEqual(saved?.status, "CHECKED_IN");
    assert.strictEqual(saved?.checkedInBy, "Dr. Sarah Patel");
    assert.strictEqual(saved?.checkedInAt?.getTime(), checkInTime.getTime());
  });

  console.log("\n--- 2. Duplicate Check-In Prevention & Timestamp Preservation ---");
  await it("Rejects duplicate check-in with message and preserves original checkedInAt", async () => {
    const originalTime = new Date("2026-11-16T09:15:00.000Z");
    const apt = await createTestAppointment({
      appointmentDate: today,
      status: "CHECKED_IN",
      checkedInAt: originalTime,
      checkedInBy: "Dr. Initial",
    });

    const secondTime = new Date("2026-11-16T09:30:00.000Z");
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Dr. Duplicate", secondTime);

    assert.strictEqual(res.success, false, "Second check-in must be rejected");
    assert(
      res.error?.includes("already checked in"),
      `Error message should state patient is already checked in, got: "${res.error}"`
    );

    const saved = await dbRepo.getAppointmentById(apt.id);
    assert.strictEqual(
      saved?.checkedInAt?.getTime(),
      originalTime.getTime(),
      "Original check-in timestamp must NOT be overwritten"
    );
    assert.strictEqual(saved?.checkedInBy, "Dr. Initial");
  });

  console.log("\n--- 3. Check-In Rejections For Invalid Statuses and Non-Today Dates ---");
  await it("Rejects check-in for CANCELLED appointment", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "CANCELLED" });
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff");
    assert.strictEqual(res.success, false);
    assert(res.error?.includes("CANCELLED"));
  });

  await it("Rejects check-in for COMPLETED appointment", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "COMPLETED" });
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff");
    assert.strictEqual(res.success, false);
    assert(res.error?.includes("COMPLETED"));
  });

  await it("Rejects check-in for NO_SHOW appointment", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "NO_SHOW" });
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff");
    assert.strictEqual(res.success, false);
    assert(res.error?.includes("NO_SHOW"));
  });

  await it("Rejects check-in for PENDING_PAYMENT appointment", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "PENDING_PAYMENT" });
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff");
    assert.strictEqual(res.success, false);
    assert(res.error?.includes("PENDING_PAYMENT"));
  });

  console.log("\n--- 4. Ownership & Doctor Isolation ---");
  await it("Blocks doctor from checking in another doctor's patient", async () => {
    const apt = await createTestAppointment({
      doctorId: otherDoctorId,
      appointmentDate: today,
      status: "BOOKED",
    });

    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Dr. Intruder");
    assert.strictEqual(res.success, false, "Must block cross-doctor check-in");
    assert(
      res.error?.includes("Forbidden") || res.error?.includes("own") || res.error?.includes("assigned"),
      `Error should indicate forbidden/ownership, got: ${res.error}`
    );
  });

  console.log("\n--- 5. Queue Ordering & Dynamic Contiguous Positions ---");
  await it("Orders checked-in patients by checkedInAt ascending and assigns positions 1..N with no gaps", () => {
    const now = new Date("2026-11-16T10:00:00.000Z");
    const t1 = new Date("2026-11-16T09:30:00.000Z");
    const t2 = new Date("2026-11-16T09:35:00.000Z");
    const t3 = new Date("2026-11-16T09:40:00.000Z");

    const appts: AppointmentEntity[] = [
      {
        id: "apt-3",
        patientId: "p3",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:30",
        endTime: "10:50",
        status: "CHECKED_IN",
        tokenNumber: 3,
        checkedInAt: t3,
        createdAt: now,
      },
      {
        id: "apt-1",
        patientId: "p1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "09:30",
        endTime: "09:50",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: t1,
        createdAt: now,
      },
      {
        id: "apt-2",
        patientId: "p2",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 2,
        checkedInAt: t2,
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today, now });
    assert.strictEqual(q.waiting.length, 3);
    assert.strictEqual(q.waiting[0].appointment.id, "apt-1");
    assert.strictEqual(q.waiting[0].queuePosition, 1);
    assert.strictEqual(q.waiting[1].appointment.id, "apt-2");
    assert.strictEqual(q.waiting[1].queuePosition, 2);
    assert.strictEqual(q.waiting[2].appointment.id, "apt-3");
    assert.strictEqual(q.waiting[2].queuePosition, 3);
  });

  await it("Breaks ties in check-in time by tokenNumber ascending", () => {
    const now = new Date("2026-11-16T10:00:00.000Z");
    const exactSameTime = new Date("2026-11-16T09:30:00.000Z");

    const appts: AppointmentEntity[] = [
      {
        id: "apt-token-5",
        patientId: "p5",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:20",
        endTime: "10:40",
        status: "CHECKED_IN",
        tokenNumber: 5,
        checkedInAt: exactSameTime,
        createdAt: now,
      },
      {
        id: "apt-token-2",
        patientId: "p2",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "09:40",
        endTime: "10:00",
        status: "CHECKED_IN",
        tokenNumber: 2,
        checkedInAt: exactSameTime,
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today, now });
    assert.strictEqual(q.waiting[0].appointment.id, "apt-token-2");
    assert.strictEqual(q.waiting[0].appointment.tokenNumber, 2);
    assert.strictEqual(q.waiting[0].queuePosition, 1);

    assert.strictEqual(q.waiting[1].appointment.id, "apt-token-5");
    assert.strictEqual(q.waiting[1].appointment.tokenNumber, 5);
    assert.strictEqual(q.waiting[1].queuePosition, 2);
  });

  console.log("\n--- 6. Dynamic Repositioning On Cancellation ---");
  await it("Closes queue positions dynamically when a waiting patient cancels", () => {
    const now = new Date();
    const appts: AppointmentEntity[] = [
      {
        id: "p1",
        patientId: "pat-1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: new Date(Date.now() - 30 * 60_000),
        createdAt: now,
      },
      {
        id: "p2",
        patientId: "pat-2",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:20",
        endTime: "10:40",
        status: "CANCELLED", // Patient at position 2 cancelled
        tokenNumber: 2,
        checkedInAt: new Date(Date.now() - 20 * 60_000),
        createdAt: now,
      },
      {
        id: "p3",
        patientId: "pat-3",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:40",
        endTime: "11:00",
        status: "CHECKED_IN",
        tokenNumber: 3,
        checkedInAt: new Date(Date.now() - 10 * 60_000),
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today });
    assert.strictEqual(q.waiting.length, 2);
    assert.strictEqual(q.waiting[0].appointment.id, "p1");
    assert.strictEqual(q.waiting[0].queuePosition, 1);
    // Patient 3 now takes Position 2 without any gaps!
    assert.strictEqual(q.waiting[1].appointment.id, "p3");
    assert.strictEqual(q.waiting[1].queuePosition, 2);
    assert.strictEqual(q.missed.length, 1);
    assert.strictEqual(q.missed[0].id, "p2");
  });

  console.log("\n--- 7. No-Show Rules & Invariants ---");
  await it("Blocks marking a CHECKED_IN patient as NO_SHOW", () => {
    // Domain Lifecycle assertion
    assert.strictEqual(
      AppointmentLifecycle.isValidTransition("CHECKED_IN", "NO_SHOW"),
      false,
      "CHECKED_IN to NO_SHOW must be blocked in lifecycle"
    );
    assert.throws(
      () => AppointmentLifecycle.assertValidTransition("CHECKED_IN", "NO_SHOW"),
      (err: any) => err instanceof DomainError && err.code === "INVALID_TRANSITION"
    );
  });

  await it("Allows marking an unarrived BOOKED patient as NO_SHOW and updates queue", () => {
    const now = new Date();
    const appts: AppointmentEntity[] = [
      {
        id: "arrived-1",
        patientId: "p1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: new Date(Date.now() - 15 * 60_000),
        createdAt: now,
      },
      {
        id: "unarrived-2",
        patientId: "p2",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:20",
        endTime: "10:40",
        status: "NO_SHOW", // unarrived patient marked no-show
        tokenNumber: 2,
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today });
    assert.strictEqual(q.waiting.length, 1);
    assert.strictEqual(q.waiting[0].appointment.id, "arrived-1");
    assert.strictEqual(q.waiting[0].queuePosition, 1);
    assert.strictEqual(q.missed.length, 1);
    assert.strictEqual(q.missed[0].id, "unarrived-2");
  });

  console.log("\n--- 8. Consultation Concurrency & Progression ---");
  await it("Allows startConsultation only for CHECKED_IN patients and enforces single active consultation", async () => {
    const apt1 = await createTestAppointment({ appointmentDate: today, status: "CHECKED_IN" });
    const apt2 = await createTestAppointment({ appointmentDate: today, status: "CHECKED_IN" });

    // 1. Call apt1 into consultation
    const res1 = await dbRepo.startConsultation(apt1.id, testDoctorId);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.appointment?.status, "IN_CONSULTATION");
    assert(res1.appointment?.consultationStartedAt instanceof Date);

    // 2. Attempt to start consultation for apt2 while apt1 is in progress
    const res2 = await dbRepo.startConsultation(apt2.id, testDoctorId);
    assert.strictEqual(res2.success, false);
    assert(
      res2.error?.includes("Another consultation is currently in progress"),
      `Should reject concurrent consultation, got: "${res2.error}"`
    );

    // 3. Complete apt1
    const updateRes = await dbRepo.updateAppointmentStatus(apt1.id, "COMPLETED");
    assert.strictEqual(updateRes, true);

    // 4. Now apt2 can be promoted into consultation
    const res2Retry = await dbRepo.startConsultation(apt2.id, testDoctorId);
    assert.strictEqual(res2Retry.success, true);
    assert.strictEqual(res2Retry.appointment?.status, "IN_CONSULTATION");
  });

  console.log("\n--- 9. Permanent Token Identity ---");
  await it("Preserves token numbers permanently regardless of position or check-in order", () => {
    const now = new Date();
    // Patient with Token #5 checked in before patient with Token #1
    const appts: AppointmentEntity[] = [
      {
        id: "p5",
        patientId: "pat-5",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "11:00",
        endTime: "11:20",
        status: "CHECKED_IN",
        tokenNumber: 5,
        checkedInAt: new Date(Date.now() - 30 * 60_000), // checked in earlier
        createdAt: now,
      },
      {
        id: "p1",
        patientId: "pat-1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "09:30",
        endTime: "09:50",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: new Date(Date.now() - 10 * 60_000), // checked in later
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today });
    // First in line is Token #5 (Position 1), second is Token #1 (Position 2)
    assert.strictEqual(q.waiting[0].appointment.tokenNumber, 5);
    assert.strictEqual(q.waiting[0].queuePosition, 1);

    assert.strictEqual(q.waiting[1].appointment.tokenNumber, 1);
    assert.strictEqual(q.waiting[1].queuePosition, 2);
  });

  console.log("\n--- 10. Pure Helper Edge Cases & Wait Time Calculation ---");
  await it("Handles empty appointment lists cleanly", () => {
    const q = computeDoctorQueue([], { targetDate: today });
    assert.strictEqual(q.nowServing, null);
    assert.strictEqual(q.waiting.length, 0);
    assert.strictEqual(q.notArrived.length, 0);
    assert.strictEqual(q.finished.length, 0);
    assert.strictEqual(q.missed.length, 0);
    assert.strictEqual(q.totalExpected, 0);
    assert.strictEqual(q.totalCheckedIn, 0);
  });

  await it("Correctly segregates non-arrived patients and ignores other dates", () => {
    const now = new Date();
    const otherDate = "2026-12-25";

    const appts: AppointmentEntity[] = [
      {
        id: "not-arrived-1",
        patientId: "p1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "BOOKED",
        tokenNumber: 1,
        createdAt: now,
      },
      {
        id: "other-day-appt",
        patientId: "p2",
        doctorId: testDoctorId,
        appointmentDate: otherDate,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: now,
        createdAt: now,
      },
    ];

    const q = computeDoctorQueue(appts, { targetDate: today });
    assert.strictEqual(q.waiting.length, 0);
    assert.strictEqual(q.notArrived.length, 1);
    assert.strictEqual(q.notArrived[0].id, "not-arrived-1");
  });

  await it("Computes wait times correctly without and with active consultation", () => {
    const now = new Date("2026-11-16T10:00:00.000Z");
    const slotDuration = 20;

    // Case A: No active consultation
    const waitingWithoutServing: AppointmentEntity[] = [
      {
        id: "w1",
        patientId: "p1",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 1,
        checkedInAt: new Date("2026-11-16T09:40:00.000Z"),
        createdAt: now,
      },
      {
        id: "w2",
        patientId: "p2",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:20",
        endTime: "10:40",
        status: "CHECKED_IN",
        tokenNumber: 2,
        checkedInAt: new Date("2026-11-16T09:45:00.000Z"),
        createdAt: now,
      },
    ];

    const qNoServing = computeDoctorQueue(waitingWithoutServing, {
      targetDate: today,
      now,
      slotDurationMinutes: slotDuration,
    });
    assert.strictEqual(qNoServing.waiting[0].estimatedWaitMinutes, 0, "Position 1 has 0 min wait when room is idle");
    assert.strictEqual(qNoServing.waiting[1].estimatedWaitMinutes, 20, "Position 2 waits 1 slot duration (20m)");

    // Case B: Active consultation started 5 minutes ago (15 min remaining out of 20 min slot)
    const startedAt = new Date(now.getTime() - 5 * 60_000);
    const servingAppt: AppointmentEntity = {
      id: "serving",
      patientId: "p0",
      doctorId: testDoctorId,
      appointmentDate: today,
      startTime: "09:40",
      endTime: "10:00",
      status: "IN_CONSULTATION",
      tokenNumber: 99,
      consultationStartedAt: startedAt,
      createdAt: now,
    };

    const qWithServing = computeDoctorQueue([servingAppt, ...waitingWithoutServing], {
      targetDate: today,
      now,
      slotDurationMinutes: slotDuration,
    });

    assert(qWithServing.nowServing !== null);
    // Remaining time = 20 - 5 = 15 minutes
    assert.strictEqual(qWithServing.waiting[0].estimatedWaitMinutes, 15, "Position 1 waits remaining time (15m)");
    assert.strictEqual(qWithServing.waiting[1].estimatedWaitMinutes, 35, "Position 2 waits 15 + 20 = 35m");
  });

  await it("Generates privacy-safe queue snapshots for patients", () => {
    const now = new Date("2026-11-16T10:00:00.000Z");
    const appts: AppointmentEntity[] = [
      {
        id: "active-doc",
        patientId: "other-patient",
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "09:40",
        endTime: "10:00",
        status: "IN_CONSULTATION",
        tokenNumber: 1,
        consultationStartedAt: new Date("2026-11-16T09:50:00.000Z"),
        createdAt: now,
      },
      {
        id: "my-appt",
        patientId: testPatientId,
        doctorId: testDoctorId,
        appointmentDate: today,
        startTime: "10:00",
        endTime: "10:20",
        status: "CHECKED_IN",
        tokenNumber: 5,
        checkedInAt: new Date("2026-11-16T09:45:00.000Z"),
        createdAt: now,
      },
    ];

    const pStatus = computePatientQueueStatus(appts, "my-appt", { targetDate: today, now });
    assert.strictEqual(pStatus.isCheckedIn, true);
    assert.strictEqual(pStatus.queuePosition, 1);
    assert.strictEqual(pStatus.nowServingToken, 1);
    assert.strictEqual(pStatus.patientsAhead, 0);
  });

  console.log("\n--- 11. Concurrency Safety On Concurrent Check-In ---");
  await it("Resolves concurrent check-in attempts with exactly 1 success and rejections for others", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "BOOKED" });

    // Fire 3 simultaneous check-ins on the same appointment
    const results = await Promise.all([
      dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff-1"),
      dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff-2"),
      dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff-3"),
    ]);

    const successes = results.filter((r) => r.success);
    const rejections = results.filter((r) => !r.success);

    assert.strictEqual(successes.length, 1, "Exactly one concurrent check-in should succeed");
    assert.strictEqual(rejections.length, 2, "Other concurrent check-ins should be rejected");
    assert(
      rejections[0].error?.includes("already checked in") || rejections[0].error?.includes("Cannot check in"),
      `Rejected attempts should report already checked in, got: ${rejections[0].error}`
    );
  });

  console.log("\n--- 12. CodeRabbit Review Hardening ---");
  await it("Rejects check-in when the appointment date differs from the expected date", async () => {
    const apt = await createTestAppointment({ appointmentDate: "2099-01-01", status: "BOOKED" });
    const res = await dbRepo.checkInAppointment(apt.id, testDoctorId, "Staff", undefined, today);
    assert.strictEqual(res.success, false);
    assert(res.error?.includes("same-day"), `Expected same-day error, got: ${res.error}`);
    assert.strictEqual(apt.status, "BOOKED", "Appointment must stay BOOKED");
  });

  await it("updateAppointmentStatus only applies when the expected status still matches", async () => {
    const apt = await createTestAppointment({ appointmentDate: today, status: "CHECKED_IN", checkedInAt: new Date() });
    const ok = await dbRepo.updateAppointmentStatus(apt.id, "NO_SHOW", { expectedStatus: "BOOKED" });
    assert.strictEqual(ok, false);
    assert.strictEqual(apt.status, "CHECKED_IN", "A checked-in patient must not be overwritten with NO_SHOW");
  });

  await it("Defaults to a 15 minute slot when no duration is supplied", async () => {
    const waiting = await createTestAppointment({
      appointmentDate: today,
      status: "CHECKED_IN",
      checkedInAt: new Date(),
      tokenNumber: 1,
    });
    const second = await createTestAppointment({
      appointmentDate: today,
      status: "CHECKED_IN",
      checkedInAt: new Date(Date.now() + 1000),
      tokenNumber: 2,
    });
    const q = computeDoctorQueue([waiting, second], { targetDate: today });
    assert.strictEqual(q.waiting[1].estimatedWaitMinutes, 15);
  });

  await it("Patient queue status ignores an appointment on a different date than the target date", async () => {
    const future = await createTestAppointment({ appointmentDate: "2099-01-01", status: "BOOKED" });
    const status = computePatientQueueStatus([future], future.id, { targetDate: today });
    assert.strictEqual(status.appointment, null);
  });

  console.log(`\n==============================================`);
  console.log(`Patient Check-in & Queue Tests:${passed} passed, ${failed} failed`);
  console.log(`==============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCheckinQueueTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
