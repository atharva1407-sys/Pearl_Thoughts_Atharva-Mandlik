"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakableText, speechLangFor, splitForSpeech } from "@/lib/voice/speech-text";
import { REPLY_LANGUAGES, chooseVoice, type ReplyLang } from "@/lib/voice/voice-choice";
import { DEFAULT_VAD_CONFIG, Vad, type VadConfig } from "@/lib/voice/vad";

const PUSH_TO_TALK_MAX_MS = 30_000;
const TICK_MS = 50;
const CALIBRATION_MS = 600;
/** After the assistant stops talking, wait a moment so the tail of its voice is not picked up. */
const RESUME_DELAY_MS = 350;
const MIN_AUDIO_BYTES = 1200;

export type VoiceStatus = "idle" | "listening" | "hearing" | "processing" | "speaking";

interface UseVoiceOptions {
  /** Called with the recognised text of one spoken message. */
  onTranscript: (text: string) => void;
}

const AudioContextCtor = (): typeof AudioContext | undefined =>
  typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

const VOICE_PREFS_KEY = "medrella.voice.prefs";

/** What the user chose for how replies sound (kept in this browser only). */
interface VoicePrefs {
  voices: Partial<Record<ReplyLang, string>>;
  rate: number;
}
const DEFAULT_PREFS: VoicePrefs = { voices: {}, rate: 1 };

function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(VOICE_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    const rate = typeof parsed.rate === "number" && parsed.rate >= 0.5 && parsed.rate <= 2 ? parsed.rate : 1;
    return { voices: parsed.voices && typeof parsed.voices === "object" ? parsed.voices : {}, rate };
  } catch {
    return DEFAULT_PREFS; // storage blocked or corrupt: just use the defaults
  }
}

function saveVoicePrefs(prefs: VoicePrefs) {
  try {
    window.localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode or blocked storage: the choice simply lasts until the page closes
  }
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

  const handsFreeRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const speakRepliesRef = useRef(false);
  const speechGeneration = useRef(0);

  // Which voice reads the replies: installed voices load late in some browsers, so listen for them.
  const [installedVoices, setInstalledVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(DEFAULT_PREFS);
  const prefsRef = useRef<VoicePrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const loaded = loadVoicePrefs();
    prefsRef.current = loaded;
    setVoicePrefs(loaded);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => setInstalledVoices(synth.getVoices());
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    setSttSupported(Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined");
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
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

  const stopSpeaking = useCallback(
    (resume = true) => {
      speechGeneration.current++;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      activeUtterancesRef.current.clear();
      speakingRef.current = false;
      setSpeaking(false);
      if (resume && handsFreeRef.current) resumeListeningSoon();
    },
    [resumeListeningSoon]
  );

  const speak = useCallback(
    /** `force` reads the text aloud even when "read replies aloud" is off (the user just spoke to the assistant). */
    (text: string, force = false) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (!force && !speakRepliesRef.current && !handsFreeRef.current) return;
      const clean = speakableText(text);
      if (!clean) return;

      const synth = window.speechSynthesis;
      synth.cancel();
      activeUtterancesRef.current.clear();

      const generation = ++speechGeneration.current;
      const lang = speechLangFor(clean);
      const voice = chooseVoice(synth.getVoices(), lang, prefsRef.current.voices[lang]);
      const parts = splitForSpeech(clean);
      if (parts.length === 0) return;

      clearResumeTimer();
      speakingRef.current = true;
      setSpeaking(true);
      // The recorder is OFF while the assistant talks, so its voice can never be transcribed.
      if (handsFreeRef.current) {
        discardRecorder();
        vadRef.current.setMode("speaking", performance.now());
      }

      const totalParts = parts.length;
      let completedParts = 0;

      const finish = () => {
        if (speechGeneration.current !== generation) return;
        activeUtterancesRef.current.clear();
        speakingRef.current = false;
        setSpeaking(false);
        if (handsFreeRef.current) resumeListeningSoon();
      };

      parts.forEach((part) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = lang;
        if (voice) utterance.voice = voice;
        utterance.rate = prefsRef.current.rate;

        // Retain reference to prevent garbage collection mid-speech (Chromium / Safari GC bug)
        activeUtterancesRef.current.add(utterance);

        utterance.onend = () => {
          activeUtterancesRef.current.delete(utterance);
          completedParts++;
          if (completedParts >= totalParts) {
            finish();
          }
        };

        utterance.onerror = (e) => {
          activeUtterancesRef.current.delete(utterance);
          if (e.error !== "canceled" && e.error !== "interrupted") {
            console.warn("[TTS_ERROR]", e.error);
          }
          completedParts++;
          if (completedParts >= totalParts) {
            finish();
          }
        };

        synth.speak(utterance);
      });
    },
    [discardRecorder, resumeListeningSoon]
  );

  // ---- choosing the voice --------------------------------------------------------------------

  const updatePrefs = useCallback((next: VoicePrefs) => {
    prefsRef.current = next;
    setVoicePrefs(next);
    saveVoicePrefs(next);
  }, []);

  const setVoiceFor = useCallback(
    (lang: ReplyLang, name: string) => {
      updatePrefs({ ...prefsRef.current, voices: { ...prefsRef.current.voices, [lang]: name } });
    },
    [updatePrefs]
  );

  const setRate = useCallback(
    (rate: number) => {
      updatePrefs({ ...prefsRef.current, rate });
    },
    [updatePrefs]
  );

  /** Reads a short sample in that language with the voice and speed currently selected. */
  const previewVoice = useCallback(
    (lang: ReplyLang) => {
      const sample = REPLY_LANGUAGES.find((l) => l.lang === lang)?.sample;
      if (sample) speak(sample, true);
    },
    [speak]
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
    if (handsFreeRef.current) {
      stopHandsFree();
      stopSpeaking(false);
    } else {
      void startHandsFree();
    }
  }, [startHandsFree, stopHandsFree, stopSpeaking]);

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
  }, [stopSpeaking, transcribe]);

  // ---- housekeeping --------------------------------------------------------------------------

  const setSpeakReplies = useCallback(
    (value: boolean) => {
      speakRepliesRef.current = value;
      setSpeakRepliesState(value);
      if (!value && !handsFreeRef.current) stopSpeaking(false);
    },
    [stopSpeaking]
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
    installedVoices,
    voicePrefs,
    setVoiceFor,
    setRate,
    previewVoice,
  };
}
