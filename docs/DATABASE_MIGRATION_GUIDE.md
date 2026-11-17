# Medrella Healthcare — Database Migration Architecture Guide

**Document Version:** 2.0.0  
**Target Database:** PostgreSQL 15+ / Neon Serverless PostgreSQL  
**Tooling:** Drizzle ORM + Drizzle Kit + `@neondatabase/serverless`  

---

## 1. Migration Architecture & Locking Strategy

In serverless and auto-scaling cloud deployments, multiple container instances or build pipelines can boot simultaneously. Without distributed concurrency control, two parallel deployments could run migrations concurrently, corrupting the migration journal or executing duplicate DDL statements.

### Connection-Pinned Advisory Lock (ADR-001)
PostgreSQL session-level advisory locks (`pg_advisory_lock`) are bound to a **physical TCP database connection**. 

> [!CRITICAL]
> If an application calls `db.execute(sql`SELECT pg_advisory_lock(...)`)` through a connection pool, the lock statement may be issued on Connection A, while subsequent migration DDL statements are executed on Connection B, and the unlock statement executes on Connection C. This leaves the database unprotected or locked indefinitely.

To prevent this defect, Medrella Healthcare's migration runner (`scripts/migrate.ts`) checks out a single dedicated client from the pool via `pool.connect()`:
```ts
const client = await pool.connect();
try {
  // 1. Acquire advisory lock on the DEDICATED physical client
  await client.query("SELECT pg_advisory_lock(84729104);");

  // 2. Wrap the SAME client in Drizzle and execute migrations
  const migratorDb = drizzle(client);
  await migrate(migratorDb, { migrationsFolder: "drizzle" });
} finally {
  // 3. Guarantee lock release and connection checkout return
  try {
    await client.query("SELECT pg_advisory_unlock(84729104);");
  } finally {
    client.release();
    await pool.end();
  }
}
```

---

## 2. Migration Journal & History

Drizzle maintains the migration journal in the `public.__drizzle_migrations` table. Each migration script in `drizzle/` has a deterministic hash that is verified before application.

### Migration Sequence
1. `0000_complete_specialists_schema.sql`: Core tables (`users`, `patients`, `doctors`, `availabilities`, `appointments`, `doctor_leaves`).
2. `0001_add_appointment_hold_and_payment_events.sql`: `hold_expires_at`, `payment_events`, `refunds`.
3. `0002_add_notification_outbox.sql`: `notifications`, `notification_preferences`, deduplication keys.
4. `0003_add_session_wave_scheduling.sql`: Wave scheduling capacity, `token_number` column.
5. `0004_add_elastic_schedule_recurrence.sql`: Recurrence rules, valid date ranges, session renaming.
6. `0005_add_agent_events_and_prescriptions.sql`: Healthcare agent audit logs, electronic prescriptions.
7. `0006_add_refund_idempotency_and_provider_ids.sql`: `refunds.idempotency_key` unique constraint, provider tracking.
8. `0007_add_rate_limits_table.sql`: High-performance rate limiting storage with index on `(key, created_at)`.

---

## 3. How to Run Migrations

### Local & Production Migrations
```bash
# Ensure DATABASE_URL is set in environment
npm run db:migrate
```

### Dry-Run & Verification via PostgreSQL Integration Suite
```bash
# Verify migrations and concurrency locks against test database
npm run test:pg
```

---

## 4. Rollback & Emergency Disaster Recovery

### Non-Destructive Zero-Downtime Design
All migrations in Medrella Healthcare follow zero-downtime engineering principles:
- Columns added are either nullable or provide safe default values.
- Tables are never dropped or renamed in-place.
- Indexes are created concurrently or during initial setup.

### Clearing a Stale Lock (Emergency Only)
If a migration process was forcefully killed (e.g., node process terminated abruptly with `kill -9` while holding the lock), PostgreSQL releases session advisory locks automatically when the socket disconnects. 
If an orphaned connection persists:
```sql
-- Check active advisory locks
SELECT pid, locktype, objid, mode, granted 
FROM pg_locks 
WHERE locktype = 'advisory' AND objid = 84729104;

-- Terminate stale backend holding the lock
SELECT pg_terminate_backend(pid) 
FROM pg_locks 
WHERE locktype = 'advisory' AND objid = 84729104;
```
