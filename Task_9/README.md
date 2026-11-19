<div align="center">

# Task 8: Doctor-Assigned Receptionists & Queue Unavailable/Reschedule

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16.4.6-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://www.sarvam.ai"><img src="https://img.shields.io/badge/Sarvam_AI_Agent-FF6F00?style=flat-square&logo=probot&logoColor=white" alt="Sarvam AI" /></a>
  <a href="https://razorpay.com"><img src="https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=flat-square&logo=razorpay&logoColor=3395FF" alt="Razorpay" /></a>
  <a href="https://neon.tech"><img src="https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=0B0D0E" alt="Neon Postgres" /></a>
</p>

</div>

Full-stack outpatient clinical management platform featuring **Doctor-Assigned Receptionists**, **Receptionist Live Queue**, **Queue Unavailable & Reschedule Workflow**, **Dynamic OPD Queue Management**, **Patient Check-in**, and **Conversational Healthcare Agent** for **Pearl Thoughts (Task 8)**.

---

## 💎 Task 8 Core Innovations

> [!NOTE]
> ### 👩‍💼 Doctor-assigned receptionists with a clean role split
> **Doctor** = clinical decisions. **Receptionist** = front desk. Each role sees only the controls it owns, and the server enforces the same rule, so a hidden button cannot be used by calling the action directly.
>
> | Control | Doctor | Receptionist |
> |---|:---:|:---:|
> | Call patient in / Complete consultation | ✅ | hidden |
> | Check In / Unavailable (then reschedule) / No-Show | hidden while a receptionist is assigned | ✅ |
> | Cancel / Reschedule | ✅ (own agenda) | ✅ |
>
> - **Solo-doctor fallback**: a doctor with no receptionist keeps the front-desk controls, so nobody is ever stuck.
> - **Complete requires Call**: only a patient who is *in consultation* can be completed (check-in → call → complete).
> - **Authorization** lives in one place: `canManageAppointment` + `getQueueControls` (`src/domain/appointment-lifecycle.ts`), loaded with the clinic facts it needs by `src/domain/appointment-access.ts`.

> [!TIP]
> ### 🖥️ `/reception`: the doctor's Live Queue, scoped to the assigned doctor(s)
> The receptionist's page is the **same shared queue view** as the doctor's `/queue` (`src/app/queue/queue-view.tsx`), so the two always look and behave alike.
> - A receptionist sees **only doctors who assigned them**; asking for any other doctor falls back to their first assignment. With no assignment they see a "not assigned yet" screen.
> - Assigned to several doctors → a doctor switcher appears.
> - Check In and Unavailable on the queue; Reschedule / No-Show / Cancel on patients who have not arrived.
> - Auto-refresh every 20 s; the **patient dashboard also refreshes** (15 s) so check-in, "now serving", "your turn" and completion reach the patient without F5.

> [!IMPORTANT]
> ### 🧑‍⚕️ Reception Team (`/doctor/reception-team`)
> Doctors manage their own front desk: **create** a receptionist account (name, email, phone, starting password), **assign an existing** receptionist by email, **remove** one (access ends on their next request) and **reset the password** of an account they created. Data lives in two new tables, `receptionists` and `doctor_receptionists` (**migration `0009`**, see below).

> [!NOTE]
> ### 🔐 Receptionist login: a separate portal
> The normal login shows **Patient / Doctor** only. A **Receptionist** button beside **Need help?** opens the same page showing only the receptionist sign-in (`/login?portal=reception`), with no tabs and no Sign up. A receptionist cannot sign in through the patient/doctor form, and vice versa.

> [!IMPORTANT]
> ### 🔄 "Unavailable" action (`src/actions/appointments.ts`, `src/lib/queue.ts`)
> When a checked-in patient is not there when called:
> - **Atomic transition** `CHECKED_IN → BOOKED` (check-in cleared, token kept); the queue closes the gap with no holes.
> - The **Reschedule dialog opens immediately** (hosted by `UnavailableRescheduleProvider`, so it survives the page refresh). Closing it without a slot leaves the patient under *Not Yet Arrived*; coming back and checking in again puts them at the **end** of the queue.
> - Payment stays attached to the same appointment.

---

## 🔒 Security & Framework Updates

- **Next.js Security Patch**: Upgraded from `16.4.3` to `16.4.6` along with `eslint-config-next@16.4.6`.
- **Reschedule Authorization Hardening**: reschedule, cancel, check-in, Unavailable and No-Show are all gated server-side by the assignment-aware rules, so one patient (or a receptionist not assigned to that doctor) cannot touch another's booking.
- **Receptionist data scoping**: `/reception` and every action load the receptionist's assigned doctors from the database on each request; removing an assignment cuts access immediately.
- **Database migration `0009_receptionist_assignments`**: adds `receptionists` and `doctor_receptionists`. Apply it to the database **before** deploying this code (`npm run db:migrate-0009`); the `role` column needs no change (it is plain text).
- **Cross-Role Notification Routing**: When receptionists or doctors reschedule or cancel an appointment, notifications and calendar reminders are routed to the patient's verified email and user record rather than the staff actor.

---

## 🧪 Verification & Test Suite

The platform includes a dedicated Task 8 test suite (`src/test-receptionist-queue.ts`) integrated into `npm test`:

```bash
# Run every test suite
npm test

# Run Task 8 verification tests directly
npx tsx src/test-receptionist-queue.ts

# Run ESLint
npm run lint

# Run Next.js production build
npm run build
```

---

## 🏃 Running it locally

```cmd
cd Task_8
copy .env.example .env.local
```

In `.env.local` set `DATABASE_URL="disabled"` (in-memory data, no database), `USE_MOCK_PAYMENTS="true"`, `ENABLE_SEED_DATA="true"` and a `SEED_DOCTOR_PASSWORD` (8+ characters), then:

```cmd
npm run dev
```

Open http://localhost:3000. The built-in Ruby Hall doctors (for example `ananya.sharma@medrella.com` and `rohan.mehta@medrella.com`) are created at start-up with that password. There is no pre-made receptionist or queue data:

1. Register a patient at `/signup` and book a visit for today.
2. Sign in as a doctor, open **Reception Team** and **create** a receptionist (name, email, phone, starting password).
3. Sign in through the **Receptionist** button on the login page. You land on `/reception`.
4. Receptionist: **Check In** the patient. Doctor: **Call**, then **Complete**. Try **Unavailable** on a waiting patient.
5. A doctor with no receptionist keeps the check-in controls (solo-doctor fallback).

Restarting `npm run dev` clears all in-memory data.
