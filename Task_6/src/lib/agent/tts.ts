/**
 * Natural-sounding speech for the assistant, from Sarvam AI's text-to-speech (the same provider and API
 * key as the chat model and speech recognition). The browser's own voices differ on every device and are
 * often robotic; this gives every user the same human voice in English, Hindi and Marathi.
 *
 * Pure server-side helper: the route handler adds sign-in, rate limiting and the HTTP response.
 */

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const REQUEST_TIMEOUT_MS = 15_000;

/** Languages the assistant speaks. Anything else falls back to Indian English. */
export const TTS_LANGUAGES = ["en-IN", "hi-IN", "mr-IN"] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number];

/** One request is one short passage; this keeps each call cheap and the first sound quick. */
export const TTS_MAX_CHARS = 500;

const DEFAULT_MODEL = "bulbul:v3";
/** Friendly default voice for each model generation. Change it with SARVAM_TTS_SPEAKER. */
const DEFAULT_SPEAKER: Record<string, string> = {
  "bulbul:v3": "priya",
  "bulbul:v2": "anushka",
};

export class TtsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "TtsError";
  }
}

export interface TtsConfig {
  apiKey: string;
  model: string;
  speaker: string;
  /** Speaking speed, 1 is normal. Sarvam accepts 0.5 to 2 (bulbul:v3). */
  pace: number;
}

/** Voice settings from the environment, or null when no Sarvam key is configured (the browser voice is used then). */
export function getTtsConfig(env: Record<string, string | undefined> = process.env): TtsConfig | null {
  const apiKey = env.SARVAM_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.SARVAM_TTS_MODEL?.trim() || DEFAULT_MODEL;
  const speaker = env.SARVAM_TTS_SPEAKER?.trim().toLowerCase() || DEFAULT_SPEAKER[model] || DEFAULT_SPEAKER[DEFAULT_MODEL];
  const paceValue = Number(env.SARVAM_TTS_PACE);
  const pace = Number.isFinite(paceValue) && paceValue >= 0.5 && paceValue <= 2 ? paceValue : 1;
  return { apiKey, model, speaker, pace };
}

export function normalizeTtsLanguage(language: unknown): TtsLanguage {
  return (TTS_LANGUAGES as readonly string[]).includes(language as string) ? (language as TtsLanguage) : "en-IN";
}

/**
 * Turns text into mp3 audio. Throws TtsError (never including the provider's response body or the API
 * key) so the caller can answer safely and the browser can fall back to its own voice.
 */
export async function synthesizeSpeech(
  input: { text: string; language: unknown },
  config: TtsConfig,
  fetchImpl: typeof fetch = fetch
): Promise<{ audio: Buffer; contentType: string }> {
  const text = input.text.trim().slice(0, TTS_MAX_CHARS);
  if (!text) throw new TtsError("There is nothing to say.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(SARVAM_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": config.apiKey },
      body: JSON.stringify({
        text,
        language_code: normalizeTtsLanguage(input.language),
        model: config.model,
        speaker: config.speaker,
        pace: config.pace,
        speech_sample_rate: 24000,
        output_audio_codec: "mp3",
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new TtsError((err as Error)?.name === "AbortError" ? "The voice service timed out." : "Could not reach the voice service.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new TtsError(`The voice service returned HTTP ${res.status}.`, res.status);

  const data = (await res.json().catch(() => null)) as { audios?: unknown } | null;
  const first = Array.isArray(data?.audios) ? data.audios[0] : undefined;
  if (typeof first !== "string" || first.length === 0) throw new TtsError("The voice service returned no audio.");

  const audio = Buffer.from(first, "base64");
  if (audio.length === 0) throw new TtsError("The voice service returned empty audio.");
  return { audio, contentType: "audio/mpeg" };
}
