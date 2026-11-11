<div align="center">

# 🏥 Medrella Healthcare — Clinical OPD & AI Platform

[![Next.js](https://img.shields.io/badge/Next.js_16.4-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=000000)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=0B0D0E)](https://neon.tech/)
[![Razorpay](https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=for-the-badge&logo=razorpay&logoColor=3395FF)](https://razorpay.com/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam_AI_Agent-FF6F00?style=for-the-badge&logo=probot&logoColor=white)](https://www.sarvam.ai/)
[![Deployment](https://img.shields.io/badge/Live_App_on_Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://medrella-healthcare.vercel.app)

</div>

Full-stack outpatient clinical management platform built for **Pearl Thoughts (Tasks 1–6)**, designed for **Medrella Healthcare, Ruby Hall, Pune, Maharashtra**.

---

## 🌐 Quick Links & Live Demonstrations

| Destination | Link | Description |
|---|---|---|
| 🚀 **Live Production App** | [medrella-healthcare.vercel.app](https://medrella-healthcare.vercel.app) | Live deployment on Vercel |
| 📦 **Deployment Repository** | [github.com/atharva1407-sys/Medrella_Healthcare](https://github.com/atharva1407-sys/Medrella_Healthcare) | Standalone deployment repository |
| 🤖 **Patient AI Assistant** | [/patient/assistant](https://medrella-healthcare.vercel.app/patient/assistant) | Multilingual triage & booking guidance |
| 📬 **Admin DLQ Outbox** | [/admin/notifications](https://medrella-healthcare.vercel.app/admin/notifications) | Dead-letter queue & email dispatch monitor |
| 📊 **Live OPD Waiting Queue** | [/queue](https://medrella-healthcare.vercel.app/queue) | Real-time triage with obstetric override |

---

## 💎 Project Highlights

> [!NOTE]
> ### 🏥 Clinical OPD Operations & Live Queue
> **Real-Time Patient Flow** · Token-by-token queue with triage badges (`Emergency`, `In consult`, `Waiting`), obstetric pre-eclampsia override banners (BP 168/110), reception desk walk-in tokens, and physician encounters with SOAP notes, ICD-10 diagnosis picker, and live vitals tracking.

> [!TIP]
> ### 📅 Elastic & Multi-Session Scheduling
> **Dynamic Clinic Hours** · Flexible Morning & Evening OPD shifts repeating weekly, on specific monthly dates (1–31), or one-date-only with Stream & Wave formats (1–20 patients/slot). Features **Elastic Scheduling** to expand/shrink session hours with active bookings without dropping patients.

> [!IMPORTANT]
> ### 💳 Razorpay Payments & Automated Tiered Refunds
> **Zero-Risk Transactions** · 10-minute concurrency seat holds, server-side HMAC-SHA256 signature verification, tamper-proof database fee authority, and automated tiered cancellation refunds (≥24h: 100%, 2h–24h: 50%, <2h: 0%, Doctor Cancel: 100%).

> [!NOTE]
> ### 🤖 Sarvam AI Healthcare Assistant & Reliable Outbox
> **Safe Patient-in-the-Loop AI** · Powered by Sarvam AI (`sarvam-105b-conversations`) with English, Hindi, and Marathi emergency triage (112 routing) and read-only slot proposal cards. Backed by Brevo & Resend transactional email outbox with Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) precision and clinical PHI redaction.

---

## 📂 Task-by-Task Repository Map

Every task folder is self-contained and independently runnable with its own automated verification tests:

| Module | Task Name | Key Deliverables & Capabilities | Tests |
|:---:|---|---|:---:|
| [`Task_1`](Task_1) | **ER Diagram & Architecture** | Relational outpatient domain model (`User` → `Patient` → `Doctor` → `Availability` → `Appointment`), architecture walkthrough video (`ER_Diagram.mp4`), and Next.js Turbopack baseline. | Lint Pass |
| [`Task_2`](Task_2) | **Medrella App Core** | Full-stack clinical management: Live Queue (`/queue`), Reception Desk (`/reception`), Encounters with SOAP notes & vitals (`/encounters`), PBKDF2 auth (600,000 iterations), and Radix UI design system. | **31** Pass |
| [`Task_3`](Task_3) | **Feedback & Scheduling** | Review feedback implementation: Multi-session shifts (weekly, monthly 1–31, one-date), Stream & Wave parity (1–20 patients/slot), atomic 1-click slot rescheduling, and doctor clinical leave guards. | **198** Pass |
| [`Task_4`](Task_4) | **Payments & Refunds** | Razorpay Test Mode integration, 10-min seat holds (`PENDING_PAYMENT`), HMAC-SHA256 signature verification, idempotent webhook processing, late-payment reconciliation, and tiered refunds. | **270** Pass |
| [`Task_5`](Task_5) | **Reliable Notifications** | Fail-safe transactional email outbox (Brevo/Resend), Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) precision, pre-send status recheck, clinical PHI redaction, patient settings (`/settings`), and admin DLQ dashboard (`/admin/notifications`). | **299** Pass |
| [`Task_6`](Task_6) | **Healthcare Agent** | Sarvam AI conversational assistant (`/patient/assistant`), English/Hindi/Marathi emergency triage (112 advice), tool calling proposal cards, proactive engagement cron jobs, and elastic session scheduling. | **390** Pass |

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies |
|---|---|
| **Framework & UI** | Next.js 16.4 (App Router), React 19, TypeScript 5, Tailwind CSS 4, Radix UI Primitives, Lucide Icons |
| **Database & ORM** | PostgreSQL (Neon Serverless), Drizzle ORM, Strictly Additive Migrations (`0000` to `0006`) |
| **Authentication** | PBKDF2 (600,000 iterations), Stateless signed HTTP-only JWT cookies, Password-confirmed deletion |
| **Payments & Gateways** | Razorpay (Test Mode Sandbox), Provider Abstraction (`RazorpayProvider`, `MockProvider`) |
| **Email & Outbox** | Transactional Outbox Pattern, Brevo API, Resend API, ConsoleChannel fallback, Asia/Kolkata (`Asia/Kolkata`, IST = UTC+05:30) scheduler |
| **AI Assistant** | Sarvam AI (`sarvam-105b-conversations`), Multilingual Triage (EN, HI, MR), Scoped Zod Tool Calling |

---

## 🏃 Quickstart: Running Any Task

Each task folder (`Task_1` to `Task_6`) runs independently:

```bash
cd Task_6               # Or Task_1, Task_2, Task_3, Task_4, Task_5
npm install
cp .env.example .env.local
npm run dev             # Starts dev server on http://localhost:3000
npm test                # Runs self-contained automated tests (zero network needed)
```

> [!TIP]
> **Zero-Database Offline Mode**: Tasks 2 through 6 include an in-memory repository fallback. Set `DATABASE_URL="disabled-for-local-test"` and `USE_MOCK_PAYMENTS=true` to test all features with pre-seeded specialists and simulated payments without needing PostgreSQL.

---

## 👤 Demo Accounts & Test Credentials

| Role | Email | Password | Details |
|---|---|---|---|
| **Cardiology** | `dr.rohan.mehta@medrella.com` | `Doctor@123` | Fee: ₹800 · Morning & Evening OPD |
| **Neurology** | `dr.priya.nair@medrella.com` | `Doctor@123` | Fee: ₹900 · Wave & Stream sessions |
| **Orthopedics** | `dr.arjun.rao@medrella.com` | `Doctor@123` | Fee: ₹750 · Sports medicine & trauma |
| **General Medicine** | `dr.sandeep.kulkarni@medrella.com` | `Doctor@123` | Fee: ₹500 · Walk-in and general OPD |
| **Patient Demo** | *Self-register at `/register`* | *Custom* | Instant access to Assistant & Booking |
| **Admin Outbox** | `admin@rubyhall.com` | *(Configured via `ADMIN_EMAILS`)* | Access to `/admin/notifications` |

### Razorpay Test Payment Instruments
* **Test Cards**: `4718 6091 0820 4366` (Visa) or `5267 3181 8797 5449` (Mastercard) · Expiry: `12/28` · CVV: `123`
* **Test UPI ID**: `success@razorpay` *(instant success simulation)*

---

## 📄 License & Attribution

Developed for the **Pearl Thoughts** Full Stack Development Assessment by **Atharva Mandlik** for **Medrella Healthcare, Ruby Hall, Pune, Maharashtra**.
