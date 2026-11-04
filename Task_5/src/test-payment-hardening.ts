/**
 * Regression tests for the Task 4 payment review. Each group proves one fix and would have failed
 * against the code as first delivered. Runs entirely in memory with the mock gateway.
 */

process.env.ENABLE_SEED_DATA = "true";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.DATABASE_URL = "disabled-for-local-test";

import crypto from "crypto";
import { NextRequest } from "next/server";
import { dbRepo, dayOfWeekFor, toLocalDateString } from "./db/repo";
import type { PaymentEntity } from "./db/repo";
import { specialistSessionId } from "./db/specialists-catalog";
import { getPaymentProvider, getMockProvider, RazorpayProvider } from "./lib/payments";
import { MockProvider } from "./lib/payments/mock-provider";
import { checkPaymentBinding, checkOrderSettled } from "./lib/payments/binding";
import { issueRefund, prepareRefund, retryStuckRefunds } from "./lib/payments/refunds";
import { sweepExpiredHolds } from "./lib/payments/expire";
import { formatNotification } from "./lib/notifications";
import { rejectUnauthorizedCron } from "./lib/cron-auth";
import { POST as webhookPost } from "./app/api/webhooks/razorpay/route";

const DOCTOR = "doc_priya_nair"; // TUE/THU/SAT 11:00-15:00, 20-minute stream slots
const SLOT_TIMES = ["11:00", "11:20", "11:40", "12:00", "12:20", "12:40", "13:00", "13:20", "13:40", "14:00", "14:20", "14:40"];
const mock = getMockProvider();
const PAST = () => new Date(Date.now() - 60 * 1000);
const FUTURE = () => new Date(Date.now() + 10 * 60 * 1000);

let passed = 0;
let failed = 0;
function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

// --- fixtures -------------------------------------------------------------------------------------
let slotCounter = 0;
function allocSlot(): { date: string; start: string; end: string; sessionId: string } {
  // Spread across many Tue/Thu/Sat dates so tests never collide on a seat.
  const dates: string[] = [];
  for (let i = 3; dates.length < 12; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const code = dayOfWeekFor(toLocalDateString(d));
    if (code === "TUE" || code === "THU" || code === "SAT") dates.push(toLocalDateString(d));
  }
  const date = dates[Math.floor(slotCounter / SLOT_TIMES.length) % dates.length];
  const start = SLOT_TIMES[slotCounter % SLOT_TIMES.length];
  slotCounter++;
  const [h, m] = start.split(":").map(Number);
  const endMin = h * 60 + m + 20;
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return { date, start, end, sessionId: specialistSessionId(DOCTOR, "midday", dayOfWeekFor(date) as any) };
}

async function mkPatient(id: string) {
  await dbRepo.createUser({ id: `u-${id}`, email: `${id}@test.example`, passwordHash: "x", role: "PATIENT", isActive: true });
  await dbRepo.createPatient({ id, userId: `u-${id}`, firstName: "Test", lastName: id, phone: "+91 9000000000" });
}

/** A hold with a payment record and a gateway order (not yet paid). */
async function mkHold(patientId: string, opts: { expired?: boolean; slot?: ReturnType<typeof allocSlot> } = {}) {
  const slot = opts.slot ?? allocSlot();
  const created = await dbRepo.createAppointment({
    patientId,
    doctorId: DOCTOR,
    sessionId: slot.sessionId,
    appointmentDate: slot.date,
    startTime: slot.start,
    endTime: slot.end,
    reason: "Payment hardening test",
    status: "PENDING_PAYMENT",
    holdExpiresAt: opts.expired ? PAST() : FUTURE(),
  });
  if (!created.success || !created.appointment) throw new Error(`hold failed: ${created.message}`);
  const order = await mock.createOrder({ amountPaise: 80000, receipt: `RCP-${crypto.randomUUID().slice(0, 8)}` });
  const payment = await dbRepo.createPayment({
    id: `pay-${crypto.randomUUID()}`,
    appointmentId: created.appointment.id,
    patientId,
    provider: "MOCK",
    providerOrderId: order.id,
    amountPaise: 80000,
    currency: "INR",
    status: "CREATED",
    receiptNo: `RCPT-T-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    expiresAt: created.appointment.holdExpiresAt ?? null,
  });
  return { appointment: created.appointment, payment, order, slot };
}

/** A hold that has been paid and confirmed (appointment BOOKED, payment PAID with a payment id). */
async function mkPaid(patientId: string) {
  const hold = await mkHold(patientId);
  const providerPaymentId = mock.markOrderPaid(hold.order.id);
  await dbRepo.confirmPaymentAndBookAppointment({
    appointmentId: hold.appointment.id,
    paymentId: hold.payment.id,
    providerPaymentId,
  });
  const payment = (await dbRepo.getPaymentById(hold.payment.id))!;
  return { ...hold, payment, providerPaymentId };
}

async function pendingNotifications(appointmentId: string) {
  const all = await dbRepo.getPendingNotifications(new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000), 5000);
  return all.filter((n) => n.appointmentId === appointmentId);
}

async function post(body: object, opts: { sig?: string | null; eventId?: string } = {}) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = opts.sig === undefined ? mock.generateWebhookSignature(raw) : opts.sig;
  if (sig) headers["x-razorpay-signature"] = sig;
  headers["x-razorpay-event-id"] = opts.eventId ?? `evt_${crypto.randomUUID()}`;
  const res = await webhookPost(new NextRequest("http://localhost/api/webhooks/razorpay", { method: "POST", headers, body: raw }));
  return { status: res.status, json: (await res.json()) as any };
}

const capturedEvent = (orderId: string, paymentId: string, amount = 80000) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: "INR", status: "captured" } } },
});
const refundEvent = (type: string, refundId: string, paymentId: string, amount: number) => ({
  event: type,
  payload: { refund: { entity: { id: refundId, payment_id: paymentId, amount, status: type.split(".")[1] } } },
});

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else (process.env as any)[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else (process.env as any)[k] = v;
    }
  }
}

async function run() {
  console.log("🔐 Starting Task 4 payment hardening tests...\n");

  // ===== 1. Payment binding (critical: a payment must belong to the appointment it confirms) ======
  console.log("--- 1. Payment Binding ---");
  await mkPatient("pat-bind-a");
  await mkPatient("pat-bind-b");
  const holdA = await mkHold("pat-bind-a");
  const holdB = await mkHold("pat-bind-b");
  const base = {
    payment: holdA.payment,
    appointment: holdA.appointment,
    patientId: "pat-bind-a",
    providerName: "MOCK" as const,
    appointmentId: holdA.appointment.id,
    providerOrderId: holdA.payment.providerOrderId,
    providerPaymentId: "pay_real_1",
  };
  assert(checkPaymentBinding(base).ok === true, "A payment confirms its own appointment for its own patient");
  assert(
    !checkPaymentBinding({ ...base, appointmentId: holdB.appointment.id, appointment: holdB.appointment }).ok,
    "A payment cannot confirm a different appointment"
  );
  assert(!checkPaymentBinding({ ...base, patientId: "pat-bind-b" }).ok, "Another patient cannot confirm someone else's payment");
  assert(
    !checkPaymentBinding({ ...base, providerOrderId: "order_UNRELATED_CHEAP_001" }).ok,
    "An unrelated order id (the exploit I demonstrated) is rejected"
  );
  assert(
    !checkPaymentBinding({ ...base, payment: { ...holdA.payment, providerPaymentId: "pay_other" } }).ok,
    "A payment already settled with a different payment id cannot be re-bound"
  );
  assert(!checkPaymentBinding({ ...base, payment: undefined }).ok, "A missing payment record is rejected");

  const paidOrder = { id: "o1", amount: 80000, amountPaid: 80000, amountDue: 0, currency: "INR", receipt: "r", status: "paid" as const, payments: [{ id: "pay_real_1", status: "captured", amount: 80000 }] };
  const chargeRef = { amountPaise: 80000, currency: "INR", providerOrderId: "o1" };
  assert(checkOrderSettled(paidOrder, chargeRef, "pay_real_1").ok === true, "A fully paid order with the reported payment passes");
  const unpaid = checkOrderSettled({ ...paidOrder, status: "created", amountPaid: 0, payments: [] }, chargeRef, "pay_real_1");
  assert(!unpaid.ok && unpaid.pending === true, "An unpaid order is 'still pending', not treated as fraud");
  assert(!checkOrderSettled({ ...paidOrder, amountPaid: 50000 }, chargeRef, "pay_real_1").ok, "Paying less than the fee is rejected");
  assert(!checkOrderSettled({ ...paidOrder, amount: 10000 }, chargeRef, "pay_real_1").ok, "An order created for a different amount is rejected");
  assert(!checkOrderSettled(paidOrder, chargeRef, "pay_not_in_order").ok, "A payment id that isn't part of the order is rejected");
  assert(
    !checkOrderSettled({ ...paidOrder, payments: [{ id: "pay_real_1", status: "failed", amount: 80000 }] }, chargeRef, "pay_real_1").ok,
    "A failed payment attempt does not confirm a booking"
  );

  // ===== 2. Mock gateway lockdown (critical) ======================================================
  console.log("\n--- 2. Mock Gateway Lockdown ---");
  assert(!mock.verifyCheckoutSignature({ orderId: "o", paymentId: "p", signature: "mock_valid_signature" }), "Mock rejects the old fixed checkout signature");
  assert(!mock.verifyCheckoutSignature({ orderId: "o", paymentId: "p", signature: "mock_sig_o_p" }), "Mock rejects the old pattern signature");
  assert(!mock.verifyWebhook({ rawBody: "{}", signature: "mock_webhook_valid_signature" }), "Mock rejects the old fixed webhook signature");
  const sim = mock.simulatePayment(holdB.order.id);
  assert(mock.verifyCheckoutSignature({ orderId: sim.orderId, paymentId: sim.paymentId, signature: sim.signature }), "Server-simulated payment carries a signature that verifies");
  assert((await mock.fetchOrder(holdB.order.id)).status === "paid", "Server-simulated payment marks the gateway order paid");
  let unknownOrderThrows = false;
  try {
    await mock.fetchOrder("order_never_created");
  } catch {
    unknownOrderThrows = true;
  }
  assert(unknownOrderThrows, "Mock no longer invents an order for an unknown id");

  await withEnv({ NODE_ENV: "production", USE_MOCK_PAYMENTS: undefined, RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }, () => {
    let threw = false;
    try {
      getPaymentProvider();
    } catch {
      threw = true;
    }
    assert(threw, "Production without Razorpay keys fails closed (no silent mock)");
  });
  await withEnv({ NODE_ENV: "production", USE_MOCK_PAYMENTS: "true", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" }, () => {
    let threw = false;
    try {
      getPaymentProvider();
    } catch {
      threw = true;
    }
    assert(threw, "Production refuses USE_MOCK_PAYMENTS even when keys exist");
  });
  await withEnv({ NODE_ENV: "production", USE_MOCK_PAYMENTS: undefined, RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "secret" }, () => {
    assert(getPaymentProvider() instanceof RazorpayProvider, "Production with keys uses real Razorpay");
  });

  // ===== 3. Honest refund status (critical) =======================================================
  console.log("\n--- 3. Honest Refund Statuses ---");
  await mkPatient("pat-ref-1");
  const paid1 = await mkPaid("pat-ref-1");
  assert(paid1.payment.status === "PAID" && !!paid1.payment.providerPaymentId, "Fixture: paid booking with a gateway payment id");

  mock.refundStatus = "pending";
  const pend = await issueRefund(dbRepo, { payment: paid1.payment, appointmentId: paid1.appointment.id, amountPaise: 40000, reason: "Half refund", purpose: "CANCELLATION" }, mock);
  assert(pend.refund?.status === "PENDING", "Gateway says pending -> refund is PENDING, not PROCESSED");
  assert((await dbRepo.getPaymentById(paid1.payment.id))!.status === "PAID", "A pending refund does not change the payment status");
  const pendNotes = (await dbRepo.getPendingNotifications(new Date(Date.now() + 1e10), 5000)).filter((n) => n.appointmentId === paid1.appointment.id);
  assert(pendNotes.some((n) => n.template === "REFUND_INITIATED") && !pendNotes.some((n) => n.template === "REFUND_PROCESSED"), "Patient is told 'initiated', never 'processed', while pending");

  const dup = await issueRefund(dbRepo, { payment: paid1.payment, appointmentId: paid1.appointment.id, amountPaise: 40000, reason: "Half refund", purpose: "CANCELLATION" }, mock);
  assert(dup.refund?.id === pend.refund?.id, "Duplicate refund request returns the same refund");
  assert([...mock.refunds.values()].filter((r) => r.paymentId === paid1.providerPaymentId).length === 1, "Duplicate request does not call the gateway twice");

  mock.refundStatus = "processed";
  const second = await issueRefund(dbRepo, { payment: paid1.payment, appointmentId: paid1.appointment.id, amountPaise: 80000, reason: "Over-refund attempt", purpose: "OTHER" }, mock);
  assert(second.refund?.amountPaise === 40000, "A second refund is capped to the balance not already refunded");
  const afterCap = await dbRepo.getPaymentById(paid1.payment.id);
  assert(afterCap!.status === "PARTIALLY_REFUNDED", "Processed 50% of the payment -> PARTIALLY_REFUNDED (not fully refunded)");

  await mkPatient("pat-ref-2");
  const paid2 = await mkPaid("pat-ref-2");
  const noRef = { ...paid2.payment, providerPaymentId: null };
  const before = mock.refunds.size;
  const missing = await issueRefund(dbRepo, { payment: noRef, appointmentId: paid2.appointment.id, amountPaise: 80000, reason: "No ref", purpose: "CANCELLATION" }, mock);
  assert(missing.refund?.status === "FAILED" && mock.refunds.size === before, "No payment reference -> FAILED with no gateway call (was wrongly PROCESSED)");

  await mkPatient("pat-ref-3");
  const paid3 = await mkPaid("pat-ref-3");
  const failing: any = Object.create(mock);
  failing.createRefund = async () => {
    throw new Error("Razorpay createRefund failed (500): gateway down");
  };
  const failedRefund = await issueRefund(dbRepo, { payment: paid3.payment, appointmentId: paid3.appointment.id, amountPaise: 80000, reason: "Retry me", purpose: "CANCELLATION" }, failing);
  assert(failedRefund.refund?.status === "FAILED" && (failedRefund.refund.failureReason ?? "").length <= 180, "Gateway error -> FAILED with a short reason");
  const retried = await issueRefund(dbRepo, { payment: paid3.payment, appointmentId: paid3.appointment.id, amountPaise: 80000, reason: "Retry me", purpose: "CANCELLATION" }, mock);
  assert(retried.refund?.id === failedRefund.refund?.id && retried.refund?.status === "PROCESSED", "A FAILED refund is retried on the same record");
  assert((await dbRepo.getPaymentById(paid3.payment.id))!.status === "REFUNDED", "Fully processed refund -> payment REFUNDED");

  // ===== 4. Refund webhooks use the payment id (high) =============================================
  console.log("\n--- 4. Refund Webhooks ---");
  mock.refundStatus = "pending";
  await mkPatient("pat-wh-1");
  const paid4 = await mkPaid("pat-wh-1");
  const r4 = (await issueRefund(dbRepo, { payment: paid4.payment, appointmentId: paid4.appointment.id, amountPaise: 80000, reason: "Webhook refund", purpose: "CANCELLATION" }, mock)).refund!;
  assert(r4.status === "PENDING" && !!r4.providerRefundId, "Fixture: pending refund with a gateway refund id");

  const created = await post(refundEvent("refund.created", r4.providerRefundId!, paid4.providerPaymentId, 80000));
  const afterCreated = (await dbRepo.getRefundsByPaymentId(paid4.payment.id))[0];
  assert(created.status === 200 && afterCreated.status === "PENDING", "refund.created does NOT mark the refund processed");

  const processed = await post(refundEvent("refund.processed", r4.providerRefundId!, paid4.providerPaymentId, 80000));
  const afterProcessed = (await dbRepo.getRefundsByPaymentId(paid4.payment.id))[0];
  assert(processed.status === 200 && afterProcessed.status === "PROCESSED", "refund.processed (matched by payment id) marks the refund PROCESSED");
  assert((await dbRepo.getPaymentById(paid4.payment.id))!.status === "REFUNDED", "Fully refunded payment becomes REFUNDED after the webhook");

  await mkPatient("pat-wh-2");
  const paid5 = await mkPaid("pat-wh-2");
  const r5 = (await issueRefund(dbRepo, { payment: paid5.payment, appointmentId: paid5.appointment.id, amountPaise: 40000, reason: "Partial", purpose: "CANCELLATION" }, mock)).refund!;
  await post(refundEvent("refund.processed", r5.providerRefundId!, paid5.providerPaymentId, 40000));
  assert((await dbRepo.getPaymentById(paid5.payment.id))!.status === "PARTIALLY_REFUNDED", "A partial refund marks the payment PARTIALLY_REFUNDED, not REFUNDED");

  await mkPatient("pat-wh-3");
  const paid6 = await mkPaid("pat-wh-3");
  const r6 = (await issueRefund(dbRepo, { payment: paid6.payment, appointmentId: paid6.appointment.id, amountPaise: 80000, reason: "Will fail", purpose: "CANCELLATION" }, mock)).refund!;
  await post(refundEvent("refund.failed", r6.providerRefundId!, paid6.providerPaymentId, 80000));
  assert((await dbRepo.getRefundsByPaymentId(paid6.payment.id))[0].status === "FAILED", "refund.failed marks the refund FAILED");

  await mkPatient("pat-wh-4");
  const paid7 = await mkPaid("pat-wh-4");
  const dashboard = await post(refundEvent("refund.processed", "rfnd_dashboard_1", paid7.providerPaymentId, 80000));
  const dashRefunds = await dbRepo.getRefundsByPaymentId(paid7.payment.id);
  assert(dashboard.status === 200 && dashRefunds.length === 1 && dashRefunds[0].status === "PROCESSED", "A refund made from the Razorpay dashboard is recorded in history");

  // ===== 5. Webhook security & retry safety (high) ================================================
  console.log("\n--- 5. Webhook Security & Retries ---");
  const probe = capturedEvent("order_x", "pay_x");
  assert((await post(probe, { sig: "deadbeef" })).status === 400, "Wrong signature -> 400");
  assert((await post(probe, { sig: "mock_webhook_valid_signature" })).status === 400, "The old fixed signature -> 400");
  assert((await post(probe, { sig: null })).status === 400, "Missing signature -> 400");

  await mkPatient("pat-wh-5");
  const hold8 = await mkHold("pat-wh-5");
  const payId8 = mock.markOrderPaid(hold8.order.id);
  const evtId = `evt_dup_${crypto.randomUUID()}`;
  const original = dbRepo.confirmPaymentAndBookAppointment.bind(dbRepo);
  (dbRepo as any).confirmPaymentAndBookAppointment = async () => {
    throw new Error("simulated database outage");
  };
  const failedDelivery = await post(capturedEvent(hold8.order.id, payId8), { eventId: evtId });
  (dbRepo as any).confirmPaymentAndBookAppointment = original;
  assert(failedDelivery.status === 500, "A processing error answers 5xx so Razorpay retries");
  assert((await dbRepo.getAppointmentById(hold8.appointment.id))!.status === "PENDING_PAYMENT", "Nothing was confirmed by the failed attempt");
  // Capture what the console channel actually sends while the re-delivered event is processed.
  const sentLines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    sentLines.push(args.join(" "));
  };
  const redelivery = await post(capturedEvent(hold8.order.id, payId8), { eventId: evtId });
  await new Promise((resolve) => setTimeout(resolve, 100)); // the dispatcher runs after the response
  console.log = originalLog;
  assert(redelivery.status === 200 && (await dbRepo.getAppointmentById(hold8.appointment.id))!.status === "BOOKED", "The re-delivered event is processed (not lost as a 'duplicate')");
  const again = await post(capturedEvent(hold8.order.id, payId8), { eventId: evtId });
  assert(again.status === 200 && /Duplicate/.test(again.json.message ?? ""), "After success, a further delivery is a harmless duplicate");

  const mine = sentLines.filter((l) => l.includes("pat-wh-5@test.example"));
  assert(
    mine.some((l) => l.includes("Template: BOOKING_CONFIRMED") && /Appointment Confirmed/.test(l)) &&
      mine.some((l) => l.includes("Template: PAYMENT_CONFIRMED") && /Payment Receipt/.test(l)),
    "Booking and payment confirmation emails are sent with real subjects (not the generic fallback)"
  );
  const notes8 = await pendingNotifications(hold8.appointment.id);
  assert(notes8.some((n) => n.template === "APPOINTMENT_REMINDER"), "Reminders are scheduled when the webhook confirms the booking");

  await mkPatient("pat-wh-6");
  const hold9 = await mkHold("pat-wh-6");
  const pf = await post({ event: "payment.failed", payload: { payment: { entity: { id: "pay_failed_1", order_id: hold9.order.id, error_description: "Card declined" } } } });
  const afterFail = await dbRepo.getAppointmentById(hold9.appointment.id);
  assert(pf.status === 200 && afterFail!.status === "PENDING_PAYMENT", "A failed attempt keeps the seat held, so a retry on the same order can still succeed");
  assert((await dbRepo.getPaymentById(hold9.payment.id))!.failureReason === "Card declined", "The failure reason is recorded");

  await mkPatient("pat-wh-7");
  const hold10 = await mkHold("pat-wh-7");
  const underpaid = await post(capturedEvent(hold10.order.id, mock.markOrderPaid(hold10.order.id), 100));
  assert(underpaid.status === 500 && (await dbRepo.getAppointmentById(hold10.appointment.id))!.status === "PENDING_PAYMENT", "A capture for less than the fee does not confirm the booking");

  // ===== 6. Late payments: refund, never drop (high) =============================================
  console.log("\n--- 6. Late Payments & Sweep ---");
  await mkPatient("pat-late-1");
  await mkPatient("pat-late-2");
  const late = await mkHold("pat-late-1", { expired: true });
  const taken = await dbRepo.createAppointment({ patientId: "pat-late-2", doctorId: DOCTOR, sessionId: late.slot.sessionId, appointmentDate: late.slot.date, startTime: late.slot.start, endTime: late.slot.end, reason: "Took the slot", status: "BOOKED" });
  assert(taken.success === true, "Fixture: another patient took the expired hold's slot");
  mock.refundStatus = "pending";
  mock.markOrderPaid(late.order.id);
  const swept = await sweepExpiredHolds(dbRepo, mock, new Date());
  const lateRefunds = await dbRepo.getRefundsByPaymentId(late.payment.id);
  assert(swept.refundedCount >= 1 && lateRefunds.length === 1 && lateRefunds[0].amountPaise === 80000, "Sweep refunds a late payment whose slot was taken (it used to be silently dropped)");
  assert(!!lateRefunds[0].providerRefundId && lateRefunds[0].status === "PENDING", "The late-payment refund uses the real payment id and stays PENDING until confirmed");
  assert((await dbRepo.getAppointmentById(late.appointment.id))!.status === "EXPIRED", "The expired hold is released");

  await mkPatient("pat-late-3");
  const noId = await mkHold("pat-late-3", { expired: true });
  const orderRef = mock.orders.get(noId.order.id)!;
  orderRef.status = "paid";
  orderRef.amountPaid = orderRef.amount;
  orderRef.payments = [];
  const sweptNoId = await sweepExpiredHolds(dbRepo, mock, new Date());
  assert(sweptNoId.skippedCount >= 1 && (await dbRepo.getAppointmentById(noId.appointment.id))!.status === "PENDING_PAYMENT", "A paid order with an unknown payment id is left for the next sweep (no invented id)");

  await mkPatient("pat-late-4");
  const recoverable = await mkHold("pat-late-4", { expired: true });
  mock.markOrderPaid(recoverable.order.id);
  const sweptOk = await sweepExpiredHolds(dbRepo, mock, new Date());
  assert(sweptOk.recoveredCount >= 1 && (await dbRepo.getAppointmentById(recoverable.appointment.id))!.status === "BOOKED", "A late payment whose slot is still free confirms the booking");

  // Cancelled before paying, then paid
  await mkPatient("pat-late-5");
  const cancelledHold = await mkHold("pat-late-5");
  await dbRepo.updateAppointmentStatus(cancelledHold.appointment.id, "CANCELLED");
  const payId11 = mock.markOrderPaid(cancelledHold.order.id);
  const confirmCancelled = await dbRepo.confirmPaymentAndBookAppointment({ appointmentId: cancelledHold.appointment.id, paymentId: cancelledHold.payment.id, providerPaymentId: payId11 });
  assert(confirmCancelled.success === false && confirmCancelled.refundNeeded === true, "Paying after cancelling the hold asks for a refund");
  assert((await dbRepo.getAppointmentById(cancelledHold.appointment.id))!.status === "CANCELLED", "...and never resurrects the cancelled appointment");

  // Stuck refund requests
  await mkPatient("pat-stuck-1");
  const stuckPaid = await mkPaid("pat-stuck-1");
  await dbRepo.updateAppointmentStatus(stuckPaid.appointment.id, "CANCELLED");
  const prepared = await prepareRefund(dbRepo, { payment: stuckPaid.payment, appointmentId: stuckPaid.appointment.id, amountPaise: 80000, reason: "Stuck", purpose: "CANCELLATION" });
  assert(prepared.refund?.status === "REQUESTED" && prepared.needsExecution === true, "A refund is recorded as REQUESTED before the gateway is called");
  prepared.refund!.updatedAt = new Date(Date.now() - 10 * 60 * 1000);
  mock.refundStatus = "processed";
  const retry = await retryStuckRefunds(dbRepo, mock, new Date());
  assert(retry.retried >= 1 && (await dbRepo.getRefundsByPaymentId(stuckPaid.payment.id))[0].status === "PROCESSED", "The sweep sends a refund that never reached the gateway");

  await mkPatient("pat-stuck-2");
  const notCancelled = await mkPaid("pat-stuck-2");
  const prep2 = await prepareRefund(dbRepo, { payment: notCancelled.payment, appointmentId: notCancelled.appointment.id, amountPaise: 80000, reason: "Never cancelled", purpose: "CANCELLATION" });
  prep2.refund!.updatedAt = new Date(Date.now() - 10 * 60 * 1000);
  const retry2 = await retryStuckRefunds(dbRepo, mock, new Date());
  assert(retry2.abandoned >= 1 && (await dbRepo.getRefundsByPaymentId(notCancelled.payment.id))[0].status === "FAILED", "A refund whose cancellation never happened is closed, not paid out");

  // ===== 7. Hold reuse (no seat hoarding) ========================================================
  console.log("\n--- 7. One Live Hold Per Patient ---");
  await mkPatient("pat-hold-r");
  const reuseSlot = allocSlot();
  const live = await mkHold("pat-hold-r", { slot: reuseSlot });
  const found = await dbRepo.findActiveHoldsForPatient("pat-hold-r", DOCTOR, reuseSlot.date);
  assert(found.length === 1 && found[0].appointment.id === live.appointment.id && found[0].payment?.id === live.payment.id, "A patient's live hold (with its payment) can be found for reuse");
  await mkPatient("pat-hold-e");
  const expSlot = allocSlot();
  await mkHold("pat-hold-e", { slot: expSlot, expired: true });
  assert((await dbRepo.findActiveHoldsForPatient("pat-hold-e", DOCTOR, expSlot.date)).length === 0, "An expired hold is not offered for reuse");

  // ===== 8. Emails & cron =======================================================================
  console.log("\n--- 8. Email Templates & Cron Auth ---");
  const baseItem = { id: "n1", userId: "u", channel: "EMAIL" as const, recipient: "a@b.c", status: "PENDING" as const, scheduledFor: new Date(), attempts: 0, createdAt: new Date() };
  const confirmed = formatNotification({ ...baseItem, template: "BOOKING_CONFIRMED", payload: { patientName: "Asha", doctorName: "Priya Nair", appointmentDate: "2030-01-01", startTime: "11:00", tokenNumber: 3, amountFormatted: "₹800" } });
  assert(/Priya Nair/.test(confirmed.bodyText) && /2030-01-01/.test(confirmed.bodyText) && /Token/.test(confirmed.subject), "Booking confirmation email shows the real details");
  const legacy = formatNotification({ ...baseItem, template: "BOOKING_CONFIRMATION", payload: { patientName: "Asha", doctorName: "Priya Nair", appointmentDate: "2030-01-01" } });
  assert(/Priya Nair/.test(legacy.bodyText), "The older BOOKING_CONFIRMATION name still renders details (was a generic fallback)");
  const injected = formatNotification({ ...baseItem, template: "BOOKING_CONFIRMED", payload: { patientName: "<script>alert(1)</script>", doctorName: "X" } });
  assert(!injected.bodyHtml.includes("<script>") && injected.bodyHtml.includes("&lt;script&gt;") && injected.bodyText.includes("<script>"), "HTML email escapes user-typed text; plain text stays readable");
  const refundMail = (template: string) => formatNotification({ ...baseItem, template, payload: { patientName: "Asha", refundAmountFormatted: "₹800" } });
  assert(/initiated/i.test(refundMail("REFUND_INITIATED").bodyText) && /processed successfully/i.test(refundMail("REFUND_PROCESSED").bodyText) && /issue/i.test(refundMail("REFUND_FAILED").bodyText), "Refund emails say initiated / processed / failed distinctly");

  const cronReq = (auth?: string) => new NextRequest("http://localhost/api/cron/payments", { headers: auth ? { authorization: auth } : {} });
  await withEnv({ NODE_ENV: "production", CRON_SECRET: undefined }, () => {
    assert(rejectUnauthorizedCron(cronReq())?.status === 503, "Cron endpoints refuse to run in production without CRON_SECRET (they were open)");
  });
  await withEnv({ NODE_ENV: "production", CRON_SECRET: "s3cret-value" }, () => {
    assert(rejectUnauthorizedCron(cronReq("Bearer wrong"))?.status === 401, "Wrong cron bearer token -> 401");
    assert(rejectUnauthorizedCron(cronReq("Bearer s3cret-value")) === null, "Correct cron bearer token is allowed");
  });

  console.log(`\n========================================`);
  console.log(`Hardening Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Hardening test execution error:", e);
  process.exit(1);
});
