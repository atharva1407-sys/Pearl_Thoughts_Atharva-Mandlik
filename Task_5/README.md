# Task 5: Reliable Transactional Email Notifications & Outbox Engine

Production-grade transactional email notification outbox with clinical privacy protection and dead-letter queue monitoring for **Pearl Thoughts (Task 5)**.

---

## 💎 Notification Architecture Highlights

> [!NOTE]
> ### 📬 Transactional Outbox Pattern & Isolation
> **Fail-Safe Decoupling** · Notifications are recorded in the `notifications` table within the same transaction as clinical state transitions. Provider network timeouts or email dispatch failures **never** break or roll back bookings, cancellations, or payment flows.

> [!TIP]
> ### ⏰ Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) Accuracy
> **Deterministic Timezone Math** · Vercel/CI servers run in UTC. Dates and clock times are calculated deterministically in Indian Standard Time (`src/lib/time.ts`), eliminating UTC midnight boundary errors. Automated reminders are scheduled at 24h and 2h before the visit.

> [!IMPORTANT]
> ### 🔒 Clinical Data Privacy (PHI Protection)
> **Strict Redaction** · Clinical diagnoses, symptoms, notes, and medical history are strictly stripped from email payloads. Cancellation reasons are sanitized against an approved non-clinical whitelist (`ALLOWED_NON_CLINICAL_REASONS`), and patient emails are masked in administrative views.

> [!NOTE]
> ### 📬 Admin Dead-Letter Outbox Dashboard (`/admin/notifications`)
> **Operational Visibility** · Protected by `ADMIN_EMAILS` authorization. Displays live metrics (Sent, Pending, Failed, Cancelled), dead-letter inspection, and 1-click manual requeue actions to retry failed deliveries.

---

## 🧭 Notification Lifecycle & Reliability Matrix

| Capability | Technical Implementation | Operational Guarantee |
|---|---|---|
| **Deterministic Deduplication** | Composite idempotency keys (e.g., `confirm-${id}`, `remind-${id}-${offset}`) | Prevents duplicate sends on webhook retries or browser reloads. |
| **Concurrency Lock** | PostgreSQL `FOR UPDATE SKIP LOCKED` (in-flight set in memory) | Prevents duplicate processing across overlapping cron sweep executions. |
| **Pre-Send Recheck** | Dispatcher verifies appointment status in database right before sending. | Drops reminders automatically if appointment was cancelled or completed. |
| **Retries & Backoff** | Up to 3 attempts with exponential backoff (5m, 15m). | Moves to `FAILED` status (dead-letter queue) after 3 attempts without dropping records. |
| **Fail-Closed Delivery** | Production requires valid `RESEND_API_KEY` or `BREVO_API_KEY`. | Fails closed; never falsely marks emails as `SENT` when provider is unavailable. |
| **1-Click Unsubscribe** | Cryptographic HMAC-SHA256 signed token (`/unsubscribe?token=...`) with 30-day expiry. | Allows instant opt-out from promotional emails without requiring login. |

---

## 🛠️ Verification & Test Suite

```bash
cd Task_5
npm install
cp .env.example .env.local
npm run dev       # Starts dev server on http://localhost:3000
npm test          # Runs 299 automated tests (zero network needed)
```

| Test Suite | Tests | Result | Focus Areas |
|---|:---:|:---:|---|
| **Clinical Suite** | **115** | **Passed** | Outpatient workflows, wave/stream slots, and double-booking guard. |
| **Payment Hardening** | **72** | **Passed** | Razorpay webhooks, seat hold expiration, and tiered refunds. |
| **Reliable Notifications** | **81** | **Passed** | Outbox deduplication, IST midnight boundary, retries, pre-send recheck, PHI redaction, and HMAC unsubscribe tokens. |
| **Brevo & Welcome Flow** | **31** | **Passed** | Brevo channel dispatcher, payload formatting, and welcome email delivery. |
| **Total Test Suite** | **299 Passed** | **0 Failed** | **100% Deterministic Verification** |
