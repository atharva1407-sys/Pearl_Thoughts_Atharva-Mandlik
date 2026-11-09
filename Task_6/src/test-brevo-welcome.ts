/**
 * Brevo email channel + welcome email tests (Task 5).
 * Runs on the in-memory repository; the Brevo HTTP API is replaced by a fake fetch.
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "false";
process.env.APP_URL = "https://medrella-healthcare.vercel.app";

import crypto from "crypto";
import { dbRepo } from "./db/repo";
import { BrevoChannel, parseSender } from "./lib/notifications/brevo-channel";
import { EmailChannel } from "./lib/notifications/email-channel";
import { NotificationDispatcher, selectEmailChannel } from "./lib/notifications/dispatcher";
import { createNotification } from "./lib/notifications/create";
import { sendWelcomeEmail } from "./lib/notifications/welcome";
import { formatNotification } from "./lib/notifications/templates";
import type { NotificationItem } from "./lib/notifications/types";

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

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: `n-${crypto.randomUUID()}`,
    userId: "u-1",
    channel: "EMAIL",
    template: "WELCOME",
    recipient: "real.person@example.com",
    payload: { patientName: "Asha Rao", role: "PATIENT" },
    status: "PENDING",
    scheduledFor: new Date(),
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  } as NotificationItem;
}

async function main() {
  const realFetch = globalThis.fetch;
  const env = process.env as Record<string, string | undefined>;
  const saved = {
    node: env.NODE_ENV,
    brevo: env.BREVO_API_KEY,
    resend: env.RESEND_API_KEY,
    provider: env.EMAIL_PROVIDER,
    from: env.EMAIL_FROM,
  };

  console.log("\n--- parseSender ---");
  assert(parseSender("Medrella Healthcare <a@b.com>").email === "a@b.com", "extracts the address");
  assert(parseSender("Medrella Healthcare <a@b.com>").name === "Medrella Healthcare", "extracts the name");
  assert(parseSender("a@b.com").email === "a@b.com" && parseSender("a@b.com").name === undefined, "bare address works");
  assert(parseSender('"Med, Care" <x@y.org>').name === "Med, Care", "quoted name works");

  console.log("\n--- BrevoChannel ---");
  const calls: { url: string; init: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ messageId: "<brevo-123@smtp-relay>" }), { status: 201 });
  }) as typeof fetch;

  const channel = new BrevoChannel("secret-key-123", "Medrella Healthcare <sender@example.com>");
  const ok = await channel.send(item());
  const body = JSON.parse(calls[0].init.body);
  assert(ok.success === true && ok.messageId === "<brevo-123@smtp-relay>", "success returns the provider message id");
  assert(calls[0].url === "https://api.brevo.com/v3/smtp/email", "calls the Brevo transactional endpoint");
  assert(calls[0].init.headers["api-key"] === "secret-key-123", "sends the api-key header");
  assert(body.to[0].email === "real.person@example.com", "addresses the real recipient");
  assert(body.sender.email === "sender@example.com" && body.sender.name === "Medrella Healthcare", "uses the verified sender");
  assert(body.subject === "Welcome to Medrella Healthcare" && body.htmlContent.includes("Asha Rao"), "sends the rendered welcome email");

  globalThis.fetch = (async () =>
    new Response('{"message":"Key not found: secret-key-123"}', { status: 401 })) as typeof fetch;
  const bad = await channel.send(item());
  assert(bad.success === false && /Brevo HTTP 401/.test(bad.error || ""), "HTTP error is a failed result");
  assert(!(bad.error || "").includes("secret-key-123"), "the API key is redacted from error text");

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const down = await channel.send(item());
  assert(down.success === false && /network down/.test(down.error || ""), "network failure is a failed result, not a throw");
  globalThis.fetch = realFetch;

  console.log("\n--- Production without a key fails closed ---");
  env.NODE_ENV = "production";
  delete env.BREVO_API_KEY;
  const noKey = await new BrevoChannel().send(item());
  assert(noKey.success === false && /BREVO_API_KEY/.test(noKey.error || ""), "production without BREVO_API_KEY is not marked sent");
  env.NODE_ENV = saved.node;
  const dev = await new BrevoChannel().send(item());
  assert(dev.success === true, "development without a key falls back to the console channel");

  console.log("\n--- Provider selection ---");
  env.EMAIL_PROVIDER = "brevo";
  assert(selectEmailChannel() instanceof BrevoChannel, "EMAIL_PROVIDER=brevo selects Brevo");
  env.EMAIL_PROVIDER = "resend";
  assert(selectEmailChannel() instanceof EmailChannel, "EMAIL_PROVIDER=resend selects Resend");
  delete env.EMAIL_PROVIDER;
  env.BREVO_API_KEY = "k";
  assert(selectEmailChannel() instanceof BrevoChannel, "a Brevo key alone selects Brevo");
  delete env.BREVO_API_KEY;
  assert(selectEmailChannel() instanceof EmailChannel, "no Brevo key selects Resend");

  console.log("\n--- Welcome template ---");
  const patientMail = formatNotification(item());
  assert(patientMail.subject === "Welcome to Medrella Healthcare", "patient subject");
  assert(patientMail.bodyText.includes("browse specialists") && patientMail.bodyText.includes("/doctors"), "patient email points to finding a doctor");
  const doctorMail = formatNotification(item({ payload: { patientName: "Meera Joshi", role: "DOCTOR" } }));
  assert(doctorMail.bodyText.includes("/doctor/dashboard"), "doctor email points to the dashboard");
  const xss = formatNotification(item({ payload: { patientName: "<script>alert(1)</script>", role: "PATIENT" } }));
  assert(!xss.bodyHtml.includes("<script>") && xss.bodyHtml.includes("&lt;script&gt;"), "name is HTML-escaped");
  assert(/operational service email/.test(patientMail.bodyText), "carries the operational footer");

  console.log("\n--- sendWelcomeEmail ---");
  const userId = `usr_${crypto.randomUUID()}`;
  const input = { userId, email: "new.user@example.com", firstName: "Asha", lastName: "Rao", role: "PATIENT" as const };
  await sendWelcomeEmail(dbRepo, input);
  await sendWelcomeEmail(dbRepo, input);
  await new Promise((r) => setTimeout(r, 50));
  const welcomes = (await dbRepo.getNotificationsByUserId(userId)).filter((n) => n.template === "WELCOME");
  assert(welcomes.length === 1, "signing up twice with the same account queues one welcome email");
  assert(welcomes[0]?.recipient === "new.user@example.com", "goes to the registered address");
  assert(welcomes[0]?.status === "SENT", "is delivered right after sign-up");

  const throwingRepo = {
    getNotificationPreferences: async () => {
      throw new Error("db down");
    },
  } as any;
  let threw = false;
  try {
    await sendWelcomeEmail(throwingRepo, { ...input, userId: "usr_x" });
  } catch {
    threw = true;
  }
  assert(!threw, "a failure while queueing never blocks sign-up");

  console.log("\n--- Dispatcher safety ---");
  const smsUser = `usr_${crypto.randomUUID()}`;
  const sms = await createNotification(dbRepo, {
    userId: smsUser,
    channel: "SMS",
    template: "WELCOME",
    recipient: "+910000000000",
    payload: { patientName: "X" },
  });
  await new NotificationDispatcher(dbRepo).processDueNotifications(50);
  const smsAfter = sms ? await dbRepo.getNotificationById(sms.id) : undefined;
  assert(smsAfter?.status !== "SENT", "an unsupported channel is never marked SENT", `status=${smsAfter?.status}`);
  assert(/Unsupported notification channel/.test(smsAfter?.lastError || ""), "and the reason is recorded");

  const remUser = `usr_${crypto.randomUUID()}`;
  const rem = await createNotification(dbRepo, {
    userId: remUser,
    appointmentId: "apt-lookup-fails",
    template: "APPOINTMENT_REMINDER",
    recipient: "x@example.com",
    payload: { patientName: "X" },
    dedupeKey: `reminder-${remUser}`,
  });
  const flaky = new (dbRepo.constructor as any)();
  flaky.getAppointmentById = async () => {
    throw new Error("lookup failed");
  };
  flaky.claimPendingNotifications = dbRepo.claimPendingNotifications.bind(dbRepo);
  flaky.updateNotificationStatus = dbRepo.updateNotificationStatus.bind(dbRepo);
  await new NotificationDispatcher(flaky).processDueNotifications(50);
  const remAfter = rem ? await dbRepo.getNotificationById(rem.id) : undefined;
  assert(remAfter?.status === "PENDING", "a reminder is not sent when the appointment lookup fails", `status=${remAfter?.status}`);

  env.NODE_ENV = saved.node;
  env.BREVO_API_KEY = saved.brevo;
  env.RESEND_API_KEY = saved.resend;
  env.EMAIL_PROVIDER = saved.provider;
  env.EMAIL_FROM = saved.from;

  console.log(`\nBrevo + welcome tests: ${passed} passed, ${failed} failed (of ${total})`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
