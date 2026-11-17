<div align="center">

# Task 8: Receptionist Front-Desk Console & Queue Unavailable/Reschedule

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16.4.6-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://www.sarvam.ai"><img src="https://img.shields.io/badge/Sarvam_AI_Agent-FF6F00?style=flat-square&logo=probot&logoColor=white" alt="Sarvam AI" /></a>
  <a href="https://razorpay.com"><img src="https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=flat-square&logo=razorpay&logoColor=3395FF" alt="Razorpay" /></a>
  <a href="https://neon.tech"><img src="https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=0B0D0E" alt="Neon Postgres" /></a>
</p>

</div>

Full-stack outpatient clinical management platform featuring **Receptionist Front-Desk Console**, **Queue Unavailable & Reschedule Workflow**, **Dynamic OPD Queue Management**, **Patient Check-in**, and **Conversational Healthcare Agent** for **Pearl Thoughts (Task 8)**.

---

## 💎 Task 8 Core Innovations

> [!NOTE]
> ### 👩‍💼 Receptionist Role & Unified Authorization (`src/domain/appointment-lifecycle.ts`)
> **Dedicated Clinical Staff Role** · Supports `"RECEPTIONIST"` role without database schema enum friction. 
> - **Authentication**: 3rd "Reception" tab on the `/login` screen (public self-signup restricted to patients/doctors).
> - **Navigation Shell**: Streamlined staff navbar and clinical sidebar with Reception Console and Live Queue links (prescription creation, patient payment checkout, and doctor schedule editing hidden).
> - **Centralized Authorization (`canManageAppointment`)**: Strict permissions engine across roles. Receptionists can check in same-day patients, mark waiting patients unavailable, reschedule, cancel, mark no-show (after slot start), and view queues across all doctors. Receptionists are strictly forbidden from starting (`CALL`) or completing consultations.
> - **Attribution**: Check-in and actions distinguish staff attribution (`"Reception: <name>"` vs `"Dr. <name>"`).

> [!TIP]
> ### 🖥️ Front-Desk Console (`/reception`)
> **Unified OPD Control Center** · View and manage today's appointments across **all doctors** in a single operational console.
> - **Zero N+1 Queries**: Single query `getAllAppointmentsForDate` joins appointments, patients, and doctors in one SQL query on PostgreSQL (and one in-memory filter/map).
> - **Doctor Filter Chips**: Real-time status chips per specialist with waiting counts, unarrived counts, and "Serving #X" badges.
> - **Search & Filter**: Instant filtering across patient name, phone number, and permanent token numbers.
> - **Per-Row Quick Actions**: Same-day Check In, Unavailable (with auto-reschedule), Reschedule, Cancel (with refund calculation preview), and No-Show.
> - **Live Synchronization**: Auto-refreshes every 20 seconds.

> [!IMPORTANT]
> ### 🔄 "Unavailable" Action & Continuous Queue Gap Closing (`src/actions/appointments.ts`, `src/lib/queue.ts`)
> **Dynamic Waiting Room Triage** · When a checked-in patient leaves the waiting room or misses their turn:
> - **Atomic CAS Transition**: Transitions `CHECKED_IN -> BOOKED`, clearing `checkedInAt` and `checkedInBy` while permanently retaining original token numbers.
> - **Contiguous Re-indexing**: Patient is immediately removed from the active waiting queue; all patients behind close up contiguous `1..N` positions with zero gaps.
> - **Immediate Reschedule Trigger**: Prompts the front-desk staff with `RescheduleModal` to move the patient to another available slot.
> - **Graceful Cancellation / Later Return**: If modal closed without picking a slot, the patient safely remains under "Not Yet Arrived" with Check In and Reschedule buttons intact. If they return later, re-check-in automatically moves them to the tail of the waiting line.
> - **Preserved Financial State**: Rescheduled visits maintain payment integrity without duplicate charges or fees.

> [!NOTE]
> ### 🚀 Offline Demo Environment & Walkthrough (`start-demo.bat`, `DEMO_RECEPTIONIST.md`)
> **Ready-to-Test Realistic OPD Simulation** · Gated under `DEMO_DATA=true`.
> - 1 Receptionist account (`reception.demo@medrella.demo`, password via `DEMO_RECEPTION_PASSWORD`).
> - 2 Demo doctors (General Medicine, Cardiology) with full 08:00 - 22:00 daily OPD sessions.
> - Realistic mid-day appointment queue relative to current server time: Completed, In Consultation, 3 Waiting out of order, Cancelled, No-Show, Not Arrived (including 1 whose slot has already started), and upcoming bookings.
> - Zero hard-coded credentials; passwords read securely from environment variables.

---

## 🔒 Security & Framework Updates

- **Next.js Security Patch**: Upgraded from `16.4.3` to `16.4.6` along with `eslint-config-next@16.4.6`.
- **Reschedule Authorization Hardening**: Enforces `canManageAppointment(user, appointment, "RESCHEDULE")` on the server action, preventing unauthorized patients from tampering with others' bookings.
- **Cross-Role Notification Routing**: When receptionists or doctors reschedule or cancel an appointment, notifications and calendar reminders are routed to the patient's verified email and user record rather than the staff actor.

---

## 🧪 Verification & Test Suite

The platform includes a dedicated Task 8 test suite (`src/test-receptionist-queue.ts`) integrated into `npm test`:

```bash
# Run all 16 test suites (859 total tests)
npm test

# Run Task 8 verification tests directly
npx tsx src/test-receptionist-queue.ts

# Run ESLint
npm run lint

# Run Next.js production build
npm run build
```

---

## 🏃 Running the Demo

See [DEMO_RECEPTIONIST.md](./DEMO_RECEPTIONIST.md) for complete step-by-step instructions.

```cmd
cd Task_8
start-demo.bat
```
