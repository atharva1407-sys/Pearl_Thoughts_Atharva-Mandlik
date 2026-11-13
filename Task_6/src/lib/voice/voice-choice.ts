/**
 * Choosing which installed browser voice reads the assistant's replies. Pure functions, so the
 * ranking can be tested without a browser. The default is a natural-sounding FEMALE Indian voice
 * matching the language of the reply (English, Hindi or Marathi).
 */

export type ReplyLang = "en-IN" | "hi-IN" | "mr-IN";

export const REPLY_LANGUAGES: { lang: ReplyLang; label: string; sample: string }[] = [
  { lang: "en-IN", label: "English", sample: "Hello, I am your Medrella assistant. How can I help you today?" },
  { lang: "hi-IN", label: "हिन्दी", sample: "नमस्ते, मैं आपकी मेड्रेला सहायक हूँ। मैं आपकी कैसे मदद कर सकती हूँ?" },
  { lang: "mr-IN", label: "मराठी", sample: "नमस्कार, मी तुमची मेड्रेला सहाय्यक आहे. मी तुम्हाला कशी मदत करू?" },
];

/** What a speech synthesis voice exposes (a subset, so tests can pass plain objects). */
export interface VoiceLike {
  name: string;
  lang: string;
}

/** First names of well-known female and male voices shipped with Windows, macOS, Android and Chrome. */
const FEMALE_NAMES = ["heera", "neerja", "kalpana", "swara", "aarohi", "veena", "lekha", "isha", "google हिन्दी", "google us english"];
const MALE_NAMES = ["ravi", "prabhat", "madhur", "hemant", "manohar", "rishi", "david", "mark"];

const norm = (tag: string) => tag.replace("_", "-").toLowerCase();
const baseOf = (tag: string) => norm(tag).split("-")[0];

export function voiceGender(voice: VoiceLike): "female" | "male" | "unknown" {
  const name = voice.name.toLowerCase();
  if (/\bfemale\b/.test(name) || FEMALE_NAMES.some((n) => name.includes(n))) return "female";
  if (/\bmale\b/.test(name) || MALE_NAMES.some((n) => name.includes(n))) return "male";
  return "unknown";
}

/** Higher is better for a reply in `lang`: the right language first, then female, then a natural/neural voice. */
export function scoreVoice(voice: VoiceLike, lang: ReplyLang): number {
  let score = 0;
  const tag = norm(voice.lang);
  if (tag === norm(lang)) score += 100;
  else if (baseOf(tag) === baseOf(lang)) score += 40;
  const gender = voiceGender(voice);
  if (gender === "female") score += 30;
  if (gender === "male") score -= 30;
  if (/natural|neural|online/i.test(voice.name)) score += 25; // Microsoft "Natural" voices sound the most human
  if (/google/i.test(voice.name)) score += 10;
  return score;
}

/** The languages whose voices may read a reply in `lang`, best match first. Marathi falls back to Hindi. */
function candidateBases(lang: ReplyLang): string[] {
  if (lang === "mr-IN") return ["mr", "hi"];
  return [baseOf(lang)];
}

/** Installed voices that can read `lang`, best first. */
export function voicesFor<T extends VoiceLike>(voices: T[], lang: ReplyLang): T[] {
  const bases = candidateBases(lang);
  return voices
    .filter((v) => bases.includes(baseOf(v.lang)))
    .map((v) => ({ v, s: scoreVoice(v, lang) - Math.max(0, bases.indexOf(baseOf(v.lang))) * 50 }))
    .sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v);
}

/** The voice to use: the one the user picked (if still installed), otherwise the best ranked one. */
export function chooseVoice<T extends VoiceLike>(voices: T[], lang: ReplyLang, savedName?: string | null): T | undefined {
  const candidates = voicesFor(voices, lang);
  if (savedName) {
    const saved = candidates.find((v) => v.name === savedName);
    if (saved) return saved;
  }
  return candidates[0];
}
