# Task 4: Medrella Healthcare — Razorpay (Test Mode) Payments, Refunds & Notifications

A full-stack clinical outpatient management platform built for **Pearl Thoughts (Task 4)**. Extends the Medrella appointment system with a **complete Razorpay TEST mode payment system** (no real money), seat holds, automatic and tiered refunds, and an email notification outbox with appointment reminders.

---

## 🚀 What's New in Task 4

### 1. Payment Provider Abstraction (`src/lib/payments/`)
- **`PaymentProvider` Interface**: Generic contract supporting `createOrder`, `verifyCheckoutSignature`, `verifyWebhook`, `fetchOrder`, and `createRefund`.
- **`RazorpayProvider`**: Official Razorpay integration using pure `fetch` with HTTP Basic Authentication and constant-time HMAC-SHA256 signature verification (`crypto.timingSafeEqual`).
- **`MockProvider`**: Deterministic in-memory payment provider used automatically whenever `RAZORPAY_KEY_ID` is unset and throughout automated test suites.
- **Provider Resolver**: `getPaymentProvider()` dynamically chooses between Razorpay and Mock without altering booking or cancellation code.

### 2. Money & Server-Side Security
- **Integer Paise Everywhere**: All financial calculations use integer paise (`paise = rupees * 100`, currency `INR`).
- **Strict Server Authority**: The consultation fee is **always read directly from `doctors.consultationFee`** in the database; client-supplied fee amounts are ignored.
- **Complimentary Visits**: Doctors with `consultationFee === 0` bypass the payment gateway and book directly with instant confirmation.

### 3. Seat Holds & Shared Occupancy (`src/lib/seat-occupancy.ts`)
- **10-Minute Seat Hold**: Booking creates an appointment with status `PENDING_PAYMENT` and `holdExpiresAt = now + PAYMENT_HOLD_MINUTES` inside a PostgreSQL transaction advisory lock (`pg_advisory_xact_lock`).
- **Unified Seat Occupancy**: `appointmentOccupiesSeat()` and `occupiesSeatSql()` enforce that an appointment occupies capacity if it is `BOOKED`, `COMPLETED`, `NO_SHOW`, OR `PENDING_PAYMENT` with an unexpired hold. Expired holds immediately free their seat without requiring a database sweep.
- Grep verified across: `createAppointment`, `rescheduleAppointment`, `computeSessionGroups`, `buildSessionSlotGroups`, `getNextOpenSlots`, duplicate booking checks, doctor leave blocking, and queue triage boards.

### 4. Dual Confirmation Paths & Idempotency
- **Path 1 (Browser Return)**: `verifyPaymentAndConfirmBookingAction` verifies the checkout HMAC signature with `timingSafeEqual`, marking the payment `PAID` and appointment `BOOKED` in one transaction.
- **Path 2 (Webhook `POST /api/webhooks/razorpay`)**: Reads the raw request body with `request.text()`, verifies `x-razorpay-signature`, inserts the event into `payment_events` first for idempotency (duplicate event ID returns `200 OK` immediately), and processes `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
- Both confirmation paths converge safely regardless of which arrives first.

### 5. Robust Edge Case Handling
- **Late Payment After Hold Expiry**: If a payment arrives after the 10-minute hold has expired:
  - If the slot is still free: Re-confirms the appointment as `BOOKED`.
  - If the slot was taken by another patient: Leaves the appointment as `EXPIRED`, marks the payment `PAID`, and **automatically initiates a 100% refund** with an email notification to the patient.
- **Failed Payment**: Marks payment `FAILED`, releases the hold, and allows the patient to retry.
- **Tampered Amount & Forged Signatures**: Strictly detected and rejected.
- **Concurrent Races**: Advisory transaction lock prevents two patients from claiming the last wave seat simultaneously.

### 6. Tiered Refund Policy (`src/lib/refund-policy.ts`)
- Pure, unit-tested refund engine:
  - **Patient cancels ≥ 24h prior to visit**: 100% refund.
  - **Patient cancels 2h – 24h prior**: 50% refund.
  - **Patient cancels < 2h prior**: 0% refund.
  - **Doctor cancels (any notice)**: 100% refund.
  - **No-Show**: 0% refund.
  - **Reschedule**: Free (retains original payment).
- **Balance Capping**: A refund can never exceed `paidAmount - alreadyRefunded`.
- **Deterministic Idempotency**: `buildRefundIdempotencyKey(paymentId, appointmentId, purpose)` prevents duplicate refund execution on retries.
- **Refund Preview**: Live refund calculation modal shows the exact rupee amount to the user **before** cancellation confirmation.

### 7. Notification Outbox Pattern (`src/lib/notifications/`)
- Outbox table `notifications` stores pending email items in the same transaction as clinical state transitions.
- **Channel Fallback**: `EmailChannel` sends via Resend (`RESEND_API_KEY`). When unset, `ConsoleChannel` logs emails and marks them `SENT` so local dev and testing work with zero keys.
- **Pre-Send Recheck**: Before sending reminders, checks the appointment status in the database; if cancelled, completed, or expired, the reminder is cancelled on the spot.
- **Automated Reminders**: Schedules reminders at 1440m (24 hours) and 120m (2 hours) before visit. Rescheduling automatically cancels old reminders and schedules new ones.
- **Dispatcher Endpoint**: `GET /api/cron/notifications` processes due notifications.

### 8. Expiry Sweep & Reconciliation
- **`GET /api/cron/payments`**: Sweeps expired holds, checks live order status from the gateway to reconcile late payments, and marks abandoned holds `EXPIRED`. Protected by `CRON_SECRET`.
- **Opportunistic Sweeping**: Runs when patients view their dashboard.

---

## 💻 UI & Patient Experience

1. **Conflict-Proof Slot Picker (`/doctors/[id]`)**:
   - "Pay ₹{fee} & Book" button.
   - Prominent **Razorpay Test Mode** indicator (`rzp_test_`).
   - 10-minute hold countdown timer with live warning.
   - Test mode checkout modal with simulation controls ("Simulate Success", "Simulate Failure").
2. **Patient Dashboard (`/patient/dashboard`)**:
   - Appointment badges show payment status ("Paid (rzp_test)", "Complimentary").
   - Cancellation modal displays real-time **Ruby Hall Refund Preview** with percentage, rupee amount, and policy rules.
3. **Payments & Billing (`/patient/payments`)**:
   - Comprehensive audit log of all transactions, receipts, and refund statuses.
4. **Printable Consultation Receipt (`/patient/payments/[id]/receipt`)**:
   - Official Ruby Hall Clinic receipt with patient ID, doctor license, token number, financial breakdown, and browser print action.

---

## 🗄️ Database Schema & Migrations

### Migration `0003_narrow_doctor_octopus.sql`
Adds the following tables and columns:
- `payments`: `id`, `appointment_id`, `patient_id`, `provider`, `provider_order_id`, `provider_payment_id`, `amount_paise`, `currency`, `status`, `receipt_no`, `failure_reason`, `expires_at`, `paid_at`, timestamps. Unique indexes on `(provider, provider_order_id)` and `(provider, provider_payment_id)`.
- `payment_events`: `id`, `provider`, `provider_event_id`, `type`, `payload`, `outcome`, `processed_at`. Unique on `(provider, provider_event_id)` for webhook idempotency.
- `refunds`: `id`, `payment_id`, `appointment_id`, `amount_paise`, `reason`, `status`, `provider_refund_id`, `idempotency_key`, `failure_reason`, timestamps. Unique on `idempotency_key`.
- `notifications`: `id`, `user_id`, `appointment_id`, `channel`, `template`, `recipient`, `payload`, `status`, `scheduled_for`, `attempts`, `last_error`, `dedupe_key`, `sent_at`.
- `appointments`: Added `PENDING_PAYMENT` and `EXPIRED` statuses, `hold_expires_at`, `cancelled_by`, and `cancel_reason`.

### Applying Migration 0003 to Neon:
To apply migration 0003 to your Neon database branch, run:
```bash
npx drizzle-kit migrate --config=src/db/drizzle.config.ts
```
*(Or run `npx drizzle-kit push` if your Neon branch is managed without a migration history table).*

---

## 🧪 Verification & Testing

The verification test suite covers 115 test cases with 100% pass rate:
```bash
npm test
```
To run offline against the in-memory repository (never touching Neon):
```bash
powershell -Command "$env:DATABASE_URL='disabled-for-local-test'; npm test --prefix Task_4"
```

### Verification Checklist:
- ✅ TypeScript typecheck passes (`tsc --noEmit` - 0 errors)
- ✅ ESLint passes (`npm run lint` - 0 warnings)
- ✅ Next.js 16 Turbopack production build succeeds (`npm run build`)
- ✅ All 87 baseline clinical tests pass
- ✅ 28 new tests for Task 4 payment holds, signature verification, webhook idempotency, auto-refunds, and reminder lifecycles pass

---

## 🛠️ Testing Webhooks Locally

Use the simulation script to test webhooks on localhost:
```bash
# Simulate successful captured payment
npx tsx scripts/simulate-webhook.ts captured [orderId] [paymentId]

# Simulate bank payment failure
npx tsx scripts/simulate-webhook.ts failed [orderId] [paymentId]

# Simulate processed refund
npx tsx scripts/simulate-webhook.ts refund [orderId] [paymentId]

# Simulate forged signature (rejected with 400)
npx tsx scripts/simulate-webhook.ts tampered [orderId] [paymentId]
```
