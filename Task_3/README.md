<div align="center">

# Task 3: Feedback Implementation & Multi-Session Scheduling

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16-000000?style=flat&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://neon.tech"><img src="https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=flat&logo=postgresql&logoColor=0B0D0E" alt="Neon Postgres" /></a>
  <a href="https://medrella-healthcare.vercel.app/schedule"><img src="https://img.shields.io/badge/Wave_&_Stream-OPD_Shifts-blue?style=flat" alt="Wave & Stream" /></a>
</p>

</div>

Outpatient clinic platform enhancements addressing review feedback and introducing multi-session Stream & Wave scheduling for **Pearl Thoughts (Task 3)**.

---

## 💎 Scheduling & Review Highlights

> [!NOTE]
> ### 📅 Multi-Session Wave & Stream Scheduling
> **Flexible Clinic Roster** · Support for Morning and Evening OPD shifts repeating weekly, on specific monthly dates (1–31), or running one-date-only. Unified Stream and Wave scheduling with configurable capacity (1–20 patients per slot) or wide arrival windows (e.g., 10:00–14:00 with 20 patients).

> [!TIP]
> ### ⚡ Atomic Slot Rescheduling & Leave Guard
> **Operational Continuity** · 1-click slot rescheduling preserving original booking audit timestamps in a single atomic database transaction. Doctor clinical leave prevents bookings on leave dates, with safety guards blocking leave on days with active appointments.

> [!IMPORTANT]
> ### 🔒 Review Feedback & Security Hardening
> **Scoped Access** · Scoped physician views so doctors see only their own patients and queue. Real-time database session verification on every request, password-confirmed atomic account deletion, login rate-limiting (5 attempts / 15m), and open-redirect protection.

---

## 🧭 Scheduling Capabilities Matrix

| Feature | Options & Scope | Operational Rules |
|---|---|---|
| **Recurrence** | Weekly, Date of Month (1–31), One-Date-Only | Bounded by optional `valid_from` and `valid_until` ranges. |
| **Shift Hours** | Flexible Start & End Times | Non-overlapping validation prevents overlapping sessions on shared dates. |
| **Slot Length** | 10 minutes to 10 hours, or Single Window | Full arrival window (e.g., 10:00–12:00 with 20 patients) processed by token. |
| **Capacity Type** | Stream or Wave | Configurable 1–20 patients per slot with concurrency locking. |
| **Doctor Leave** | Full-day clinical leave | Blocked if active bookings exist; cancels leave when removed. |
| **Rescheduling** | Instant 1-click slot swap | Preserves original booking timestamp in a single atomic transaction. |

---

## 👨‍⚕️ Landing Page Specialists Catalog

Features 8 founding specialists for **Ruby Hall, Pune** with real-time next-open-slot preview in Indian Standard Time (`Asia/Kolkata`, IST = UTC+05:30):

| Specialist | Department | Consultation Fee | Daily Session Pattern |
|---|---|:---:|---|
| **Dr. Rohan Mehta** | Cardiology | ₹800 | Morning (09:00–12:00) & Evening (16:00–18:00) |
| **Dr. Priya Nair** | Neurology | ₹900 | Morning Stream OPD (10:00–13:00) |
| **Dr. Arjun Rao** | Orthopedics | ₹750 | Afternoon Procedure Shift (13:00–17:00) |
| **Dr. Ananya Sharma** | Pediatrics | ₹600 | Morning Wave Clinic (09:30–12:30) |
| **Dr. Vikram Iyer** | Oncology | ₹1,200 | Bi-weekly Specialized Consultation |
| **Dr. Meera Krishnan** | Dermatology | ₹700 | Afternoon Stream Shift (14:00–17:00) |
| **Dr. Kavya Menon** | Gynecology | ₹800 | Morning High-Risk Antenatal OPD |
| **Dr. Sandeep Kulkarni** | General Medicine | ₹500 | Daily Morning & Evening Walk-in OPD |

---

## 🛠️ Verification & Test Suite

```bash
cd Task_3
npm install
cp .env.example .env.local
npm run dev       # Starts dev server on http://localhost:3000
npm test          # Runs 198 automated tests (zero network needed)
```

| Test Suite | Tests | Result | Coverage |
|---|:---:|:---:|---|
| **`src/test-suite.ts`** | **198** | **Passed** | Multi-session overlap checks, wave capacity, token sequences, atomic reschedule, doctor leave locks, specialists catalog, and 114 scheduling recurrence rules. |
