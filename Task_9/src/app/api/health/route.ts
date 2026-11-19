import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, isPostgresConfigured } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus: "connected" | "degraded" | "in-memory-dev" = "in-memory-dev";
  let dbLatencyMs: number | undefined;

  if (isPostgresConfigured() && db) {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = "connected";
    } catch (err: any) {
      console.error("[HEALTH_CHECK_DB_ERROR]", err?.message || err);
      dbStatus = "degraded";
    }
  }

  const isHealthy = dbStatus === "connected" || dbStatus === "in-memory-dev";

  const responseBody = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
  };

  return NextResponse.json(responseBody, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
