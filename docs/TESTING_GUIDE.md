# Medrella Healthcare — Quality Engineering & Testing Guide

**Document Version:** 2.0.0  
**Coverage Target:** 100% of Critical Clinical Invariants, Payment Correctness, and Security Boundaries  
**Test Frameworks:** Node.js Native Assertions + TSX + Playwright + PostgreSQL Test Client  

---

## 1. Testing Pyramid Overview

Medrella Healthcare employs a rigorous three-tier testing strategy:

```
               ▲
              / \
             /   \      Tier 3: Browser E2E Tests (Playwright)
            / E2E \     User journeys, slot picker, voice UI, auth cookies
           /-------\
          /         \   Tier 2: Real PostgreSQL Integration (test:pg)
         / Integrat. \  ACID rollbacks, advisory locks, unique constraints (23505), CTEs
        /-------------\
       /               \ Tier 1: Domain & Security Suites (npm test)
      /   Unit/Domain   \ 11 suites, 580+ assertions, state machine, zero regressions
     /-------------------\
```

---

## 2. Tier 1 — Domain & Security Test Suites (`npm test`)

The primary test runner executes 11 comprehensive suites:

```bash
npm test
```

### Test Suite Inventory & Domain Coverage
1. **`src/test-suite.ts` (32 Sections, 115+ Assertions):**
   - Availability parsing, Asia/Kolkata date calculations, PBKDF2 600,000-iteration hashing.
   - Double-booking prevention, 2-hour cancellation cutoff, doctor completion check.
   - Doctor account deletion guard, login rate limiting (5 attempts/15 min), open-redirect defense.
   - Wave scheduling token serialization, atomic rescheduling, doctor clinical leaves.
   - Specialist catalog integrity, landing page next open slot discovery.
   - Resend/Brevo notification outbox, HMAC unsubscribe validation, Razorpay signature verification.
   - Payment expiration capacity release, refund policy tiers (100%, 50%, 0%), and hold sweeps.

2. **`src/test-payment-hardening.ts`:**
   - Pre-cancellation refund preparation (`REQUESTED` state).
   - Gateway unsent refund recovery via cron reconciliation.
   - Capping cumulative refunds to never exceed amount paid.

3. **`src/test-notifications.ts`:**
   - Durable outbox claiming with `SKIP LOCKED`.
   - Exponential retry backoff with jitter on transient email delivery failure.
   - Pre-send appointment status recheck (prevents reminders for cancelled bookings).

4. **`src/test-brevo-welcome.ts`:**
   - Account registration welcome email rendering and plain-text fallback.

5. **`src/test-agent.ts` & `src/test-assistant.ts` (99 Assertions):**
   - Multilingual Hinglish and English detection.
   - Prompt isolation: doctor read-only schedule assistant vs patient booking agent.
   - Voice audio stream cleanup and hands-free microphone silence detection.

6. **`src/test-timezone.ts` (4 Multi-Region Clock Shifts):**
   - Confirms hospital scheduling rules in Asia/Kolkata remain completely invariant even when server clock runs in UTC, America/Los_Angeles, or Pacific/Auckland.

7. **`src/test-scheduling.ts` & `src/test-elastic.ts` (223 Assertions):**
   - Recurrence calculation O(1) fast-paths for WEEKLY and ONE_TIME sessions.
   - Session relocation impact analysis (previewing movable vs stuck appointments on schedule shrink).

8. **`src/test-phase1-hardening.ts` (48 Assertions):**
   - Strict `validateEnv()` rejection of weak secrets and missing production variables.
   - Cron bearer token authentication.
   - `useVoice` utterance GC retention via `activeUtterancesRef`.
   - Connection-pinned migration locking (`scripts/migrate.ts`).
   - Distributed atomic CTE rate limiting.

9. **`src/test-phase3-lifecycle.ts` (12 Assertions):**
   - `AppointmentLifecycle` state machine legal and illegal status transitions.
   - Concurrency locking and wave capacity enforcement under burst traffic.
   - Deterministic refund idempotency key generation.

---

## 3. Tier 2 — Real PostgreSQL Integration (`npm run test:pg`)

Verifies live PostgreSQL behavior against a real instance (local or CI container):

```bash
# Set connection string to a test PostgreSQL database
export TEST_DATABASE_URL="postgres://user:password@localhost:5432/medrella_test"
npm run test:pg
```

### Verified Behaviors
- **Connection Probe:** Verifies physical TCP/TLS connectivity and database version.
- **Schema Presence:** Confirms all 11 required tables exist in the `public` schema.
- **Rollback Integrity:** Inserts records within a transaction, triggers an intentional rollback, and verifies zero residual data persists.
- **Advisory Locks:** Tests `pg_advisory_xact_lock` mutual exclusion.
- **Unique Constraint (23505) Recovery:** Triggers duplicate refund key insertion and tests graceful application recovery.
- **Atomic Rate Limiting:** Executes concurrent token consumption via data-modifying CTE.

---

## 4. Tier 3 — Playwright End-to-End Browser Testing (`npm run test:e2e`)

Automates real browser user journeys:

```bash
# Run all end-to-end user journeys
npm run test:e2e
```

### Test Journeys in `tests/e2e/clinic.spec.ts`
- **Journey 1:** Landing page header branding, specialist doctor cards, and next open slot display.
- **Journey 2:** Patient registration form validation and submission.
- **Journey 3:** Patient authentication login and `HttpOnly; Secure; SameSite=Lax` session cookie issuance.
- **Journey 4:** Interactive slot picker accessibility, keyboard navigation, and ARIA attributes (`aria-pressed`, `aria-label`).
- **Journey 5:** Voice assistant interactive UI drawer, microphone permissions, and status feedback regions.

---

## 5. Continuous Integration (CI) Automation

All three tiers are wired into `.github/workflows/ci.yml`. On every pull request and push to `main`:
1. ESLint (`npm run lint`)
2. TypeScript Typecheck (`npx tsc --noEmit`)
3. Domain Verification (`npm test`)
4. PostgreSQL Migrations (`npm run db:migrate`) against PostgreSQL 16 container
5. PostgreSQL Integration (`npm run test:pg`)
6. Production Build (`npm run build`)
