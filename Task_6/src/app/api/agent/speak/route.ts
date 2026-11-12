import { NextRequest } from "next/server";
import { getCurrentUser } from "@/actions/auth";
import { speechLangFor, speakableText } from "@/lib/voice/speech-text";
import { isSameOrigin, jsonResponse as json } from "@/lib/agent/route-guard";
import { TTS_MAX_CHARS, TtsError, getTtsConfig, normalizeTtsLanguage, synthesizeSpeech } from "@/lib/agent/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
/** A reply is read as up to 3 short passages, so this allows about 30 spoken replies per 10 minutes. */
const MAX_CLIPS_PER_WINDOW = 90;
const hits = new Map<string, number[]>();

function checkClipLimit(userId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CLIPS_PER_WINDOW) {
    hits.set(userId, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Reads a short piece of the assistant's reply aloud with a natural voice. It returns mp3 audio. When
 * the voice service is not configured or fails, the browser falls back to its built-in voice, so a
 * non-OK answer here never breaks the conversation.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);

  const user = await getCurrentUser();
  if (!user || (user.role !== "PATIENT" && user.role !== "DOCTOR")) {
    return json({ error: "Please sign in to use the assistant's voice." }, 401);
  }

  const config = getTtsConfig();
  if (!config) return json({ error: "The natural voice is not set up." }, 503);

  const body = (await request.json().catch(() => null)) as { text?: unknown; language?: unknown } | null;
  const text = typeof body?.text === "string" ? speakableText(body.text).slice(0, TTS_MAX_CHARS) : "";
  if (!text) return json({ error: "Nothing to read aloud." }, 400);
  const language = body?.language ? normalizeTtsLanguage(body.language) : speechLangFor(text);

  const limit = checkClipLimit(user.userId);
  if (!limit.allowed) {
    return json({ error: "Too much speech requested. Please wait a little." }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  try {
    const { audio, contentType } = await synthesizeSpeech({ text, language }, config);
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store", "Content-Length": String(audio.length) },
    });
  } catch (err) {
    console.error("[AGENT_SPEAK_ERROR]", err instanceof TtsError ? err.message : "unexpected error");
    return json({ error: "The natural voice is unavailable right now." }, 502);
  }
}
