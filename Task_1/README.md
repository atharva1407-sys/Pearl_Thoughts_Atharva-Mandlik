<div align="center">

# Task 1: ER Diagram, Relational Architecture & Next.js Baseline

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16-000000?style=flat&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript_5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
</p>

</div>

Full-stack outpatient clinical model design and Next.js Turbopack application baseline for **Task 1 (Pearl Thoughts Assessment)**.

---

## 💎 Architecture & Artifacts

> [!NOTE]
> ### 📊 Outpatient Domain Relational Model
> Designed the complete entity architecture for outpatient clinic operations: `User` (identity & PBKDF2 credentials), `Patient` (demographics), `Doctor` (specialties & fees), `Availability` (OPD shifts & slots), and `Appointment` (bookings, statuses, & vitals).

> [!TIP]
> ### 🎥 Media & Documentation Artifacts
> * **Architecture Video Walkthrough**: `ER_Diagram.mp4` explaining entity relationships, cardinalities, and indexing strategies.
> * **High-Resolution ER Diagram**: `Task_1 - ER Diagram.png`.

---

## 🧭 Core Relational Schema

| Entity | Primary Attributes | Relational Cardinality | Purpose |
|---|---|---|---|
| `users` | `id`, `email`, `role`, `passwordHash` | 1-to-1 with `patients` or `doctors` | Authentication & role-based access control |
| `patients` | `id`, `userId`, `fullName`, `phone`, `gender` | 1-to-Many with `appointments` | Demographic patient records |
| `doctors` | `id`, `userId`, `name`, `department`, `consultationFee` | 1-to-Many with `doctor_sessions` | Consulting physicians & fee master |
| `doctor_sessions` | `id`, `doctorId`, `dayOfWeek`, `startTime`, `slotDuration` | 1-to-Many with `appointments` | Weekly outpatient shift availability |
| `appointments` | `id`, `patientId`, `doctorId`, `date`, `time`, `status` | Belongs to Patient & Doctor | Scheduled consultations & queue records |

---

## 🛠️ Tech Stack & Scripts

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router + Turbopack) |
| **Language** | TypeScript 5 (Strict Mode) |
| **Styling** | Tailwind CSS 4 |

```bash
cd Task_1
npm install
npm run dev       # Starts dev server on http://localhost:3000
npm run lint      # Runs ESLint code quality checks
npm run build     # Compiles production build
```
