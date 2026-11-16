"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, X } from "lucide-react";
import type { AgentRole } from "@/lib/agent/tools";
import { AssistantChat } from "./assistant-chat";

/**
 * Floating chat launcher (bottom-right) that opens the assistant as a popup over the current page.
 *
 * Two things keep the popup fully visible:
 *  - it is drawn at the top level of the page (a portal), because the page content sits in a layer that is painted
 *    BELOW the sticky main navbar, so a z-index inside it can never win against the navbar;
 *  - its height always leaves room for that navbar (68px, 56px on phones) plus the launcher button underneath,
 *    so the popup's own header can never slide up under it, however short the window is.
 */
export function AssistantWidget(props: { role: AgentRole; firstName: string; configured: boolean; userKey?: string }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.body);
  }, []);

  if (!host) return null;

  return createPortal(
    // z-40: above the sticky navbar (30), below the open side menu and dialogs (50).
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {/* Stays mounted while closed so the conversation survives closing the popup; the microphone is released. */}
      <div className={open ? "block" : "hidden"}>
        <AssistantChat
          {...props}
          active={open}
          onClose={() => setOpen(false)}
          // 11rem = navbar (68px) + a gap + the launcher button + the bottom margin, so the header always stays on screen.
          className="h-[min(600px,calc(100dvh-11rem))] min-h-0 w-[calc(100vw-2rem)] max-w-[400px] shadow-xl"
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
    </div>,
    host
  );
}
