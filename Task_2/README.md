# Task 2: Medrella Hospital Appointment & Clinical Management System

A full-stack clinical outpatient management platform built for **Pearl Thoughts (Task 2)**. Incorporates the **Medrella Hospital Design System** (`medrella-ui` light clinical medical theme, 238px operational sidebar, and sticky breadcrumb topbar) backed by **Next.js 16 App Router**, **TypeScript**, **Drizzle ORM**, **Zod**, and signed **JWT** authentication.

---

## 🚀 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + Medrella Clinical Healthcare Theme (`#f6f8fb` clinical background, `#14243d` ink, `#1769e8` Medrella royal blue)
- **Typography**: Google Fonts (`DM Sans` + `Manrope` + `JetBrains Mono`)
- **ORM & Database**: [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL (Neon Serverless compatible schema)
- **Validation**: [Zod](https://zod.dev/)
- **Authentication**: Role-based signed JWT session via HttpOnly cookies (Offline-ready, zero external dependency failures)

---

## ⚡ Core Pages & Modules

### 1. Clinical Operations Workspace
- **Dashboard (`/`)**: Daily outpatient census, 20-min delay alert banner, today's appointments table, live token queue summary, recent activity feed, and quick-action shortcuts.
- **Live Queue (`/queue`)**: Token-by-token live waiting board with triage badges (`Emergency`, `In consult`, `Waiting`), emergency override alert for obstetric pre-eclampsia (BP 168/110), and next-patient vitals panel.
- **Reception Desk (`/reception`)**: Outpatient search, walk-in token allocation, and real-time OPD shift monitoring across consulting specialists.
- **Weekly Schedule Matrix (`/schedule`)**: 7-day multi-column calendar grid (8:00 AM – 5:00 PM) with color-coded appointment blocks (Consultation, Antenatal, Procedure, Follow-up).
- **Doctor Encounters & Vitals (`/encounters`)**: Doctor consultation workspace with Chief Complaint, SOAP clinical notes, ICD-10 diagnosis selector, and live recorded vitals (BP `168/110`, HR `102`, Temp `99.1°F`, SpO₂ `98%`, Weight `72kg`).
- **Reports & Analytics (`/reports`)**: Outpatient census charts, 5-day daily visit bar charts, appointment type breakdown progress bars, and CSV report export.
- **Hospital Settings (`/settings`)**: Facility profile for `Ruby Hall, Pune` and infrastructure health monitor.

### 2. Specialist Booking & Patient Care
- **Specialist Directory (`/doctors`)**: Search and filter physicians by department (Cardiology, Dermatology, Pediatrics, Orthopedics, General Medicine).
- **Interactive Conflict-Proof Slot Picker (`/doctors/[id]`)**: 7-day date selector, dynamic shift window calculation, real-time conflict locking, and booking summary.
- **Patient Dashboard (`/patient/dashboard`)**: Patient care portal showing upcoming appointments, past consultation history, and one-click cancellation.

### 3. Physician Agenda & Shifts
- **Doctor Agenda (`/doctor/dashboard`)**: Live consultation queue, chronological patient list with chief complaints, "Done" completion action, and cancellation controls.
- **Weekly Shift Configurator (`/doctor/availability`)**: 7-day shift roster to toggle working days, set consultation start/end hours, and configure slot durations (15m, 20m, 30m, 45m, 60m).

---

## 🗄️ Database & PostgreSQL (Neon Serverless)

The application uses **Drizzle ORM** with native **Neon Serverless PostgreSQL** connection pooling, transactions, and partial index concurrency locking.

### 1. Database Setup & Push
Set your Neon PostgreSQL connection string in `.env.local`:
```bash
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
SESSION_SECRET="your-strong-random-session-secret"
```

To sync your database schema directly to Neon:
```bash
npm run db:push
```

### 2. Seed Initial Specialists & Shifts
To seed initial hospital specialists and weekly shift availability into Neon PostgreSQL:
```bash
npm run db:seed
```

### 3. Concurrency & Double-Booking Guard
Concurrency is enforced at the **PostgreSQL database engine level** via a partial unique index on `appointments`:
```sql
CREATE UNIQUE INDEX "doctor_slot_active_unique" 
ON "appointments" ("doctor_id", "appointment_date", "start_time") 
WHERE "status" != 'CANCELLED';
```
This guarantees that concurrent booking requests cannot double-book a specialist even under high traffic, while cancelled slots remain immediately available for other patients.

---

## 🔒 Security & Authorization Architecture

- **Password Hashing**: OWASP-standard PBKDF2-HMAC-SHA256 with **600,000 iterations**, 16-byte random salt, and constant-time buffer comparison (`crypto.timingSafeEqual`).
- **Session Tokens**: Signed HMAC-SHA256 HttpOnly session cookies. In production, startup fails if `SESSION_SECRET` is unset, preventing forgery.
- **Resource Ownership**:
  - `cancelAppointmentAction`: Strictly verifies that the caller is the patient who booked the appointment or the assigned doctor.
  - `completeAppointmentAction`: Strictly verifies that the caller is a doctor assigned to that specific appointment.
  - `updateAvailabilityAction`: Scoped strictly to the authenticated physician profile.
- **Collision-Proof IDs**: All entity IDs are generated using 128-bit cryptographically secure UUIDs (`crypto.randomUUID()`).

---

## ⚡ Core Outpatient Care vs. Ops Previews

1. **Core Outpatient Care** (Primary Task Requirements):
   - **Specialist Directory (`/doctors`)**: Search and filter physicians across medical departments.
   - **Conflict-Proof Slot Picker (`/doctors/[id]`)**: 7-day date selector, dynamic shift window calculation, real-time slot conflict locking.
   - **Patient Care Portal (`/patient/dashboard`)**: Patient upcoming visits, past history, and cancellation.
   - **Physician Agenda (`/doctor/dashboard`)**: Live patient queue, consultation status, and one-click completion.
   - **Weekly Shift Configurator (`/doctor/availability`)**: Configure consultation days, working hours, and slot durations.
   - **Authentication (`/login`, `/signup`)**: Role-based access with reactive Medrella hospital branding.

2. **Prototype & Ops Modules** (Hospital System UI Showcases):
   - **Dashboard (`/`)**: Daily census and activity overview.
   - **Live Queue (`/queue`)**: Token-by-token triage waiting board.
   - **Reception Desk (`/reception`)**: Walk-in registration and token assignment.
   - **Schedule Matrix (`/schedule`)**: Weekly multi-column calendar grid.
   - **Encounters & Vitals (`/encounters`)**: SOAP notes and vitals entry.
   - **Reports & Analytics (`/reports`)**: Outpatient analytics and dynamic CSV export.
   - **Facility Settings (`/settings`)**: Hospital profile for Ruby Hall, Pune.

---

## 🛠️ How to Run Locally

1. Navigate to the `Task_2` directory:
   ```bash
   cd Task_2
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open **http://localhost:3000** in your browser.

---

## 📦 Production Build

To run the production build:
```bash
npm run build
npm run start
```
All 17 routes are fully optimized and type-checked with zero compilation errors.
