<div align="center">

# 🏥 Medrella Healthcare

### Outpatient booking, payments and a multilingual voice AI assistant for Ruby Hall Clinic, Pune

*Pearl Thoughts Full Stack Assessment · Tasks 1 to 6*

<a href="https://medrella-healthcare.vercel.app"><img src="https://img.shields.io/badge/LIVE_DEMO-medrella--healthcare.vercel.app-0875DF?style=for-the-badge&logo=vercel&logoColor=white" alt="Live demo" /></a>
<a href="https://github.com/atharva1407-sys/Medrella_Healthcare"><img src="https://img.shields.io/badge/DEPLOYMENT_REPO-Medrella__Healthcare-181717?style=for-the-badge&logo=github&logoColor=white" alt="Deployment repository" /></a>

<img src="https://skillicons.dev/icons?i=nextjs,react,ts,tailwind,postgres,nodejs,vercel,githubactions&perline=8" alt="Next.js, React, TypeScript, Tailwind CSS, PostgreSQL, Node.js, Vercel, GitHub Actions" />

<img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=000000" alt="Drizzle ORM" />
<img src="https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=000000" alt="Neon" />
<img src="https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=3395FF" alt="Razorpay" />
<img src="https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white" alt="Zod" />
<img src="https://img.shields.io/badge/Sarvam_AI-FF6F00?style=for-the-badge" alt="Sarvam AI" />

</div>

---

## What this is

A hospital appointment platform built one task at a time. Patients find a doctor, book a slot, pay online and get email reminders. Doctors run their own schedule. A **voice AI assistant** (English, Hindi, Marathi, Hinglish) lets both sides do all of that by chatting, with an explicit **Confirm** before anything changes.

- 🔒 **No double booking**: database advisory locks serialize concurrent bookings.
- 🤖 **AI that acts safely**: real backend actions, signed single-use confirmations, emergency messages routed to 112.
- 💳 **Real payment flow**: Razorpay checkout, 10-minute seat holds, signature checks, tiered refunds.
- 📬 **Reliable emails**: transactional outbox with retries and a dead-letter dashboard.
- ✅ **Tested**: 750+ automated checks, run in CI on every push.

## 📋 All tasks and their features

Each folder is a complete, separately runnable app. Every task builds on the one before it.

| Task | Focus | Features | Checks |
|:---:|---|---|:---:|
| [**1**](Task_1) | ER design and baseline | • Relational model for users, patients, doctors, sessions and appointments<br>• ER diagram (PNG) and a video walkthrough<br>• Next.js 16 + TypeScript + Tailwind starter | n/a |
| [**2**](Task_2) | Core clinic app | • Live waiting queue with triage badges and an obstetric priority override<br>• Reception walk-ins and token allocation<br>• Doctor encounters: SOAP notes, ICD-10 diagnosis, vitals<br>• Weekly schedule view and conflict-proof slot booking<br>• Hashed passwords and signed session cookies | 17 |
| [**3**](Task_3) | Advanced scheduling | • Morning and evening sessions on the same day<br>• Weekly, monthly-date or one-date recurrence<br>• Stream and Wave capacity (1 to 20 patients per slot)<br>• Doctor leave, and one-click atomic reschedule<br>• Review fixes: doctors see only their own patients, login rate limit | 205 |
| [**4**](Task_4) | Razorpay payments | • Razorpay checkout in test mode<br>• 10-minute seat holds during payment<br>• Server-side signature checks and idempotent webhooks<br>• Refunds by notice: 100% (24h+), 50% (2 to 24h), 0% (under 2h)<br>• Printable receipts | 305 |
| [**5**](Task_5) | Email outbox | • Transactional outbox: emails never block a booking<br>• Brevo and Resend delivery with retries<br>• Confirmation and reminder emails, IST-accurate timing<br>• Medical details kept out of emails<br>• Admin dead-letter dashboard and one-click unsubscribe | 417 |
| [**6**](Task_6) | AI assistant and elastic scheduling | • **Assistant for patients and doctors**: text or hands-free voice, 4 languages, interrupt and stop<br>• Patients: search doctors, book, reschedule, cancel, pay in chat, see prescriptions and refunds<br>• Doctors: schedule, stats, leaves, conflicts, next free slot, reschedule suggestions<br>• **Confirm before any change**, slot rechecked at confirm time<br>• Elastic sessions: stretch or shrink hours even when booked<br>• Doctor-written prescriptions, follow-up and reminder jobs | 772 |

## 🎬 2-minute demo (what to click)

Open the **[live app](https://medrella-healthcare.vercel.app)** and follow along:

1. **Home** shows the 8 specialists with each one's next open slot.
2. **Register** as a patient at `/register` (any email, 8+ character password).
3. Open the **assistant** (round button, bottom right) and type *"Find a cardiologist"*, then *"Book Dr. Mehta tomorrow around 10:00"*.
4. A **Confirm card** appears. Nothing is booked until you press it. Then pay with the Razorpay test details below.
5. Try *"Kal ke liye slot dikhao"* (Hinglish), or tap the **waveform** for hands-free voice and talk over the reply to interrupt it.
6. Type *"I have chest pain"*: it answers with 112 emergency guidance and never calls the AI.
7. Ask to **cancel**: the refund amount is shown before you confirm.
8. As a **doctor** (logins on request): ask *"Any scheduling conflicts this week?"*, stretch or shrink a session in **Weekly Shifts** with patients booked, and add a prescription to a completed visit.

> **Razorpay test mode** (no real money): card `4718 6091 0820 4366`, expiry `12/28`, CVV `123`, or UPI `success@razorpay`.

## 🏃 Run it locally

```bash
cd Task_6                      # or Task_1 ... Task_5
npm install
cp .env.example .env.local
npm run dev                    # http://localhost:3000
npm test                       # all automated checks, no network needed
```

> **No database needed to try it.** Set `DATABASE_URL=disabled-for-local-test`, `USE_MOCK_PAYMENTS=true` and `ENABLE_SEED_DATA=true` in `.env.local`: the app runs in memory with the 8 specialists and a simulated payment gateway. Add `SARVAM_API_KEY` to turn on the assistant.

## 📦 Repositories

| Repository | Purpose |
|---|---|
| **This repo** (`Pearl_Thoughts_Atharva-Mandlik`) | Task by task history, Tasks 1 to 6 |
| [`Medrella_Healthcare`](https://github.com/atharva1407-sys/Medrella_Healthcare) | The production build deployed on Vercel, with CI and operations guides |

---

<div align="center">

Built by **Atharva Mandlik** for **Pearl Thoughts**, for Medrella Healthcare, Ruby Hall Clinic, Pune.

</div>
