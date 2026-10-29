import { NextRequest, NextResponse } from "next/server";
import { sweepExpiredHolds } from "@/lib/payments/expire";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Authorization via Bearer CRON_SECRET if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sweepExpiredHolds();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error("[CRON_PAYMENTS_ERROR]", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
