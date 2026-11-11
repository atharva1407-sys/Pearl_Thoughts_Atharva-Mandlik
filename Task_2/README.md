# Task 2: Medrella Clinical Outpatient Management Platform

Full-stack outpatient clinical management system built for **Pearl Thoughts (Task 2)**, incorporating the **Medrella Hospital Design System** for **Ruby Hall, Pune**.

---

## 💎 Clinical Highlights

> [!NOTE]
> ### 🏥 Real-Time Clinical Operations
> **Outpatient Census & Triage** · Live token waiting queue (`/queue`) with triage urgency badges (`Emergency`, `In consult`, `Waiting`) and obstetric pre-eclampsia override alerts. Reception desk (`/reception`) for patient search and walk-in token allocation.

> [!TIP]
> ### 🩺 Doctor Consultation Workspace
> **Encounters & Diagnostics (`/encounters`)** · Dedicated clinical workspace with Chief Complaint recording, SOAP progress notes, ICD-10 diagnosis selector, and recorded vitals (BP `168/110`, HR `102`, Temp `99.1°F`, SpO₂ `98%`).

> [!IMPORTANT]
> ### 🔒 Security & Concurrency Guard
> **Hardened Access** · PBKDF2 password hashing (600,000 iterations), stateless signed HTTP-only JWT cookies, and partial unique database index guards preventing double-booking race conditions.

---

## 🧭 Core Workspaces & Routes

| Module | Route | Highlights & Purpose |
|---|---|---|
| **Clinical Dashboard** | `/` | Outpatient census, 20-minute delay alert banner, today's appointments table, and quick actions. |
| **Live Waiting Queue** | `/queue` | Real-time token queue with triage badges, obstetric override, and next-patient vitals panel. |
| **Reception Desk** | `/reception` | Walk-in registration, token allocation, and specialist schedule monitoring. |
| **Doctor Encounters** | `/encounters` | Consultation workspace with Chief Complaint, SOAP notes, ICD-10 picker, and live vitals. |
| **Weekly Schedule** | `/schedule` | 7-day multi-column calendar grid (8:00 AM – 5:00 PM) with color-coded visit blocks. |
| **Specialist Booking** | `/doctors/[id]` | Conflict-proof slot picker with dynamic shift window calculation and booking summary. |
| **Shift Configurator** | `/doctor/availability` | 7-day shift roster to toggle working days, start/end hours, and slot durations (15m–60m). |

---

## 🛠️ Tech Stack & Automated Tests

| Layer | Technologies |
|---|---|
| **Framework & UI** | Next.js 16 (App Router + Turbopack), React 19, TypeScript, Tailwind CSS 4, Radix UI Primitives |
| **Database & ORM** | PostgreSQL (Neon Serverless), Drizzle ORM, Additive Migrations (`0000_lazy_bruce_banner.sql`) |
| **Authentication** | PBKDF2 (600,000 iterations), Signed HTTP-only JWT cookies, In-memory offline fallback |

```bash
cd Task_2
npm install
cp .env.example .env.local
npm run dev       # Starts server on http://localhost:3000
npm test          # Runs 31 automated tests (zero network needed)
```

| Suite | Tests | Result | Verification Focus |
|---|:---:|:---:|---|
| **`src/test-suite.ts`** | **31** | **Passed** | PBKDF2 security, double-booking prevention, cancellation rules, IST shifts, and queue triage. |
