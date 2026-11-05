import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { LlmError, checkRateLimit, cleanUserMessage, getLlmClient, runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: NextRequest) {
  // Same-origin only: the session cookie must not be usable from another site.
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== request.headers.get("host")) return json({ error: "Forbidden." }, 403);
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") {
    return json({ error: "Please sign in as a patient to chat with the assistant." }, 401);
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;
  const message = cleanUserMessage(body?.message);
  if (!message) return json({ error: "Please type a message." }, 400);

  const llm = getLlmClient();
  if (!llm) return json({ error: "The assistant is not set up yet. Please try again later." }, 503);

  const limit = checkRateLimit(user.userId);
  if (!limit.allowed) {
    return json(
      { error: "You are sending messages too quickly. Please wait a little and try again." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const patient = await dbRepo.getPatientById(user.profileId);
  if (!patient) return json({ error: "Patient profile not found." }, 404);

  try {
    const result = await runAgent({
      repo: dbRepo,
      llm,
      userId: user.userId,
      patient,
      history: body?.history,
      message,
    });
    return json({ reply: result.reply, cards: result.cards, emergency: result.emergency ?? false });
  } catch (err) {
    if (err instanceof LlmError) {
      return json({ error: "The assistant is having trouble right now. Please try again in a moment." }, 502);
    }
    console.error("[AGENT_CHAT_ERROR]", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
