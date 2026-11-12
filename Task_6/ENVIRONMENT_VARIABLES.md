# Medrella Healthcare — Production Environment Variables Reference

**Document Version:** 2.0.0  
**Target:** Production, Staging, CI/CD, and Development  

---

## 1. Quick Summary Matrix

| Variable Name | Required (Prod) | Secret? | Default Value | Description |
| :--- | :---: | :---: | :--- | :--- |
| `DATABASE_URL` | **YES** | **YES** | *None* | PostgreSQL / Neon connection string with TLS |
| `DB_POOL_MAX` | NO | NO | `10` | Maximum connections per serverless instance pool |
| `TEST_DATABASE_URL` | NO | **YES** | *None* | Dedicated PostgreSQL instance for `npm run test:pg` |
| `SESSION_SECRET` | **YES** | **YES** | *None* | 32+ byte cryptographic key for PBKDF2/session signing |
| `CRON_SECRET` | **YES** | **YES** | *None* | Bearer token authenticating `/api/cron/*` endpoints |
| `APP_URL` | **YES** | NO | `http://localhost:3000` | Canonical production URL for email links and CORS |
| `ADMIN_EMAILS` | **YES** | NO | *None* | Comma-separated admin emails allowed into `/admin/*` |
| `RAZORPAY_KEY_ID` | **YES** | NO | *None* | Razorpay API key ID for payment checkouts |
| `RAZORPAY_KEY_SECRET` | **YES** | **YES** | *None* | Razorpay API secret key for order creation |
| `RAZORPAY_WEBHOOK_SECRET` | **YES** | **YES** | *None* | HMAC-SHA256 secret validating webhook signatures |
| `PAYMENT_HOLD_MINUTES` | NO | NO | `10` | Reservation lock duration during payment checkout |
| `EMAIL_PROVIDER` | NO | NO | `brevo` | Primary email delivery provider (`brevo` or `resend`) |
| `BREVO_API_KEY` | **YES** | **YES** | *None* | Brevo transactional email delivery API key |
| `EMAIL_FROM` | **YES** | NO | *None* | Verified sender address (e.g., `care@medrella.com`) |
| `RESEND_API_KEY` | NO | **YES** | *None* | Alternative Resend email API key |
| `REMINDER_OFFSETS_MINUTES`| NO | NO | `1440,120` | Pre-visit reminder offsets in minutes (24h and 2h) |
| `SARVAM_API_KEY` | NO | **YES** | *None* | Sarvam AI API key for voice assistant |
| `SARVAM_MODEL` | NO | NO | `sarvam-105b-conversations` | Multilingual conversational LLM model |
| `SEED_DOCTOR_PASSWORD` | NO | **YES** | *None* | Password assigned when running `npm run db:seed` |
| `ENABLE_SEED_DATA` | NO | NO | `false` | Offline dev auto-seeding flag (FORBIDDEN in prod) |

---

## 2. Detailed Variable Specifications

### 2.1 Database & Infrastructure

#### `DATABASE_URL`
- **Type:** String (URI format: `postgres://...` or `postgresql://...`)
- **Required in Production:** YES
- **Secret:** YES (Never commit to version control)
- **Validation:** Enforced by `src/lib/env.ts` during runtime startup.
- **Description:** Direct pooled connection string to the PostgreSQL database. Must specify `sslmode=require` in production.
- **Example:** `postgresql://medrella_admin:Secr3tP@ss@ep-winter-pooler.us-east-2.aws.neon.tech/medrella?sslmode=require`

#### `DB_POOL_MAX`
- **Type:** Number (Integer, 1–50)
- **Required in Production:** NO
- **Default:** `10`
- **Description:** Caps the maximum number of client connections per serverless function instance. Prevents connection exhaustion on Neon/PostgreSQL when handling sudden traffic spikes.

#### `TEST_DATABASE_URL`
- **Type:** String (PostgreSQL URI)
- **Required in Production:** NO (Required only for CI/CD or running `npm run test:pg`)
- **Description:** Dedicated test database used by `scripts/test-pg-integration.ts` to execute schema validation, advisory locks, rollback integrity, and concurrency checks.

---

### 2.2 Security & Authentication

#### `SESSION_SECRET`
- **Type:** String (Cryptographic string, minimum 32 characters)
- **Required in Production:** YES
- **Secret:** YES
- **Validation:** Strictly rejected if under 32 characters or matching template placeholders (`your-32-byte-secret...`).
- **Description:** Used to sign and verify patient and doctor authentication session cookies (`medrella_session`) and generate HMAC tokens for email preference unsubscribe links.
- **Generation:** `openssl rand -base64 32`

#### `CRON_SECRET`
- **Type:** String (Cryptographic token, minimum 16 characters)
- **Required in Production:** YES
- **Secret:** YES
- **Validation:** Enforced by `src/lib/cron-auth.ts`. Requests to `/api/cron/*` without `Authorization: Bearer <CRON_SECRET>` return HTTP 401.
- **Description:** Authenticates scheduled background jobs dispatched by Vercel Cron or external schedulers.

#### `ADMIN_EMAILS`
- **Type:** String (Comma-separated list of email addresses)
- **Required in Production:** YES
- **Description:** Restricts access to the Notification Outbox dead-letter queue and administrative dashboards at `/admin/*`. Non-admin authenticated users receive an HTTP 404 (notFound).
- **Example:** `dr.sharma@medrella.com,admin@medrella.com`

---

### 2.3 Payments & Billing

#### `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`
- **Type:** String
- **Required in Production:** YES
- **Secret:** `RAZORPAY_KEY_SECRET` is sensitive.
- **Description:** Razorpay API credentials used to create orders, verify payments, and process patient refund requests.

#### `RAZORPAY_WEBHOOK_SECRET`
- **Type:** String
- **Required in Production:** YES
- **Secret:** YES
- **Description:** Secret shared between Razorpay dashboard and `/api/webhooks/razorpay` to cryptographically verify webhook payload authenticity using `crypto.createHmac("sha256", secret)`.

#### `PAYMENT_HOLD_MINUTES`
- **Type:** Number (Minutes)
- **Default:** `10`
- **Description:** The duration a patient's requested appointment slot is reserved while completing payment on Razorpay. Automatically swept and freed if payment is not confirmed within this window.

---

### 2.4 Notifications & Outbox

#### `BREVO_API_KEY` & `EMAIL_FROM`
- **Type:** String
- **Required in Production:** YES
- **Description:** Delivers transactional booking confirmations, rescheduling notices, reminder alerts, and refund receipts via Brevo API. `EMAIL_FROM` must match a verified domain/sender in Brevo.
- **Example:** `EMAIL_FROM="Medrella Healthcare <notifications@medrella.com>"`

#### `REMINDER_OFFSETS_MINUTES`
- **Type:** String (Comma-separated integers)
- **Default:** `1440,120` (24 hours and 2 hours before scheduled slot)
- **Description:** Configures pre-consultation reminder dispatch timings relative to the appointment start time in Asia/Kolkata timezone.
