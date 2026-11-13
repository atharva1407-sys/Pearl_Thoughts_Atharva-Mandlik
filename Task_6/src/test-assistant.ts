/**
 * Assistant tests: doctor-side tools, confirmed actions, voice logic.
 * Runs on the in-memory repository with a scripted model and a recording executor, so no network,
 * API key, browser or microphone is needed.
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "true";
process.env.APP_URL = "https://medrella-healthcare.vercel.app";

import crypto from "crypto";
import { dbRepo, type AppointmentEntity, type AvailabilityEntity, type DoctorEntity, type PatientEntity } from "./db/repo";
import {
  CONFIRMATION_TTL_MS,
  buildSystemPrompt,
  consumeNonce,
  detectConflicts,
  detectReplyLanguage,
  executeConfirmation,
  findAlternativeSlots,
  listOpenSlotsOnDate,
  resetConfirmationsForTests,
  resetRateLimitsForTests,
  runAgent,
  signConfirmation,
  summarizeStatuses,
  verifyConfirmation,
  type ActionExecutor,
  type AgentCard,
  type BookOutcome,
  type LlmClient,
  type LlmMessage,
  type LlmReply,
} from "./lib/agent";
import { istDateString } from "./lib/time";
import { DEFAULT_VAD_CONFIG, Vad } from "./lib/voice/vad";
import { speakableText, speechLangFor, splitForSpeech } from "./lib/voice/speech-text";

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, details?: string) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${details ? ` (${details})` : ""}`);
    failed++;
  }
}

class ScriptedLlm implements LlmClient {
  readonly name = "scripted";
  calls: LlmMessage[][] = [];
  constructor(private replies: Array<LlmReply>) {}
  async chat(input: { messages: LlmMessage[] }): Promise<LlmReply> {
    this.calls.push(input.messages.map((m) => ({ ...m })));
    return this.replies.shift() ?? { content: "ok", toolCalls: [] };
  }
}
const say = (content: string): LlmReply => ({ content, toolCalls: [] });
const call = (name: string, args: unknown): LlmReply => ({
  content: null,
  toolCalls: [{ id: `call_${crypto.randomUUID().slice(0, 6)}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

class FakeExecutor implements ActionExecutor {
  calls: { type: string; args: unknown[] }[] = [];
  bookResult: BookOutcome = { ok: true, message: "ok", appointmentId: "appt_fake", tokenNumber: 4 };
  cancelResult: { ok: boolean; message?: string; error?: string } = { ok: true, message: "Appointment cancelled successfully." };
  rescheduleResult: { ok: boolean; message?: string; error?: string } = { ok: true };
  async book(input: Parameters<ActionExecutor["book"]>[0]) {
    this.calls.push({ type: "book", args: [input] });
    return this.bookResult;
  }
  async cancel(id: string) {
    this.calls.push({ type: "cancel", args: [id] });
    return this.cancelResult;
  }
  async reschedule(id: string, date: string, time: string) {
    this.calls.push({ type: "reschedule", args: [id, date, time] });
    return this.rescheduleResult;
  }
  count(type: string) {
    return this.calls.filter((c) => c.type === type).length;
  }
}

async function makePatient(label: string): Promise<{ userId: string; patient: PatientEntity }> {
  const userId = `usr_${crypto.randomUUID()}`;
  await dbRepo.createUser({ id: userId, email: `${label}.${crypto.randomUUID().slice(0, 6)}@example.com`, passwordHash: "x", role: "PATIENT", isActive: true });
  const patient = await dbRepo.createPatient({
    id: `pat_${crypto.randomUUID()}`,
    userId,
    firstName: label[0].toUpperCase() + label.slice(1),
    lastName: "Tester",
    phone: "+919876543210",
  });
  return { userId, patient };
}

async function makeAppointment(
  patientId: string,
  doctorId: string,
  date: string,
  startTime: string,
  endTime: string,
  status: AppointmentEntity["status"] = "BOOKED"
): Promise<AppointmentEntity> {
  const res = await dbRepo.createAppointment({ doctorId, patientId, appointmentDate: date, startTime, endTime, reason: "visit", status });
  if (!res.success || !res.appointment) throw new Error(`could not create appointment: ${res.message}`);
  return res.appointment;
}

const addDays = (date: string, days: number) => istDateString(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + days * 86_400_000));

async function firstOpenSlot(doctorId: string, now: Date, fromDay = 2) {
  const today = istDateString(now);
  for (let i = fromDay; i <= 14; i++) {
    const date = addDays(today, i);
    const { slots } = await listOpenSlotsOnDate(dbRepo, doctorId, date, now);
    if (slots.length) return slots[0];
  }
  throw new Error("no open slot found in the seed data");
}

const toolResult = (llm: ScriptedLlm, round = 1) => JSON.parse(llm.calls[round].filter((m) => m.role === "tool").pop()?.content ?? "{}");

async function main() {
  const doctors = await dbRepo.getAllDoctors();
  const doctorA: DoctorEntity = doctors.find((d) => d.consultationFee > 0) ?? doctors[0];
  const doctorB: DoctorEntity = doctors.find((d) => d.id !== doctorA.id)!;
  const now = new Date();
  const today = istDateString(now);

  // ===================================================================================
  console.log("\n--- Confirmation tokens ---");
  resetConfirmationsForTests();
  const action = { type: "CANCEL" as const, appointmentId: "appt_1" };
  const signed = signConfirmation("user-1", action, now);
  const ok = verifyConfirmation(signed.token, "user-1", now);
  assert(ok.ok && ok.action.type === "CANCEL", "a signed token verifies for its own user");
  assert(!verifyConfirmation(signed.token, "user-2", now).ok, "a token is bound to one user");
  assert(
    (() => {
      const r = verifyConfirmation(signed.token, "user-1", new Date(now.getTime() + CONFIRMATION_TTL_MS + 1000));
      return !r.ok && r.reason === "EXPIRED";
    })(),
    "a token expires after 5 minutes"
  );
  const [payload, sig] = signed.token.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), a: { type: "CANCEL", appointmentId: "someone_elses" } })).toString("base64url");
  assert(!verifyConfirmation(`${tampered}.${sig}`, "user-1", now).ok, "editing the action invalidates the signature");
  assert(!verifyConfirmation("garbage", "user-1", now).ok && !verifyConfirmation(undefined, "user-1", now).ok && !verifyConfirmation(`${payload}.`, "user-1", now).ok, "malformed tokens are rejected");
  assert(ok.ok && consumeNonce(ok.nonce, ok.expiresAt, now.getTime()) && !consumeNonce(ok.nonce, ok.expiresAt, now.getTime()), "a token can be used only once");

  // ===================================================================================
  console.log("\n--- Patient: confirmed booking ---");
  resetConfirmationsForTests();
  resetRateLimitsForTests();
  const { userId, patient } = await makePatient("meera");
  const slot = await firstOpenSlot(doctorA.id, now);
  const base = { repo: dbRepo, userId, patient };

  const proposeLlm = new ScriptedLlm([call("propose_booking", { doctorId: doctorA.id, date: slot.date, startTime: slot.startTime, reason: "fever for two days" }), say("Please press Confirm.")]);
  const proposed = await runAgent({ ...base, llm: proposeLlm, history: [], message: "book it", now });
  const bookCard = proposed.cards[0];
  assert(bookCard?.kind === "CONFIRM" && Boolean(bookCard.confirm?.token), "booking is proposed as a confirmation card");
  assert(bookCard.lines.some((l) => /fever for two days/.test(l)), "the card shows the reason");
  assert(toolResult(proposeLlm).awaitingConfirmation === true, "the model is told the booking awaits confirmation");
  const beforeCount = (await dbRepo.getAppointmentsByPatientId(patient.id)).length;
  assert(beforeCount === 0, "nothing is booked before the patient confirms");

  const exec = new FakeExecutor();
  const confirmed = await executeConfirmation({ repo: dbRepo, userId, patient, token: bookCard.confirm!.token, executor: exec, now });
  assert(confirmed.ok && exec.count("book") === 1, "confirming runs the booking once");
  const bookArgs = exec.calls[0].args[0] as { doctorId: string; date: string; startTime: string; reason: string };
  assert(bookArgs.doctorId === doctorA.id && bookArgs.date === slot.date && bookArgs.startTime === slot.startTime && bookArgs.reason === "fever for two days", "the executor receives exactly what was approved");
  const replay = await executeConfirmation({ repo: dbRepo, userId, patient, token: bookCard.confirm!.token, executor: exec, now });
  assert(!replay.ok && replay.code === "USED" && exec.count("book") === 1, "a confirmation cannot be replayed");

  const intruder = await makePatient("intruder");
  const sneaky = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_booking", { doctorId: doctorA.id, date: slot.date, startTime: slot.startTime }), say("ok")]), history: [], message: "book", now });
  const stolen = await executeConfirmation({ repo: dbRepo, userId: intruder.userId, patient: intruder.patient, token: sneaky.cards[0].confirm!.token, executor: exec, now });
  assert(!stolen.ok && stolen.code === "INVALID" && exec.count("book") === 1, "someone else's confirmation token does nothing");

  const stale = await executeConfirmation({
    repo: dbRepo, userId, patient, token: sneaky.cards[0].confirm!.token, executor: exec,
    now: new Date(now.getTime() + CONFIRMATION_TTL_MS + 5000),
  });
  assert(!stale.ok && stale.code === "EXPIRED" && /expired/i.test(stale.message) && exec.count("book") === 1, "an expired confirmation is refused safely");
  const forged = await executeConfirmation({ repo: dbRepo, userId, patient, token: "e30.AAAA", executor: exec, now });
  assert(!forged.ok && forged.code === "INVALID", "a forged confirmation is refused");

  // paid booking returns a payment hold; failed booking changes nothing
  resetConfirmationsForTests();
  const hold = {
    provider: "MOCK" as const, orderId: "order_1", amountPaise: 80000, amountRupees: 800, currency: "INR", paymentId: "pay_1", appointmentId: "appt_hold",
    holdExpiresAt: new Date(now.getTime() + 600000).toISOString(), receiptNo: "R-1", doctorName: "Dr. X", appointmentDate: slot.date, startTime: slot.startTime,
    patientName: "Meera Tester", patientEmail: "m@example.com", patientPhone: "+911234567890",
  };
  const exec2 = new FakeExecutor();
  exec2.bookResult = { ok: true, payment: hold };
  const p2 = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_booking", { doctorId: doctorA.id, date: slot.date, startTime: slot.startTime }), say("ok")]), history: [], message: "book", now });
  const paid = await executeConfirmation({ repo: dbRepo, userId, patient, token: p2.cards[0].confirm!.token, executor: exec2, now });
  assert(paid.ok && paid.payment?.paymentId === "pay_1" && /payment/i.test(paid.message), "a paid booking returns the payment to complete, not a confirmed booking");
  const exec3 = new FakeExecutor();
  exec3.bookResult = { ok: false, error: "Online payments are not available right now." };
  const p3 = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_booking", { doctorId: doctorA.id, date: slot.date, startTime: slot.startTime }), say("ok")]), history: [], message: "book", now });
  const refused = await executeConfirmation({ repo: dbRepo, userId, patient, token: p3.cards[0].confirm!.token, executor: exec3, now });
  assert(!refused.ok && refused.code === "FAILED" && /not available/.test(refused.message), "a failed booking or payment setup reports the error safely");

  // slot taken between proposing and confirming
  resetConfirmationsForTests();
  const slot2 = await firstOpenSlot(doctorB.id, now, 3);
  const p4 = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_booking", { doctorId: doctorB.id, date: slot2.date, startTime: slot2.startTime }), say("ok")]), history: [], message: "book", now });
  for (let i = 0; i < slot2.seatsLeft; i++) {
    const other = await makePatient(`filler${i}`);
    await makeAppointment(other.patient.id, doctorB.id, slot2.date, slot2.startTime, slot2.endTime);
  }
  const exec4 = new FakeExecutor();
  const taken = await executeConfirmation({ repo: dbRepo, userId, patient, token: p4.cards[0].confirm!.token, executor: exec4, now });
  assert(!taken.ok && taken.code === "SLOT_TAKEN" && exec4.count("book") === 0, "the slot is revalidated at confirmation and nothing is booked if it was taken");
  assert(Boolean(taken.cards?.[0]?.options?.length) && !taken.cards![0].options!.some((o) => o.message.includes(`${slot2.date} at ${slot2.startTime}`)), "alternative times are offered, without the taken one");

  // proposing a taken slot is refused and offers alternatives
  const p5 = new ScriptedLlm([call("propose_booking", { doctorId: doctorB.id, date: slot2.date, startTime: slot2.startTime }), say("sorry")]);
  const refusedProposal = await runAgent({ ...base, llm: p5, history: [], message: "book", now });
  assert(refusedProposal.cards.every((c) => c.kind !== "CONFIRM"), "a taken slot cannot even be proposed");

  // alternatives
  const altLlm = new ScriptedLlm([call("suggest_alternative_slots", { doctorId: doctorB.id, date: slot2.date, preferredTime: slot2.startTime }), say("here")]);
  const alt = await runAgent({ ...base, llm: altLlm, history: [], message: "something else", now });
  const altCard = alt.cards[0];
  assert(altCard?.kind === "SLOTS" && (altCard.options?.length ?? 0) > 0, "alternative slots come back as tappable options");
  assert(!JSON.stringify(toolResult(altLlm)).includes(`"startTime":"${slot2.startTime}","session"`) || toolResult(altLlm).slots.every((s: any) => !(s.date === slot2.date && s.startTime === slot2.startTime)), "alternatives never include the full slot");

  // duplicate booking the same day
  const dupAppt = await makeAppointment(patient.id, doctorA.id, addDays(today, 9), "06:00", "06:14");
  void dupAppt;

  // ===================================================================================
  console.log("\n--- Patient: confirmed cancel and reschedule ---");
  resetConfirmationsForTests();
  const cancelDate = addDays(today, 6);
  const mine = await makeAppointment(patient.id, doctorA.id, cancelDate, "07:00", "07:14");
  await dbRepo.createPayment({
    id: `pay_${crypto.randomUUID()}`, appointmentId: mine.id, patientId: patient.id, provider: "MOCK", providerOrderId: `order_${crypto.randomUUID()}`,
    amountPaise: 50000, currency: "INR", status: "PAID", receiptNo: `RCT-${crypto.randomUUID().slice(0, 6)}`,
  });
  const cancelLlm = new ScriptedLlm([call("propose_cancel_appointment", { appointmentId: mine.id }), say("confirm please")]);
  const cancelProposal = await runAgent({ ...base, llm: cancelLlm, history: [], message: "cancel", now });
  const cancelCard = cancelProposal.cards[0];
  assert(cancelCard?.confirm?.action === "CANCEL" && cancelCard.confirm.destructive === true, "cancelling is proposed as a destructive confirmation");
  assert(cancelCard.lines.some((l) => /Refund: ₹500\.00 \(100%\)|Refund: ₹500 \(100%\)/.test(l)), "the cancel card shows the refund before confirming", cancelCard.lines.join(" | "));
  assert((await dbRepo.getAppointmentById(mine.id))?.status === "BOOKED", "proposing a cancel does not cancel");
  const execC = new FakeExecutor();
  const cancelled = await executeConfirmation({ repo: dbRepo, userId, patient, token: cancelCard.confirm!.token, executor: execC, now });
  assert(cancelled.ok && execC.count("cancel") === 1 && execC.calls[0].args[0] === mine.id, "confirming runs the cancellation for that appointment");

  const otherAppt = await makeAppointment(intruder.patient.id, doctorA.id, addDays(today, 7), "07:00", "07:14");
  const peek = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_cancel_appointment", { appointmentId: otherAppt.id }), say("no")]), history: [], message: "cancel theirs", now });
  assert(peek.cards.length === 0, "another patient's appointment cannot be proposed for cancellation");

  const soon = await makeAppointment(patient.id, doctorA.id, today, "23:50", "23:59");
  const lateLlm = new ScriptedLlm([call("propose_cancel_appointment", { appointmentId: soon.id }), say("late")]);
  const nowLate = new Date(`${today}T23:30:00+05:30`);
  const late = await runAgent({ ...base, llm: lateLlm, history: [], message: "cancel", now: nowLate });
  assert(late.cards.length === 0 && /1 hour/.test(JSON.stringify(toolResult(lateLlm))), "the 1-hour cancellation rule is explained, not bypassed");

  const slot3 = await firstOpenSlot(doctorA.id, now, 4);
  const target = await makeAppointment(patient.id, doctorA.id, addDays(today, 8), "07:30", "07:44");
  const reLlm = new ScriptedLlm([call("propose_reschedule_appointment", { appointmentId: target.id, newDate: slot3.date, newStartTime: slot3.startTime }), say("confirm")]);
  const reProposal = await runAgent({ ...base, llm: reLlm, history: [], message: "move it", now });
  const reCard = reProposal.cards[0];
  assert(reCard?.confirm?.action === "RESCHEDULE", "rescheduling is proposed as a confirmation card");
  const execR = new FakeExecutor();
  const moved = await executeConfirmation({ repo: dbRepo, userId, patient, token: reCard.confirm!.token, executor: execR, now });
  assert(moved.ok && execR.count("reschedule") === 1 && JSON.stringify(execR.calls[0].args) === JSON.stringify([target.id, slot3.date, slot3.startTime]), "confirming runs the reschedule with the approved slot");
  const sameTime = new ScriptedLlm([call("propose_reschedule_appointment", { appointmentId: target.id, newDate: target.appointmentDate, newStartTime: target.startTime }), say("no")]);
  assert((await runAgent({ ...base, llm: sameTime, history: [], message: "same", now })).cards.length === 0, "rescheduling to the same time is refused");

  const execFail = new FakeExecutor();
  execFail.cancelResult = { ok: false, error: "Cancellations are only permitted up to 1 hour prior." };
  const target2 = await makeAppointment(patient.id, doctorA.id, addDays(today, 10), "07:00", "07:14");
  const p6 = await runAgent({ ...base, llm: new ScriptedLlm([call("propose_cancel_appointment", { appointmentId: target2.id }), say("ok")]), history: [], message: "cancel", now });
  const failedCancel = await executeConfirmation({ repo: dbRepo, userId, patient, token: p6.cards[0].confirm!.token, executor: execFail, now });
  assert(!failedCancel.ok && /1 hour/.test(failedCancel.message), "a refused cancellation surfaces the real reason");

  // ===================================================================================
  console.log("\n--- Patient: history, payments, prescriptions ---");
  const listLlm = new ScriptedLlm([call("list_my_appointments", { scope: "upcoming" }), say("listed")]);
  await runAgent({ ...base, llm: listLlm, history: [], message: "my upcoming", now });
  const upcoming = toolResult(listLlm).appointments as { date: string; status: string }[];
  assert(upcoming.length > 0 && upcoming.every((a) => a.date >= today && ["BOOKED", "PENDING_PAYMENT"].includes(a.status)), "upcoming scope returns only future active appointments");
  const pastDone = await makeAppointment(patient.id, doctorA.id, addDays(today, -3), "09:00", "09:14");
  await dbRepo.updateAppointmentStatus(pastDone.id, "COMPLETED");
  const pastLlm = new ScriptedLlm([call("list_my_appointments", { scope: "past" }), say("listed")]);
  await runAgent({ ...base, llm: pastLlm, history: [], message: "my past", now });
  const past = toolResult(pastLlm).appointments as { appointmentId: string; status: string }[];
  assert(past.some((a) => a.appointmentId === pastDone.id) && !past.some((a) => a.status === "BOOKED"), "past scope includes completed visits and no active ones");

  const payLlm = new ScriptedLlm([call("list_my_payments", {}), say("payments")]);
  await runAgent({ ...base, llm: payLlm, history: [], message: "my payments", now });
  const payData = toolResult(payLlm);
  assert(payData.count >= 1 && /₹500/.test(JSON.stringify(payData)), "list_my_payments shows the patient's payments");
  assert(!/providerOrderId|providerPaymentId|order_/.test(JSON.stringify(payData)), "payment history leaks no gateway identifiers");
  const intruderPay = new ScriptedLlm([call("list_my_payments", {}), say("none")]);
  await runAgent({ repo: dbRepo, userId: intruder.userId, patient: intruder.patient, llm: intruderPay, history: [], message: "payments", now });
  assert(toolResult(intruderPay).count === 0, "another patient's payments are not visible");

  const refundPay = (await dbRepo.getPaymentsByPatientId(patient.id))[0];
  await dbRepo.createRefund({
    id: `ref_${crypto.randomUUID()}`, paymentId: refundPay.id, appointmentId: refundPay.appointmentId, amountPaise: 50000, reason: "test",
    status: "PENDING", idempotencyKey: `idem_${crypto.randomUUID()}`,
  });
  const refundLlm = new ScriptedLlm([call("list_my_payments", {}), say("refunds")]);
  await runAgent({ ...base, llm: refundLlm, history: [], message: "refund status", now });
  assert(/Refund in progress/.test(JSON.stringify(toolResult(refundLlm))), "refund status is shown in plain words");

  const rxLlm0 = new ScriptedLlm([call("list_my_prescriptions", {}), say("none")]);
  await runAgent({ ...base, llm: rxLlm0, history: [], message: "prescriptions", now });
  assert(toolResult(rxLlm0).count === 0, "no prescriptions are reported before a doctor writes one");
  await dbRepo.upsertPrescription({ appointmentId: pastDone.id, doctorId: doctorA.id, patientId: patient.id, medicines: [{ name: "Paracetamol 500 mg", dosage: "1 tablet", frequency: "Twice a day", duration: "3 days" }], notes: "Drink water." });
  await dbRepo.upsertPrescription({ appointmentId: pastDone.id, doctorId: doctorA.id, patientId: patient.id, medicines: [{ name: "Paracetamol 650 mg", dosage: "1 tablet", frequency: "Twice a day", duration: "3 days" }] });
  const rxLlm = new ScriptedLlm([call("list_my_prescriptions", {}), say("here")]);
  await runAgent({ ...base, llm: rxLlm, history: [], message: "prescriptions", now });
  const rx = toolResult(rxLlm);
  assert(rx.count === 1 && rx.prescriptions[0].medicines[0].name === "Paracetamol 650 mg", "a prescription is read back, and editing replaces it instead of duplicating");
  const rxOther = new ScriptedLlm([call("list_my_prescriptions", {}), say("none")]);
  await runAgent({ repo: dbRepo, userId: intruder.userId, patient: intruder.patient, llm: rxOther, history: [], message: "prescriptions", now });
  assert(toolResult(rxOther).count === 0, "another patient's prescription is not visible");

  // ===================================================================================
  console.log("\n--- Doctor assistant ---");
  const docUserId = doctorA.userId;
  const docBase = { repo: dbRepo, userId: docUserId, doctor: doctorA };
  const pat1 = await makePatient("kavya");
  const pat2 = await makePatient("lalit");
  const todayAppt = await makeAppointment(pat1.patient.id, doctorA.id, today, "11:00", "11:14");
  const futureAppt = await makeAppointment(pat2.patient.id, doctorA.id, addDays(today, 3), "11:00", "11:14");
  const otherDoctorAppt = await makeAppointment(pat1.patient.id, doctorB.id, today, "11:00", "11:14");
  await dbRepo.updateAppointmentStatus(futureAppt.id, "CANCELLED");

  const dPrompt = new ScriptedLlm([say("Hello Doctor")]);
  const dReply = await runAgent({ ...docBase, llm: dPrompt, history: [], message: "hi", now });
  assert(dReply.role === "DOCTOR" && /doctor/i.test(dPrompt.calls[0][0].content ?? "") && /cannot change appointments/i.test(dPrompt.calls[0][0].content ?? ""), "the doctor assistant has its own prompt and is read-only");
  assert(!/propose_booking|propose_cancel/.test(dPrompt.calls[0][0].content ?? ""), "the doctor prompt does not mention patient booking tools");

  const apptLlm = new ScriptedLlm([call("get_my_appointments", {}), say("today")]);
  const apptRes = await runAgent({ ...docBase, llm: apptLlm, history: [], message: "today?", now });
  const apptData = toolResult(apptLlm);
  const ids = (apptData.appointments as { appointmentId: string }[]).map((a) => a.appointmentId);
  assert(ids.includes(todayAppt.id) && !ids.includes(otherDoctorAppt.id), "get_my_appointments shows only this doctor's appointments for today by default");
  assert(!/phone|email|\+91|@/.test(JSON.stringify(apptData)), "patient contact details are never returned to the assistant");
  assert(apptRes.cards[0]?.kind === "INFO", "doctor answers come with info cards");
  const rangeLlm = new ScriptedLlm([call("get_my_appointments", { startDate: today, endDate: addDays(today, 5), status: "CANCELLED" }), say("range")]);
  await runAgent({ ...docBase, llm: rangeLlm, history: [], message: "cancelled this week", now });
  assert((toolResult(rangeLlm).appointments as { appointmentId: string }[]).some((a) => a.appointmentId === futureAppt.id), "date ranges and status filters work");
  const hugeLlm = new ScriptedLlm([call("get_my_appointments", { startDate: "2020-01-01", endDate: "2026-12-31" }), say("too much")]);
  await runAgent({ ...docBase, llm: hugeLlm, history: [], message: "everything", now });
  assert(/at most/.test(JSON.stringify(toolResult(hugeLlm))), "huge date ranges are refused");

  const statsLlm = new ScriptedLlm([call("get_appointment_stats", { startDate: addDays(today, -5), endDate: addDays(today, 10) }), say("stats")]);
  await runAgent({ ...docBase, llm: statsLlm, history: [], message: "stats", now });
  const stats = toolResult(statsLlm).stats;
  assert(stats.cancelled >= 1 && stats.booked >= 1 && stats.total >= stats.cancelled + stats.booked, "statistics count appointments by status");
  const s2 = summarizeStatuses([{ status: "COMPLETED" }, { status: "COMPLETED" }, { status: "NO_SHOW" }, { status: "BOOKED" }, { status: "CANCELLED" }]);
  assert(s2.total === 5 && s2.completionRate === 50 && s2.noShow === 1, "completion rate is completed over due visits");

  const schedLlm = new ScriptedLlm([call("get_my_schedule", { date: addDays(today, 2) }), say("schedule")]);
  await runAgent({ ...docBase, llm: schedLlm, history: [], message: "my hours", now });
  const sched = toolResult(schedLlm);
  assert(Array.isArray(sched.shifts) && sched.shifts.length > 0 && Boolean(sched.shifts[0].hours) && sched.day?.date === addDays(today, 2), "working hours and the chosen day are reported");
  const leaveDate = addDays(today, 20);
  await dbRepo.addDoctorLeave(doctorB.id, leaveDate, "Conference");
  const leaveLlm = new ScriptedLlm([call("get_my_schedule", { date: leaveDate }), say("leave")]);
  await runAgent({ repo: dbRepo, userId: doctorB.userId, doctor: doctorB, llm: leaveLlm, history: [], message: "leave?", now });
  const leaveData = toolResult(leaveLlm);
  assert(leaveData.day.onLeave === true && leaveData.upcomingLeaves.some((l: any) => l.date === leaveDate), "leaves are reported");
  const leaveOther = new ScriptedLlm([call("get_my_schedule", {}), say("none")]);
  await runAgent({ ...docBase, llm: leaveOther, history: [], message: "my leaves", now });
  assert(!toolResult(leaveOther).upcomingLeaves.some((l: any) => l.date === leaveDate), "another doctor's leaves are not visible");

  const openDay = (await firstOpenSlot(doctorA.id, now, 1)).date;
  const openLlm = new ScriptedLlm([call("get_my_open_slots", { date: openDay }), say("open")]);
  const openRes = await runAgent({ ...docBase, llm: openLlm, history: [], message: "free slots that day?", now });
  const openData = toolResult(openLlm);
  assert(openData.totalOpen > 0 && openData.slots.length > 0 && openData.slots.every((s: any) => s.seatsLeft > 0) && openRes.cards[0]?.kind === "INFO", "open slots on a chosen date are listed with seats left");
  const bookedSlot = await firstOpenSlot(doctorA.id, now, 1);
  for (let i = 0; i < bookedSlot.seatsLeft; i++) {
    const filler = await makePatient(`doctorfill${i}`);
    await makeAppointment(filler.patient.id, doctorA.id, bookedSlot.date, bookedSlot.startTime, bookedSlot.endTime);
  }
  const fullLlm = new ScriptedLlm([call("get_my_open_slots", { date: bookedSlot.date }), say("full")]);
  await runAgent({ ...docBase, llm: fullLlm, history: [], message: "free that day?", now });
  assert(!toolResult(fullLlm).slots.some((s: any) => s.startTime === bookedSlot.startTime), "a fully booked slot is not listed as open");
  const pastOpen = new ScriptedLlm([call("get_my_open_slots", { date: addDays(today, -1) }), say("past")]);
  await runAgent({ ...docBase, llm: pastOpen, history: [], message: "yesterday", now });
  assert(/past/.test(JSON.stringify(toolResult(pastOpen))), "open slots in the past are refused");
  const leaveOpen = new ScriptedLlm([call("get_my_open_slots", { date: leaveDate }), say("leave")]);
  await runAgent({ repo: dbRepo, userId: doctorB.userId, doctor: doctorB, llm: leaveOpen, history: [], message: "leave day", now });
  assert(toolResult(leaveOpen).onLeave === true && toolResult(leaveOpen).totalOpen === 0, "a leave day reports no open slots");

  const nextLlm = new ScriptedLlm([call("get_next_available_slot", {}), say("next")]);
  await runAgent({ ...docBase, llm: nextLlm, history: [], message: "next free slot", now });
  const next = toolResult(nextLlm);
  assert(Boolean(next.next?.startTime) && next.next.date >= today && next.slots.length <= 3, "the next available slot is found");

  const sugLlm = new ScriptedLlm([call("suggest_reschedule_slots", { appointmentId: todayAppt.id }), say("suggest")]);
  const sugRes = await runAgent({ ...docBase, llm: sugLlm, history: [], message: "move kavya", now });
  const sug = toolResult(sugLlm);
  assert(sug.suggestions.length > 0 && sug.suggestions.every((s: any) => !(s.date === todayAppt.appointmentDate && s.startTime === todayAppt.startTime)), "reschedule suggestions exclude the current slot");
  assert(sugRes.cards[0]?.href === "/doctor/dashboard", "suggestions point to the dashboard for the actual change");
  const sugOther = new ScriptedLlm([call("suggest_reschedule_slots", { appointmentId: otherDoctorAppt.id }), say("no")]);
  await runAgent({ ...docBase, llm: sugOther, history: [], message: "move that", now });
  assert(/not found/i.test(JSON.stringify(toolResult(sugOther))), "a doctor cannot get suggestions for another doctor's appointment");

  // role separation
  const patientTool = new ScriptedLlm([call("propose_booking", { doctorId: doctorA.id, date: addDays(today, 3), startTime: "10:00" }), say("done")]);
  const crossed = await runAgent({ ...docBase, llm: patientTool, history: [], message: "book for me", now });
  assert(crossed.cards.length === 0 && /unknown tool/i.test(JSON.stringify(toolResult(patientTool))), "a doctor cannot reach patient tools");
  const doctorTool = new ScriptedLlm([call("get_my_appointments", {}), say("done")]);
  await runAgent({ ...base, llm: doctorTool, history: [], message: "show doctor data", now });
  assert(/unknown tool/i.test(JSON.stringify(toolResult(doctorTool))), "a patient cannot reach doctor tools");
  let threw = false;
  try {
    await runAgent({ repo: dbRepo, userId: "x", llm: new ScriptedLlm([]), history: [], message: "hi" });
  } catch {
    threw = true;
  }
  assert(threw, "an agent turn without a patient or doctor is refused");

  // conflict detection through the tool
  const oddPat = await makePatient("oddhour");
  await makeAppointment(oddPat.patient.id, doctorA.id, addDays(today, 2), "03:00", "03:14");
  const conflictLlm = new ScriptedLlm([call("find_schedule_conflicts", {}), say("conflicts")]);
  await runAgent({ ...docBase, llm: conflictLlm, history: [], message: "conflicts?", now });
  const conflicts = toolResult(conflictLlm);
  assert(conflicts.conflictCount >= 1 && conflicts.conflicts.some((c: any) => c.kind === "OUTSIDE_HOURS"), "an appointment outside working hours is flagged");

  // ===================================================================================
  console.log("\n--- Conflict detection (pure) ---");
  const session = (over: Partial<AvailabilityEntity> = {}): AvailabilityEntity => ({
    id: "s1", doctorId: "d1", name: "Morning", dayOfWeek: "MON", startTime: "09:00", endTime: "13:00", slotDurationMinutes: 20, isActive: true,
    schedulingType: "STREAM", patientsPerWave: 1, recurrence: "WEEKLY", ...over,
  });
  const monday = "2026-11-16"; // a Monday
  const ap = (id: string, start: string, end: string, status = "BOOKED", name = id, date = monday) => ({ id, patientName: name, appointmentDate: date, startTime: start, endTime: end, status });
  const fixedNow = new Date("2026-11-10T08:00:00+05:30");
  assert(detectConflicts({ appointments: [ap("a", "09:00", "09:20"), ap("b", "09:20", "09:40")], sessions: [session()], leaveDates: [], now: fixedNow }).length === 0, "back-to-back visits are not a conflict");
  const overlap = detectConflicts({ appointments: [ap("a", "09:00", "09:20"), ap("b", "09:10", "09:30")], sessions: [session()], leaveDates: [], now: fixedNow });
  assert(overlap.some((c) => c.kind === "OVERLAP"), "overlapping visits are detected");
  const over = detectConflicts({ appointments: [ap("a", "09:00", "09:20"), ap("b", "09:00", "09:20")], sessions: [session()], leaveDates: [], now: fixedNow });
  assert(over.some((c) => c.kind === "OVER_CAPACITY"), "more patients than a slot allows is detected");
  assert(detectConflicts({ appointments: [ap("a", "09:00", "09:20"), ap("b", "09:00", "09:20")], sessions: [session({ patientsPerWave: 2 })], leaveDates: [], now: fixedNow }).length === 0, "wave capacity allows several patients in one slot");
  assert(detectConflicts({ appointments: [ap("a", "09:00", "09:20")], sessions: [session()], leaveDates: [monday], now: fixedNow }).some((c) => c.kind === "ON_LEAVE"), "a visit on a leave day is detected");
  assert(detectConflicts({ appointments: [ap("a", "15:00", "15:20")], sessions: [session()], leaveDates: [], now: fixedNow }).some((c) => c.kind === "OUTSIDE_HOURS"), "a visit outside working hours is detected");
  assert(detectConflicts({ appointments: [ap("a", "09:00", "09:20", "CANCELLED"), ap("b", "09:00", "09:20", "COMPLETED"), ap("c", "09:00", "09:20", "EXPIRED")], sessions: [session()], leaveDates: [monday], now: fixedNow }).length === 0, "cancelled, finished and expired visits never conflict");
  assert(detectConflicts({ appointments: [{ ...ap("a", "09:00", "09:20", "PENDING_PAYMENT"), holdExpiresAt: new Date("2026-11-10T07:00:00+05:30") }], sessions: [session()], leaveDates: [monday], now: fixedNow }).length === 0, "an expired payment hold is not a conflict");

  // ===================================================================================
  console.log("\n--- Slot search ---");
  const alts = await findAlternativeSlots(dbRepo, { doctorId: doctorA.id, date: addDays(today, 1), now, limit: 5 });
  assert(alts.length > 0 && alts.length <= 5 && alts.every((s) => s.date >= today), "alternatives are future open slots, capped");
  const first = alts[0];
  const without = await findAlternativeSlots(dbRepo, { doctorId: doctorA.id, date: first.date, exclude: { date: first.date, startTime: first.startTime }, now, limit: 5 });
  assert(!without.some((s) => s.date === first.date && s.startTime === first.startTime), "an excluded slot is left out");
  assert((await findAlternativeSlots(dbRepo, { doctorId: doctorA.id, date: addDays(today, 90), now })).length === 0, "nothing is offered beyond the booking window");

  // ===================================================================================
  console.log("\n--- Languages and prompts ---");
  assert(detectReplyLanguage("Mujhe kal cardiologist ka appointment chahiye") === "Hinglish", "Hinglish is recognised");
  assert(detectReplyLanguage("I would like to book a cardiologist for tomorrow") === null, "plain English is not mistaken for Hinglish");
  assert(detectReplyLanguage("Show my appointment please, what is the fee") === null, "English with a few shared words stays English");
  const hinglishLlm = new ScriptedLlm([say("Theek hai")]);
  await runAgent({ ...base, llm: hinglishLlm, history: [], message: "Mujhe kal doctor ka slot dikhao, abhi chahiye", now });
  assert(/Hinglish/.test(hinglishLlm.calls[0].filter((m) => m.role === "user").pop()?.content ?? ""), "a Hinglish message gets a Hinglish reply instruction");
  const englishLlm = new ScriptedLlm([say("Sure")]);
  await runAgent({ ...base, llm: englishLlm, history: [], message: "When is my next free slot?", now });
  assert(/in English/.test(englishLlm.calls[0].filter((m) => m.role === "user").pop()?.content ?? ""), "an English message gets an explicit English reply instruction (models drift to Hindi otherwise)");
  assert(/Hinglish/.test(buildSystemPrompt({ role: "PATIENT", name: "Asha", now })) && /confirm/i.test(buildSystemPrompt({ role: "PATIENT", name: "Asha", now })), "the patient prompt covers Hinglish and confirmation");

  // ===================================================================================
  console.log("\n--- Voice: speech text ---");
  assert(speakableText("**Dr. Rao** is free at *10:15*. See https://x.test/a ✅") === "Dr. Rao is free at 10:15. See", "markdown, links and emoji are not read aloud", speakableText("**Dr. Rao** is free at *10:15*. See https://x.test/a ✅"));
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const parts = splitForSpeech(long);
  assert(parts.length > 1 && parts.every((p) => p.length <= 180) && parts.join(" ").replace(/\s+/g, " ") === long, "long replies are split into short, lossless chunks");
  assert(splitForSpeech("नमस्ते। आप कैसे हैं? मैं ठीक हूँ।").length >= 1 && splitForSpeech("नमस्ते। आप कैसे हैं?")[0].includes("नमस्ते"), "Hindi sentences split on the danda");
  assert(speechLangFor("आपकी अपॉइंटमेंट बुक हो गई") === "hi-IN" && speechLangFor("तुमची भेट आहे") === "mr-IN" && speechLangFor("Your appointment is booked") === "en-IN" && speechLangFor("Aapki appointment book ho gayi") === "en-IN", "the speech language follows the reply's language");

  // ===================================================================================
  console.log("\n--- Voice: hands-free detection ---");
  const cfg = DEFAULT_VAD_CONFIG;
  const run = (vad: Vad, from: number, ms: number, level: number) => {
    const events: string[] = [];
    for (let t = from; t < from + ms; t += 50) events.push(vad.push(level, t));
    return events.filter((e) => e !== "none");
  };
  {
    const vad = new Vad();
    vad.setMode("listening", 0);
    assert(run(vad, 0, 2000, 0.005).length === 0, "silence produces no events");
    assert(run(vad, 2000, 600, 0.08).includes("speech-start"), "sustained speech starts an utterance");
    const end = run(vad, 2600, 2000, 0.005);
    assert(end.includes("speech-end"), "a pause after speech ends the utterance, with no mic click");
  }
  {
    const vad = new Vad();
    vad.setMode("listening", 0);
    assert(run(vad, 0, 100, 0.5).length === 0, "a short click or cough is ignored");
    const vad2 = new Vad();
    vad2.setMode("listening", 0);
    run(vad2, 0, 200, 0.08);
    assert(run(vad2, 200, 2000, 0.0).includes("utterance-too-short"), "a very short sound is discarded");
  }
  {
    const vad = new Vad();
    vad.setMode("listening", 0);
    assert(run(vad, 0, cfg.idleResetMs + 500, 0.001).includes("idle-reset"), "long silence asks for the recording to restart");
    const vad2 = new Vad();
    vad2.setMode("listening", 0);
    assert(run(vad2, 0, cfg.maxUtteranceMs + 1000, 0.08).includes("max-length"), "a never-ending utterance is cut off");
  }
  {
    const vad = new Vad();
    vad.setMode("paused", 0);
    assert(run(vad, 0, 3000, 0.5).length === 0, "the microphone is ignored while the assistant is thinking");
  }
  {
    const vad = new Vad();
    vad.setMode("speaking", 0);
    assert(run(vad, 0, 3000, 0.08).length === 0, "the assistant's own voice (moderate level) does not interrupt it");
    assert(run(vad, 3000, 150, 0.4).length === 0, "a brief loud blip over the assistant does not interrupt it");
    const vad2 = new Vad();
    vad2.setMode("speaking", 0);
    const events = run(vad2, 0, 800, 0.4);
    assert(events.includes("barge-in") && vad2.currentMode === "listening" && vad2.isHearingSpeech, "the user talking over the assistant interrupts it and starts an utterance");
    assert(run(vad2, 800, 2500, 0.001).includes("speech-end"), "the interrupting utterance ends normally after a pause");
  }

  console.log(`\nAssistant tests: ${passed} passed, ${failed} failed (of ${total})`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error in assistant test suite:", err);
  process.exit(1);
});
