<div align="center">

# Task 6: Conversational Healthcare Agent & Elastic Scheduling

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam_AI_Agent-FF6F00?style=for-the-badge&logo=probot&logoColor=white)](https://www.sarvam.ai/)
[![Razorpay](https://img.shields.io/badge/Razorpay_Sandbox-02042B?style=for-the-badge&logo=razorpay&logoColor=3395FF)](https://razorpay.com/)
[![PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=0B0D0E)](https://neon.tech/)

</div>

Full-stack clinical management platform featuring a **Conversational Healthcare Agent**, **Proactive Engagement Jobs**, and **Elastic Scheduling** for **Pearl Thoughts (Task 6)**.

---

## 💎 Task 6 Core Innovations

> [!NOTE]
> ### 🤖 AI Assistant for Patients **and** Doctors (floating chat on each dashboard)
> **Text or voice, English / Hindi / Marathi / Hinglish** · Powered by Sarvam AI (`sarvam-105b-conversations`) with speech-to-text. The assistant performs **real operations through the same backend actions as the rest of the app** (slots, bookings, payments, refunds, prescriptions), but **every booking, cancellation and reschedule needs an explicit Confirm press** on a signed, 5-minute, single-use card. Pre-model safety checks send emergencies (English, Hindi, Marathi, Hinglish) straight to **112** without calling the model.

> [!TIP]
> ### 📅 Elastic Session Scheduling (`src/lib/elastic-schedule.ts`)
> **Dynamic Clinic Hours** · Doctors can stretch or shrink existing OPD sessions (Weekly Shifts → edit) **even when appointments are booked**. Live preview calculates added or removed slots. If hours shrink past booked patients, doctors choose: **move to nearest free slot** (default), **cancel and refund**, or **keep booked**.

> [!IMPORTANT]
> ### 📬 Proactive Patient Engagement Jobs (`/api/cron/engagement`)
> **Care Follow-Up & Retention** · Automated cron jobs run daily: post-visit follow-ups sent after consultation completion, preventive care reminders (90 days), and patient re-engagement nudges (180 days). Promotional messages are strictly gated by patient opt-in preferences.

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
cd Task_6
npm install
cp .env.example .env.local
npm run db:migrate-0005    # adds agent audit table
npm run db:migrate-0006    # adds flexible scheduling recurrence
npm run db:migrate-0007    # adds the prescriptions table (assistant + doctor prescriptions)
npm run dev               # Starts dev server on http://localhost:3000
npm test                  # Runs 485 automated tests (zero network needed)
```

| Test Suite | Tests | Result | Verification Scope |
|---|:---:|:---:|---|
| **`src/test-suite.ts`** | **115** | **Passed** | Clinical rules, wave/stream capacity, token sequences, and double-booking guard. |
| **`src/test-payment-hardening.ts`** | **72** | **Passed** | Razorpay webhooks, signature verification, seat holds, and tiered refund engine. |
| **`src/test-notifications.ts`** | **81** | **Passed** | Outbox deduplication, IST midnight calculations, PHI redaction, and DLQ retries. |
| **`src/test-agent.ts`** | **72** | **Passed** | Sarvam AI tool calling, safety checks, multilingual emergency triage, and crons. |
| **`src/test-assistant.ts`** | **95** | **Passed** | Doctor tools, confirmed booking/cancel/reschedule, expired and forged confirmations, slot taken at confirm time, conflict detection, prescriptions, role separation, voice activity detection and barge-in. |
| **Timezone & Recurrence** | **50** | **Passed** | Recurrence rules (dates 1–31, one-date-only) across multiple client timezones. |
| **Total Test Suite** | **485 Passed** | **0 Failed** | **100% Deterministic Verification** |
