# Task 2: Medrella Hospital Appointment Booking Application

An outpatient appointment scheduling platform built for **Pearl Thoughts (Task 2)**. Matches the **Task 1 ER Diagram** specification (User $\rightarrow$ Patient $\rightarrow$ Doctor $\rightarrow$ Availability $\rightarrow$ Appointment) and adopts the sleek **Dark Mode** visual design of Task 1.

---

## 🚀 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **ORM & Database**: [Drizzle ORM](https://orm.drizzle.team/) + PostgreSQL (Neon Serverless compatible)
- **Validation**: [Zod](https://zod.dev/)
- **Authentication**: Role-based signed JWT session via HttpOnly cookies (Offline-ready, zero external dependency failures)

---

## ⚡ Core Features

1. **Specialist Directory & Filtering (`/doctors`)**:
   - Filter physicians by clinical department (Cardiology, Dermatology, Pediatrics, Orthopedics, General Medicine).
   - View doctor credentials, experience years, license number, and consultation fee.

2. **Dynamic Conflict-Proof Slot Picker (`/doctors/[id]`)**:
   - 7-day interactive date selector strip.
   - Dynamic time-slot computation based on each doctor's shift window and slot duration (e.g. 30m intervals between 09:00 and 17:00).
   - Real-time conflict prevention: already booked slots are disabled and crossed out.
   - Instant booking via Next.js Server Actions.

3. **Patient Portal & Dashboard (`/patient/dashboard`)**:
   - Overview metrics: scheduled visits, completed visits, patient contact info.
   - Chronological appointment queue with doctor details, date, time slot, and status pill.
   - One-click cancellation with real-time slot liberation.

4. **Doctor Portal & Shifts (`/doctor/dashboard`, `/doctor/availability`)**:
   - Today's patient consultation queue with chronological order and reason for visit.
   - Status actions: "Mark Completed" and "Cancel".
   - Weekly shift manager: configure consultation hours (start time, end time, 15m/20m/30m/45m/60m durations) and toggle off-days.

5. **Role-Based Authentication (`/login`, `/register`)**:
   - Instant role switcher: **Patient** vs **Doctor**.
   - Pre-seeded test accounts for instant evaluation.

---

## 🔑 Pre-Seeded Evaluation Credentials

Both demo accounts are pre-loaded with realistic appointments and shifts:

| Role | Email | Password | Details |
|---|---|---|---|
| **Doctor** | `doctor.smith@medrella.com` | `password123` | Cardiologist • 12 years exp • Active queue |
| **Doctor** | `doctor.chen@medrella.com` | `password123` | Dermatologist • 9 years exp • Active shifts |
| **Patient** | `patient.john@medrella.com` | `password123` | John Doe • Has scheduled upcoming appointment |

*(You can also register brand-new Patient or Doctor accounts directly from `/register`)*

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

3. Open **http://localhost:3000** (or http://localhost:3001 if port 3000 is occupied) in your browser.

---

## 📦 Production Build

To test the production build:
```bash
npm run build
npm run start
```
