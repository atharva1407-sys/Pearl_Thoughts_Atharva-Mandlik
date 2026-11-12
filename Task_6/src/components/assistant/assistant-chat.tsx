"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  Mic,
  SendHorizonal,
  Sparkles,
  Square,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentCard, AgentRole } from "@/lib/agent/tools";
import type { PaymentHold } from "@/lib/agent/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaymentCard } from "./payment-card";
import { useVoice } from "./use-voice";

interface Message {
  role: "user" | "assistant";
  content: string;
  cards?: AgentCard[];
  payment?: PaymentHold;
  isError?: boolean;
}

type CardState = "working" | "done" | "failed" | "declined" | "expired";

/** Shown when the API says nobody is signed in (session expired, signed out elsewhere, or a local dev server restart). */
const SESSION_ENDED_TEXT = "Your session has ended, so I can't continue. Please sign in again.";
const SESSION_ENDED_CARD: AgentCard = {
  kind: "INFO",
  title: "Session ended",
  lines: ["You were signed out. This happens when the session expires, or when the local development server restarts."],
  href: "/login",
  linkLabel: "Sign in again",
};

const SUGGESTIONS: Record<AgentRole, string[]> = {
  PATIENT: [
    "Find a cardiologist",
    "Show my upcoming appointments",
    "Show my payments and refunds",
    "मुझे त्वचा रोग विशेषज्ञ चाहिए",
  ],
  DOCTOR: [
    "What is on my schedule today?",
    "Show my appointment stats this month",
    "When is my next free slot?",
    "Any scheduling conflicts this week?",
  ],
};

const INTRO: Record<AgentRole, string> = {
  PATIENT:
    "I can help you find a doctor, check slots, book, reschedule or cancel (you always confirm first), and show your payments and prescriptions. I can't give medical advice. For emergencies call 112.",
  DOCTOR:
    "I can show your appointments and statistics, your shifts and leaves, spot scheduling conflicts and suggest slots for rescheduling. I only read and suggest; changes are made from your dashboard.",
};

const STATUS_TEXT = {
  listening: "Listening… just speak. I'll answer when you pause.",
  hearing: "Hearing you…",
  processing: "Understanding what you said…",
  speaking: "Speaking… talk or tap Stop to interrupt.",
} as const;

export function AssistantChat({
  role = "PATIENT",
  firstName,
  configured,
  className,
  onClose,
  active = true,
}: {
  role?: AgentRole;
  firstName: string;
  configured: boolean;
  className?: string;
  onClose?: () => void;
  /** False while the popup is closed: the microphone is released and speech stops. */
  active?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const sendRef = useRef<(text: string, spoken?: boolean) => Promise<void>>(async () => {});
  const voice = useVoice({ onTranscript: (text) => void sendRef.current(text, true) });
  const { setBusy: setVoiceBusy, speak, stopAll } = voice;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  // Closing the popup must also release the microphone and silence the assistant.
  useEffect(() => {
    if (!active) stopAll();
  }, [active, stopAll]);

  /** `speakMode`: "auto" reads it aloud only when voice mode or "read replies aloud" is on; "force" always (the user just spoke). */
  const addAssistantMessage = useCallback(
    (content: string, extra?: Partial<Message>, speakMode: false | "auto" | "force" = false) => {
      setMessages((prev) => [...prev, { role: "assistant", content, ...extra }]);
      if (speakMode) speak(content, speakMode === "force");
    },
    [speak]
  );

  async function send(text: string, spoken = false) {
    const message = text.trim();
    if (!message || busyRef.current) return;
    const history = messagesRef.current
      .filter((m) => !m.isError)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setDraft("");
    busyRef.current = true;
    setBusy(true);
    setVoiceBusy(true);
    voice.stopSpeaking(false);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; cards?: AgentCard[]; error?: string };
      if (res.status === 401) {
        addAssistantMessage(SESSION_ENDED_TEXT, { isError: true, cards: [SESSION_ENDED_CARD] });
      } else if (!res.ok || !data.reply) {
        addAssistantMessage(data.error || "Something went wrong. Please try again.", { isError: true });
      } else {
        addAssistantMessage(data.reply, { cards: data.cards ?? [] }, spoken ? "force" : "auto");
      }
    } catch {
      addAssistantMessage("I could not reach the server. Please check your connection and try again.", { isError: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
      // After speak() has started, so hands-free listening waits until the reply has been read out.
      setVoiceBusy(false);
    }
  }
  sendRef.current = send;

  async function confirmCard(card: AgentCard) {
    const confirm = card.confirm;
    if (!confirm || busyRef.current) return;
    if (new Date(confirm.expiresAt).getTime() < Date.now()) {
      setCardStates((s) => ({ ...s, [confirm.token]: "expired" }));
      addAssistantMessage("That confirmation expired, so nothing was changed. Ask me again and I will prepare it afresh.", undefined, "auto");
      return;
    }
    voice.stopSpeaking(false);
    setCardStates((s) => ({ ...s, [confirm.token]: "working" }));
    busyRef.current = true;
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: confirm.token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        payment?: PaymentHold | null;
        cards?: AgentCard[];
        error?: string;
      };
      if (res.status === 401) {
        setCardStates((s) => ({ ...s, [confirm.token]: "failed" }));
        addAssistantMessage(`${SESSION_ENDED_TEXT} Nothing was changed.`, { isError: true, cards: [SESSION_ENDED_CARD] });
        return;
      }
      const text = data.message || data.error || "Something went wrong and nothing was changed.";
      setCardStates((s) => ({ ...s, [confirm.token]: data.ok ? "done" : data.code === "EXPIRED" ? "expired" : "failed" }));
      addAssistantMessage(text, { payment: data.payment ?? undefined, cards: data.cards ?? [], isError: !data.ok && !data.cards?.length }, "auto");
    } catch {
      setCardStates((s) => ({ ...s, [confirm.token]: "failed" }));
      addAssistantMessage("I could not reach the server, so nothing was changed. Please try again.", { isError: true });
    } finally {
      busyRef.current = false;
      setVoiceBusy(false);
    }
  }

  function declineCard(card: AgentCard) {
    if (!card.confirm) return;
    setCardStates((s) => ({ ...s, [card.confirm!.token]: "declined" }));
    addAssistantMessage("Okay, I did not change anything. Tell me if you want something else.", undefined, "auto");
  }

  const onPaymentResult = useCallback((message: string) => addAssistantMessage(message, undefined, "auto"), [addAssistantMessage]);

  const voiceBusy = voice.recording || voice.transcribing;
  const statusText = voice.status in STATUS_TEXT ? STATUS_TEXT[voice.status as keyof typeof STATUS_TEXT] : null;

  return (
    <Card className={cn("flex h-[calc(100vh-290px)] min-h-[440px] flex-col p-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[#e6ebf2] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#e8f2ff] text-[#1769e8]">
            <Bot size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">Medrella Assistant</div>
            <div className="text-[11px] text-slate-500">{role === "DOCTOR" ? "Scheduling helper · reads and suggests" : "Virtual helper · not a doctor"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={configured ? "green" : "amber"}>{configured ? "Online" : "Not set up"}</Badge>
          {voice.ttsSupported && (
            <button
              type="button"
              onClick={() => voice.setSpeakReplies(!voice.speakReplies)}
              aria-label={voice.speakReplies ? "Stop reading replies aloud" : "Read replies aloud"}
              aria-pressed={voice.speakReplies}
              title={voice.speakReplies ? "Replies are read aloud" : "Read replies aloud"}
              className={cn(
                "grid size-7 place-items-center rounded-full hover:bg-slate-100",
                voice.speakReplies ? "bg-[#e8f2ff] text-[#1769e8]" : "text-slate-500"
              )}
            >
              {voice.speakReplies ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          )}
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

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {!configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>The assistant is not set up yet (no language-model key is configured). Everything else on the site still works.</span>
          </div>
        )}

        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Hi {role === "DOCTOR" ? `Dr. ${firstName}` : firstName}! {INTRO[role]}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS[role].map((s) => (
                <Button key={s} variant="outline" size="sm" disabled={!configured || busy} onClick={() => send(s)}>
                  <Sparkles size={13} />
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            cardStates={cardStates}
            disabled={busy}
            onConfirm={confirmCard}
            onDecline={declineCard}
            onPick={(text) => send(text)}
            onPaymentResult={onPaymentResult}
          />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(statusText || voice.recording || voice.transcribing || voice.error) && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-4 pt-2 text-xs sm:px-5",
            voice.error && !statusText && !voice.recording && !voice.transcribing ? "text-red-600" : "text-slate-500"
          )}
          role="status"
        >
          <span className="flex items-center gap-1.5">
            {voice.status === "hearing" && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
            {voice.recording
              ? "Listening… tap the square to stop."
              : voice.transcribing && !statusText
                ? "Converting your voice to text…"
                : (statusText ?? voice.error)}
          </span>
          {voice.speaking && (
            <Button size="sm" variant="outline" onClick={() => voice.stopSpeaking()} className="min-h-7 gap-1 px-2.5 text-[11px]">
              <Square size={11} /> Stop
            </Button>
          )}
        </div>
      )}

      <form
        className="flex items-center gap-1.5 border-t border-[#e6ebf2] px-3 py-3 sm:gap-2 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={voice.handsFree ? "Voice mode on: just speak, or type…" : "Type or speak your message…"}
          maxLength={1000}
          disabled={!configured || busy}
          aria-label="Message to the assistant"
        />
        {voice.sttSupported && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void voice.togglePushToTalk()}
              disabled={!configured || busy || voice.transcribing || voice.handsFree}
              aria-label={voice.recording ? "Stop recording" : "Record one voice message"}
              title="Record one voice message"
              className={cn("px-2.5", voice.recording && "border-red-300 text-red-600")}
            >
              {voice.transcribing && !voice.handsFree ? (
                <Loader2 size={15} className="animate-spin" />
              ) : voice.recording ? (
                <Square size={15} />
              ) : (
                <Mic size={15} />
              )}
            </Button>
            <Button
              type="button"
              variant={voice.handsFree ? "default" : "outline"}
              onClick={voice.toggleHandsFree}
              disabled={!configured || voiceBusy}
              aria-label={voice.handsFree ? "End voice conversation" : "Start hands-free voice conversation"}
              aria-pressed={voice.handsFree}
              title={voice.handsFree ? "End voice conversation" : "Talk hands-free"}
              className="px-2.5"
            >
              <AudioLines size={15} />
            </Button>
          </>
        )}
        <Button type="submit" variant="default" disabled={!configured || busy || voiceBusy || !draft.trim()} className="px-2.5 sm:px-3.5">
          <SendHorizonal size={15} />
          <span className="hidden sm:inline">Send</span>
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

function MessageBubble({
  message,
  cardStates,
  disabled,
  onConfirm,
  onDecline,
  onPick,
  onPaymentResult,
}: {
  message: Message;
  cardStates: Record<string, CardState>;
  disabled: boolean;
  onConfirm: (card: AgentCard) => void;
  onDecline: (card: AgentCard) => void;
  onPick: (text: string) => void;
  onPaymentResult: (message: string) => void;
}) {
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
      <div className={`min-w-0 max-w-[88%] space-y-2 ${isUser ? "items-end" : ""}`}>
        <div
          className={`whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm ${
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
          <ActionCard
            key={i}
            card={card}
            state={card.confirm ? cardStates[card.confirm.token] : undefined}
            disabled={disabled}
            onConfirm={onConfirm}
            onDecline={onDecline}
            onPick={onPick}
          />
        ))}
        {message.payment && <PaymentCard hold={message.payment} onResult={onPaymentResult} />}
      </div>
    </div>
  );
}

const STATE_LABEL: Record<CardState, string> = {
  working: "Working on it…",
  done: "Confirmed",
  failed: "Could not be completed",
  declined: "Not confirmed",
  expired: "Expired, ask me again",
};

function ActionCard({
  card,
  state,
  disabled,
  onConfirm,
  onDecline,
  onPick,
}: {
  card: AgentCard;
  state?: CardState;
  disabled: boolean;
  onConfirm: (card: AgentCard) => void;
  onDecline: (card: AgentCard) => void;
  onPick: (text: string) => void;
}) {
  const Icon = card.kind === "CONFIRM" ? CalendarCheck : card.kind === "SLOTS" ? Clock3 : Info;
  return (
    <Card className="space-y-2 p-3.5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icon size={15} className="shrink-0 text-[#1769e8]" />
        {card.title}
      </div>
      <ul className="space-y-0.5 text-xs text-slate-600">
        {card.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {card.options && (
        <div className="flex flex-wrap gap-1.5">
          {card.options.map((o) => (
            <Button key={o.message} size="sm" variant="outline" disabled={disabled} onClick={() => onPick(o.message)} className="min-h-8 text-[11px]">
              {o.label}
            </Button>
          ))}
        </div>
      )}

      {card.confirm &&
        (state && state !== "working" ? (
          <p className={cn("flex items-center gap-1.5 text-xs font-semibold", state === "done" ? "text-emerald-700" : "text-slate-500")}>
            {state === "done" && <CheckCircle2 size={14} />}
            {STATE_LABEL[state]}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={card.confirm.destructive ? "destructive" : "default"}
              disabled={disabled || state === "working"}
              onClick={() => onConfirm(card)}
            >
              {state === "working" ? <Loader2 size={14} className="animate-spin" /> : null}
              {card.confirm.label}
            </Button>
            <Button size="sm" variant="outline" disabled={disabled || state === "working"} onClick={() => onDecline(card)}>
              Not now
            </Button>
            <span className="text-[10px] text-slate-400">Nothing changes until you confirm.</span>
          </div>
        ))}

      {card.href && (
        <Button asChild variant="outline" size="sm">
          <Link href={card.href}>{card.linkLabel ?? "Open"}</Link>
        </Button>
      )}
    </Card>
  );
}
