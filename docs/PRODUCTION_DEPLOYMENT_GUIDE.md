# Medrella Healthcare — Production Deployment Guide

**Document Version:** 2.0.0  
**Target Platform:** Vercel / AWS / Docker / Kubernetes / Railway  
**Database:** PostgreSQL 15+ / Neon Serverless PostgreSQL  
**Runtime:** Node.js 20.x LTS  

---

## 1. System Architecture Overview

Medrella Healthcare is a high-reliability clinical healthcare platform engineered with Next.js 16 (App Router + Turbopack), Drizzle ORM, Neon Serverless PostgreSQL, Razorpay payments, and transactional email automation.

### Architecture Topology
- **Web & API Tier:** Next.js 16 App Router serverless functions with Turbopack compilation.
- **Persistence Tier:** PostgreSQL with connection pooling (`DB_POOL_MAX`), transaction advisory locks (`pg_advisory_xact_lock`), and atomic CTE rate limiting.
- **Payment Gateway:** Razorpay payment provider with HMAC-SHA256 webhook signature validation and idempotent refund lifecycle.
- **Messaging Outbox:** Resilient notification outbox with automated retry backoff, pre-send status re-checks, and dead-letter queuing (`/admin/notifications`).
- **Scheduled Automation:** Automated Vercel cron triggers for hold sweeps (`/api/cron/payments`) and outbox dispatching (`/api/cron/notifications`).

---

## 2. Pre-Deployment Prerequisites

Ensure you have the following credentials and accounts provisioned before proceeding:
1. **PostgreSQL Database:** Neon Serverless PostgreSQL connection string (`DATABASE_URL`).
2. **Session Encryption Secret:** 32+ byte cryptographic random key (`SESSION_SECRET`).
3. **Cron Authentication Secret:** Cryptographic bearer token (`CRON_SECRET`).
4. **Razorpay Production Account:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
5. **Transactional Email Provider:** Brevo (`BREVO_API_KEY`) or Resend (`RESEND_API_KEY`) with verified sender email.
6. **AI Agent (Optional):** Sarvam AI API key (`SARVAM_API_KEY`) for multilingual assistant.

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Clone Repository & Install Dependencies
```bash
git clone <repository_url> medrella-production
cd medrella-production
npm ci --omit=dev
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.production` (or configure secrets in your deployment dashboard):
```bash
cp .env.example .env.production
```
Generate high-entropy secrets for production:
```bash
# Generate SESSION_SECRET (minimum 32 bytes)
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -hex 24
```
Ensure all required variables in `ENVIRONMENT_VARIABLES.md` are populated.

### Step 3: Execute Connection-Pinned Database Migrations
Run the migration script to apply all schema changes. The runner automatically acquires a dedicated connection-pinned PostgreSQL advisory lock (`pg_advisory_lock(84729104)`), preventing concurrent migration races:
```bash
npm run db:migrate
```
*Verification:* Check migration output for `✅ All database migrations applied successfully.`

### Step 4: Seed Specialists Catalog (First-Time Deployment Only)
If deploying to a fresh database without doctor records:
```bash
SEED_DOCTOR_PASSWORD="<choose-a-strong-doctor-password>" npm run db:seed
```
*Note:* Existing accounts and passwords are not overwritten by the seed script.

### Step 5: Execute Pre-Deployment Quality Gate
Verify compilation and automated test suites:
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

### Step 6: Deploy to Vercel (Recommended)
1. Push your branch or connect your repository in Vercel.
2. In **Project Settings -> Environment Variables**, configure all variables from Section 2.
3. Deploy the project.
4. Verify that `vercel.json` automatically registers the cron jobs (all daily, UTC):
   - `/api/cron/notifications` at 02:00 (`0 2 * * *`)
   - `/api/cron/payments` at 02:30 (`30 2 * * *`)
   - `/api/cron/engagement` at 09:00 (`0 9 * * *`)

   > **Vercel Hobby limit:** the free Hobby plan only accepts cron jobs that run **at most once per day**. A schedule such as `* * * * *` or `*/10 * * * *` makes the whole deployment fail, and the site keeps serving the last successful build. Booking confirmations and receipts are still sent right after each action; the daily notification run is a backstop for reminders. For more frequent runs, use the Pro plan or call the endpoints from an external scheduler with the header `Authorization: Bearer <CRON_SECRET>`.

5. **Function region.** `vercel.json` sets `"regions": ["sin1"]` (Singapore) so the serverless functions run next to the Neon database (`ap-southeast-1`). Every page makes database round trips; with the default region (Washington, `iad1`) each one crossed the world and screens felt slow. If you ever move the database, change this to the nearest Vercel region (for example `bom1` for Mumbai, `iad1` for AWS us-east).

### Step 7: Alternative — Deploy with Docker Container
Build and launch using standard container tooling:
```bash
docker build -t medrella-healthcare:latest .
docker run -d \
  -p 3000:3000 \
  --name medrella-app \
  --env-file .env.production \
  medrella-healthcare:latest
```

---

## 4. Post-Deployment Verification & Smoke Testing

Immediately after deployment, perform the following verification checks:

### 1. Health Probe Verification
Send an HTTP GET request to `/api/health`:
```bash
curl -i https://your-domain.com/api/health
```
**Expected Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-11-12T...",
  "uptime": 12.4
}
```

### 2. Cron Endpoint Security Check
Verify that unauthenticated requests to cron endpoints are blocked:
```bash
curl -i https://your-domain.com/api/cron/payments
# Expected: 401 Unauthorized

curl -i -H "Authorization: Bearer <YOUR_CRON_SECRET>" https://your-domain.com/api/cron/payments
# Expected: 200 OK {"processed":0,"expired":0}
```

### 3. End-to-End Clinical Smoke Test
1. **Landing Page:** Navigate to `https://your-domain.com` and verify doctor cards render.
2. **Patient Registration:** Register a new test patient account.
3. **Session Cookie:** Confirm `medrella_session` cookie contains `HttpOnly; Secure; SameSite=Lax`.
4. **Slot Reservation:** Select an open appointment slot and observe payment hold countdown.
5. **Admin Dead-Letter Outbox:** Log in with an email listed in `ADMIN_EMAILS` and visit `/admin/notifications`.

---

## 5. Rollback & Disaster Recovery Strategy

### Application Rollback
- **Vercel:** In the Vercel dashboard, select **Deployments -> Previous Production Deployment -> Promote to Production**. Rollback takes <10 seconds.
- **Docker:** Re-point your reverse proxy (e.g., Nginx, Traefik) to the previous container image tag.

### Database Rollback Strategy
All migrations in `drizzle/` are strictly additive and non-destructive. If application rollback is required:
1. Retain the database schema; new nullable columns and tables do not break older application versions.
2. If data restoration is required, restore a point-in-time snapshot via the Neon console (Point-In-Time Restore supports 1-second granularity).

---

## 6. Security & Hardening Checklist

- [x] Strict Content Security Policy (CSP) headers enabled in `next.config.ts`.
- [x] Distributed rate limiting active on `/api/agent/*`, auth, and checkout routes.
- [x] Sensitive patient data excluded from all log statements and client responses.
- [x] Razorpay webhook endpoint verifies HMAC-SHA256 signature using `crypto.timingSafeEqual`.
- [x] Database connection pooling bounded to prevent pool exhaustion (`DB_POOL_MAX=10`).
