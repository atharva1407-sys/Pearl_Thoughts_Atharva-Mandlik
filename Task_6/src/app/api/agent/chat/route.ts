import { NextRequest } from "next/server";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { LlmError, checkRateLimit, cleanUserMessage, getLlmClient, runAgent } from "@/lib/agent";
import { isSameOrigin, jsonResponse as json } from "@/lib/agent/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);

  const user = await getCurrentUser();
  if (!user || (user.role !== "PATIENT" && user.role !== "DOCTOR")) {
    return json({ error: "Please sign in to chat with the assistant." }, 401);
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

  // The profile comes from the signed session, never from the request body: this is what keeps each
  // role inside its own data.
  const patient = user.role === "PATIENT" ? await dbRepo.getPatientById(user.profileId) : undefined;
  const doctor = user.role === "DOCTOR" ? await dbRepo.getDoctorById(user.profileId) : undefined;
  if (!patient && !doctor) return json({ error: "Profile not found." }, 404);

  try {
    const result = await runAgent({
      repo: dbRepo,
      llm,
      userId: user.userId,
      patient,
      doctor,
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
