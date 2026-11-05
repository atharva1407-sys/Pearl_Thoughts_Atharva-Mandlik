# 🏥 Pearl_Thoughts_Atharva-Mandlik

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Radix UI](https://img.shields.io/badge/UI-Radix%20Primitives-black?logo=radix-ui)](https://www.radix-ui.com/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20Postgres-00e599?logo=postgresql)](https://neon.tech/)
[![Razorpay](https://img.shields.io/badge/Payments-Razorpay%20(Test%20Mode)-0c2340?logo=razorpay)](https://razorpay.com/)
[![Sarvam AI](https://img.shields.io/badge/AI%20Agent-Sarvam%20AI-orange)](https://www.sarvam.ai/)
[![Deployment](https://img.shields.io/badge/Live%20App-Vercel-black?logo=vercel)](https://medrella-healthcare.vercel.app)

Full Stack Development assessment repository for **Pearl Thoughts**, organized as **self-contained, runnable modules per task (Tasks 1 through 6)** for **Medrella Healthcare, Ruby Hall, Pune, Maharashtra**.

---

## 🌐 Quick Links & Live Demonstrations

* 🚀 **Production Deployment**: [https://medrella-healthcare.vercel.app](https://medrella-healthcare.vercel.app)
* 📦 **Standalone Deployment Repository**: [https://github.com/atharva1407-sys/Medrella_Healthcare](https://github.com/atharva1407-sys/Medrella_Healthcare)
* 💬 **Patient AI Assistant**: [https://medrella-healthcare.vercel.app/patient/assistant](https://medrella-healthcare.vercel.app/patient/assistant)
* 🛡️ **Insurance & Cashless Pre-Auth**: [https://medrella-healthcare.vercel.app/patient/insurance](https://medrella-healthcare.vercel.app/patient/insurance)
* 📬 **Admin Dead-Letter Outbox**: [https://medrella-healthcare.vercel.app/admin/notifications](https://medrella-healthcare.vercel.app/admin/notifications)
* 📊 **Live OPD Waiting Queue**: [https://medrella-healthcare.vercel.app/queue](https://medrella-healthcare.vercel.app/queue)

---

## 📂 Task-by-Task Repository Map

Every task folder is **100% self-contained and independent**, containing its own `package.json`, environment configurations, database migrations, and automated verification test suites:

| Folder | Task | Primary Scope | Core Highlights & Innovations |
|---|---|---|---|
| [`Task_1`](Task_1) | **ER Diagram & Setup** | System Modeling & Foundation | Outpatient scheduling domain model (`User` → `Patient` → `Doctor` → `Availability` → `Appointment`), architecture walkthrough video (`ER_Diagram.mp4`), diagram (`Task_1 - ER Diagram.png`), and Next.js HelloWorld application with Turbopack. |
| [`Task_2`](Task_2) | **Medrella App Core** | Outpatient Clinic Management | Full-stack clinical management system: Next.js 16 App Router, TypeScript, Drizzle ORM on Neon PostgreSQL, Zod validation, PBKDF2 (600,000 iterations) auth, role-based JWT session cookies, clinical dashboard, live queue, reception desk, and encounters with SOAP notes & vitals. Styled with Radix UI components. |
| [`Task_3`](Task_3) | **Feedback & Scheduling** | Wave/Stream OPD & Rescheduling | Review feedback implementation: Multi-session daily schedules (Morning/Evening OPDs), unified Stream & Wave scheduling (weekly, date-of-the-month, one-date-only), configurable patients per slot (1–20), atomic 1-click slot rescheduling, doctor leave management with active-booking guard, founding doctors catalog (8 specialists with live next-open-slot preview), and smooth page transitions. |
| [`Task_4`](Task_4) | **Payments & Refunds** | Razorpay Test Mode & Seat Holds | Paid outpatient bookings with Razorpay Sandbox integration, 10-minute seat holds (`HOLD`), official Razorpay Checkout popup, server-side HMAC-SHA256 signature verification, tamper-proof fees from database, idempotent webhook processing, late-payment reconciliation, tiered cancellation refunds (100%, 50%, 0%), printable GST receipts, and notification outbox foundation. |
| [`Task_5`](Task_5) | **Reliable Notifications** | Transactional Outbox & Privacy | Production-grade transactional email notifications via Brevo & Resend with fail-closed safety, deterministic deduplication, Indian Standard Time (`Asia/Kolkata`, IST = UTC+05:30) calculations, pre-send status recheck, clinical data privacy (PHI/diagnosis redaction), patient preferences (`/settings`), 1-click cryptographically signed HMAC-SHA256 unsubscribe (`/unsubscribe`), and admin dead-letter outbox dashboard (`/admin/notifications`). |
| [`Task_6`](Task_6) | **Healthcare Agent** | Conversational AI & Insurance | Multilingual conversational assistant powered by Sarvam AI (`sarvam-105b-conversations`), multilingual emergency triage in English, Hindi, and Marathi with 112 guidance, tool calling (`search_doctors`, `get_open_slots`, `list_my_appointments`, `insurance_overview`, `propose_booking`, `propose_manage_appointment`, `propose_preauth`), simulated cashless insurance workflow (`/patient/insurance`), proactive engagement cron jobs (post-visit follow-up, 90-day care checkups, 180-day re-engagement nudges), and arrival window scheduling. |

---

## 🔍 Detailed Task Descriptions

### 📄 Task 1 — ER Diagram, System Architecture & Setup
* **Domain Model**: Designed the complete relational entity model for outpatient hospital scheduling: `User` (identity & credentials), `Patient` (demographics & contact), `Doctor` (specialization & fee), `Availability` (session times & durations), and `Appointment` (date, time, status, notes).
* **Media Walkthrough**: Includes `ER_Diagram.mp4` explaining architectural considerations, entity cardinalities, and indexing strategies.
* **Architecture Diagram**: High-resolution `Task_1 - ER Diagram.png`.
* **Next.js Baseline**: Verified Next.js 16 (App Router) Turbopack foundation with TypeScript and Tailwind CSS.

### 🏥 Task 2 — Medrella Clinical Outpatient Management Platform
* **Clinical Operations**: Built dedicated hospital workspaces for `Ruby Hall, Pune`:
  * **Clinical Dashboard (`/`)**: Daily outpatient census, 20-minute delay alerts, live token queue, and clinical metrics.
  * **Live Waiting Queue (`/queue`)**: Triage badges (`Emergency`, `In consult`, `Waiting`), obstetric emergency override banners, and vitals preview.
  * **Reception Desk (`/reception`)**: Patient search, walk-in token allocation, and specialist schedule monitoring.
  * **Doctor Encounters (`/encounters`)**: Doctor consultation workspace with Chief Complaint, SOAP notes, ICD-10 diagnosis selector, and vitals recording (BP, HR, Temp, SpO₂, Weight).
  * **Weekly Schedule Matrix (`/schedule`)**: 7-day multi-column calendar grid (8:00 AM – 5:00 PM).
* **Security & Auth**: PBKDF2 password hashing with 600,000 iterations, stateless signed HTTP-only JWT cookies, and offline-ready in-memory fallbacks.
* **Design System**: Refactored with accessible Radix UI primitives (`Card`, `Badge`, `Button`, `Table`, `Tabs`, `Dialog`).

### ⚡ Task 3 — Review Feedback, Stability & Multi-Session Scheduling
* **Review Feedback Addressed**:
  * Scoped physician views so doctors see only their own patients, queue, and reports.
  * Real-time database session verification on every request (deleted/suspended accounts signed out immediately).
  * Account deletion protected by password confirmation, executed in a single atomic transaction, and blocked if upcoming appointments exist.
  * Login rate-limiting (5 failed attempts / 15 minutes), open-redirect protections, 8+ character password policy, and branded 404/Terms/Privacy pages.
* **Wave & Stream Scheduling Implementation**:
  * **Session Flexibility**: Sessions can repeat weekly, on a specific date of the month (1–31), or run on "one date only" with optional `valid_from` / `valid_until` ranges.
  * **Stream & Wave Parity**: Configurable patients per slot (1–20) for both Stream and Wave sessions.
  * **Arrival Windows**: Ability to configure single wide-window sessions (e.g., 10:00–14:00 with 20 patients) processed in sequential token order.
  * **Non-Overlapping Guard**: Strict validation preventing overlapping sessions on common calendar dates.
* **Atomic Rescheduling & Doctor Leave**:
  * 1-click slot rescheduling preserving original booking audit timestamps in a single atomic database transaction.
  * Clinical leave blocking future bookings on leave dates, with safety checks preventing leave on days with active bookings.
* **Landing Page Specialists Catalog**: 8 founding doctors with dynamic calculation of their next available consultation slot in IST.

### 💳 Task 4 — Razorpay (Test Mode) Payments, Refunds & Outbox Foundation
* **Payment Gateway Architecture**:
  * `PaymentProvider` interface supporting both `RazorpayProvider` (production/test mode using Node `fetch` with Basic Auth and `crypto.timingSafeEqual`) and `MockProvider` (deterministic zero-network offline testing).
  * Official Razorpay Checkout popup modal integration.
* **10-Minute Seat Holds**: Selecting a slot places a `HOLD` status with `hold_expires_at` column. Slot capacity checks treat holds as occupied seats to guarantee concurrency safety.
* **Dual Confirmation Convergence**:
  * Browser return server action verifies cryptographic checkout signatures.
  * Webhook endpoint (`POST /api/webhooks/razorpay`) verifies HMAC-SHA256 signatures, deduplicating events against `payment_events`.
* **Automated Tiered Refund Engine**:
  * Patient cancels ≥ 24h prior: **100% full refund**.
  * Patient cancels 2h–24h prior: **50% partial refund**.
  * Patient cancels < 2h prior: **0% refund**.
  * Doctor cancels (any time): **100% full refund**.
* **Late-Payment Handling**: Reconciles payments made after seat hold expiration; confirms the visit if the slot is still free, or initiates an automated 100% refund if the slot was claimed by another patient.
* **Printable Invoices**: Clean, printable GST receipt view (`/patient/payments/[id]/receipt`).

### 📬 Task 5 — Reliable Transactional Email Notifications & Outbox Engine
* **Outbox Pattern with Fail-Safe Isolation**:
  * Notifications are stored in a dedicated outbox table in the same transaction as state changes.
  * Notification dispatch failures **never** break or roll back bookings, cancellations, or payments.
* **Dual Provider Support**: Integrated with **Brevo API** and **Resend API**, falling back to `ConsoleChannel` in local development, with fail-closed safety in production.
* **Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) Accuracy**:
  * Deterministic parsing of dates and clock times into UTC instants regardless of host clock (solving midnight boundary shifts, e.g., `00:15 IST` mapping correctly to the preceding UTC calendar day).
  * Automated reminder offsets configurable via `REMINDER_OFFSETS_MINUTES` (defaults to 24h and 2h before consultation).
* **Pre-Send Status Recheck**: The dispatcher verifies the appointment status right before sending. If the visit was cancelled, rescheduled, completed, or marked no-show, the reminder is marked `CANCELLED` and dropped.
* **Clinical Privacy (PHI Protection)**:
  * Strict redaction stripping clinical diagnoses, symptoms, notes, and medical history from email payloads.
  * Cancellation reasons strictly sanitized against an approved non-clinical whitelist (`ALLOWED_NON_CLINICAL_REASONS`).
  * XSS HTML escaping and email masking (`a***@domain.com`).
* **Preferences & 1-Click Expiring Unsubscribe**:
  * Notification Preferences card in `/settings` with audit tracking (`consentedAt`).
  * 1-click unsubscribe route (`/unsubscribe?token=...`) using cryptographically signed HMAC-SHA256 tokens with 30-day expiration, verified in constant time.
* **Admin Dead-Letter Outbox Dashboard (`/admin/notifications`)**: Protected by `ADMIN_EMAILS` check; displays live metrics (Sent, Pending, Failed, Cancelled), dead-letter inspection, and 1-click manual requeue actions.

### 🤖 Task 6 — Conversational Healthcare Agent, Insurance & Engagement
* **Sarvam AI Conversational Assistant (`/patient/assistant`)**:
  * Powered by Sarvam AI (`sarvam-105b-conversations`) with function/tool calling.
  * **Multilingual Emergency Triage**: Pre-model safety checks detect emergencies in **English, Hindi, and Marathi** (e.g., chest pain, severe bleeding, breathing distress, self-harm) and immediately respond with fixed medical guidance to call **112**, never sending the prompt to the LLM.
  * **Safe Tool Execution**: The agent cannot touch the database directly; it executes scoped, Zod-validated read-only and proposal tools (`search_doctors`, `get_open_slots`, `list_my_appointments`, `insurance_overview`, `propose_booking`, `propose_manage_appointment`, `propose_preauth`).
  * **Patient-in-the-Loop Hand-off**: The agent never confirms bookings or processes payments directly; it returns rich interactive UI cards linking to the booking checkout page with pre-selected slots for patient review and authorization.
* **Cashless Insurance Workflow (`/patient/insurance`)**:
  * Simulated insurer supporting policy management, cashless pre-authorisation requests, and claims tracking.
  * Triggers transactional notification updates (`PREAUTH_UPDATE`, `CLAIM_UPDATE`).
  * Cancelling an appointment automatically cancels any associated open or approved pre-authorisation.
* **Proactive Patient Engagement Jobs (`/api/cron/engagement`)**:
  * Post-visit follow-up messages sent after consultation completion.
  * Preventive care reminders (configurable via `ENGAGEMENT_CARE_REMINDER_DAYS`, default 90 days).
  * "We miss you" patient re-engagement nudges (configurable via `ENGAGEMENT_REENGAGE_DAYS`, default 180 days).
  * Gated strictly by patient promotional preferences and consent audit timestamps.
* **Complete Scheduling Refinements**:
  * Unified `src/lib/session-schedule.ts` module governing slot generation, booking gates, landing page availability, and agent lookups.
  * Date-range bounding (`valid_from` / `valid_until`), monthly recurrence (dates 1–31), one-date-only sessions, and multi-date batch creation.

---

## 🏃 Running Any Task Independently

Every task folder (`Task_1` through `Task_6`) can be run completely independently:

```bash
# 1. Navigate to the desired task directory
cd Task_6    # or cd Task_1, Task_2, Task_3, Task_4, Task_5

# 2. Install dependencies (first time only)
npm install

# 3. Configure local environment (Tasks 2 to 6)
cp .env.example .env.local

# 4. Start the development server
npm run dev

# 5. Run the automated verification test suite
npm test
```

### 💡 Zero-Database Offline Mode
Tasks 2, 3, 4, 5, and 6 feature a built-in in-memory repository fallback. If you do not have a live Neon PostgreSQL database, simply set:
```bash
DATABASE_URL="disabled-for-local-test"
USE_MOCK_PAYMENTS=true
```
The application will launch with fully seeded mock specialists, sessions, and simulated payment gateways—no database installation required.

---

## 🧪 Comprehensive Automated Test Matrix

All task folders include self-contained automated test suites with **zero network dependencies**:

| Task Folder | Test Command | Tests Passing | Key Verification Areas |
|:---|:---|:---:|:---|
| **Task 1** | `npm run lint` | — | Code quality, TypeScript types, and Turbopack production compilation. |
| **Task 2** | `npm test` | **31** | Checkbox parsing, IST date shift prevention, PBKDF2 iterations, double-booking race condition prevention, cancellation boundaries, and doctor complete action. |
| **Task 3** | `npm test` | **198** | Multi-session overlap guards, wave capacity limits, token persistence, atomic reschedule, doctor leave locks, landing specialists catalog, next-open-slot engine, and 114 scheduling recurrence checks. |
| **Task 4** | `npm test` | **270** | Clinical rules + 72 payment hardening checks: gateway mode detection, fee tamper protection, Razorpay webhook signature verification, replay protection, hold expiration, late payment capture vs refund, and tiered refund percentages. |
| **Task 5** | `npm test` | **299** | Clinical rules + Payment hardening + 81 reliable notification tests + 31 Brevo/welcome tests: outbox event map, dedupe uniqueness, IST midnight calculations, overlapping sweep protection (`FOR UPDATE SKIP LOCKED`), pre-send status recheck, PHI redaction, and HMAC tokens. |
| **Task 6** | `npm test` | **413** | Full clinical suite + Payments + Notifications + 95 Healthcare Agent tests (Sarvam AI tool calling, safety checks, English/Hindi/Marathi emergency detection, insurance workflow, proactive engagement crons) + 114 advanced scheduling checks across multiple timezones. |

---

## 🗄️ Database Migrations Roadmap

Medrella’s database migrations are **strictly additive** (no drops or destructive modifications), with safe migration runners that check constraints and print only hostnames:

| Migration File | Migration Runner | Primary Additions |
|---|---|---|
| `0000_lazy_bruce_banner.sql` | `npm run db:push` | Initial schema (`users`, `patients`, `doctors`, `doctor_sessions`, `appointments`). |
| `0001_happy_bill_hollister.sql` | `npm run db:push` | Wave scheduling attributes & token number sequences. |
| `0002_short_the_twelve.sql` | `npm run db:push` | Doctor clinical leave management (`doctor_leave`). |
| `0003_narrow_doctor_octopus.sql` | `npm run db:migrate-0003` | Payments (`payments`), refunds (`refunds`), hold expirations, and notification outbox (`notifications`). |
| `0004_careful_night_nurse.sql` | `npm run db:migrate-0004` | Notification preferences (`notification_preferences`), category flags, and provider message IDs. |
| `0005_agent_insurance.sql` | `npm run db:migrate-0005` | Agent audit logs (`agent_events`), insurance policies (`insurance_policies`), pre-authorisations (`preauth_requests`), and claims (`claims`). |
| `0006_scheduling_dates.sql` | `npm run db:migrate-0006` | Advanced scheduling columns (`recurrence`, `day_of_month`, `specific_date`, `valid_from`, `valid_until`). |

---

## ⏱️ Background Cron Endpoints

Medrella exposes authenticated endpoints for background queue processing, secured via `CRON_SECRET` Bearer authorization:

| Endpoint | Recommended Cadence | Description |
|:---|:---:|:---|
| `GET /api/cron/notifications` | Every 1 minute (`* * * * *`) | Dispatches due outbox emails, retries failed deliveries with backoff (up to 3 attempts), and manages the dead-letter queue. |
| `GET /api/cron/payments` | Every 2 minutes (`*/2 * * * *`) | Reconciles captured payments and sweeps expired 10-minute seat holds. |
| `GET /api/cron/engagement` | Daily (`0 10 * * *`) | Evaluates patient engagement rules (post-visit follow-ups, 90-day care checkup reminders, and 180-day re-engagement nudges). |

---

## 👤 Pre-Seeded Test Credentials

### Doctor Accounts (Password: `Doctor@123`):
* `dr.rohan.mehta@medrella.com` (Cardiology — ₹800)
* `dr.priya.nair@medrella.com` (Neurology — ₹900)
* `dr.arjun.rao@medrella.com` (Orthopedics — ₹750)
* `dr.ananya.sharma@medrella.com` (Pediatrics — ₹600)
* `dr.vikram.iyer@medrella.com` (Oncology — ₹1,200)
* `dr.meera.krishnan@medrella.com` (Dermatology — ₹700)
* `dr.kavya.menon@medrella.com` (Gynecology — ₹800)
* `dr.sandeep.kulkarni@medrella.com` (General Medicine — ₹500)

### Razorpay Test Payment Methods:
* **Visa Domestic Card**: `4718 6091 0820 4366` | Expiry: `12/28` | CVV: `123`
* **Mastercard Domestic Card**: `5267 3181 8797 5449` | Expiry: `12/28` | CVV: `123`
* **Test UPI ID**: `success@razorpay` *(instant success)*
* **Test Netbanking**: Select any bank and click **Success** on the mock portal.

---

## 📄 License & Attribution

Developed for the **Pearl Thoughts** Full Stack Development Assessment by **Atharva Mandlik**.  
Designed for **Medrella Healthcare, Ruby Hall, Pune, Maharashtra**. All rights reserved.
