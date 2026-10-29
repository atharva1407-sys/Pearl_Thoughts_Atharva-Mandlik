import { NextRequest, NextResponse } from "next/server";
import { dbRepo } from "@/db/repo";
import { processDueNotifications } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
