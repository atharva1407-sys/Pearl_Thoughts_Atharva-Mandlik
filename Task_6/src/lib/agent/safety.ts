/**
 * Deterministic safety checks that run BEFORE the language model sees a message.
 * A model must never be the only thing standing between a patient in an emergency and the
 * right guidance.
 */

const EMERGENCY_PATTERNS: RegExp[] = [
  /chest\s+pain|pain\s+in\s+(my\s+)?chest/i,
  /can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing|short(ness)?\s+of\s+breath/i,
  /heart\s+attack|stroke|seizure|unconscious|not\s+breathing|choking/i,
  /severe\s+bleeding|bleeding\s+(a\s+lot|heavily)|heavy\s+bleeding/i,
  /overdose|poison(ed|ing)?|snake\s*bite/i,
  /suicid|kill\s+myself|end\s+my\s+life|self[-\s]?harm/i,
  /सीने\s*में\s*दर्द|सांस\s*(नहीं|लेने\s*में)|बेहोश|दौरा\s*(पड़|आ)|मिर्गी|आत्महत्या|खून\s*बह/,
  /छातीत\s*दुखत|श्वास\s*घेता|बेशुद्ध/,
  // Hindi and Marathi typed in Roman script (Hinglish).
  /seene?\s*(me|mein|mai)\s*dard|chhaati\s*(me|mein)\s*dard|chaati\s*(me|mein)\s*dard|saans?\s*(nahi|nhi|lene\s*me)|behosh|bepuddh|aatmahatya|khoon\s*beh/i,
];

export function isEmergencyMessage(text: string): boolean {
  return EMERGENCY_PATTERNS.some((re) => re.test(text));
}

export const EMERGENCY_REPLY =
  "This sounds like it could be an emergency. Please call 112 (or 108 for an ambulance) right now, or go to the nearest hospital emergency department. " +
  "I can't help with emergencies and booking an appointment is not the right step. " +
  "If you are thinking about harming yourself, please call a helpline such as Tele-MANAS at 14416 or 1-800-891-4416 or tell someone close to you immediately.";

export const MAX_USER_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_MESSAGES = 12;

/** Trims and bounds a user message; returns null when it is empty. */
export function cleanUserMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_USER_MESSAGE_CHARS);
  return text.length ? text : null;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

/** Simple per-user sliding-window limit. In-memory: it resets on cold starts, which is fine for abuse control. */
export function checkRateLimit(userId: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_MESSAGES_PER_WINDOW) {
    hits.set(userId, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  hits.clear();
}

const DEVANAGARI = /[ऀ-ॿ]/;
const MARATHI_MARKERS = /(आहे|आहेत|मला|हवी|हवे|आम्ही|तुम्ही|कृपया|उद्या|काय|कोण|नाही|करा)/;

/** The language a message is written in, for the languages the assistant must answer in natively. */
export function detectReplyLanguage(text: string): "Hindi" | "Marathi" | null {
  if (!DEVANAGARI.test(text)) return null;
  return MARATHI_MARKERS.test(text) ? "Marathi" : "Hindi";
}
