import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/actions/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // ~30s of compressed speech is far below this
const WINDOW_MS = 60_000;
const MAX_CLIPS_PER_WINDOW = 10;
const MAX_TRANSCRIPT_CHARS = 1000; // matches the chat input's maxLength

const hits = new Map<string, number[]>();

const json = (body: Record<string, unknown>, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

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
  if (!user || (user.role !== "PATIENT" && user.role !== "DOCTOR")) {
    return json({ error: "Please sign in to use voice input." }, 401);
  }

  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) return json({ error: "Voice input is not set up yet. Please type your message." }, 503);

  const limit = checkClipLimit(user.userId);
  if (!limit.allowed) {
    return json(
      { error: "You are sending voice clips too quickly. Please wait a little and try again." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) return json({ error: "No audio received." }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: "That recording is too long. Please keep it short." }, 413);

  // MediaRecorder reports types like "audio/webm;codecs=opus"; the upstream API wants a plain type and a file extension.
  const baseType = (file.type.split(";")[0] || "audio/webm").trim().toLowerCase();
  const ext = baseType.includes("ogg") ? "ogg" : baseType.includes("mp4") ? "mp4" : baseType.includes("wav") ? "wav" : "webm";
  const upstream = new FormData();
  upstream.append("file", new Blob([await file.arrayBuffer()], { type: baseType }), `voice.${ext}`);
  upstream.append("language_code", "unknown"); // auto-detect: English, Hindi, Marathi, ...

  let res: Response;
  try {
    res = await fetch(SARVAM_STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: upstream,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json({ error: "Voice input is unavailable right now. Please type your message." }, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[TRANSCRIBE_ERROR]", res.status, baseType, file.size, detail.slice(0, 300));
    return json({ error: "I couldn't understand that recording. Please try again or type your message." }, 502);
  }

  const data = (await res.json().catch(() => null)) as { transcript?: unknown } | null;
  const text = typeof data?.transcript === "string" ? data.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : "";
  if (!text) return json({ error: "I couldn't hear anything. Please try again." }, 422);

  return json({ text });
}
