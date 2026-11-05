# Task 6 — Wave & Stream scheduling completed (dates, recurrence, Stream capacity)

Closes the three gaps in the "Wave & Stream Scheduling Implementation" brief. Wave and Stream sessions already existed (weekly, per-session slot length, Wave capacity). Now:

| Brief item | Before | Now |
|---|---|---|
| Non-recurring, specific date | Not possible | **"One date only"** session: runs on exactly one calendar date and never repeats. Past dates and impossible dates (30 Feb) are refused. |
| Recurring by day | Weekly only, forever | Weekly **plus an optional "runs from / until" date range** (for example every Monday, 1 Dec to 31 Dec). |
| Recurring by date | Not possible | **"Date of month"** session (1–31, for example the 1st of every month) with the same optional range. Months without that date (31st in June) are skipped. |
| Stream capacity | Fixed at 1 | **Patients per slot (1–20) is configurable for Stream as well as Wave.** Capacity is enforced at booking, reschedule and late-payment reconciliation. |

## How it works

| Area | Change |
|---|---|
| Rules | New pure module `src/lib/session-schedule.ts`: `sessionAppliesOnDate`, `firstSharedDate`, validation, descriptions. Everything (slot engine, booking gate, landing page, agent, UI) asks this one module whether a session runs on a date. |
| Database | Migration `0006_scheduling_dates.sql` (additive): `availabilities.recurrence` (default `WEEKLY`, so every existing session keeps working), `day_of_month`, `specific_date`, `valid_from`, `valid_until`; `day_of_week` becomes nullable (monthly sessions have no weekday). Apply with `npm run db:migrate-0006`. |
| Overlap rule | Two sessions of one doctor clash only if their hours overlap **and** they can run on a common date (weekly vs one-off, monthly vs weekly, disjoint date ranges are fine). Inactive sessions never clash. |
| Doctor form | "When does it run?" (Every week / Date of month / One date only), optional from/until dates, slot length 10–120 min, Stream or Wave, **Patients per slot**. Roster shows weekly days, monthly dates and one-date sessions separately and marks ended ones. |
| Several dates at once | In the one-date form, "Same session on more dates" creates one session per date. Every date is checked first, so if any clashes nothing is created. |
| Arrival window (Stream) | "One slot for the whole session" makes the session a single slot (slot length up to 10 hours), for example 10:00–14:00 with 20 patients per slot, seen in token order. This is the "window with a total capacity" reading of Stream. |
| Patients | Slot picker, reschedule dialog and the assistant show seats left for any slot with capacity above 1. Doctor profile lists weekdays, monthly dates and the number of special dates. |
| Tests | `src/test-scheduling.ts`: 114 checks in memory (116 against a real Postgres engine), re-run under three server timezones, chained into `npm test`. Loops over 40–75 consecutive days to prove each kind of session appears on exactly the right dates. |

Deploying this change: run `npm run db:migrate-0006` against the database **before** deploying the new code.

**Verification beyond the in-memory tests:** the same scheduling suite, the migration (applied on top of an old-style row) and the Postgres booking, reschedule and session queries were run against a real Postgres engine (PGlite). The doctor form, a patient's slot list and a full mock-paid booking (token issued, seats left updated) were also checked in the browser.

**Same change in Tasks 3, 4 and 5:** each has its own migration (`0003`, `0004`, `0005_scheduling_dates.sql`) applied with `npm run db:migrate-scheduling`.

**Copying this into the deployment repo** (only valid if that repo is already at the Task 6 state): copy `src/lib/session-schedule.ts`, `src/db/schema.ts`, `src/db/repo.ts`, `src/lib/booking-rules.ts`, `src/lib/validators.ts`, `src/actions/availability.ts`, `src/app/doctor/availability/sessions-client.tsx`, `src/app/doctor/dashboard/page.tsx`, `src/app/doctors/[id]/page.tsx`, `src/components/slot-picker.tsx`, `src/components/reschedule-modal.tsx`, `src/db/migrations/0006_scheduling_dates.sql`, `src/db/migrations/meta/*`, `src/db/apply-0006.ts`, `src/test-scheduling.ts`, plus the `db:migrate-0006` and `test` lines of `package.json`. Then run `npm run db:migrate-0006` on the live database before redeploying.

---

# Task 6 — Healthcare Agent (changes from Task 5)

## What was added

| Area | Change |
|---|---|
| Agent | `src/lib/agent/`: Sarvam client (`llm.ts`), safety checks (`safety.ts`), prompt (`prompt.ts`), tools (`tools.ts`), agent loop (`agent.ts`); API route `POST /api/agent/chat` |
| Chat UI | `/patient/assistant` (shadcn components), "Assistant" entry in the patient navigation |
| Booking hand-off | `/doctors/[id]?date=YYYY-MM-DD&slot=HH:mm` opens the booking page with that date and slot pre-selected |
| Insurance | `src/lib/insurance/` (provider interface, simulated insurer, service), actions in `src/actions/insurance.ts`, page `/patient/insurance`, emails `PREAUTH_UPDATE` and `CLAIM_UPDATE` |
| Engagement | `src/lib/engagement/`, cron `GET /api/cron/engagement`, emails `FOLLOW_UP_VISIT` (operational), `CARE_REMINDER` and `REENGAGEMENT` (promotional, opt-in) |
| Database | Migration `0005_agent_insurance.sql` (additive only): `agent_events`, `insurance_policies`, `preauth_requests`, `claims`. Apply with `npm run db:migrate-0005`. |
| Cancellation | Cancelling an appointment now also cancels its open or approved insurance pre-authorisation |
| Tests | `src/test-agent.ts` (95 checks), chained into `npm test` |

## Event and message map (new)

| Trigger | Template | Category | Dedupe key |
|---|---|---|---|
| Pre-authorisation status changes | `PREAUTH_UPDATE` | Operational | `preauth-<id>-<status>` |
| Claim status changes | `CLAIM_UPDATE` | Operational | `claim-<id>-<status>` |
| Visit completed 1–3 days ago | `FOLLOW_UP_VISIT` | Operational | `followup-<appointmentId>` |
| Last visit ≥ 90 days ago, nothing upcoming, opted in | `CARE_REMINDER` | Promotional | `care_reminder-<patientId>-<YYYY-MM>` |
| Last visit ≥ 180 days ago, nothing upcoming, opted in | `REENGAGEMENT` | Promotional | `reengagement-<patientId>-<YYYY-MM>` |

## Simulated insurer rules

Policy number ends in `0`: inactive. Starts with `LOW`: sum insured ₹500 (larger pre-auths rejected). Contains `QRY`: first status check asks for more information, the next approves. Contains `REJ`: claims are rejected. Anything else: active, ₹5,00,000 cover, 10% co-pay; pre-auth is approved on the first check; claims go IN_REVIEW then SETTLED.

## Deploying

1. Back up or branch the database, then run `npm run db:migrate-0005` against it **before** deploying (new code reads the new tables).
2. Add `SARVAM_API_KEY` (and, for a demo, `INSURANCE_PROVIDER=mock`) in Vercel, then redeploy.
3. Schedule `GET /api/cron/engagement` daily with the `CRON_SECRET` bearer header.

---

# Task 5 — Reliable Email Notifications (Changes from Task 4)


This document describes all changes introduced in **Task 5 (Reliable Email Notifications)** for Medrella Healthcare.

---

## 1. Outpatient Event Notification Map

All transactional outpatient communications are evaluated against this event table. Deterministic deduplication keys guarantee that concurrent retries, webhook repeats, or browser refreshes never double-email a patient or doctor.

| Event Trigger | Recipient | Template Name | Category | Dedupe Key Strategy | Why Sent / Purpose |
|---|---|---|---|---|---|
| **Appointment Booked** (Free visit or after payment confirmation) | Patient | `BOOKING_CONFIRMED` | Operational (Mandatory) | `confirm-${appointment.id}` | Informs the patient of their booked OPD visit, token number, specialist name, IST date/time, and hospital arrival instructions. |
| **Payment Captured** (Successful Razorpay payment or verified webhook) | Patient | `PAYMENT_CONFIRMED` | Operational (Mandatory) | `payment-confirmed-${payment.id}` | Provides an official payment receipt with receipt number, transaction ID, consultation fee, and tax breakdown. |
| **Appointment Cancelled by Patient** (>= 1 hour before start time) | Patient | `APPOINTMENT_CANCELLED` | Operational (Mandatory) | `cancel-notif-${appointment.id}` | Confirms visit cancellation, displays non-clinical cancellation reason, and explains any initiated refund. |
| **Appointment Cancelled by Doctor** (Physician emergency / schedule shift) | Patient | `APPOINTMENT_CANCELLED_BY_DOCTOR` | Operational (Mandatory) | `cancel-notif-${appointment.id}` | Alerts patient to physician schedule disruption, apologizes, confirms 100% full refund initiation, and offers 1-click rebooking link. |
| **Appointment Rescheduled** (Slot moved to new date/time) | Patient | `APPOINTMENT_RESCHEDULED` | Operational (Mandatory) | `reschedule-${appointment.id}-${newDate}-${newTime}` | Notifies patient of updated IST appointment date/time, new token number, and reassures them that payment remains valid. |
| **Appointment Reminder (24h Before)** (Configurable offset: 1440m) | Patient | `APPOINTMENT_REMINDER` | Operational (Mandatory) | `remind-${appointment.id}-1440` | Pre-visit reminder 24 hours prior to appointment; re-verifies appointment status is `BOOKED` before dispatch. |
| **Appointment Reminder (2h Before)** (Configurable offset: 120m) | Patient | `APPOINTMENT_REMINDER` | Operational (Mandatory) | `remind-${appointment.id}-120` | Day-of-visit reminder 2 hours prior to consultation; includes travel advice and 10-minute early arrival guidance. |
| **Refund Initiated** (Refund requested by cancellation/sweep) | Patient | `REFUND_INITIATED` | Operational (Mandatory) | `refund-${refund.id}-PENDING` | Confirms refund request has been queued with Razorpay gateway (expected 5–7 banking days credit). |
| **Refund Processed** (Settled by bank / Razorpay webhook) | Patient | `REFUND_PROCESSED` | Operational (Mandatory) | `refund-${refund.id}-PROCESSED` | Confirms that funds have been settled back to patient's original card/UPI/net-banking account. |
| **Refund Failed** (Gateway decline or banking issue) | Patient | `REFUND_FAILED` | Operational (Mandatory) | `refund-${refund.id}-FAILED` | Alerts patient of temporary gateway issue and reassures them that billing operations is manually re-issuing funds. |
| **Doctor Session Cancelled** (Session group deletion/update) | Patient | `APPOINTMENT_CANCELLED_BY_DOCTOR` | Operational (Mandatory) | `cancel-notif-${appointment.id}` | Triggers cancellation with 100% refund for all affected patient bookings in the deleted OPD session. |
| **Promotional Newsletter / Health Tip** (Framework only; opt-in required) | Patient | `PROMOTIONAL_NEWSLETTER` / `PROMOTIONAL_HEALTH_TIP` | Promotional (Optional) | `promo-${userId}-${campaignId}` | Delivers preventive wellness advisories, health checkup notices; requires user opt-in consent and provides 1-click HMAC unsubscribe token. |

---

## 2. Key Architectural Changes

### 2.1 Additive Schema Migration (`0004_careful_night_nurse.sql`)
1. **New Table: `notification_preferences`**:
   - `user_id` (UUID PK, FK to `users.id` with `ON DELETE CASCADE`)
   - `email_promotional` (boolean, default `false` — strict opt-in)
   - `consented_at` (timestamp with time zone, audit timestamp)
   - `updated_at` (timestamp with time zone, auto-updated)
   - *Operational emails are NOT an adjustable setting*: operational messages (bookings, receipts, refunds, reminders) are mandatory for healthcare delivery and patient safety.
2. **New Columns on `notifications`**:
   - `category` (text, default `'operational'` with index `idx_notifications_category`)
   - `provider_message_id` (text nullable, stores Resend delivery message ID)
3. **Safe Migration Script**:
   - Written in `src/db/apply-0004.ts` (safe additive runner that skips `42P07` table exists, `42701` column exists, and `42710` index exists, and logs only the database host without leaking connection credentials).
   - Added npm script `"db:migrate-0004": "tsx src/db/apply-0004.ts"`.

### 2.2 Timezone Accuracy (`Asia/Kolkata` IST = UTC+05:30)
- Added `src/lib/time.ts`:
  - `buildInstantFromKolkataTime(dateStr, timeStr)`: Deterministically parses calendar date and clock time as IST and yields the exact UTC `Date` instant. Tested across midnight boundaries (e.g. `00:15 IST` on Nov 1 translates strictly to `18:45 UTC` on Oct 31) and month boundaries.
  - `formatKolkataDate(date)`: Formats dates in Indian English with IST weekday and full month name.
  - `formatKolkataTime(time)`: Formats clock times in 12-hour AM/PM with explicit `IST` label.
  - `formatKolkataDateTime(date)`: Formats audit timestamps with full IST date and time.
- Reminder scheduling in `src/lib/notifications/reminders.ts`:
  - Validates `REMINDER_OFFSETS_MINUTES` environment variable (ignores non-numeric garbage and falls back to `1440,120`).
  - Skips scheduling any reminder whose calculated send time is already in the past.

### 2.3 Concurrency & Overlapping Cron Protection
- Prevented duplicate sends when cron runs overlap:
  - **PostgreSQL**: Implemented `FOR UPDATE SKIP LOCKED` query in `claimPendingNotifications(cutoff, limit)` which atomically locks due pending items and advances `scheduled_for` by 5 minutes before releasing.
  - **In-Memory**: Implemented `inFlightNotificationClaims: Set<string>` to guarantee that concurrent in-process dispatcher sweeps never claim or send the same item twice.

### 2.4 Resiliency & Fail-Closed Delivery
- Central creation gatekeeper `createNotification` (`src/lib/notifications/create.ts`):
  - Wraps all notification creation in safe `try/catch`. Notification failures NEVER throw into booking, payment, or cancellation flows.
  - Gated by `shouldSend(category, preferences)`.
  - Enforces dedupe key uniqueness in both PostgreSQL and in-memory repositories.
- Dispatcher Retries & Backoff (`src/lib/notifications/dispatcher.ts`):
  - 3 delivery attempts with exponential-like backoff (5m, 15m).
  - Status transitions to `FAILED` after 3 failed attempts, capturing sanitized `lastError`.
  - Once marked `SENT`, an item is never resent.
- Fail Closed in Production:
  - When `NODE_ENV === "production"` and `RESEND_API_KEY` is missing, `EmailChannel` fails closed (returns `success: false`). Messages remain `PENDING` or `FAILED`; they are NEVER falsely logged as `SENT`.

### 2.5 Clinical Privacy Enforcement (`src/lib/notifications/templates.ts`)
- **Key Redaction**: Forbidden clinical keys (`diagnosis`, `symptoms`, `clinicalNotes`, `notes`, `reasonForVisit`, `medicalHistory`, `prescription`, `vitalSigns`) are strictly filtered out of email payloads.
- **Cancellation Reason Sanitization**: Non-clinical reasons are validated against `ALLOWED_NON_CLINICAL_REASONS` (e.g. "Doctor emergency", "Schedule conflict", "Facility maintenance"). Any unapproved free-text is discarded.
- **XSS Protection**: HTML entities are strictly escaped in HTML email bodies.
- **Email Masking**: Recipient emails are masked (`a***@domain.com`) on admin dashboards and in production console channels.

### 2.6 User Preferences & 1-Click Unsubscribe
- **Settings Page** (`/settings`):
  - Added "Notification Preferences" card accessible to both patients and doctors.
  - Displays clear explanation that operational emails are mandatory.
  - Provides toggle for optional promotional health updates with audit tracking (`consentedAt`).
- **Unsubscribe Token & Route** (`/unsubscribe`):
  - Cryptographically signed HMAC-SHA256 expiring token (`src/lib/notifications/unsubscribe-token.ts`).
  - Constant-time signature verification (`crypto.timingSafeEqual`) preventing timing attacks.
  - Rejects expired and tampered tokens with friendly UI.

### 2.7 Dead-Letter Monitoring & Admin Dashboard
- Route `/admin/notifications`:
  - Protected by `ADMIN_EMAILS` check; returns `notFound()` (404) for unauthorized users.
  - Displays outbox metrics (Sent, Pending, Failed, Cancelled).
  - Displays Failed / Dead-Letter queue with masked recipient, attempt count, last error, and IST timestamps.
  - Provides "Retry" button calling `requeueNotificationAction(id)` to reset status to `PENDING` with 0 attempts for immediate re-delivery.
  - Provides "Sweep Due Outbox" trigger button for manual outbox dispatch.

---

## 3. How to Verify

Run all automated verification test suites:
```bash
# 1. Automated test suite (all 3 test suites: clinical, payment hardening, and reliable notifications)
npm test

# 2. Code quality & linting
npm run lint

# 3. Production optimized bundle build
npm run build
```
Result: **268 passing automated tests, 0 lint warnings, 0 build errors**.

## UI components (shadcn/ui)

Interactive UI now uses shadcn/ui components instead of plain HTML elements: `Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Card`, `Badge`, `Table` and `Dialog` (modals). They live in `src/components/ui/` (configured by `components.json`) and are built on Radix UI, `class-variance-authority` and the existing `cn()` helper. Theme tokens map to the existing design colours in `globals.css`, so the look is unchanged. Add more components with `npx shadcn@latest add <name>`.
