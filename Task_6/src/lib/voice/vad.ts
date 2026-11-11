/**
 * Voice-activity detection as a small, pure state machine, so the hands-free conversation logic can
 * be unit-tested without a microphone. The browser feeds it a loudness level (0..1) a few times per
 * second and acts on the events it returns.
 *
 * Modes:
 *  - listening: the user may speak; a short run of loud audio starts an utterance and a pause ends it
 *  - speaking: the assistant is talking. Its own voice can leak into the microphone, so a much higher
 *    level held for longer is needed before it counts as the user interrupting (barge-in)
 *  - paused: ignore the microphone (the assistant is thinking, or the mic is off)
 */

export type VadMode = "listening" | "speaking" | "paused";

export type VadEvent =
  | "none"
  | "speech-start"
  | "speech-end"
  | "utterance-too-short"
  | "max-length"
  | "barge-in"
  | "idle-reset";

export interface VadConfig {
  /** Level that counts as speech while listening. */
  speechThreshold: number;
  /** Level that counts as the user talking over the assistant. Must be well above speechThreshold. */
  bargeThreshold: number;
  /** Speech must stay above the threshold this long to start an utterance (ignores clicks and coughs). */
  minSpeechMs: number;
  /** Loud audio must last this long over the assistant before it interrupts it. */
  bargeMinMs: number;
  /** Silence this long after speech ends the utterance. */
  silenceMs: number;
  /** An utterance shorter than this is thrown away. */
  minUtteranceMs: number;
  /** An utterance is cut off at this length. */
  maxUtteranceMs: number;
  /** With no speech for this long, ask the host to restart its recording so it never grows unbounded. */
  idleResetMs: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  speechThreshold: 0.035,
  bargeThreshold: 0.12,
  minSpeechMs: 150,
  bargeMinMs: 350,
  silenceMs: 1100,
  minUtteranceMs: 400,
  maxUtteranceMs: 25_000,
  idleResetMs: 8_000,
};

export class Vad {
  private mode: VadMode = "paused";
  private aboveSince: number | null = null;
  private inSpeech = false;
  private speechStart = 0;
  private lastVoice = 0;
  private listenStart = 0;

  constructor(private readonly cfg: VadConfig = DEFAULT_VAD_CONFIG) {}

  get currentMode(): VadMode {
    return this.mode;
  }

  get isHearingSpeech(): boolean {
    return this.inSpeech;
  }

  setMode(mode: VadMode, nowMs: number): void {
    this.mode = mode;
    this.aboveSince = null;
    this.inSpeech = false;
    this.listenStart = nowMs;
  }

  /** Feed one loudness reading. */
  push(level: number, nowMs: number): VadEvent {
    if (this.mode === "paused") return "none";
    if (this.mode === "speaking") return this.pushWhileAssistantSpeaks(level, nowMs);
    return this.pushWhileListening(level, nowMs);
  }

  private pushWhileAssistantSpeaks(level: number, nowMs: number): VadEvent {
    if (level < this.cfg.bargeThreshold) {
      this.aboveSince = null;
      return "none";
    }
    if (this.aboveSince === null) this.aboveSince = nowMs;
    if (nowMs - this.aboveSince >= this.cfg.bargeMinMs) {
      // The user took over: continue as a normal utterance that started when they began talking.
      this.mode = "listening";
      this.inSpeech = true;
      this.speechStart = this.aboveSince;
      this.lastVoice = nowMs;
      this.aboveSince = null;
      this.listenStart = nowMs;
      return "barge-in";
    }
    return "none";
  }

  private pushWhileListening(level: number, nowMs: number): VadEvent {
    const loud = level >= this.cfg.speechThreshold;

    if (!this.inSpeech) {
      if (loud) {
        if (this.aboveSince === null) this.aboveSince = nowMs;
        if (nowMs - this.aboveSince >= this.cfg.minSpeechMs) {
          this.inSpeech = true;
          this.speechStart = this.aboveSince;
          this.lastVoice = nowMs;
          return "speech-start";
        }
        return "none";
      }
      this.aboveSince = null;
      if (nowMs - this.listenStart >= this.cfg.idleResetMs) {
        this.listenStart = nowMs;
        return "idle-reset";
      }
      return "none";
    }

    if (loud) this.lastVoice = nowMs;
    if (nowMs - this.speechStart >= this.cfg.maxUtteranceMs) {
      this.finishUtterance(nowMs);
      return "max-length";
    }
    if (nowMs - this.lastVoice >= this.cfg.silenceMs) {
      const spoken = this.lastVoice - this.speechStart;
      this.finishUtterance(nowMs);
      return spoken >= this.cfg.minUtteranceMs ? "speech-end" : "utterance-too-short";
    }
    return "none";
  }

  private finishUtterance(nowMs: number): void {
    this.inSpeech = false;
    this.aboveSince = null;
    this.listenStart = nowMs;
  }
}
