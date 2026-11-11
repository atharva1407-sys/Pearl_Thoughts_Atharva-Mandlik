<div align="center">

# Task 4: Razorpay Payments, Seat Holds & Tiered Refunds

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Razorpay](https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=for-the-badge&logo=razorpay&logoColor=3395FF)](https://razorpay.com/)
[![PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=0B0D0E)](https://neon.tech/)

</div>

Outpatient platform financial integration with Razorpay Test Mode, concurrency seat holds, automated tiered refunds, and outbox foundations for **Pearl Thoughts (Task 4)**.

---

## 💎 Payment Architecture Highlights

> [!NOTE]
> ### 💳 Razorpay Test Mode & Provider Abstraction
> **Zero Real Money Risk** · Pluggable `PaymentProvider` interface supporting `RazorpayProvider` (HTTP Basic Auth & constant-time HMAC-SHA256 signature verification) and `MockProvider` for deterministic offline testing. Official Razorpay Checkout popup modal integration.

> [!TIP]
> ### ⏳ 10-Minute Concurrency Seat Holds
> **Fair Slot Locking** · Selecting a slot reserves a 10-minute `PENDING_PAYMENT` seat hold. Capacity checks treat holds as occupied seats, preventing double-booking during checkout. Abandoned holds expire automatically and free their seats.

> [!IMPORTANT]
> ### 💰 Automated Tiered Cancellation Refunds
> **Deterministic Refund Policy** · Automatic refunds calculated on cancellation: ≥24h notice (100% full refund), 2h–24h notice (50% partial refund), <2h notice (0% refund). Doctor cancellations receive an automatic 100% full refund.

---

## 🧭 Payment Lifecycle & Edge Cases

| Scenario | System Behavior | Safety Mechanism |
|---|---|---|
| **Online Checkout** | Official Razorpay modal opens with integer paise fee read strictly from database. | Client-supplied fee amounts are ignored; server-side fee authority. |
| **Dual Confirmation** | Verifies checkout signature on return OR via webhook (`POST /api/webhooks/razorpay`). | Both paths converge safely and deduplicate via `payment_events`. |
| **Late Payment (Slot Free)** | Payment completes after 10-min hold, but slot is still open. | Automatically re-confirms the appointment as `BOOKED`. |
| **Late Payment (Slot Taken)** | Payment completes after hold, but slot was taken by another patient. | Leaves appointment as `EXPIRED` and triggers an automated 100% refund. |
| **Tampered Signature** | Altered checkout parameters or forged webhook signatures. | Constant-time comparison (`crypto.timingSafeEqual`) rejects the request. |
| **Printable Invoices** | Patient downloads or prints tax receipt post-consultation. | Clean GST invoice view at `/patient/payments/[id]/receipt`. |

---

## 📊 Tiered Refund Policy Matrix

| Cancellation Trigger | Notice Period Before Visit | Refund Percentage | Processing Method |
|---|:---:|:---:|---|
| **Patient Cancel** | ≥ 24 Hours | **100%** | Automated via Razorpay API |
| **Patient Cancel** | 2 Hours to 24 Hours | **50%** | Automated via Razorpay API |
| **Patient Cancel** | < 2 Hours | **0%** | No refund issued |
| **Doctor Cancel** | Any Time | **100%** | Automated full refund to patient |
| **Reschedule** | Free (retains booking fee) | **N/A** | Atomic slot transfer |

---

## 🛠️ Verification & Test Suite

```bash
cd Task_4
npm install
cp .env.example .env.local
npm run dev       # Starts dev server on http://localhost:3000
npm test          # Runs 270 automated tests (zero network needed)
```

| Test Suite | Tests | Result | Focus Areas |
|---|:---:|:---:|---|
| **`src/test-suite.ts`** | **198** | **Passed** | Clinical rules, multi-session shifts, doctor leave, and wave slot allocation. |
| **`src/test-payment-hardening.ts`** | **72** | **Passed** | Fee tampering detection, webhook verification, hold expiry, late payment reconciliation, and tiered refunds. |
| **Total Test Suite** | **270 Passed** | **0 Failed** | **100% Verification Coverage** |
