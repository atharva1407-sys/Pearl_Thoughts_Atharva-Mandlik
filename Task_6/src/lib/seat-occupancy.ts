import { sql, SQL } from "drizzle-orm";
import * as schema from "../db/schema";

/**
 * Checks if an in-memory appointment occupies a seat at a given point in time.
 * An appointment occupies a seat if:
 * 1. It is BOOKED, COMPLETED, or NO_SHOW.
 * 2. It is PENDING_PAYMENT and its hold has not yet expired (holdExpiresAt > now).
 * Expired holds and CANCELLED / EXPIRED appointments do NOT occupy a seat.
 */
export function appointmentOccupiesSeat(
  app: { status: string; holdExpiresAt?: Date | string | null },
  now: Date = new Date()
): boolean {
  if (app.status === "BOOKED" || app.status === "COMPLETED" || app.status === "NO_SHOW") {
    return true;
  }
  if (app.status === "PENDING_PAYMENT") {
    if (!app.holdExpiresAt) return false;
    const expires = typeof app.holdExpiresAt === "string" ? new Date(app.holdExpiresAt) : app.holdExpiresAt;
    return expires.getTime() > now.getTime();
  }
  return false;
}

/**
 * SQL expression for Postgres queries to filter appointments that currently occupy a seat.
 */
export function occupiesSeatSql(now: Date = new Date()): SQL {
  const nowIso = now.toISOString();
  return sql`(${schema.appointments.status} IN ('BOOKED', 'COMPLETED', 'NO_SHOW') OR (${schema.appointments.status} = 'PENDING_PAYMENT' AND ${schema.appointments.holdExpiresAt} > ${nowIso}::timestamp))`;
}
