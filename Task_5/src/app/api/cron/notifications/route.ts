import { NextRequest, NextResponse } from "next/server";
import { dbRepo } from "@/db/repo";
import { processDueNotifications } from "@/lib/notifications";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  try {
    const result = await processDueNotifications(dbRepo);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error("[CRON_NOTIFICATIONS_ERROR]", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
