# Medrella Healthcare — Task 5: Reliable Email Notifications

A Next.js 16 (App Router, React 19, TypeScript, Tailwind 4) outpatient appointment platform with Drizzle ORM on Neon PostgreSQL.

**Task 5 focuses on Reliable Appointment Notifications (EMAIL ONLY)**. The finished system sends the right email for every appointment event, schedules reminders accurately in Indian Standard Time (`Asia/Kolkata`), eliminates duplicate and stale messages, retries failures with exponential backoff, provides patient preference controls, enforces strict clinical data privacy, and ensures a notification delivery failure never breaks clinical bookings or cancellations.

---

## 📋 Architectural Highlights

### 1. Central Creation & Gating (`src/lib/notifications/create.ts`)
- All system events (booking, payments, cancellations, refunds, reminders) create outbox records through `createNotification`.
- **Fail-Safe Isolation**: Notification creation is wrapped in exception safety. Provider network errors or database timeouts never bubble up to break or roll back bookings, cancellations, or payment flows.
- **Deterministic Deduplication**: Deterministic keys (e.g. `confirm-${appointment.id}`, `remind-${appointment.id}-${offset}`) ensure repeated webhook calls, browser reloads, or action retries never queue duplicate emails.
- **Preference Gating**: `shouldSend(category, preferences)` gates promotional messages based on patient opt-in consent, while operational messages are always sent for service continuity and patient safety.

### 2. Timezone Precision (`Asia/Kolkata`, IST = UTC+05:30)
- Vercel and CI servers run in UTC. To avoid off-by-one calendar day shifts or inaccurate reminder delivery, all dates and clock times are calculated in `Asia/Kolkata` (`src/lib/time.ts`).
- `buildInstantFromKolkataTime(dateStr, timeStr)` builds exact UTC instants regardless of host server clock. Appointments scheduled near midnight (e.g. `00:15 IST` on Nov 1) map strictly to the preceding UTC calendar day (`18:45 UTC` on Oct 31).
- Reminder offsets are configurable via `REMINDER_OFFSETS_MINUTES` (defaults to `1440,120` = 24h and 2h before consultation). Garbage or invalid values fall back to defaults. Reminders whose calculated send time is in the past are skipped.

### 3. Concurrency Safety & Overlapping Cron Protection
- When scheduled cron runs overlap (e.g. cold start delays or long sweeps), duplicate sends are prevented:
  - **PostgreSQL**: `claimPendingNotifications` uses `FOR UPDATE SKIP LOCKED` and advances `scheduled_for` by 5 minutes atomically in the claim transaction.
  - **In-Memory**: Uses an in-flight claim lock (`inFlightNotificationClaims: Set<string>`) to guarantee each due item is processed by only one worker.

### 4. Retries, Backoff & Fail-Closed Delivery
- Due items are processed with 3 attempts and exponential-like backoff (5m, 15m).
- After 3 failed attempts, status transitions to `FAILED` (dead-letter queue) and records sanitized `lastError` details (truncated to 500 characters, no secrets).
- Once marked `SENT`, notifications are never resent.
- **Fail Closed in Production**: In production without `RESEND_API_KEY`, messages are not sent and remain `PENDING`/`FAILED`. They are NEVER falsely marked `SENT`. In local development, unset key falls back safely to `ConsoleChannel`.

### 5. Pre-Send Status Recheck
- Before dispatching `APPOINTMENT_REMINDER`, the dispatcher verifies the appointment status in the database.
- If the appointment was cancelled, completed, expired, or not booked, the reminder is automatically marked `CANCELLED` and skipped.
- If the appointment start time has already passed in IST, the reminder is cancelled.

### 6. Clinical Privacy & Non-Clinical Sanitization
- **Strict Key Stripping**: Any clinical details (`diagnosis`, `symptoms`, `clinicalNotes`, `notes`, `reasonForVisit`, `medicalHistory`, `prescription`, `vitalSigns`) in notification payloads are stripped before rendering.
- **Cancellation Reason Sanitization**: Only approved non-clinical reasons (`ALLOWED_NON_CLINICAL_REASONS`, such as "Doctor emergency", "Clinic maintenance", "Schedule conflict") are included in email text.
- **HTML Escaping**: User-supplied strings are escaped (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) in HTML templates.
- **Masked Dashboard Emails**: Patient email addresses are masked (`a***@domain.com`) in administrative monitoring and production logs.

### 7. Preferences & 1-Click Expiring Unsubscribe
- **Settings Page** (`/settings`):
  - Accessible to both patients and doctors.
  - Explains mandatory operational emails.
  - Provides toggle for optional promotional health updates with audit tracking (`consentedAt`).
- **Unsubscribe Route** (`/unsubscribe?token=...`):
  - Uses signed HMAC-SHA256 tokens (`src/lib/notifications/unsubscribe-token.ts`) with 30-day expiration.
  - Verified in constant time (`crypto.timingSafeEqual`).
  - Allows 1-click opt-out without requiring login.

### 8. Admin Dead-Letter Outbox Dashboard (`/admin/notifications`)
- Protected by `ADMIN_EMAILS` check; unauthorized visitors receive a `404 Not Found`.
- Live status metrics: Total, Sent, Pending, Failed, Cancelled.
- Dead-letter table displaying masked recipient, attempt count, last error, and IST timestamps.
- "Retry" action calling `requeueNotificationAction(id)` which resets attempts to 0 and status to `PENDING` for immediate redelivery.
- Manual outbox sweep trigger button for on-demand dispatch.

---

## 🛠️ Environment Configuration (`.env`)

Add the following environment variables to your deployment environment (e.g. Vercel Project Settings) or `.env.local` for development:

```bash
# Database & Auth
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
SESSION_SECRET="generate-a-strong-32-byte-secret-key-for-production"
APP_URL="https://medrella-healthcare.vercel.app"

# Admin Dashboard Access (comma-separated admin emails)
ADMIN_EMAILS="admin@rubyhall.com,ops@medrella.com"

# Email Provider Configuration (Resend)
RESEND_API_KEY="re_your_api_key_here"
EMAIL_FROM="Medrella Healthcare <appointments@rubyhall-pune.medrella.com>"

# Reminder Schedule Offsets (in minutes, evaluated in Asia/Kolkata)
REMINDER_OFFSETS_MINUTES="1440,120"

# Cron Sweep Authorization Secret
CRON_SECRET="your_secure_cron_secret_here"
```

---

## 🚀 Database Migration (Migration 0004)

The Task 5 migration is **additive only** (new table `notification_preferences`, new columns `category` and `provider_message_id` on `notifications`). It contains zero drop, truncate, or delete operations.

To apply migration 0004 against your PostgreSQL database:

```bash
npm run db:migrate-0004
```

The migration runner prints only the database host for verification and skips tables, columns, or indexes that already exist.

---

## ⏱️ External Scheduler Setup (cron-job.org or Vercel Cron)

Medrella Healthcare exposes two protected endpoints for recurring background processing:
1. `GET /api/cron/notifications`: Dispatches due notification emails and processes retries.
2. `GET /api/cron/payments`: Reconciles pending gateway payments and sweeps expired holds.

### Setting up on [cron-job.org](https://cron-job.org):
1. Create a free account on [cron-job.org](https://cron-job.org).
2. Create **Job 1 (Notification Outbox Sweeper)**:
   - **URL**: `https://your-domain.vercel.app/api/cron/notifications`
   - **Schedule**: Every 1 minute (`* * * * *`)
   - **Request Headers**:
     ```http
     Authorization: Bearer your_cron_secret_here
     ```
3. Create **Job 2 (Payment & Expiry Sweeper)**:
   - **URL**: `https://your-domain.vercel.app/api/cron/payments`
   - **Schedule**: Every 2 minutes (`*/2 * * * *`)
   - **Request Headers**:
     ```http
     Authorization: Bearer your_cron_secret_here
     ```

Both endpoints return `503 Service Unavailable` if `CRON_SECRET` is unset in production, and `401 Unauthorized` if an incorrect Bearer token is provided.

---

## 🧪 Automated Verification Suite

Run the full automated test suite, code linter, and production build:

```bash
# Run all tests (clinical suite + payment hardening + reliable notifications)
npm test

# Run ESLint validation
npm run lint

# Compile production bundle
npm run build
```

### Test Suite Summary:
- **`src/test-suite.ts`**: 115 tests passing (clinical rules, wave scheduling, double-booking guard).
- **`src/test-payment-hardening.ts`**: 72 tests passing (Razorpay webhook verification, signature validation, hold expiry, tiered refund calculation).
- **`src/test-notifications.ts`**: 81 tests passing:
  1. Event map coverage across all 10 notification templates.
  2. Deduplication key uniqueness in memory and PostgreSQL.
  3. Asia/Kolkata reminder calculation (including midnight boundary and UTC server clock).
  4. Pre-send status recheck cancelling reminders for cancelled/completed visits.
  5. Retries and backoff (3 attempts -> FAILED, never resending SENT).
  6. Overlapping dispatcher sweep safety (0 duplicate sends).
  7. Provider error isolation (notification failure never breaks booking/cancel).
  8. Preferences, consent audit, and HMAC-SHA256 unsubscribe token lifecycle.
  9. Privacy enforcement (stripping diagnosis, symptoms, notes; XSS HTML escaping).
  10. Admin dashboard access control and dead-letter requeue action.
  11. Production fail-closed behavior when `RESEND_API_KEY` is missing.

**Total: 268 passed, 0 failed.**
