import assert from "node:assert";
import crypto from "crypto";
import { AppointmentLifecycle, DomainError } from "./domain/appointment-lifecycle";
import { dbRepo, type AppointmentStatus } from "./db/repo";
import { buildRefundIdempotencyKey } from "./lib/refund-policy";
import { prepareRefund } from "./lib/payments/refunds";
import type { PaymentEntity } from "./db/repo";

console.log("🧪 Running Phase 3 Lifecycle & Payment Hardening Suite...\n");

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(err);
      failed++;
    }
  })();
}

async function runPhase3Tests() {
  console.log("--- 1. Appointment Lifecycle State Machine ---");

  await it("Permits legal transitions from PENDING_PAYMENT", () => {
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "BOOKED"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "EXPIRED"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "CANCELLED"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "PENDING_PAYMENT"), true);
  });

  await it("Blocks illegal transitions from PENDING_PAYMENT to COMPLETED or NO_SHOW", () => {
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "COMPLETED"), false);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("PENDING_PAYMENT", "NO_SHOW"), false);
    assert.throws(
      () => AppointmentLifecycle.assertValidTransition("PENDING_PAYMENT", "COMPLETED"),
      (err: any) => err instanceof DomainError && err.code === "INVALID_TRANSITION"
    );
  });

  await it("Permits legal transitions from BOOKED", () => {
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "COMPLETED"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "CANCELLED"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "NO_SHOW"), true);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "BOOKED"), true);
  });

  await it("Blocks illegal transitions from BOOKED to PENDING_PAYMENT or EXPIRED", () => {
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "PENDING_PAYMENT"), false);
    assert.strictEqual(AppointmentLifecycle.isValidTransition("BOOKED", "EXPIRED"), false);
  });

  await it("Enforces terminal state for COMPLETED (no outbound transitions)", () => {
    const statuses: AppointmentStatus[] = ["PENDING_PAYMENT", "BOOKED", "CANCELLED", "NO_SHOW", "EXPIRED"];
    for (const s of statuses) {
      assert.strictEqual(AppointmentLifecycle.isValidTransition("COMPLETED", s), false);
      assert.throws(
        () => AppointmentLifecycle.assertValidTransition("COMPLETED", s),
        (err: any) => err instanceof DomainError
      );
    }
  });

  await it("Enforces terminal state for CANCELLED (no outbound transitions)", () => {
    const statuses: AppointmentStatus[] = ["PENDING_PAYMENT", "BOOKED", "COMPLETED", "NO_SHOW", "EXPIRED"];
    for (const s of statuses) {
      assert.strictEqual(AppointmentLifecycle.isValidTransition("CANCELLED", s), false);
      assert.throws(
        () => AppointmentLifecycle.assertValidTransition("CANCELLED", s),
        (err: any) => err instanceof DomainError
      );
    }
  });

  await it("Enforces terminal state for NO_SHOW (no outbound transitions)", () => {
    const statuses: AppointmentStatus[] = ["PENDING_PAYMENT", "BOOKED", "COMPLETED", "CANCELLED", "EXPIRED"];
    for (const s of statuses) {
      assert.strictEqual(AppointmentLifecycle.isValidTransition("NO_SHOW", s), false);
      assert.throws(
        () => AppointmentLifecycle.assertValidTransition("NO_SHOW", s),
        (err: any) => err instanceof DomainError
      );
    }
  });

  console.log("\n--- 2. Concurrency & Double-Booking Guards ---");

  await it("Prevents concurrent double booking of the exact same slot", async () => {
    const doctorId = `doc-p3-${crypto.randomUUID()}`;
    const patient1Id = `pat-1-${crypto.randomUUID()}`;
    const patient2Id = `pat-2-${crypto.randomUUID()}`;
    const date = "2026-12-01";
    const startTime = "10:00";
    const endTime = "10:30";

    // Create doctor and availability session
    await dbRepo.createDoctor({
      id: doctorId,
      userId: `user-${doctorId}`,
      firstName: "Aarav",
      lastName: "Deshmukh",
      specialization: "Cardiology",
      phone: "+919876543210",
      licenseNumber: "MED-99881",
      experienceYears: 12,
      consultationFee: 600,
    });

    const session = await dbRepo.createAvailabilitySession({
      doctorId,
      name: "Morning OPD",
      dayOfWeek: "TUE",
      startTime: "09:00",
      endTime: "13:00",
      slotDurationMinutes: 30,
      schedulingType: "STREAM",
      patientsPerWave: 1,
      isActive: true,
    });

    // Patient 1 books the slot
    const res1 = await dbRepo.createAppointment({
      patientId: patient1Id,
      doctorId,
      sessionId: session.id,
      appointmentDate: date,
      startTime,
      endTime,
      status: "BOOKED",
      reason: "Routine checkup",
    });

    assert.strictEqual(res1.success, true);
    assert.ok(res1.appointment);

    // Patient 2 attempts to book the same slot
    const res2 = await dbRepo.createAppointment({
      patientId: patient2Id,
      doctorId,
      sessionId: session.id,
      appointmentDate: date,
      startTime,
      endTime,
      status: "BOOKED",
      reason: "Second patient",
    });

    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.message.includes("already been booked"), true);
  });

  await it("Enforces wave session capacity limit under burst reservations", async () => {
    const doctorId = `doc-wave-${crypto.randomUUID()}`;
    const date = "2026-12-02";
    const startTime = "11:00";
    const endTime = "11:30";
    const maxCapacity = 2;

    await dbRepo.createDoctor({
      id: doctorId,
      userId: `user-${doctorId}`,
      firstName: "Neha",
      lastName: "Kulkarni",
      specialization: "Pediatrics",
      phone: "+919876543211",
      licenseNumber: "MED-99882",
      experienceYears: 8,
      consultationFee: 500,
    });

    const session = await dbRepo.createAvailabilitySession({
      doctorId,
      name: "Wave OPD",
      dayOfWeek: "WED",
      startTime: "11:00",
      endTime: "12:00",
      slotDurationMinutes: 30,
      schedulingType: "WAVE",
      patientsPerWave: maxCapacity,
      isActive: true,
    });

    // Book seat 1
    const p1 = await dbRepo.createAppointment({
      patientId: `pat-w1-${crypto.randomUUID()}`,
      doctorId,
      sessionId: session.id,
      appointmentDate: date,
      startTime,
      endTime,
      status: "BOOKED",
    });
    assert.strictEqual(p1.success, true);

    // Book seat 2
    const p2 = await dbRepo.createAppointment({
      patientId: `pat-w2-${crypto.randomUUID()}`,
      doctorId,
      sessionId: session.id,
      appointmentDate: date,
      startTime,
      endTime,
      status: "BOOKED",
    });
    assert.strictEqual(p2.success, true);

    // Book seat 3 (should fail due to full capacity)
    const p3 = await dbRepo.createAppointment({
      patientId: `pat-w3-${crypto.randomUUID()}`,
      doctorId,
      sessionId: session.id,
      appointmentDate: date,
      startTime,
      endTime,
      status: "BOOKED",
    });
    assert.strictEqual(p3.success, false);
    assert.strictEqual(p3.message.includes("full capacity"), true);
  });

  console.log("\n--- 3. Payment & Refund Idempotency ---");

  await it("Refund idempotency key is deterministic per payment, appointment, and purpose", () => {
    const k1 = buildRefundIdempotencyKey("pay-123", "apt-456", "CANCELLATION");
    const k2 = buildRefundIdempotencyKey("pay-123", "apt-456", "CANCELLATION");
    const k3 = buildRefundIdempotencyKey("pay-123", "apt-456", "AUTO_REFUND_EXPIRED_SLOT");

    assert.strictEqual(k1, k2);
    assert.notStrictEqual(k1, k3);
    assert.strictEqual(k1, "rfnd_key_pay-123_apt-456_CANCELLATION");
  });

  await it("Concurrent cancellation requests do not issue duplicate refunds", async () => {
    const appointmentId = `apt-ref-${crypto.randomUUID()}`;
    const paymentId = `pay-ref-${crypto.randomUUID()}`;
    const patientId = `pat-ref-${crypto.randomUUID()}`;
    const amountPaise = 80000;

    const fakePayment: PaymentEntity = {
      id: paymentId,
      appointmentId,
      patientId,
      provider: "MOCK",
      providerOrderId: `order-${paymentId}`,
      providerPaymentId: `pay_gateway_${paymentId}`,
      receiptNo: "REC-9999",
      amountPaise,
      currency: "INR",
      status: "PAID",
      failureReason: null,
      paidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dbRepo.createPayment(fakePayment);

    // Call 1
    const ref1 = await prepareRefund(dbRepo, {
      payment: fakePayment,
      appointmentId,
      amountPaise,
      reason: "Cancelled by patient with full notice",
      purpose: "CANCELLATION",
    });
    assert.strictEqual(ref1.needsExecution, true);
    assert.ok(ref1.refund);
    assert.strictEqual(ref1.refund.amountPaise, amountPaise);

    // Call 2 (concurrent repeat)
    const ref2 = await prepareRefund(dbRepo, {
      payment: fakePayment,
      appointmentId,
      amountPaise,
      reason: "Concurrent retry",
      purpose: "CANCELLATION",
    });

    // Should return existing refund with needsExecution = false or same row
    assert.strictEqual(ref2.refund?.id, ref1.refund.id);
  });

  await it("Caps refund amounts so cumulative refunds never exceed original payment", async () => {
    const appointmentId = `apt-cap-${crypto.randomUUID()}`;
    const paymentId = `pay-cap-${crypto.randomUUID()}`;
    const patientId = `pat-cap-${crypto.randomUUID()}`;
    const amountPaise = 50000; // Rs 500

    const payment: PaymentEntity = {
      id: paymentId,
      appointmentId,
      patientId,
      provider: "MOCK",
      providerOrderId: `order-${paymentId}`,
      providerPaymentId: `pay_gtw_${paymentId}`,
      receiptNo: "REC-8888",
      amountPaise,
      currency: "INR",
      status: "PAID",
      failureReason: null,
      paidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await dbRepo.createPayment(payment);

    // First refund: Rs 300
    const r1 = await prepareRefund(dbRepo, {
      payment,
      appointmentId,
      amountPaise: 30000,
      reason: "Partial refund 1",
      purpose: "PARTIAL_1",
    });
    assert.strictEqual(r1.needsExecution, true);
    assert.strictEqual(r1.refund?.amountPaise, 30000);

    // Second refund: requests Rs 300, but only Rs 200 remains!
    const r2 = await prepareRefund(dbRepo, {
      payment,
      appointmentId,
      amountPaise: 30000,
      reason: "Partial refund 2",
      purpose: "PARTIAL_2",
    });
    assert.strictEqual(r2.needsExecution, true);
    assert.strictEqual(r2.refund?.amountPaise, 20000); // Strictly capped at remaining 20000

    // Third refund: requests Rs 100, 0 remains
    const r3 = await prepareRefund(dbRepo, {
      payment,
      appointmentId,
      amountPaise: 10000,
      reason: "Partial refund 3",
      purpose: "PARTIAL_3",
    });
    assert.strictEqual(r3.needsExecution, false);
    assert.strictEqual(r3.skippedReason, "No refundable balance remaining on this payment.");
  });

  console.log("\n==============================================");
  console.log(`Phase 3 Verification Results: ${passed} passed, ${failed} failed`);
  console.log("==============================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error("Fatal error running Phase 3 tests:", err);
  process.exit(1);
});
