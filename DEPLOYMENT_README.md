# Medrella Healthcare

Outpatient hospital appointment and clinical scheduling platform for **Medrella Healthcare, Ruby Hall, Pune**.
Patients find a specialist, pick an open OPD slot, pay the consultation fee online and get a confirmed appointment. Doctors manage their sessions, leave and queue from their own dashboard.

**Live app:** https://medrella-healthcare.vercel.app

> Payments run in **Razorpay test mode**. No real money is charged. Use Razorpay's published test cards.

---

## Features

### For patients
- Sign up and sign in with secure, signed session cookies
- Browse specialists on the landing page, with each doctor's next open slot
- Book a slot in a doctor's OPD session (stream and wave scheduling with token numbers)
- Pay online: the booking is held for 10 minutes while you pay
- Reschedule an appointment, or cancel it with a live refund preview before you confirm
- See payment history, receipts and refund status
- Receive emails for booking, payment, cancellation, refunds and reminders

### For doctors
- Dashboard with today's appointments and the patient queue
- Weekly availability, multiple OPD sessions per day and session capacity
- Clinical leave management, with protection against leaving on days that already have bookings

### Payments and refunds
- Razorpay (test mode) behind a provider interface, so other gateways can be added
- Fees always come from the database; amounts from the browser are ignored
- Checkout signature and webhook signature are verified on the server
- Webhook events are stored and processed once, even if Razorpay sends them again
- Seat holds expire safely, and late payments are confirmed or refunded automatically
- Refund policy: 100% if cancelled 24h or more before, 50% from 2h to 24h before, 0% under 2h; 100% if the doctor cancels
- A refund shows as "Refunded" only once the gateway confirms it

### Notifications
- Email via Resend (console output when no key is set)
- Reminders 24h and 2h before the visit; changed or removed automatically on reschedule and cancel
- Retries on failure and no duplicate messages

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL on Neon |
| ORM | Drizzle ORM |
| Validation | Zod |
| Auth | Signed HTTP-only session cookies, PBKDF2 password hashing |
| Payments | Razorpay (test mode) |
| Email | Resend |
| Hosting | Vercel |

---

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

To try the app without a database or payment keys, set `DATABASE_URL="disabled-for-local-test"` and `USE_MOCK_PAYMENTS=true`. This uses seeded in-memory data and a mock payment gateway (development only).

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Secret used to sign session cookies |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay test keys (required in production) |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying Razorpay webhooks |
| `CRON_SECRET` | Protects the `/api/cron/*` endpoints |
| `PAYMENT_HOLD_MINUTES` | Seat hold length (default 10) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email sending (optional) |

### Useful scripts

| Command | What it does |
|---|---|
| `npm test` | Runs the automated test suites |
| `npm run build` | Production build |
| `npm run db:push` | Applies the schema to an empty database |
| `npm run db:migrate-0003` | Adds the payments and notifications tables to an existing database |
| `npm run db:seed` | Seeds doctors |

---

## Deploying

1. Create a Neon database and set `DATABASE_URL`.
2. Apply the schema (`npm run db:push`, or `npm run db:migrate-0003` on an existing database).
3. Add the environment variables above in Vercel and deploy.
4. In the Razorpay dashboard, add a webhook to `https://<your-domain>/api/webhooks/razorpay` using the same secret as `RAZORPAY_WEBHOOK_SECRET`. Select the payment and refund events.

Production refuses to take payments if the Razorpay keys are missing. The mock gateway never runs in production.

---

## Project history

Built task by task for Pearl Thoughts: ER design, app foundation, the appointment platform, and payments with refunds and notifications. Each task folder and its notes live in the task repository: https://github.com/atharva1407-sys/Pearl_Thoughts_Atharva-Mandlik
