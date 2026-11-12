<div align="center">

# 🏥 Medrella Healthcare — Outpatient Clinic & AI Platform
### Pearl Thoughts Assessment — Complete Tasks 1 through 6

<p align="center">
  <img src="https://skillicons.dev/icons?i=nextjs,react,ts,tailwind,postgres,nodejs,vercel,docker" alt="Next.js, React, TypeScript, Tailwind CSS, PostgreSQL, Node.js, Vercel" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16.4-black?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16.4" />
  <img src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_4.0-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind 4" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=000000" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Neon_PostgreSQL_16-00E599?style=flat-square&logo=postgresql&logoColor=0B0D0E" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Razorpay_Gateway-02042B?style=flat-square&logo=razorpay&logoColor=3395FF" alt="Razorpay" />
  <img src="https://img.shields.io/badge/Sarvam_AI-FF6F00?style=flat-square&logo=probot&logoColor=white" alt="Sarvam AI" />
  <img src="https://img.shields.io/badge/CI%2FCD-100%25_Passing-success?style=flat-square&logo=githubactions&logoColor=white" alt="CI/CD Status" />
</p>

Full-stack outpatient clinical management platform developed for the **Pearl Thoughts Assessment (Tasks 1–6)**, designed for **Medrella Healthcare, Ruby Hall Clinic, Pune, Maharashtra**.

| 🚀 Live Production Application | 📦 Standalone Deployment Repository |
|:---:|:---:|
| [**medrella-healthcare.vercel.app**](https://medrella-healthcare.vercel.app) | [**github.com/atharva1407-sys/Medrella_Healthcare**](https://github.com/atharva1407-sys/Medrella_Healthcare) |

</div>

---

## ⚡ Executive Brief for Interviewers

This repository demonstrates the step-by-step architectural evolution of **Medrella Healthcare** across 6 self-contained tasks. Every task folder (`Task_1` to `Task_6`) is independently runnable and includes automated verification tests:

- **Incremental Domain Engineering**: From the initial relational ER schema (Task 1) to full-stack OPD operations (Task 2), multi-session wave & stream scheduling (Task 3), Razorpay payments & tiered refunds (Task 4), transactional email outbox with Asia/Kolkata precision (Task 5), and culminating in a multilingual AI Clinical Voice Assistant with elastic scheduling and PostgreSQL advisory locking (Task 6).
- **Zero Double-Booking Guarantees**: Transaction-scoped advisory locks (`pg_advisory_xact_lock`) on doctor-day hashes ensure absolute serialization under high-concurrency patient reservation bursts.
- **Patient-in-the-Loop Clinical AI**: Multilingual assistant (EN, HI, MR, Hinglish) using Sarvam AI (`sarvam-105b-conversations`) with 112 emergency routing and cryptographic HMAC 2-step confirmation for any mutating clinical actions.

---

## 📋 All Tasks & Features Breakdown Table

The table below showcases all features implemented in each task folder:

| Task & Directory | Focus Area | All Features Present in Task | Key Routes & Artifacts | Automated Tests |
|:---:|---|---|---|:---:|
| [`Task_1`](Task_1) | **ER Architecture & Baseline** | • Relational outpatient entity model (`User` ↔ `Patient` ↔ `Doctor` ↔ `Availability` ↔ `Appointment`)<br>• Foreign key cardinalities, indexing strategy, and constraints<br>• Architecture walkthrough video demonstration (`ER_Diagram.mp4`)<br>• High-resolution vector ER architecture diagram (`Task_1 - ER Diagram.png`)<br>• Next.js 16 App Router application scaffold with Turbopack baseline | `ER_Diagram.mp4`<br>`Task_1 - ER Diagram.png`<br>`src/` app baseline | Lint & Schema Pass |
| [`Task_2`](Task_2) | **Core Clinical Application** | • **Live OPD Waiting Queue** (`/queue`): Real-time triage badges (`Waiting`, `In consult`, `Emergency`)<br>• **Obstetric Emergency Override**: Clinical priority banner triggered on elevated BP (168/110)<br>• **Reception Desk** (`/reception`): Walk-in patient registration & instant token issuance<br>• **Consultation Encounters** (`/encounters`): SOAP clinical notes, ICD-10 diagnosis picker, live vitals<br>• **PBKDF2 Password Hashing**: 600,000 iterations with cryptographic per-user salts<br>• **Radix UI Accessible System**: Standardized components with dark-mode support | `/`<br>`/queue`<br>`/reception`<br>`/encounters`<br>`/login`, `/register` | **31** Checks Pass |
| [`Task_3`](Task_3) | **Advanced Multi-Shift Scheduling** | • **Multi-Session Shifts**: Support for Morning & Evening OPD shifts for same doctor on same day<br>• **Shift Recurrence**: Weekly recurring, specific monthly dates (1–31), or one-date-only clinics<br>• **Wave & Stream Parity**: Configurable wave capacity (1–20 patients/slot) with persistent tokens<br>• **Atomic Rescheduling**: 1-click slot rescheduling (claims new slot & frees old in single atomic step)<br>• **Doctor Clinical Leave Blocker**: Prevents appointment bookings on doctor leave dates<br>• **Session Overlap Protection**: Strict validation preventing overlapping shifts on identical dates | `/book`<br>`/doctor/availability`<br>`/doctor/dashboard`<br>`/schedule` | **198** Checks Pass |
| [`Task_4`](Task_4) | **Razorpay Payments & Refunds** | • **Razorpay Gateway Integration**: Test Mode sandbox payment processing with Razorpay checkout<br>• **10-Minute Seat Holds**: Temporary slot lock with `PENDING_PAYMENT` state & live countdown<br>• **Hold Expiration Sweeper**: Automatic background recovery of abandoned holds (`sweepExpiredHolds`)<br>• **HMAC-SHA256 Signature Verification**: Server-side verification of gateway order signatures<br>• **Tamper-Proof Fee Authority**: Consultation fee strictly pulled from database, ignoring client body<br>• **Idempotent Webhooks**: Safe handling of webhook replays with `payment_events` audit trail<br>• **Automated Tiered Refund Policy**: ≥24 hrs (100%), 2–24 hrs (50%), <2 hrs (0%), Doctor Cancel (100%)<br>• **Digital Receipts**: Printable/PDF payment receipts at `/patient/payments/[id]/receipt` | `/book`<br>`/patient/payments`<br>`/patient/payments/[id]/receipt`<br>`/api/webhooks/razorpay` | **270** Checks Pass |
| [`Task_5`](Task_5) | **Reliable Transactional Outbox** | • **Transactional Outbox Pattern**: Atomic database queuing of notifications during clinical operations<br>• **Multi-Provider Dispatch**: Primary Brevo API & Resend API dispatch with `ConsoleChannel` fallback<br>• **Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) Precision**: Hospital local time calculation across UTC runners<br>• **Pre-Send Status Recheck**: Prevents sending reminders if an appointment is cancelled post-queueing<br>• **Clinical PHI Redaction**: Strips patient identifying info from audit logs and dispatch traces<br>• **Patient Notification Preferences**: Granular opt-in/out toggles for email/SMS at `/settings`<br>• **Admin Dead-Letter Queue (DLQ)**: Real-time outbox monitor with 1-click retry at `/admin/notifications` | `/settings`<br>`/admin/notifications`<br>`/api/cron/notifications` | **299** Checks Pass |
| [`Task_6`](Task_6) | **Enterprise AI Clinical Assistant** | • **Multilingual AI Voice Assistant**: Powered by Sarvam AI (`sarvam-105b-conversations`) with STT & browser TTS<br>• **Emergency 112 Safety Triage**: Instant bypass routing for English, Hindi, Marathi, and Hinglish keywords<br>• **Patient-in-the-Loop 2-Step Actions**: HMAC-signed 5-minute single-use token cards before mutating DB<br>• **Role-Scoped Zod Clinical Tools**: Specialized tools for patients (slots, bookings, refunds) and doctors (schedules, prescriptions)<br>• **In-Chat Payment Flow**: Interactive Razorpay payment card rendered directly inside assistant chat<br>• **Elastic Session Scheduling**: Resize doctor session hours dynamically without dropping booked patients<br>• **Proactive Engagement Cron Jobs**: Post-visit follow-up, 90-day preventive care, and 180-day retention nudges<br>• **PostgreSQL Advisory Locks**: Concurrency serialization via `pg_advisory_xact_lock` on doctor-day hashes<br>• **Repository Pattern Decomposition**: Monolith decoupled into 5 domain repositories with shared context | Floating Chat<br>`/patient/dashboard`<br>`/doctor/dashboard`<br>`/patient/prescriptions`<br>`/api/agent/chat`<br>`/api/agent/confirm`<br>`/api/cron/engagement` | **489** Checks Pass |

---

## 🔑 Reviewer Demo Accounts & Test Credentials

All roles are pre-seeded in the database for instant testing:

| Role / Specialist | Login Email | Password | Clinical Purpose & Demo Focus |
|---|---|---|---|
| **Cardiology** | `dr.rohan.mehta@medrella.com` | `Doctor@123` | Morning & Evening OPD shifts · ₹800 consultation fee |
| **Neurology** | `dr.priya.nair@medrella.com` | `Doctor@123` | Wave & Stream sessions · ₹900 fee · Elastic rescheduling |
| **Orthopedics** | `dr.arjun.rao@medrella.com` | `Doctor@123` | Sports trauma OPD · ₹750 fee · Leave dates management |
| **General Medicine** | `dr.sandeep.kulkarni@medrella.com` | `Doctor@123` | Walk-in triage · ₹500 fee · SOAP notes & prescriptions |
| **Patient Account** | *Self-register at `/register`* | *Any 8+ char* | Instant access to AI Assistant, Slot Picker & Payments |
| **Admin Outbox** | `admin@rubyhall.com` | *Authorized* | Live Email Outbox & Dead-Letter Queue at `/admin/notifications` |

### Razorpay Sandbox Test Payment Details
- **Test Card (Visa)**: `4718 6091 0820 4366` · Exp: `12/28` · CVV: `123`
- **Test UPI**: `success@razorpay` *(instant success simulation)*

---

## 🏃 Running Any Task Locally

Each task directory (`Task_1` to `Task_6`) is completely standalone:

```bash
# 1. Enter any task directory
cd Task_6               # Or Task_1, Task_2, Task_3, Task_4, Task_5

# 2. Install dependencies
npm install

# 3. Configure local environment
cp .env.example .env.local

# 4. Start local development server
npm run dev
# Open http://localhost:3000

# 5. Run automated test suites (zero network required)
npm test
```

> [!TIP]
> **Zero-Database Offline Mode**: Tasks 2 through 6 include an automatic in-memory fallback. Set `DATABASE_URL="disabled-for-local-test"` and `USE_MOCK_PAYMENTS=true` to test all features with pre-seeded specialists and simulated payments without needing a PostgreSQL instance.

---

## 📄 License & Attribution

Developed for the **Pearl Thoughts** Full Stack Development Assessment by **Atharva Mandlik** for **Medrella Healthcare, Ruby Hall Clinic, Pune, Maharashtra**.
