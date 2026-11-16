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

export interface RateLimitStorage {
  recordFailedLogin?(identifier: string): Promise<void>;
  getRecentFailedLoginCount?(identifier: string, windowMinutes?: number): Promise<number>;
  consumeRateLimitToken?(
    key: string,
    maxLimit: number,
    windowMinutes: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>;
}

/** Simple per-user sliding-window limit. In-memory: it resets on cold starts, which is fine for offline tests and dev. */
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

/** Distributed per-user sliding-window limit backed by persistent storage with local memory acceleration. */
export async function checkRateLimitDistributed(
  userId: string,
  now: number = Date.now(),
  storage?: RateLimitStorage
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // 1. Fast-path local container check
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_MESSAGES_PER_WINDOW) {
    hits.set(userId, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }

  // 2. Distributed check across all serverless instances
  if (storage) {
    try {
      const windowMinutes = Math.ceil(WINDOW_MS / (60 * 1000));
      const identifier = `rl:${userId.trim().toLowerCase()}`;

      if (typeof storage.consumeRateLimitToken === "function") {
        const atomicRes = await storage.consumeRateLimitToken(identifier, MAX_MESSAGES_PER_WINDOW, windowMinutes);
        if (!atomicRes.allowed) {
          return { allowed: false, retryAfterSeconds: atomicRes.retryAfterSeconds };
        }
      } else if (
        typeof storage.getRecentFailedLoginCount === "function" &&
        typeof storage.recordFailedLogin === "function"
      ) {
        const count = await storage.getRecentFailedLoginCount(identifier, windowMinutes);
        if (count >= MAX_MESSAGES_PER_WINDOW) {
          return { allowed: false, retryAfterSeconds: 60 };
        }
        await storage.recordFailedLogin(identifier);
      }
    } catch (err) {
      console.warn("[RATE_LIMIT_STORAGE_WARN] Could not sync distributed rate limit:", err);
      // Fallback: local memory tracking continues below to prevent fail-open spikes
    }
  }

  // 3. Record in local memory
  recent.push(now);
  hits.set(userId, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  hits.clear();
}

const DEVANAGARI = /[ऀ-ॿ]/;
const MARATHI_MARKERS = /(आहे|आहेत|मला|हवी|हवे|आम्ही|तुम्ही|कृपया|उद्या|काय|कोण|नाही|करा)/;
const HINGLISH_WORDS = new Set([
  "mujhe", "mera", "meri", "mere", "chahiye", "chahie", "hai", "hain", "kal", "aaj", "parso", "kab", "kya", "kaun", "nahi", "nahin",
  "karo", "karna", "kijiye", "kardo", "batao", "bataiye", "dikhao", "dikhana", "dena", "lena", "wala", "wali", "liye", "subah",
  "shaam", "dopahar", "abhi", "kitna", "kitne", "milega", "mil", "sakta", "sakti", "bukhar", "dard", "se", "ko", "ka", "ki", "ke",
]);
/** Words that are also common English words are weighted out by requiring several distinct Hinglish hits. */
const HINGLISH_STRONG = new Set([
  "mujhe", "mera", "meri", "mere", "chahiye", "chahie", "hai", "hain", "kal", "aaj", "kab", "kya", "kaun", "nahi", "nahin", "karo",
  "karna", "kijiye", "kardo", "batao", "bataiye", "dikhao", "dikhana", "wala", "wali", "liye", "subah", "shaam", "dopahar", "abhi",
  "kitna", "kitne", "milega", "sakta", "sakti",
]);

function looksLikeHinglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = new Set(words.filter((w) => HINGLISH_WORDS.has(w)));
  const strong = [...hits].filter((w) => HINGLISH_STRONG.has(w)).length;
  return hits.size >= 3 && strong >= 2;
}

/** The language a message is written in, for the languages the assistant must answer in natively. */
export function detectReplyLanguage(text: string): "Hindi" | "Marathi" | "Hinglish" | null {
  if (!DEVANAGARI.test(text)) return looksLikeHinglish(text) ? "Hinglish" : null;
  return MARATHI_MARKERS.test(text) ? "Marathi" : "Hindi";
}
