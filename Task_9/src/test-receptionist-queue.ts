// Force the in-memory repository even if a real DATABASE_URL is in the shell.
process.env.DATABASE_URL = "disabled-for-local-test";

import assert from "node:assert";
import crypto from "crypto";
import { dbRepo, type AppointmentEntity } from "./db/repo";
import { computeDoctorQueue } from "./lib/queue";
import { istDateString } from "./lib/time";
import { canManageAppointment, getQueueControls, AppointmentLifecycle, DomainError } from "./domain/appointment-lifecycle";
import { isAllowedToManage } from "./domain/appointment-access";
import {
  createReceptionistForDoctor,
  assignExistingReceptionist,
  revokeReceptionistFromDoctor,
  resetReceptionistPassword,
} from "./domain/reception-team";
import { verifyPassword } from "./lib/auth-crypto";

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

  console.log("--- 1. Role split (canManageAppointment + getQueueControls) ---");

  const receptionist = { role: "RECEPTIONIST" as const, profileId: "rec_test", userId: recepUserId };
  const assignedToA = { assignedDoctorIds: [docA] };

  await it("Receptionist assigned to a doctor: Check In (same day only), Unavailable, No-Show, Cancel, Reschedule, View", () => {
    const todayAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const futureAppt = { doctorId: docA, patientId: patA, appointmentDate: "2099-01-01" };
    const now = new Date();

    assert.strictEqual(canManageAppointment(receptionist, todayAppt, "CHECK_IN", now, assignedToA), true);
    assert.strictEqual(canManageAppointment(receptionist, futureAppt, "CHECK_IN", now, assignedToA), false);
    for (const action of ["UNAVAILABLE", "NO_SHOW", "CANCEL", "RESCHEDULE", "VIEW_QUEUE"] as const) {
      assert.strictEqual(canManageAppointment(receptionist, todayAppt, action, now, assignedToA), true, action);
    }
  });

  await it("Receptionist is denied for a doctor they are NOT assigned to, and by default with no context", () => {
    const otherDoctorAppt = { doctorId: docB, patientId: patA, appointmentDate: today };
    const now = new Date();
    for (const action of ["CHECK_IN", "UNAVAILABLE", "NO_SHOW", "CANCEL", "RESCHEDULE", "VIEW_QUEUE"] as const) {
      assert.strictEqual(canManageAppointment(receptionist, otherDoctorAppt, action, now, assignedToA), false, `other doctor: ${action}`);
      assert.strictEqual(canManageAppointment(receptionist, otherDoctorAppt, action, now), false, `no context: ${action}`);
      assert.strictEqual(canManageAppointment(receptionist, otherDoctorAppt, action, now, { assignedDoctorIds: [] }), false, `unassigned: ${action}`);
    }
  });

  await it("Receptionist can never Call or Complete, even for an assigned doctor", () => {
    const appt = { doctorId: docA, patientId: patA, appointmentDate: today };
    assert.strictEqual(canManageAppointment(receptionist, appt, "CALL", new Date(), assignedToA), false);
    assert.strictEqual(canManageAppointment(receptionist, appt, "COMPLETE", new Date(), assignedToA), false);
  });

  await it("Doctor WITH a receptionist: Call, Complete, Cancel, Reschedule yes; Check In, Unavailable, No-Show no", () => {
    const ownAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const doctor = { role: "DOCTOR" as const, profileId: docA, userId: "usr_docA" };
    const ctx = { doctorHasReceptionist: true };
    const now = new Date();

    for (const action of ["CALL", "COMPLETE", "CANCEL", "RESCHEDULE", "VIEW_QUEUE"] as const) {
      assert.strictEqual(canManageAppointment(doctor, ownAppt, action, now, ctx), true, action);
    }
    for (const action of ["CHECK_IN", "UNAVAILABLE", "NO_SHOW"] as const) {
      assert.strictEqual(canManageAppointment(doctor, ownAppt, action, now, ctx), false, action);
      // Unknown context is treated the same way: the front-desk controls stay hidden.
      assert.strictEqual(canManageAppointment(doctor, ownAppt, action, now), false, `${action} (no context)`);
    }
  });

  await it("Doctor WITHOUT a receptionist keeps the front-desk controls (solo-doctor fallback), for own patients only", () => {
    const ownAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const otherAppt = { doctorId: docB, patientId: patA, appointmentDate: today };
    const doctor = { role: "DOCTOR" as const, profileId: docA, userId: "usr_docA" };
    const ctx = { doctorHasReceptionist: false };
    const now = new Date();

    for (const action of ["CHECK_IN", "UNAVAILABLE", "NO_SHOW", "CALL", "COMPLETE"] as const) {
      assert.strictEqual(canManageAppointment(doctor, ownAppt, action, now, ctx), true, action);
      assert.strictEqual(canManageAppointment(doctor, otherAppt, action, now, ctx), false, `other doctor: ${action}`);
    }
  });

  await it("Patient can only CANCEL and RESCHEDULE their own appointments", () => {
    const ownAppt = { doctorId: docA, patientId: patA, appointmentDate: today };
    const otherAppt = { doctorId: docA, patientId: patB, appointmentDate: today };
    const patient = { role: "PATIENT" as const, profileId: patA, userId: "usr_patA" };

    assert.strictEqual(canManageAppointment(patient, ownAppt, "RESCHEDULE"), true);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "CANCEL"), true);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "CHECK_IN"), false);
    assert.strictEqual(canManageAppointment(patient, ownAppt, "UNAVAILABLE"), false);
    assert.strictEqual(canManageAppointment(patient, otherAppt, "RESCHEDULE"), false);
    assert.strictEqual(canManageAppointment(patient, otherAppt, "CANCEL"), false);
  });

  await it("getQueueControls: which buttons each role sees", () => {
    assert.deepStrictEqual(getQueueControls("RECEPTIONIST", false), {
      canCall: false, canComplete: false, canCheckIn: true, canMarkUnavailable: true, canMarkNoShow: true,
    });
    assert.deepStrictEqual(getQueueControls("DOCTOR", true), {
      canCall: true, canComplete: true, canCheckIn: false, canMarkUnavailable: false, canMarkNoShow: false,
    });
    assert.deepStrictEqual(getQueueControls("DOCTOR", false), {
      canCall: true, canComplete: true, canCheckIn: true, canMarkUnavailable: true, canMarkNoShow: true,
    });
    assert.deepStrictEqual(getQueueControls("PATIENT", false), {
      canCall: false, canComplete: false, canCheckIn: false, canMarkUnavailable: false, canMarkNoShow: false,
    });
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

  console.log("\n--- 5b. Reception team (doctor assigns receptionists) ---");

  const teamEmail = `team.${crypto.randomUUID().slice(0, 6)}@medrella.test`;
  let teamReceptionistId = "";
  let teamUserId = "";

  await it("A doctor creates a receptionist account and it is assigned to that doctor only", async () => {
    const res = await createReceptionistForDoctor(docA, {
      firstName: "Asha",
      lastName: "Kulkarni",
      email: teamEmail.toUpperCase(),
      phone: "+91 98765 43210",
      password: "Start-pass-1",
    });
    assert.strictEqual(res.success, true, JSON.stringify(res));
    assert.ok(res.success && res.data);
    teamReceptionistId = res.success && res.data ? res.data.id : "";
    teamUserId = res.success && res.data ? res.data.userId : "";

    const user = await dbRepo.getUserByEmail(teamEmail);
    assert.strictEqual(user?.role, "RECEPTIONIST");
    assert.strictEqual(verifyPassword("Start-pass-1", user!.passwordHash), true);
    assert.deepStrictEqual(await dbRepo.getAssignedDoctorIds(teamReceptionistId), [docA]);
    assert.strictEqual(await dbRepo.doctorHasReceptionist(docA), true);
    assert.strictEqual(await dbRepo.doctorHasReceptionist(docB), false);
  });

  await it("Creating a receptionist rejects a taken email, a short password and bad details", async () => {
    const base = { firstName: "Bina", lastName: "Rao", phone: "9876543210", password: "Start-pass-1" };
    const taken = await createReceptionistForDoctor(docA, { ...base, email: teamEmail });
    assert.strictEqual(taken.success, false);
    const short = await createReceptionistForDoctor(docA, { ...base, email: "short.pw@medrella.test", password: "abc" });
    assert.strictEqual(short.success, false);
    const badEmail = await createReceptionistForDoctor(docA, { ...base, email: "not-an-email" });
    assert.strictEqual(badEmail.success, false);
    const patientEmail = (await dbRepo.mem.users.find((u) => u.role === "PATIENT"))?.email;
    if (patientEmail) {
      const clash = await createReceptionistForDoctor(docA, { ...base, email: patientEmail });
      assert.strictEqual(clash.success, false, "an email owned by a patient must not be reusable");
    }
  });

  await it("Another doctor can assign the existing receptionist by email; unknown or non-receptionist emails are refused", async () => {
    const unknown = await assignExistingReceptionist(docB, "nobody@medrella.test");
    assert.strictEqual(unknown.success, false);
    const patientEmail = dbRepo.mem.users.find((u) => u.role === "PATIENT")?.email;
    if (patientEmail) {
      assert.strictEqual((await assignExistingReceptionist(docB, patientEmail)).success, false);
    }

    const added = await assignExistingReceptionist(docB, teamEmail);
    assert.strictEqual(added.success, true);
    const again = await assignExistingReceptionist(docB, teamEmail);
    assert.strictEqual(again.success, true, "assigning twice is safe");
    assert.deepStrictEqual((await dbRepo.getAssignedDoctorIds(teamReceptionistId)).sort(), [docA, docB].sort());
    assert.strictEqual(dbRepo.mem.doctorReceptionists.filter((a) => a.receptionistId === teamReceptionistId).length, 2);
  });

  await it("Only the creating doctor can reset a receptionist's password", async () => {
    const byOther = await resetReceptionistPassword(docB, teamReceptionistId, "Other-pass-9");
    assert.strictEqual(byOther.success, false);
    const tooShort = await resetReceptionistPassword(docA, teamReceptionistId, "abc");
    assert.strictEqual(tooShort.success, false);

    const ok = await resetReceptionistPassword(docA, teamReceptionistId, "New-pass-2024");
    assert.strictEqual(ok.success, true);
    const user = await dbRepo.getUserByEmail(teamEmail);
    assert.strictEqual(verifyPassword("New-pass-2024", user!.passwordHash), true);
    assert.strictEqual(verifyPassword("Start-pass-1", user!.passwordHash), false);
  });

  await it("Server-side gate follows the assignment: allowed while assigned, refused for others, refused after removal", async () => {
    const appt = createMemoryAppt({ doctorId: docA, patientId: patA, status: "CHECKED_IN", checkedInAt: new Date() });
    const user = { role: "RECEPTIONIST" as const, profileId: teamReceptionistId, userId: teamUserId };

    assert.strictEqual(await isAllowedToManage(user, appt, "UNAVAILABLE"), true);
    assert.strictEqual(await isAllowedToManage(user, appt, "CALL"), false, "a receptionist can never Call");

    // The doctor removes docA's assignment (docB stays): docA's queue is closed to this receptionist immediately.
    const removed = await revokeReceptionistFromDoctor(docA, teamReceptionistId);
    assert.strictEqual(removed.success, true);
    assert.strictEqual(await isAllowedToManage(user, appt, "UNAVAILABLE"), false);
    assert.strictEqual(await isAllowedToManage(user, appt, "CHECK_IN"), false);
    assert.deepStrictEqual(await dbRepo.getAssignedDoctorIds(teamReceptionistId), [docB]);

    const docBAppt = createMemoryAppt({ doctorId: docB, patientId: patA, status: "CHECKED_IN", checkedInAt: new Date() });
    assert.strictEqual(await isAllowedToManage(user, docBAppt, "UNAVAILABLE"), true, "still assigned to the other doctor");
  });

  await it("Removing an assignment that does not exist fails, and deleting the account clears its assignments", async () => {
    const again = await revokeReceptionistFromDoctor(docA, teamReceptionistId);
    assert.strictEqual(again.success, false);

    assert.strictEqual(await dbRepo.deleteUserComplete(teamUserId), true);
    assert.strictEqual(await dbRepo.getReceptionistById(teamReceptionistId), undefined);
    assert.strictEqual(dbRepo.mem.doctorReceptionists.some((a) => a.receptionistId === teamReceptionistId), false);
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
