import { detectReplyLanguage } from "../agent/safety";

/**
 * Text helpers for text-to-speech. Pure functions: what the assistant WRITES is not always what
 * should be SPOKEN (markdown marks, emoji, very long paragraphs the browser's speech engine cuts off).
 */

/** Removes formatting that would be read out loud as symbols. */
export function speakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>~|]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits text into short sentences. Browsers stop reading long utterances part-way, and short ones
 * also make "stop" respond quickly.
 */
export function splitForSpeech(text: string, maxLen = 180): string[] {
  const sentences = text.match(/[^.!?।\n]+[.!?।]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      if (current) parts.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += maxLen) parts.push(sentence.slice(i, i + maxLen).trim());
      continue;
    }
    if (current && current.length + sentence.length + 1 > maxLen) {
      parts.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Splits a reply into at most a few clips for the natural voice. The FIRST clip is short so sound starts
 * quickly; the next clips are fetched while it plays. Whole sentences only, in order.
 */
export function groupForTts(text: string, options: { firstMax?: number; maxChars?: number; maxGroups?: number } = {}): string[] {
  const { firstMax = 180, maxChars = 420, maxGroups = 3 } = options;
  // True sentences (splitForSpeech already merges them into long blocks); an over-long sentence is cut at maxChars.
  const sentences = (text.match(/[^.!?।\n]+[.!?।]*/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (s.length > maxChars ? (s.match(new RegExp(`.{1,${maxChars}}`, "g")) ?? [s]) : [s]));
  const groups: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const limit = groups.length === 0 ? firstMax : maxChars;
    if (current && current.length + 1 + sentence.length > limit) {
      groups.push(current);
      current = "";
      if (groups.length >= maxGroups) return groups;
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) groups.push(current);
  return groups;
}

/**
 * Language tag for the speech engine. Hinglish is Hindi typed in English letters, which Indian-English
 * voices read far better than Hindi voices do.
 */
export function speechLangFor(text: string): "hi-IN" | "mr-IN" | "en-IN" {
  if (/[ऀ-ॿ]/.test(text)) return detectReplyLanguage(text) === "Marathi" ? "mr-IN" : "hi-IN";
  return "en-IN";
}
