import { NextRequest, NextResponse } from "next/server";
import { dbRepo } from "@/db/repo";
import { processDueNotifications } from "@/lib/notifications";
import { runEngagementSweep } from "@/lib/engagement";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

/** Queues follow-ups and care reminders, then sends whatever is due. Call once a day. */
export async function GET(request: NextRequest) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  try {
    const sweep = await runEngagementSweep(dbRepo);
    const delivery = await processDueNotifications(dbRepo);
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), sweep, delivery });
  } catch (err: any) {
    console.error("[CRON_ENGAGEMENT_ERROR]", err);
    return NextResponse.json({ success: false, error: "Engagement sweep failed." }, { status: 500 });
  }
}
