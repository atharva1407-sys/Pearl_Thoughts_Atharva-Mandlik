<div align="center">

# Task 7: Patient Check-In & Dynamic OPD Queue Management

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
  <a href="https://www.sarvam.ai"><img src="https://img.shields.io/badge/Sarvam_AI_Agent-FF6F00?style=flat-square&logo=probot&logoColor=white" alt="Sarvam AI" /></a>
  <a href="https://razorpay.com"><img src="https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=flat-square&logo=razorpay&logoColor=3395FF" alt="Razorpay" /></a>
  <a href="https://neon.tech"><img src="https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=0B0D0E" alt="Neon Postgres" /></a>
</p>

</div>

Full-stack clinical management platform featuring **Patient Check-in**, **Dynamic OPD Queue Management**, **Conversational Healthcare Agent**, and **Elastic Scheduling** for **Pearl Thoughts (Task 7)**.

---

## 💎 Task 7 Core Innovations

> [!NOTE]
> ### 🤖 AI Assistant for Patients **and** Doctors (floating chat on each dashboard)
> **Text or voice, English / Hindi / Marathi / Hinglish** · Powered by Sarvam AI (`sarvam-105b-conversations`) with speech-to-text. The assistant performs **real operations through the same backend actions as the rest of the app** (slots, bookings, payments, refunds, prescriptions), but **every booking, cancellation and reschedule needs an explicit Confirm press** on a signed, 5-minute, single-use card. Pre-model safety checks send emergencies (English, Hindi, Marathi, Hinglish) straight to **112** without calling the model.

> [!TIP]
> ### 📅 Elastic Session Scheduling (`src/lib/elastic-schedule.ts`)
> **Dynamic Clinic Hours** · Doctors can stretch or shrink existing OPD sessions (Weekly Shifts → edit) **even when appointments are booked**. Live preview calculates added or removed slots. If hours shrink past booked patients, doctors choose: **move to nearest free slot** (default), **cancel and refund**, or **keep booked**.

> [!IMPORTANT]
> ### 📬 Proactive Patient Engagement Jobs (`/api/cron/engagement`)
> **Care Follow-Up & Retention** · Automated cron jobs run daily: post-visit follow-ups sent after consultation completion, preventive care reminders (90 days), and patient re-engagement nudges (180 days). Promotional messages are strictly gated by patient opt-in preferences.

> [!NOTE]
> ### 🏥 Patient Check-In & Dynamic OPD Queue Management (`src/lib/queue.ts`)
> **Live Triage & Consultation Progress** · Doctors and clinic staff can check in same-day `BOOKED` patients directly from their agenda or the live queue (`/queue`). Check-in records `checkedInAt` and `checkedInBy` with atomic database guards preventing duplicate attempts or timestamp overwriting.
> - **Dynamic Positions, Permanent Tokens**: Check-in order establishes queue positions (`1..N` with zero gaps). Permanent token numbers are never renumbered ("Token #5 · Position 2").
> - **Accurate Wait Times**: Computed using active session duration and elapsed consultation progress (replacing static token formulas).
> - **Clinical Lifecycle**: `BOOKED` → `CHECKED_IN` → `IN_CONSULTATION` → `COMPLETED`. Only one patient may be in consultation with a doctor at a time.
> - **Privacy-Safe Patient Portal**: Patients track live queue status ("Now Serving Token #3 · Your Token #5 · 1 patient ahead of you") with zero exposure of other patients' identities.
> - *Role Note*: The platform supports `DOCTOR` and `PATIENT` roles; doctors perform check-in and consultation control. A specialized `RECEPTIONIST` front-desk role is documented as a future access control extension.

---

## 🧭 Assistant Pipeline & Safety

| Step | Component | Safety & Privacy Implementation |
|:---:|---|---|
| **1** | **Request** | Signed-in patients **or doctors** only, same-origin check, rate limit of 20 messages per 10 minutes. The profile comes from the signed session, never from the request. |
| **2** | **Emergency filter** | English, Hindi, Marathi and Hinglish keywords. Routes to 112 instantly without contacting the model. |
| **3** | **Tool calling** | The role decides which tools exist: a doctor cannot reach patient tools and the reverse. Arguments are validated with Zod; at most 3 tool calls per round and 6 rounds. Doctor tools are scoped to the signed-in doctor, patient tools to the signed-in patient. |
| **4** | **Propose, then confirm** | Booking, cancelling and rescheduling tools only **prepare** an action and return a card with a signed token (HMAC, bound to the user, 5 minutes, single use). Nothing changes until the user presses **Confirm**. |
| **5** | **Revalidation** | `POST /api/agent/confirm` verifies the token, then re-checks the slot, ownership and status against the live database before running the normal server action (double-booking guard, payment order, refund, e-mails). If the slot was taken meanwhile, nothing is booked and alternatives are offered. |
| **6** | **Payment** | Paid visits hold the seat and show a **payment card** in the chat (Razorpay Checkout, or the test gateway locally). The server verifies the signature and asks the gateway before confirming. Failed, abandoned or expired payments leave the hold to expire safely; the card can also release the seat. |
| **7** | **Audit logging** | Tool calls, confirmations and errors go to `agent_events` with ids only, **never raw message text**. Doctor tools never return patient phone numbers or e-mails. |

### Patient tools

| Tool | Effect |
|---|---|
| `search_doctors` | Find doctors by name or specialty (fee, experience). |
| `get_open_slots` | Open slots for a doctor on a date, as tappable chips. |
| `suggest_alternative_slots` | Nearest open times (same day first, then the next days) when the wanted slot is taken. |
| `list_my_appointments` | Upcoming, past or all of the patient's own appointments. |
| `propose_booking` / `propose_cancel_appointment` / `propose_reschedule_appointment` | Prepare the action; a Confirm card appears (the cancel card shows the refund first). |
| `list_my_payments` | Payment history with refund status in plain words (requested, in progress, refunded, failed). |
| `list_my_prescriptions` | Prescriptions written by the patient's doctors. |

### Doctor tools (read and suggest)

| Tool | Effect |
|---|---|
| `get_my_appointments` | Appointments for today, a date or a range, with optional status filter. |
| `get_appointment_stats` | Counts by status (booked, completed, cancelled, no-show, pending payment) for a range. |
| `get_my_schedule` | Shifts (hours, slot length, repeat pattern), upcoming leaves, and whether a given day is a working day. |
| `find_schedule_conflicts` | Overlapping visits, overbooked slots, visits on leave days or outside working hours. |
| `get_my_open_slots` | Open slots (with seats left) on one chosen date, or that the day is a leave day. |
| `get_next_available_slot` | The next open slots. |
| `suggest_reschedule_slots` | Suitable slots to move one of the doctor's own appointments to. |

### Voice

| Capability | How |
|---|---|
| Text **and** voice | Type, tap the mic for one voice message, or tap the waveform button for a **hands-free conversation**. |
| Hands-free | One tap, then just talk: the app detects speech and pauses (voice-activity detection in `src/lib/voice/vad.ts`), sends each utterance for transcription, answers, and listens again. |
| Languages | Speech-to-text auto-detects English, Hindi, Marathi, Hinglish; replies follow the user's language and are read aloud with the matching browser voice (`hi-IN`, `mr-IN`, `en-IN`). |
| Interrupt | A **Stop** button, or simply talking over the assistant. |
| Own voice not captured | Echo cancellation and noise suppression are requested from the browser; the recorder is **switched off while the assistant speaks**; interruption needs a much louder voice held for a moment. |
| Privacy | The microphone is released when the chat closes, the tab is hidden or the page is left. |
| Cost | Speech-to-text only runs on real utterances; text-to-speech uses the free browser engine. |

### Chat history

A **History** button in the assistant's header lists the user's past conversations: reopen one to continue it, start a **New chat**, delete one, or clear them all. The open chat is restored after a page refresh.

| Aspect | How it works |
|---|---|
| Where it is stored | On **this device only** (browser storage), separately for each signed-in user. The server still never stores message text. |
| What is saved | Message text and harmless info or slot cards. Confirmation cards, payment cards and their signed tokens are **never** saved, so an old copy can't be pressed again. |
| Privacy | Cleared at sign-out and when the account is deleted. Up to 30 chats of 60 messages are kept; the oldest drop off first. |

### Prescriptions (new, needed by the assistant)

Doctors write a prescription for a completed visit (**Prescription** button in *Completed Consultations*). Patients read them at `/patient/prescriptions` or by asking the assistant. Table `prescriptions` via `npm run db:migrate-0007`.

---

## 🔄 Elastic Scheduling Resolution Options

When editing session hours that affect booked patients, the system requires an explicit clinical resolution:

| Resolution Strategy | Clinical Behavior | Notification & Refund |
|---|---|---|
| **Move to Nearest Slot** *(Default)* | Re-assigns booked patients to the closest available slot within the new session hours. | Patients are notified of their new time via email outbox. |
| **Cancel & Refund** | Cancels affected bookings and triggers an automated 100% full refund via the payment gateway. | Cancellation and refund confirmation emails are queued immediately. |
| **Keep as Booked** | Preserves existing appointments at their original times even if outside standard shift bounds. | Existing booking confirmation remains unchanged. |

---

## 🛠️ Verification & Test Suite

```bash
cd Task_7
npm install
cp .env.example .env.local
npm run db:migrate        # runs complete advisory-locked database migrations
npm run db:migrate-0008   # runs additive patient check-in & queue migration (columns & index)
npm run test:pg           # runs real PostgreSQL concurrency and advisory lock tests
npm run test:e2e          # runs Playwright E2E clinical user journeys
npm run dev               # Starts dev server on http://localhost:3000
npm test                  # Runs 840 automated tests across 15 suites (zero network needed)
```

| Test Suite | Tests | Result | Verification Scope |
|---|:---:|:---:|---|
| **`src/test-suite.ts`** | **115** | **Passed** | Clinical rules, wave/stream capacity, token sequences, and double-booking guard. |
| **`src/test-payment-hardening.ts`** | **72** | **Passed** | Razorpay webhooks, signature verification, seat holds, and tiered refund engine. |
| **`src/test-notifications.ts`** | **81** | **Passed** | Outbox deduplication, IST midnight calculations, PHI redaction, and DLQ retries. |
| **`src/test-brevo-welcome.ts`** | **31** | **Passed** | Welcome notification pipeline, template escaping, and non-blocking delivery. |
| **`src/test-agent.ts`** | **72** | **Passed** | Sarvam AI tool calling, safety checks, multilingual emergency triage, and crons. |
| **`src/test-assistant.ts`** | **99** | **Passed** | Doctor tools, confirmed booking/cancel/reschedule, expired/forged confirmations, slot taken guards, and VAD audio handling. |
| **`src/test-dev-store.ts`** | **14** | **Passed** | Dev and mock persistence validation across runtime environments. |
| **`src/test-voice-choice.ts`** | **13** | **Passed** | Multilingual speech synthesis selection and voice preference storage. |
| **`src/test-chat-history.ts`** | **41** | **Passed** | Device-scoped chat storage, privacy limits, sign-out purge, and timestamp formatting. |
| **`src/test-timezone.ts`** | **4** | **Passed** | Hospital timezone rules evaluated across UTC, Asia/Kolkata, America/Los_Angeles, Pacific/Auckland. |
| **`src/test-scheduling.ts`** | **114** | **Passed** | Wave & stream recurrence, specific-date shifts, and timezone cross-checks. |
| **`src/test-elastic.ts`** | **105** | **Passed** | Live OPD session expansion, shrinkage, slot calculation, and clinical conflict resolution. |
| **`src/test-phase1-hardening.ts`** | **48** | **Passed** | Distributed rate limiting, environment validation, background sweep safety, and advisory locks. |
| **`src/test-phase3-lifecycle.ts`** | **12** | **Passed** | Appointment state machine transitions, concurrency guards, and deterministic refund idempotency. |
| **`src/test-checkin-queue.ts`** | **19** | **Passed** | Patient check-in idempotency, queue order, dynamic repositioning, wait time estimation, and consultation progression. |
| **`tests/e2e/clinic.spec.ts`** | **10** | **Passed** | 10 Playwright E2E clinical journeys (registration, login, slot picker, voice UI, dashboard). |
| **Total Test Suite** | **850 Passed** | **0 Failed** | **100% Deterministic Verification** |

---

## 📚 Operational Runbooks & Documentation

- [🚀 Production Deployment Guide](../docs/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [🔐 Environment Variables Specification](../docs/ENVIRONMENT_VARIABLES.md)
- [🗄️ Database Migration Guide](../docs/DATABASE_MIGRATION_GUIDE.md)
- [🧪 Testing Guide](../docs/TESTING_GUIDE.md)
- [📋 Release Notes (v2.0.0)](../docs/RELEASE_NOTES.md)
- [🛡️ Production Readiness Report](../docs/PRODUCTION_READINESS_REPORT.md)
