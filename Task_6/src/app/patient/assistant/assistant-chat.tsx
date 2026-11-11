"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, CalendarCheck, Loader2, Mic, SendHorizonal, Sparkles, Square, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentCard } from "@/lib/agent/tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
  cards?: AgentCard[];
  isError?: boolean;
}

const MAX_RECORDING_MS = 30_000;

const SUGGESTIONS = [
  "Find a cardiologist",
  "What slots are open tomorrow for a general physician?",
  "Show my appointments",
  "मुझे त्वचा रोग विशेषज्ञ चाहिए",
];

export function AssistantChat({
  firstName,
  configured,
  className,
  onClose,
}: {
  firstName: string;
  configured: boolean;
  className?: string;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ send: (text: string) => Promise<void>; draft: string }>({ send: async () => {}, draft: "" });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  // Release the microphone if the page is left mid-recording.
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    try {
      const body = new FormData();
      body.append("file", blob, "voice");
      const res = await fetch("/api/agent/transcribe", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        setVoiceError(data.error || "I couldn't understand that recording. Please try again.");
        return;
      }
      // Called through a ref: this runs from a recorder callback created before the latest render.
      void latestRef.current.send(`${latestRef.current.draft.trim()} ${data.text}`.trim().slice(0, 1000));
    } catch {
      setVoiceError("I could not reach the server. Please check your connection and try again.");
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setVoiceError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice input isn't supported in this browser. Please type your message.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError("Microphone access was blocked. Allow it in your browser settings to use voice input.");
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setRecording(false);
      if (chunks.length) void transcribe(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    stopTimerRef.current = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), MAX_RECORDING_MS);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages
      .filter((m) => !m.isError)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; cards?: AgentCard[]; error?: string };
      if (!res.ok || !data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong. Please try again.", isError: true },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply!, cards: data.cards ?? [] }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I could not reach the server. Please check your connection and try again.", isError: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  latestRef.current = { send, draft };

  return (
    <Card className={cn("flex h-[calc(100vh-290px)] min-h-[440px] flex-col p-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[#e6ebf2] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#e8f2ff] text-[#1769e8]">
            <Bot size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">Medrella Assistant</div>
            <div className="text-[11px] text-slate-500">Virtual helper · not a doctor</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={configured ? "green" : "amber"}>{configured ? "Online" : "Not set up"}</Badge>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
        {!configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>The assistant is not set up yet (no language-model key is configured). Booking still works from the Doctors page.</span>
          </div>
        )}

        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Hi {firstName}! I can help you find a doctor, check open slots and review your appointments. I can&apos;t give medical advice. For emergencies call 112.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" disabled={!configured || busy} onClick={() => send(s)}>
                  <Sparkles size={13} />
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(recording || transcribing || voiceError) && (
        <p
          className={`px-5 pt-2 text-xs ${voiceError && !recording && !transcribing ? "text-red-600" : "text-slate-500"}`}
          role="status"
        >
          {recording ? "Listening… tap the square to stop." : transcribing ? "Converting your voice to text and sending…" : voiceError}
        </p>
      )}
      <form
        className="flex items-center gap-2 border-t border-[#e6ebf2] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type or speak your message…"
          maxLength={1000}
          disabled={!configured || busy}
          aria-label="Message to the assistant"
        />
        <Button
          type="button"
          variant="outline"
          onClick={toggleRecording}
          disabled={!configured || busy || transcribing}
          aria-label={recording ? "Stop recording" : "Start voice input"}
          className={recording ? "border-red-300 text-red-600" : undefined}
        >
          {transcribing ? <Loader2 size={15} className="animate-spin" /> : recording ? <Square size={15} /> : <Mic size={15} />}
        </Button>
        <Button type="submit" variant="default" disabled={!configured || busy || recording || transcribing || !draft.trim()}>
          <SendHorizonal size={15} />
          Send
        </Button>
      </form>
    </Card>
  );
}

/** The model often wraps names and times in **bold**; show that as bold instead of literal asterisks. */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full ${
          isUser ? "bg-[#1769e8] text-white" : "bg-[#e8f2ff] text-[#1769e8]"
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </span>
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end" : ""}`}>
        <div
          className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm ${
            isUser
              ? "bg-[#1769e8] text-white"
              : message.isError
                ? "border border-red-200 bg-red-50 text-red-800"
                : "bg-[#f3f8fe] text-slate-800"
          }`}
        >
          {isUser ? message.content : renderInline(message.content)}
        </div>
        {message.cards?.map((card, i) => (
          <ActionCard key={i} card={card} />
        ))}
      </div>
    </div>
  );
}

function ActionCard({ card }: { card: AgentCard }) {
  return (
    <Card className="space-y-2 p-3.5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <CalendarCheck size={15} className="text-[#1769e8]" />
        {card.title}
      </div>
      <ul className="space-y-0.5 text-xs text-slate-600">
        {card.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {card.href && (
        <Button asChild variant="default" size="sm">
          <Link href={card.href}>{card.kind === "BOOKING" ? "Review & book" : "Open dashboard"}</Link>
        </Button>
      )}
    </Card>
  );
}
