# Task 4: Razorpay (Test Mode) Payments, Refunds & Notifications

Task 4 builds on the Medrella app from [`Task_3`](../Task_3). This folder is the **complete, runnable app** with all Task 4 work included: Task 3's code plus the payment, refund, and notification systems described below. [Files](#files) shows exactly which files Task 4 added, changed, or removed compared with `Task_3`.

## Assignment
- Transition the Medrella appointment system from free booking to a **working demo payment system using Razorpay TEST mode** (no real money), with seat holds, automatic and tiered refunds, and outbox email notifications with appointment reminders.
- Enforce strict server authority on consultation fees, integer paise representation, and transaction advisory locking.
- Support dual confirmation convergence: browser checkout callback and webhook handler.
- Handle critical edge cases: late payment after hold expiry, auto-refunds on taken slots, abandoned checkout sweeps, forged signatures, and webhook replay idempotency.
- Maintain full parity between Neon PostgreSQL and in-memory fallback repositories.
- Keep all existing 87 clinical verification tests passing and add new test coverage.

## What changed

### Payment Provider Abstraction
- Introduced `PaymentProvider` interface in `src/lib/payments/types.ts` (`createOrder`, `verifyCheckoutSignature`, `verifyWebhook`, `fetchOrder`, `createRefund`).
- Built `RazorpayProvider` in `src/lib/payments/razorpay-provider.ts` using Node.js `fetch` with Basic auth and `crypto.timingSafeEqual` signature verification.
- Built `MockProvider` in `src/lib/payments/mock-provider.ts` for deterministic offline testing and local development without keys.
- Implemented `getPaymentProvider()` resolver in `src/lib/payments/index.ts`.

### Seat Holds & Shared Occupancy Helper
- Added `PENDING_PAYMENT` and `EXPIRED` appointment statuses with `hold_expires_at` column.
- Created `src/lib/seat-occupancy.ts` providing `appointmentOccupiesSeat()` and `occupiesSeatSql()` to consistently treat `BOOKED`, `COMPLETED`, `NO_SHOW`, and unexpired `PENDING_PAYMENT` holds as occupying a seat.
- Updated all slot capacity checks, leave blocking, duplicate booking checks, and triage queue boards to use the shared occupancy helper.

### Dual Confirmation Paths & Idempotency
- **Browser Return**: Server action `verifyPaymentAndConfirmBookingAction` verifies the checkout signature and confirms appointment as `BOOKED` and payment as `PAID`.
- **Webhook Route (`POST /api/webhooks/razorpay`)**: Reads raw body via `request.text()`, verifies HMAC-SHA256 signature, inserts into `payment_events` first for idempotency, and handles `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
- Both paths converge idempotently.

### Late Payment & Auto-Refund Edge Cases
- When a payment succeeds after the 10-minute hold expired:
  - If the slot is still open, it is re-confirmed as `BOOKED`.
  - If the slot was taken by another patient while expired, it triggers an **automatic 100% refund** and creates an email notification explaining the expiration.

### Tiered Refund Policy
- Built pure, unit-tested `computeRefund()` in `src/lib/refund-policy.ts`:
  - Patient cancels ≥ 24h prior: 100% refund.
  - Patient cancels 2h–24h prior: 50% refund.
  - Patient cancels < 2h prior: 0% refund.
  - Doctor cancels (any time): 100% refund.
  - Reschedule: Free (retains original payment).
- Built deterministic `buildRefundIdempotencyKey()` to prevent duplicate refunds.

### Outbox Notifications & Reminder Lifecycle
- Created `notifications` table storing queued email items within the same transaction as state changes.
- Implemented `EmailChannel` (Resend) and `ConsoleChannel` (zero-key fallback).
- Scheduled reminders at 1440m (24h) and 120m (2h) with pre-send appointment status validation.
- Created cron endpoints: `GET /api/cron/notifications` and `GET /api/cron/payments`.

### UI & Patient Experience
- **Slot Picker (`/doctors/[id]`)**: "Pay ₹{fee} & Book" button, test mode warning, 10-minute hold timer, and interactive test mode checkout dialog.
- **Patient Dashboard (`/patient/dashboard`)**: Displays payment badges, opportunistic hold sweeping, and cancel modal with live Ruby Hall refund preview.
- **Billing History (`/patient/payments`)**: Audit list of transactions, amounts, and refund badges.
- **Printable Receipt (`/patient/payments/[id]/receipt`)**: Clean, computer-generated consultation receipt with browser print capability.

## Run the Task 4 app
Inside this `Task_4` folder:
```bash
npm install
```
```bash
npm test
```
```bash
npm run build
```
```bash
npm run dev
```

## Files
Compared with [`Task_3`](../Task_3).

### Added (18)
- Migrations: `src/db/migrations/0003_narrow_doctor_octopus.sql`, `meta/0003_snapshot.json`
- Seat Occupancy: `src/lib/seat-occupancy.ts`
- Payments: `src/lib/payments/types.ts`, `src/lib/payments/mock-provider.ts`, `src/lib/payments/razorpay-provider.ts`, `src/lib/payments/index.ts`, `src/lib/payments/expire.ts`
- Refund Policy: `src/lib/refund-policy.ts`
- Notifications: `src/lib/notifications/types.ts`, `src/lib/notifications/templates.ts`, `src/lib/notifications/console-channel.ts`, `src/lib/notifications/email-channel.ts`, `src/lib/notifications/dispatcher.ts`, `src/lib/notifications/reminders.ts`, `src/lib/notifications/index.ts`
- Routes & Pages:
  - `src/app/api/webhooks/razorpay/route.ts`
  - `src/app/api/cron/payments/route.ts`
  - `src/app/api/cron/notifications/route.ts`
  - `src/app/patient/payments/page.tsx`
  - `src/app/patient/payments/[id]/receipt/page.tsx`
  - `src/app/patient/payments/[id]/receipt/print-button.tsx`
- Scripts: `scripts/simulate-webhook.ts`

### Modified (8)
- `.env.example`
- `README.md`
- `src/actions/appointments.ts`
- `src/app/patient/dashboard/page.tsx`
- `src/app/patient/dashboard/patient-appointment-actions.tsx`
- `src/components/clinical-shell.tsx`
- `src/components/slot-picker.tsx`
- `src/db/migrations/meta/_journal.json`
- `src/db/repo.ts`
- `src/db/schema.ts`
- `src/test-suite.ts`
