import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Guards the background-job endpoints. In production CRON_SECRET is mandatory: without it the
 * endpoints refuse to run instead of being open to the internet. Returns a response to send back
 * when the caller is not allowed, or null when the request may proceed.
 */
export function rejectUnauthorizedCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Cron endpoint is not configured" }, { status: 503 });
    }
    return null; // Local development without a secret
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const allowed = expected.length === received.length && crypto.timingSafeEqual(expected, received);
  return allowed ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
