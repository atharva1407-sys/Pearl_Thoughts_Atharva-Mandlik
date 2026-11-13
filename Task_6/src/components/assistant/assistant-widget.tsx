"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import type { AgentRole } from "@/lib/agent/tools";
import { AssistantChat } from "./assistant-chat";

/** Floating chat launcher (bottom-right) that opens the assistant as a popup over the current page. */
export function AssistantWidget(props: { role: AgentRole; firstName: string; configured: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {/* Stays mounted while closed so the conversation survives closing the popup; the microphone is released. */}
      <div className={open ? "block" : "hidden"}>
        <AssistantChat
          {...props}
          active={open}
          onClose={() => setOpen(false)}
          className="h-[min(600px,calc(100dvh-7rem))] min-h-0 w-[calc(100vw-2rem)] max-w-[400px] shadow-xl"
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open Medrella Assistant"}
        aria-expanded={open}
        className="grid size-14 place-items-center rounded-full bg-[#1769e8] text-white shadow-lg transition hover:bg-[#1259c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
      >
        {open ? <X size={24} /> : <Bot size={26} />}
      </button>
    </div>
  );
}
