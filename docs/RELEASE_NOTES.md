# Medrella Healthcare v2.0.0 — Production Release Notes

**Release Version:** `v2.0.0`  
**Release Date:** November 12, 2026  
**Target Platform:** Production (Vercel / AWS / Docker / Kubernetes)  
**Database:** PostgreSQL 15+ / Neon Serverless PostgreSQL  
**Runtime:** Node.js 20.x LTS  

---

## 1. Release Overview

Medrella Healthcare v2.0.0 is a comprehensive, production-grade architectural and security release. It hardens the clinical management, appointment booking, payment reconciliation, and doctor availability infrastructure to enterprise healthcare standards.

---

## 2. Key Architectural Highlights

### 2.1 Database Repository Decomposition (ADR-004)
- **Monolith Refactoring:** Decomposed the 3,600+ line monolithic `MedrellaRepository` into 5 domain-specific repositories:
  - `UserRepository`: User profiles, patient accounts, login attempts, distributed rate limits.
  - `DoctorRepository`: Doctor specialties, recurring OPD shifts (stream & wave), leaves, slot generation.
  - `AppointmentRepository`: Clinical visits, prescriptions, agent audit trail, double-booking locks.
  - `BillingRepository`: Payments, webhooks, hold timeouts, refund idempotency.
  - `NotificationRepository`: Durable outbox, `SKIP LOCKED` batch dispatching, dead-letter monitoring.
- **Backward-Compatible Facade:** `MedrellaRepository` in `src/db/repo.ts` now acts as a lightweight delegating facade (~350 lines), preserving 100% backward compatibility for existing server actions and test harnesses.

### 2.2 Concurrency & Double-Booking Prevention
- **Transaction-Level Advisory Locks:** Integrated `lockDoctorDay(tx, doctorId, date)` using `pg_advisory_xact_lock(hashtext('appointments:' || doctorId || ':' || date))` across appointment creation, rescheduling, and doctor leaves.
- **Occupancy Verification:** Guarantees 0% double-booking probability under burst concurrent load by re-verifying seat capacity within the lock boundary.

### 2.3 Payment & Refund Fault Tolerance
- **Error 23505 Unique Violation Recovery:** `BillingRepository.createRefund` and `prepareRefund` catch PostgreSQL unique constraint collisions on `refunds.idempotency_key` and gracefully return the existing refund, eliminating race condition crashes.
- **Two-Phase Preparation:** Refunds are durably recorded in `REQUESTED` status before communicating with gateway providers, with cumulative refunds strictly capped to paid amounts.

### 2.4 Authentication & Session Security
- **Unconditional HTTPS Cookies:** `src/actions/auth.ts` enforces `Secure; HttpOnly; SameSite=Lax` cookies across all production hosts (AWS, Docker, Railway, Render, etc.).
- **PBKDF2-HMAC-SHA512:** Secure password hashing using 600,000 iterations and 32-byte salts.
- **Strict Environment Validation:** Fails loudly during server startup if production secrets (`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`) are missing or weak.

### 2.5 Resilient Notification Outbox
- **Durable Outbox Pattern:** All transactional notifications are staged to the database and claimed in batches using PostgreSQL `SKIP LOCKED` with exponential retry backoff.
- **Pre-Send Recheck:** Checks appointment status immediately before sending reminders, preventing ghost alerts for cancelled or rescheduled appointments.
- **Administrative Dead-Letter Outbox:** Accessible at `/admin/notifications` for users authorized in `ADMIN_EMAILS`.

---

## 3. Testing & Verification Summary

- **TypeScript:** 0 type errors (`npx tsc --noEmit`).
- **ESLint:** 0 errors, 0 warnings (`npm run lint`).
- **Domain Verification:** 11 test suites executed locally; **580+ assertions passed with 0 failures**.
- **Playwright E2E:** 10 end-to-end browser journeys verified on headless Chromium.
- **PostgreSQL Integration:** Automated test harness implemented in `scripts/test-pg-integration.ts`.
- **CI/CD:** Automated dual-stage pipeline configured in `.github/workflows/ci.yml`.

---

## 4. Upgrade & Migration Instructions

1. Ensure all environment variables documented in `ENVIRONMENT_VARIABLES.md` are configured in your deployment platform.
2. Run database migrations before traffic cutover:
   ```bash
   npm run db:migrate
   ```
3. Deploy application assets and verify health at `/api/health`.
