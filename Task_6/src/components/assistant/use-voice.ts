"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { groupForTts, speakableText, speechLangFor, splitForSpeech } from "@/lib/voice/speech-text";
import { DEFAULT_VAD_CONFIG, Vad, type VadConfig } from "@/lib/voice/vad";

const PUSH_TO_TALK_MAX_MS = 30_000;
const TICK_MS = 50;
const CALIBRATION_MS = 600;
/** After the assistant stops talking, wait a moment so the tail of its voice is not picked up. */
const RESUME_DELAY_MS = 350;
const MIN_AUDIO_BYTES = 1200;
/** A silent, valid WAV file: played once during a tap to unlock audio playback on phones. */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export type VoiceStatus = "idle" | "listening" | "hearing" | "processing" | "speaking";

interface UseVoiceOptions {
  /** Called with the recognised text of one spoken message. */
  onTranscript: (text: string) => void;
}

const AudioContextCtor = (): typeof AudioContext | undefined =>
  typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const exact = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const base = lang.slice(0, 2).toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(base));
}

/**
 * Everything voice: push-to-talk, hands-free conversation, and reading replies aloud.
 *
 * Hands-free design:
 *  - one tap turns it on; after that the user simply talks, pauses, and the message is sent
 *  - the microphone asks the browser for echo cancellation and noise suppression
 *  - while the assistant speaks the recorder is switched OFF, so its own voice is never transcribed
 *  - the user can interrupt: a clearly louder voice held for a moment stops the assistant and the
 *    user's words are recorded; a Stop button does the same by hand
 *  - the microphone is released when the chat closes, the tab is hidden or the page is left
 */
export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [handsFree, setHandsFree] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakReplies, setSpeakRepliesState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const vadRef = useRef(new Vad());
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; chunks: Blob[] } | null>(null);
  const pttRef = useRef<MediaRecorder | null>(null);
  const pttTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set());
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  /** Turns false when the server has no natural voice configured, so replies go straight to the built-in voice. */
  const naturalVoiceOkRef = useRef(true);

  const handsFreeRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const speakRepliesRef = useRef(false);
  const speechGeneration = useRef(0);

  useEffect(() => {
    setSttSupported(Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined");
    setTtsSupported(typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined"));
  }, []);

  // ---- speech to text ------------------------------------------------------------------------

  const transcribe = useCallback(async (blob: Blob): Promise<string | null> => {
    try {
      const body = new FormData();
      body.append("file", blob, "voice");
      const res = await fetch("/api/agent/transcribe", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setError(data.error || "I couldn't understand that recording. Please try again.");
        return null;
      }
      setError(null);
      return data.text;
    } catch {
      setError("I could not reach the server. Please check your connection and try again.");
      return null;
    }
  }, []);

  // ---- recorder used by hands-free mode ------------------------------------------------------

  const discardRecorder = useCallback(() => {
    const current = recorderRef.current;
    recorderRef.current = null;
    if (current && current.recorder.state !== "inactive") {
      current.recorder.onstop = null;
      current.recorder.ondataavailable = null;
      try {
        current.recorder.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorderRef.current = { recorder, chunks };
    recorder.start();
  }, []);

  const takeRecording = useCallback((): Promise<Blob | null> => {
    const current = recorderRef.current;
    recorderRef.current = null;
    if (!current || current.recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      current.recorder.onstop = () => resolve(current.chunks.length ? new Blob(current.chunks, { type: current.recorder.mimeType }) : null);
      current.recorder.stop();
    });
  }, []);

  // ---- mode changes --------------------------------------------------------------------------

  const clearResumeTimer = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
  };

  const enterListening = useCallback(() => {
    if (!handsFreeRef.current || !streamRef.current) return;
    clearResumeTimer();
    vadRef.current.setMode("listening", performance.now());
    setHearing(false);
    discardRecorder();
    startRecorder();
  }, [discardRecorder, startRecorder]);

  const enterPaused = useCallback(() => {
    vadRef.current.setMode("paused", performance.now());
    setHearing(false);
    discardRecorder();
  }, [discardRecorder]);

  /** Back to listening once nothing else is going on (not thinking, not speaking). */
  const resumeListeningSoon = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      if (handsFreeRef.current && !busyRef.current && !speakingRef.current) enterListening();
    }, RESUME_DELAY_MS);
  }, [enterListening]);

  // ---- text to speech ------------------------------------------------------------------------

  /**
   * One audio element is reused for every clip and "unlocked" by a tap, so phones allow it to play later
   * (a reply arrives after the tap, and browsers block sound that was not started by the user).
   */
  const unlockAudio = useCallback(() => {
    if (typeof Audio === "undefined") return;
    if (!audioElRef.current) audioElRef.current = new Audio();
    const audio = audioElRef.current;
    if (audio.dataset.unlocked === "1") return;
    audio.dataset.unlocked = "1";
    audio.src = SILENT_WAV;
    void audio.play().catch(() => {
      audio.dataset.unlocked = "";
    });
  }, []);

  const stopSpeaking = useCallback(
    (resume = true) => {
      speechGeneration.current++;
      stopPlaybackRef.current?.(); // natural voice
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel(); // built-in voice
      }
      activeUtterancesRef.current.clear();
      speakingRef.current = false;
      setSpeaking(false);
      if (resume && handsFreeRef.current) resumeListeningSoon();
    },
    [resumeListeningSoon]
  );

  const finishSpeaking = useCallback(
    (generation: number) => {
      if (speechGeneration.current !== generation) return;
      activeUtterancesRef.current.clear();
      speakingRef.current = false;
      setSpeaking(false);
      if (handsFreeRef.current) resumeListeningSoon();
    },
    [resumeListeningSoon]
  );

  /** Reads text with the browser's built-in voice: the fallback when the natural voice is unavailable. */
  const speakWithBrowserVoice = useCallback((clean: string, generation: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      finishSpeaking(generation);
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    activeUtterancesRef.current.clear();

    const lang = speechLangFor(clean);
    const voice = pickVoice(synth.getVoices(), lang);
    const parts = splitForSpeech(clean);
    if (parts.length === 0) {
      finishSpeaking(generation);
      return;
    }

    const totalParts = parts.length;
    let completedParts = 0;
    const partDone = () => {
      completedParts++;
      if (completedParts >= totalParts) finishSpeaking(generation);
    };

    parts.forEach((part) => {
      const utterance = new SpeechSynthesisUtterance(part);
      utterance.lang = lang;
      if (voice) utterance.voice = voice;

      // Retain reference to prevent garbage collection mid-speech (Chromium / Safari GC bug)
      activeUtterancesRef.current.add(utterance);

      utterance.onend = () => {
        activeUtterancesRef.current.delete(utterance);
        partDone();
      };
      utterance.onerror = (e) => {
        activeUtterancesRef.current.delete(utterance);
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("[TTS_ERROR]", e.error);
        }
        partDone();
      };

      synth.speak(utterance);
    });
  }, [finishSpeaking]);

  /** One short clip of natural speech from the server, or null when it is unavailable. */
  const fetchNaturalClip = useCallback(async (text: string, language: string): Promise<Blob | null> => {
    try {
      const res = await fetch("/api/agent/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      if (res.status === 503) {
        naturalVoiceOkRef.current = false; // not set up on this server: do not ask again
        return null;
      }
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

  const playClip = useCallback(
    (blob: Blob): Promise<"ended" | "stopped" | "error"> =>
      new Promise((resolve) => {
        const audio = audioElRef.current ?? (audioElRef.current = new Audio());
        const url = URL.createObjectURL(blob);
        const done = (result: "ended" | "stopped" | "error") => {
          audio.onended = null;
          audio.onerror = null;
          URL.revokeObjectURL(url);
          stopPlaybackRef.current = null;
          resolve(result);
        };
        stopPlaybackRef.current = () => {
          audio.pause();
          done("stopped");
        };
        audio.onended = () => done("ended");
        audio.onerror = () => done("error");
        audio.src = url;
        audio.play().catch(() => done("error"));
      }),
    []
  );

  const speak = useCallback(
    /** `force` reads the text aloud even when "read replies aloud" is off (the user just spoke to the assistant). */
    (text: string, force = false) => {
      if (typeof window === "undefined") return;
      if (!force && !speakRepliesRef.current && !handsFreeRef.current) return;
      const clean = speakableText(text);
      if (!clean) return;

      const canNatural = naturalVoiceOkRef.current && typeof Audio !== "undefined";
      const canBrowser = "speechSynthesis" in window;
      if (!canNatural && !canBrowser) return;

      // Replace whatever is being said right now.
      stopPlaybackRef.current?.();
      if (canBrowser) window.speechSynthesis.cancel();
      activeUtterancesRef.current.clear();

      const generation = ++speechGeneration.current;
      clearResumeTimer();
      speakingRef.current = true;
      setSpeaking(true);
      // The recorder is OFF while the assistant talks, so its voice can never be transcribed.
      if (handsFreeRef.current) {
        discardRecorder();
        vadRef.current.setMode("speaking", performance.now());
      }

      if (!canNatural) {
        speakWithBrowserVoice(clean, generation);
        return;
      }

      const language = speechLangFor(clean);
      const parts = groupForTts(clean);
      void (async () => {
        // Clip n + 1 is fetched while clip n plays, so there is no gap between them.
        let upcoming: Promise<Blob | null> = fetchNaturalClip(parts[0], language);
        for (let i = 0; i < parts.length; i++) {
          const clip = await upcoming;
          if (speechGeneration.current !== generation) return; // stopped or replaced meanwhile
          if (!clip) {
            speakWithBrowserVoice(parts.slice(i).join(" "), generation); // natural voice failed: built-in voice finishes the reply
            return;
          }
          upcoming = i + 1 < parts.length ? fetchNaturalClip(parts[i + 1], language) : Promise.resolve(null);
          const result = await playClip(clip);
          if (speechGeneration.current !== generation || result === "stopped") return;
          if (result === "error") {
            speakWithBrowserVoice(parts.slice(i).join(" "), generation); // e.g. the browser refused to autoplay
            return;
          }
        }
        finishSpeaking(generation);
      })();
    },
    [discardRecorder, fetchNaturalClip, finishSpeaking, playClip, speakWithBrowserVoice]
  );

  // ---- hands-free ----------------------------------------------------------------------------

  const handleUtterance = useCallback(async () => {
    setHearing(false);
    const blob = await takeRecording();
    enterPaused();
    if (!blob || blob.size < MIN_AUDIO_BYTES) {
      resumeListeningSoon();
      return;
    }
    setTranscribing(true);
    const text = await transcribe(blob);
    setTranscribing(false);
    if (text) {
      onTranscriptRef.current(text.slice(0, 1000));
      // The chat now reports busy; listening resumes when its reply has been read out.
      return;
    }
    resumeListeningSoon();
  }, [enterPaused, resumeListeningSoon, takeRecording, transcribe]);

  const onTick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const level = Math.sqrt(sum / samples.length);

    switch (vadRef.current.push(level, performance.now())) {
      case "speech-start":
        setHearing(true);
        break;
      case "speech-end":
      case "max-length":
        void handleUtterance();
        break;
      case "utterance-too-short":
      case "idle-reset":
        setHearing(false);
        discardRecorder();
        startRecorder();
        break;
      case "barge-in":
        // The user talked over the assistant: stop it and capture what they are saying.
        stopSpeaking(false);
        setHearing(true);
        discardRecorder();
        startRecorder();
        break;
      default:
        break;
    }
  }, [discardRecorder, handleUtterance, startRecorder, stopSpeaking]);

  const stopHandsFree = useCallback(() => {
    handsFreeRef.current = false;
    clearResumeTimer();
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    discardRecorder();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    vadRef.current.setMode("paused", performance.now());
    setHandsFree(false);
    setHearing(false);
  }, [discardRecorder]);

  const startHandsFree = useCallback(async () => {
    setError(null);
    const Ctor = AudioContextCtor();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || !Ctor) {
      setError("Voice conversation isn't supported in this browser. You can still type your message.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings to talk to the assistant.");
      return;
    }

    // A push-to-talk recording would fight for the microphone.
    if (pttRef.current && pttRef.current.state !== "inactive") pttRef.current.stop();

    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // Connected only to the analyser, never to the speakers: no feedback loop.
    ctx.createMediaStreamSource(stream).connect(analyser);

    streamRef.current = stream;
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    handsFreeRef.current = true;
    setHandsFree(true);

    // Measure the room's background noise for a moment so thresholds suit this microphone.
    const samples = new Float32Array(analyser.fftSize);
    const readings: number[] = [];
    const calibrationStart = performance.now();
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        readings.push(Math.sqrt(sum / samples.length));
        if (performance.now() - calibrationStart >= CALIBRATION_MS) {
          clearInterval(timer);
          resolve();
        }
      }, TICK_MS);
    });
    if (!handsFreeRef.current) return; // turned off during calibration
    readings.sort((a, b) => a - b);
    const floor = readings[Math.floor(readings.length / 2)] ?? 0;
    const config: VadConfig = {
      ...DEFAULT_VAD_CONFIG,
      speechThreshold: Math.min(0.2, Math.max(DEFAULT_VAD_CONFIG.speechThreshold, floor * 3)),
      bargeThreshold: Math.min(0.5, Math.max(DEFAULT_VAD_CONFIG.bargeThreshold, floor * 6)),
    };
    vadRef.current = new Vad(config);

    tickRef.current = setInterval(onTick, TICK_MS);
    if (busyRef.current || speakingRef.current) {
      vadRef.current.setMode(speakingRef.current ? "speaking" : "paused", performance.now());
    } else {
      enterListening();
    }
  }, [enterListening, onTick]);

  const toggleHandsFree = useCallback(() => {
    unlockAudio(); // this tap lets the assistant's voice play later on phones
    if (handsFreeRef.current) {
      stopHandsFree();
      stopSpeaking(false);
    } else {
      void startHandsFree();
    }
  }, [startHandsFree, stopHandsFree, stopSpeaking, unlockAudio]);

  /** The chat tells the voice layer when it is waiting for the assistant's reply. */
  const setBusy = useCallback(
    (busy: boolean) => {
      busyRef.current = busy;
      if (busy) {
        if (handsFreeRef.current && !speakingRef.current) enterPaused();
      } else if (handsFreeRef.current && !speakingRef.current) {
        resumeListeningSoon();
      }
    },
    [enterPaused, resumeListeningSoon]
  );

  // ---- push-to-talk (one message per tap) ----------------------------------------------------

  const togglePushToTalk = useCallback(async () => {
    unlockAudio();
    if (pttRef.current && pttRef.current.state !== "inactive") {
      pttRef.current.stop();
      return;
    }
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice input isn't supported in this browser. Please type your message.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings to use voice input.");
      return;
    }
    stopSpeaking(false); // talking over the assistant stops it
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      pttRef.current = null;
      setRecording(false);
      if (!chunks.length) return;
      setTranscribing(true);
      const text = await transcribe(new Blob(chunks, { type: recorder.mimeType }));
      setTranscribing(false);
      if (text) onTranscriptRef.current(text.slice(0, 1000));
    };
    pttRef.current = recorder;
    recorder.start();
    setRecording(true);
    pttTimerRef.current = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), PUSH_TO_TALK_MAX_MS);
  }, [stopSpeaking, transcribe, unlockAudio]);

  // ---- housekeeping --------------------------------------------------------------------------

  const setSpeakReplies = useCallback(
    (value: boolean) => {
      speakRepliesRef.current = value;
      setSpeakRepliesState(value);
      if (value) unlockAudio();
      if (!value && !handsFreeRef.current) stopSpeaking(false);
    },
    [stopSpeaking, unlockAudio]
  );

  /** Release the microphone and silence the assistant (chat closed, tab hidden, page left). */
  const stopAll = useCallback(() => {
    stopHandsFree();
    stopSpeaking(false);
    if (pttRef.current && pttRef.current.state !== "inactive") {
      pttRef.current.onstop = null;
      pttRef.current.stop();
      pttRef.current.stream.getTracks().forEach((t) => t.stop());
      pttRef.current = null;
      setRecording(false);
    }
    if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
  }, [stopHandsFree, stopSpeaking]);

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) stopAll();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stopAll);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", stopAll);
      stopAll();
    };
  }, [stopAll]);

  const status: VoiceStatus = speaking
    ? "speaking"
    : transcribing
      ? "processing"
      : hearing
        ? "hearing"
        : handsFree
          ? "listening"
          : "idle";

  return {
    status,
    handsFree,
    recording,
    transcribing,
    speaking,
    speakReplies,
    error,
    setError,
    sttSupported,
    ttsSupported,
    toggleHandsFree,
    togglePushToTalk,
    setSpeakReplies,
    speak,
    stopSpeaking,
    setBusy,
    stopAll,
  };
}
