import { NextRequest } from "next/server";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { checkRateLimitDistributed, executeConfirmation } from "@/lib/agent";
import { serverActionExecutor } from "@/lib/agent/executor";
import { isSameOrigin, jsonResponse as json } from "@/lib/agent/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only way the assistant changes anything: the patient pressed Confirm on a card. The signed
 * token says exactly what was approved; the action is re-validated and then run through the same
 * server actions as the rest of the app.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);

  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") {
    return json({ error: "Please sign in as a patient to confirm this." }, 401);
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string") return json({ error: "Missing confirmation." }, 400);

  const limit = await checkRateLimitDistributed(`confirm:${user.userId}`, Date.now(), dbRepo);
  if (!limit.allowed) {
    return json({ error: "Too many confirmations. Please wait a little and try again." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const patient = await dbRepo.getPatientById(user.profileId);
  if (!patient) return json({ error: "Patient profile not found." }, 404);

  try {
    const result = await executeConfirmation({
      repo: dbRepo,
      userId: user.userId,
      patient,
      token: body.token,
      executor: serverActionExecutor,
    });
    return json({ ok: result.ok, code: result.code, message: result.message, payment: result.payment ?? null, cards: result.cards ?? [] });
  } catch (err) {
    console.error("[AGENT_CONFIRM_ERROR]", err);
    return json({ ok: false, code: "FAILED", message: "Something went wrong and nothing was changed. Please try again.", payment: null, cards: [] }, 500);
  }
}
