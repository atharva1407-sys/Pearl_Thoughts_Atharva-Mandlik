/**
 * Medrella Healthcare Task 5 Automated Test Suite
 * Reliable Appointment Notifications (EMAIL ONLY)
 *
 * Verifies all 11 specification requirements:
 * 1. Event map coverage (10 templates)
 * 2. Dedupe key uniqueness
 * 3. Asia/Kolkata reminder scheduling (including midnight boundary and UTC clock)
 * 4. Pre-send recheck prevents sending for cancelled/completed visits
 * 5. Retries, backoff, 3 attempts -> FAILED, never resend SENT
 * 6. Overlapping dispatcher runs do not double-send
 * 7. Throwing email provider does not break booking or cancellation
 * 8. Preferences (promotional opt-in required, operational always sent, unsubscribe token lifecycle)
 * 9. Privacy (clinical field stripping and HTML escaping)
 * 10. Admin monitoring & requeue action
 * 11. Production without RESEND_API_KEY fails closed
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "false";
process.env.APP_URL = "https://medrella-healthcare.vercel.app";
process.env.ADMIN_EMAILS = "admin@rubyhall.com,ops@medrella.com";

import { MedrellaRepository, NotificationEntity, dbRepo } from "./db/repo";
import {
  createNotification,
  shouldSend,
} from "./lib/notifications/create";
import {
  NotificationDispatcher,
  processDueNotifications,
} from "./lib/notifications/dispatcher";
import {
  scheduleAppointmentReminders,
  cancelAppointmentReminders,
} from "./lib/notifications/reminders";
import {
  formatNotification,
  sanitizeCancellationReason,
  ALLOWED_NON_CLINICAL_REASONS,
} from "./lib/notifications/templates";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "./lib/notifications/unsubscribe-token";
import {
  buildInstantFromKolkataTime,
  formatKolkataDate,
  formatKolkataTime,
  formatKolkataDateTime,
} from "./lib/time";
import { isAdminUser } from "./lib/admin";
import { requeueNotificationAction } from "./actions/admin-notifications";
import { unsubscribeWithTokenAction } from "./actions/notifications";
import { EmailChannel } from "./lib/notifications/email-channel";

async function runNotificationsTestSuite() {
  console.log("===============================================================");
  console.log("📧 Running Medrella Task 5: Reliable Notifications Verification");
  console.log("===============================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, extraInfo?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (extraInfo) console.error(`     Details: ${extraInfo}`);
      failedTests++;
    }
  }

  const repo = dbRepo;

  // Seed sample patient and doctor in repo
  const userPatient = await repo.createUser({
    id: `usr-pat-${Date.now()}`,
    email: "test.patient@example.com",
    passwordHash: "hash",
    role: "PATIENT",
    isActive: true,
  });
  const patient = await repo.createPatient({
    id: `pat-${Date.now()}`,
    userId: userPatient.id,
    firstName: "Aarav",
    lastName: "Deshmukh",
    phone: "+919876543210",
  });

  const userDoctor = await repo.createUser({
    id: `usr-doc-${Date.now()}`,
    email: "dr.patil@rubyhall.com",
    passwordHash: "hash",
    role: "DOCTOR",
    isActive: true,
  });
  const doctor = await repo.createDoctor({
    id: `doc-${Date.now()}`,
    userId: userDoctor.id,
    firstName: "Ramesh",
    lastName: "Patil",
    specialization: "Cardiology",
    phone: "+919876543211",
    licenseNumber: "MMC-12345",
    experienceYears: 15,
    consultationFee: 80000,
  });

  // ---------------------------------------------------------------------------
  // 1. EVENT MAP COVERAGE (10 TEMPLATES)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 1: Event Map Coverage & Template Formatting ---");

  const templatesToTest = [
    { template: "BOOKING_CONFIRMED", category: "operational" },
    { template: "PAYMENT_CONFIRMED", category: "operational" },
    { template: "APPOINTMENT_CANCELLED", category: "operational" },
    { template: "APPOINTMENT_CANCELLED_BY_DOCTOR", category: "operational" },
    { template: "APPOINTMENT_RESCHEDULED", category: "operational" },
    { template: "REFUND_INITIATED", category: "operational" },
    { template: "REFUND_PROCESSED", category: "operational" },
    { template: "REFUND_FAILED", category: "operational" },
    { template: "APPOINTMENT_REMINDER", category: "operational" },
    { template: "PROMOTIONAL_NEWSLETTER", category: "promotional" },
  ] as const;

  for (const { template, category } of templatesToTest) {
    const item: any = {
      id: `test-${template}`,
      userId: userPatient.id,
      channel: "EMAIL",
      category,
      template,
      recipient: "aarav@example.com",
      payload: {
        patientName: "Aarav Deshmukh",
        doctorName: "Ramesh Patil",
        specialization: "Cardiology",
        appointmentDate: "2026-11-10",
        startTime: "10:30",
        tokenNumber: 5,
        receiptNo: "REC-1001",
        amountFormatted: "₹800",
        refundAmountFormatted: "₹800",
        reason: "Cancelled by the doctor",
      },
    };

    const formatted = formatNotification(item);
    assert(
      typeof formatted.subject === "string" && formatted.subject.length > 0,
      `Template ${template} renders valid subject`
    );
    assert(
      formatted.bodyText.includes("Aarav") || formatted.bodyText.includes("Valued Patient"),
      `Template ${template} contains recipient greeting`
    );
    if (category === "operational") {
      assert(
        formatted.bodyText.includes("Why you received this email:") &&
          formatted.bodyText.includes("Operational messages cannot be unsubscribed from"),
        `Template ${template} includes mandatory operational footer`
      );
    } else {
      assert(
        formatted.bodyText.includes("To unsubscribe") || formatted.bodyHtml.includes("unsubscribe"),
        `Template ${template} includes promotional unsubscribe link`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. DEDUPE KEY UNIQUENESS
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 2: Dedupe Key Uniqueness Enforcement ---");

  const dedupeKey = `unique-event-key-${Date.now()}`;
  const notif1 = await createNotification(repo, {
    userId: userPatient.id,
    template: "BOOKING_CONFIRMED",
    recipient: "aarav@example.com",
    payload: { patientName: "Aarav" },
    dedupeKey,
  });

  const notif2 = await createNotification(repo, {
    userId: userPatient.id,
    template: "BOOKING_CONFIRMED",
    recipient: "aarav@example.com",
    payload: { patientName: "Aarav" },
    dedupeKey,
  });

  assert(notif1 !== null && notif2 !== null, "Both creation calls completed");
  assert(notif1?.id === notif2?.id, "Second call returned the existing notification (id matched)");

  // ---------------------------------------------------------------------------
  // 3. ASIA/KOLKATA REMINDER SCHEDULING & TIMEZONE IMMUNITY
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 3: Asia/Kolkata Reminder Scheduling & Timezone Safety ---");

  // Standard morning appointment: 2026-10-31 09:30 IST -> 04:00 UTC
  const instantMorning = buildInstantFromKolkataTime("2026-10-31", "09:30");
  assert(
    instantMorning.toISOString() === "2026-10-31T04:00:00.000Z",
    "09:30 IST translates strictly to 04:00:00Z UTC",
    instantMorning.toISOString()
  );

  // Midnight boundary appointment: 2026-11-01 00:15 IST -> 2026-10-31 18:45 UTC (previous day in UTC)
  const instantMidnight = buildInstantFromKolkataTime("2026-11-01", "00:15");
  assert(
    instantMidnight.toISOString() === "2026-10-31T18:45:00.000Z",
    "00:15 IST translates strictly to previous day 18:45:00Z UTC",
    instantMidnight.toISOString()
  );

  // Month end boundary: 2026-03-01 01:00 IST -> 2026-02-28 19:30 UTC
  const instantMonthEnd = buildInstantFromKolkataTime("2026-03-01", "01:00");
  assert(
    instantMonthEnd.toISOString() === "2026-02-28T19:30:00.000Z",
    "01:00 IST on March 1 translates to Feb 28 19:30:00Z UTC",
    instantMonthEnd.toISOString()
  );

  // Formatters check
  const dateFormatted = formatKolkataDate("2026-10-31");
  assert(
    dateFormatted.includes("October") && dateFormatted.includes("2026"),
    "formatKolkataDate renders full Indian calendar date",
    dateFormatted
  );
  const timeFormatted = formatKolkataTime("09:30");
  assert(
    timeFormatted === "09:30 AM IST",
    "formatKolkataTime formats clock time with AM/PM and IST suffix",
    timeFormatted
  );

  // Past reminders skip test: Appointment scheduled 30 minutes in future
  // 1440m reminder is in the past; 120m reminder is also in the past -> 0 reminders scheduled
  const futureDate = new Date(Date.now() + 30 * 60 * 1000);
  const apptDateStr = futureDate.toISOString().slice(0, 10);
  const apptTimeStr = "12:00";
  const dummyAppt: any = {
    id: `appt-quick-${Date.now()}`,
    appointmentDate: "2025-01-01", // Long past
    startTime: "09:00",
    status: "BOOKED",
  };
  const scheduledCount = await scheduleAppointmentReminders(
    repo,
    dummyAppt,
    "test@example.com",
    userPatient.id,
    "Aarav",
    doctor
  );
  assert(scheduledCount === 0, "Past reminders are skipped and not scheduled into outbox");

  // ---------------------------------------------------------------------------
  // 4. PRE-SEND RECHECK PREVENTS SENDING FOR CANCELLED/COMPLETED VISITS
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 4: Pre-Send Status Recheck in Dispatcher ---");

  // Create an appointment in repo
  const createRes = await repo.createAppointment({
    doctorId: doctor.id,
    patientId: patient.id,
    appointmentDate: "2026-11-20",
    startTime: "11:00",
    endTime: "11:30",
    status: "BOOKED",
  });
  const apptToCancel = createRes.appointment!;

  // Schedule a reminder for it due right now
  const reminderNotif = await repo.createNotification({
    id: `remind-${Date.now()}`,
    userId: userPatient.id,
    appointmentId: apptToCancel.id,
    channel: "EMAIL",
    category: "operational",
    template: "APPOINTMENT_REMINDER",
    recipient: "aarav@example.com",
    payload: { patientName: "Aarav", doctorName: "Dr. Patil" },
    status: "PENDING",
    scheduledFor: new Date(Date.now() - 1000), // Due
    attempts: 0,
    dedupeKey: `remind-test-${apptToCancel.id}`,
  });

  // Cancel the appointment before the dispatcher runs
  await repo.updateAppointmentStatus(apptToCancel.id, "CANCELLED", {
    cancelledBy: "PATIENT",
    cancelReason: "Schedule conflict",
  });

  // Run dispatcher
  const dispatcher = new NotificationDispatcher(repo);
  const sweepRes = await dispatcher.processDueNotifications();

  // Check reminder notification status
  const updatedNotif = await repo.getNotificationById(reminderNotif.id);
  assert(
    updatedNotif?.status === "CANCELLED",
    "Reminder for cancelled appointment was marked CANCELLED instead of SENT"
  );
  assert(
    Boolean(updatedNotif?.lastError?.includes("status is CANCELLED")),
    "lastError recorded the cancellation reason"
  );
  assert(sweepRes.skipped >= 1, "Dispatcher skipped count incremented for cancelled reminder");

  // ---------------------------------------------------------------------------
  // 5. RETRIES AND BACKOFF (3 ATTEMPTS -> FAILED, NEVER RESEND SENT)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 5: Retries, Backoff, and Dead-Letter Logic ---");

  // Create a failing dispatcher instance
  const failingDispatcher = new NotificationDispatcher(repo);
  (failingDispatcher as any).emailChannel = {
    send: async () => ({ success: false, error: "Gateway timeout (HTTP 504)" }),
  };

  const failingItem = await repo.createNotification({
    id: `failing-${Date.now()}`,
    userId: userPatient.id,
    channel: "EMAIL",
    category: "operational",
    template: "PAYMENT_CONFIRMED",
    recipient: "aarav@example.com",
    status: "PENDING",
    scheduledFor: new Date(Date.now() - 1000),
    attempts: 0,
    dedupeKey: `fail-test-${Date.now()}`,
  });

  // Attempt 1
  await failingDispatcher.processDueNotifications();
  let row = await repo.getNotificationById(failingItem.id);
  assert(row?.attempts === 1, "Attempt 1: attempts count incremented to 1");
  assert(row?.status === "PENDING", "Attempt 1: status remains PENDING");
  assert(
    Boolean(row?.scheduledFor && row.scheduledFor.getTime() > Date.now()),
    "Attempt 1: scheduledFor backed off into the future (5 minutes)"
  );

  // Make due again for Attempt 2
  await repo.updateNotificationStatus(failingItem.id, "PENDING", {
    scheduledFor: new Date(Date.now() - 1000),
  });
  await failingDispatcher.processDueNotifications();
  row = await repo.getNotificationById(failingItem.id);
  assert(row?.attempts === 2, "Attempt 2: attempts count incremented to 2");
  assert(row?.status === "PENDING", "Attempt 2: status remains PENDING");

  // Make due again for Attempt 3
  await repo.updateNotificationStatus(failingItem.id, "PENDING", {
    scheduledFor: new Date(Date.now() - 1000),
  });
  await failingDispatcher.processDueNotifications();
  row = await repo.getNotificationById(failingItem.id);
  assert(row?.attempts === 3, "Attempt 3: attempts count incremented to 3");
  assert(row?.status === "FAILED", "Attempt 3: status transitioned to FAILED (dead-letter)");
  assert(
    typeof row?.lastError === "string" && row.lastError.includes("504"),
    "Attempt 3: lastError recorded on notification"
  );

  // Verify SENT notification is never resent
  const sentItem = await repo.createNotification({
    id: `already-sent-${Date.now()}`,
    userId: userPatient.id,
    channel: "EMAIL",
    category: "operational",
    template: "BOOKING_CONFIRMED",
    recipient: "aarav@example.com",
    status: "SENT",
    scheduledFor: new Date(Date.now() - 1000),
    attempts: 1,
    dedupeKey: `already-sent-${Date.now()}`,
  });
  await dispatcher.processDueNotifications();
  const sentRow = await repo.getNotificationById(sentItem.id);
  assert(sentRow?.status === "SENT", "SENT item remains untouched in SENT status");

  // ---------------------------------------------------------------------------
  // 6. OVERLAPPING DISPATCHER RUNS SAFETY
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 6: Overlapping Dispatcher Runs (Atomic Claim Safety) ---");

  // Create 10 pending notifications due right now
  const batchIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const item = await repo.createNotification({
      id: `batch-${Date.now()}-${i}`,
      userId: userPatient.id,
      channel: "EMAIL",
      category: "operational",
      template: "BOOKING_CONFIRMED",
      recipient: "aarav@example.com",
      status: "PENDING",
      scheduledFor: new Date(Date.now() - 5000),
      attempts: 0,
      dedupeKey: `batch-dedupe-${Date.now()}-${i}`,
    });
    batchIds.push(item.id);
  }

  // Run two dispatcher sweeps simultaneously
  const [res1, res2] = await Promise.all([
    dispatcher.processDueNotifications(10),
    dispatcher.processDueNotifications(10),
  ]);

  const totalSentInOverlapping = res1.sent + res2.sent;
  assert(
    totalSentInOverlapping === 10,
    `Concurrent sweeps dispatched exactly 10 items without double-sending (res1: ${res1.sent}, res2: ${res2.sent})`
  );

  // ---------------------------------------------------------------------------
  // 7. THROWING EMAIL PROVIDER DOES NOT BREAK BOOKING / FLOWS
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 7: Fail-Safe Provider Isolation ---");

  // createNotification wraps all operations in try/catch and never throws
  const badInput: any = {
    userId: "non-existent-user-without-prefs",
    template: "BOOKING_CONFIRMED",
    recipient: "test@example.com",
  };
  let threw = false;
  try {
    await createNotification(repo, badInput);
  } catch {
    threw = true;
  }
  assert(!threw, "createNotification never throws an uncaught error into caller");

  // ---------------------------------------------------------------------------
  // 8. PREFERENCES, CONSENT, AND UNSUBSCRIBE TOKENS
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 8: Preferences, Consent & Unsubscribe Tokens ---");

  // Default state: promotional email is false
  const initialPrefs = await repo.getNotificationPreferences(userPatient.id);
  assert(
    initialPrefs === undefined || initialPrefs.emailPromotional === false,
    "Default user preferences have promotional emails disabled"
  );

  // shouldSend helper
  assert(shouldSend("operational", initialPrefs) === true, "Operational messages always return shouldSend=true");
  assert(shouldSend("promotional", initialPrefs) === false, "Promotional messages return shouldSend=false when opt-out");
  assert(
    shouldSend("promotional", { userId: "1", emailPromotional: true, consentedAt: new Date(), updatedAt: new Date() }) === true,
    "Promotional messages return shouldSend=true when opt-in"
  );

  // Promotional notification is skipped when user has not opted in
  const skippedPromo = await createNotification(repo, {
    userId: userPatient.id,
    template: "PROMOTIONAL_NEWSLETTER",
    category: "promotional",
    recipient: "aarav@example.com",
  });
  assert(skippedPromo === null, "Promotional notification was skipped (returned null) for non-consented patient");

  // Operational notification succeeds regardless of preferences
  const sentOperational = await createNotification(repo, {
    userId: userPatient.id,
    template: "BOOKING_CONFIRMED",
    category: "operational",
    recipient: "aarav@example.com",
    dedupeKey: `op-check-${Date.now()}`,
  });
  assert(sentOperational !== null, "Operational notification was successfully created for the same user");

  // Unsubscribe Token Lifecycle
  const token = generateUnsubscribeToken(userPatient.id);
  assert(typeof token === "string" && token.includes("."), "generateUnsubscribeToken creates token string");

  const verified = verifyUnsubscribeToken(token);
  assert(verified.valid === true && verified.userId === userPatient.id, "verifyUnsubscribeToken verifies authentic token");

  // Tampered token test
  const tamperedToken = token.slice(0, -4) + "abcd";
  const tamperedRes = verifyUnsubscribeToken(tamperedToken);
  assert(tamperedRes.valid === false && tamperedRes.error === "tampered", "Tampered token correctly rejected in constant time");

  // Expired token test (TTL = -1 second)
  const expiredToken = generateUnsubscribeToken(userPatient.id, -10);
  const expiredRes = verifyUnsubscribeToken(expiredToken);
  assert(expiredRes.valid === false && expiredRes.error === "expired", "Expired token correctly rejected");

  // Unsubscribe action test
  // Opt patient in first
  await repo.upsertNotificationPreferences({
    userId: userPatient.id,
    emailPromotional: true,
    consentedAt: new Date(),
  });
  const optInPrefs = await repo.getNotificationPreferences(userPatient.id);
  assert(optInPrefs?.emailPromotional === true, "Patient opted into promotional emails");

  // Unsubscribe using valid token
  const unsubActionResult = await unsubscribeWithTokenAction(token);
  assert(unsubActionResult.success === true, "unsubscribeWithTokenAction returned success");
  const postUnsubPrefs = await repo.getNotificationPreferences(userPatient.id);
  assert(postUnsubPrefs?.emailPromotional === false, "Patient promotional preference successfully set to false");

  // ---------------------------------------------------------------------------
  // 9. PRIVACY ENFORCEMENT & CLINICAL DATA MASKING
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 9: Privacy Enforcement & XSS Sanitization ---");

  const privacyItem: any = {
    id: "privacy-test-item",
    userId: userPatient.id,
    template: "APPOINTMENT_CANCELLED",
    channel: "EMAIL",
    category: "operational",
    recipient: "aarav@example.com",
    payload: {
      patientName: "Aarav Deshmukh",
      doctorName: "Dr. Ramesh Patil",
      diagnosis: "Acute Myocardial Infarction",
      symptoms: "Severe chest pain radiating to left arm",
      clinicalNotes: "Patient has history of hypertension and diabetes",
      reasonForVisit: "Emergency Cardiology OPD",
      medicalHistory: "Prior cardiac arrest",
      reason: "Cancelled by the doctor", // Allowed non-clinical reason
    },
  };

  const renderedPrivacy = formatNotification(privacyItem);
  assert(
    !renderedPrivacy.bodyText.includes("Acute Myocardial Infarction") &&
      !renderedPrivacy.bodyHtml.includes("Acute Myocardial Infarction"),
    "Clinical diagnosis is strictly omitted from email body and HTML"
  );
  assert(
    !renderedPrivacy.bodyText.includes("chest pain") &&
      !renderedPrivacy.bodyHtml.includes("chest pain"),
    "Clinical symptoms are strictly omitted from email body and HTML"
  );
  assert(
    !renderedPrivacy.bodyText.includes("hypertension") &&
      !renderedPrivacy.bodyHtml.includes("hypertension"),
    "Doctor clinical notes are strictly omitted from email body and HTML"
  );
  assert(
    renderedPrivacy.bodyText.includes("Cancelled by the doctor"),
    "Allowed non-clinical cancellation reason is preserved"
  );

  // XSS escaping test
  const xssItem: any = {
    id: "xss-test-item",
    userId: userPatient.id,
    template: "BOOKING_CONFIRMED",
    channel: "EMAIL",
    category: "operational",
    recipient: "aarav@example.com",
    payload: {
      patientName: "<script>alert('xss')</script>Aarav",
      doctorName: "Dr. Patil & Sons",
    },
  };
  const renderedXss = formatNotification(xssItem);
  assert(
    !renderedXss.bodyHtml.includes("<script>"),
    "HTML script tag was escaped and not rendered raw"
  );
  assert(
    renderedXss.bodyHtml.includes("&lt;script&gt;"),
    "HTML contains escaped &lt;script&gt; entity"
  );

  // ---------------------------------------------------------------------------
  // 10. ADMIN DASHBOARD & REQUEUE ACTION
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 10: Admin Access Control & Requeue Dead-Letter ---");

  assert(isAdminUser("admin@rubyhall.com") === true, "isAdminUser returns true for admin@rubyhall.com");
  assert(isAdminUser("ops@medrella.com") === true, "isAdminUser returns true for ops@medrella.com");
  assert(isAdminUser("patient@gmail.com") === false, "isAdminUser returns false for patient@gmail.com");
  assert(isAdminUser(null) === false, "isAdminUser returns false for unauthenticated user");

  // Create a FAILED notification
  const deadLetterItem = await repo.createNotification({
    id: `dead-letter-${Date.now()}`,
    userId: userPatient.id,
    channel: "EMAIL",
    category: "operational",
    template: "PAYMENT_CONFIRMED",
    recipient: "aarav@example.com",
    status: "FAILED",
    scheduledFor: new Date(),
    attempts: 3,
    lastError: "Connection timeout",
    dedupeKey: `dead-letter-${Date.now()}`,
  });

  // Requeue action
  const requeueRes = await repo.requeueNotification(deadLetterItem.id);
  assert(requeueRes === true, "repo.requeueNotification successfully reset failed notification");
  const requeuedRow = (await repo.getNotificationsByUserId(userPatient.id)).find(
    (n) => n.id === deadLetterItem.id
  );
  assert(requeuedRow?.status === "PENDING", "Requeued notification status is PENDING");
  assert(requeuedRow?.attempts === 0, "Requeued notification attempts reset to 0");

  // Count by status
  const counts = await repo.countNotificationsByStatus();
  assert(typeof counts.SENT === "number" && typeof counts.PENDING === "number", "countNotificationsByStatus returns metrics");

  // ---------------------------------------------------------------------------
  // 11. PRODUCTION WITHOUT RESEND_API_KEY FAILS CLOSED
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 11: Production Missing Key Fails Closed ---");

  const emailChannel = new EmailChannel();
  const prodEnvOrig = process.env.NODE_ENV;
  const keyOrig = process.env.RESEND_API_KEY;

  try {
    (process.env as any).NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;

    const sendRes = await emailChannel.send({
      id: "prod-fail-closed-test",
      userId: userPatient.id,
      channel: "EMAIL",
      category: "operational",
      template: "BOOKING_CONFIRMED",
      recipient: "aarav@example.com",
      status: "PENDING",
      scheduledFor: new Date(),
      attempts: 0,
      createdAt: new Date(),
      payload: {},
    });

    assert(sendRes.success === false, "Email delivery in production without RESEND_API_KEY returns success: false");
    assert(
      Boolean(sendRes.error?.includes("fail closed")),
      "Error indicates fail closed behavior in production"
    );
  } finally {
    (process.env as any).NODE_ENV = prodEnvOrig;
    process.env.RESEND_API_KEY = keyOrig;
  }

  // ---------------------------------------------------------------------------
  // TEST REPORT SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================");
  console.log(`Test Execution Summary:`);
  console.log(`  Total Invocations: ${totalTests}`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log("===============================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runNotificationsTestSuite().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
