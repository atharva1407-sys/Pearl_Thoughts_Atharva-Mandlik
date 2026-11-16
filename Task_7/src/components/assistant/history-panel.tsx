"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWhen, type StoredChat } from "@/lib/assistant/chat-history";
import { Button } from "@/components/ui/button";

/**
 * The "Chat history" panel under the assistant's header: past conversations of this user on this device.
 * Pick one to continue it, start a new chat, delete one, or clear them all.
 */
export function HistoryPanel({
  chats,
  activeId,
  disabled,
  onOpen,
  onNew,
  onDelete,
  onClearAll,
}: {
  chats: StoredChat[];
  activeId: string | null;
  /** True while the assistant is answering: switching chats then would mix up the reply. */
  disabled: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const now = Date.now();
  return (
    <div className="space-y-2 border-b border-[#e6ebf2] bg-[#f8fbff] px-4 py-3 sm:px-5" role="group" aria-label="Chat history">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">Chat history</p>
        <Button type="button" size="sm" variant="outline" onClick={onNew} disabled={disabled} className="min-h-7 gap-1 px-2.5 text-[11px]">
          <Plus size={12} /> New chat
        </Button>
      </div>

      {chats.length === 0 ? (
        <p className="rounded-md bg-white px-2.5 py-3 text-center text-[11px] text-slate-500">
          No saved chats yet. Your conversations will appear here.
        </p>
      ) : (
        <ul className="max-h-52 space-y-1 overflow-y-auto pr-0.5">
          {chats.map((chat) => {
            const isActive = chat.id === activeId;
            return (
              <li key={chat.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(chat.id)}
                  disabled={disabled}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-60",
                    isActive ? "border-[#a8c9f8] bg-[#e8f2ff]" : "border-[#e6ebf2] bg-white hover:border-[#a8c9f8] hover:bg-[#f3f8fe]"
                  )}
                >
                  <MessageSquare size={13} className="shrink-0 text-[#1769e8]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">{chat.title}</span>
                    <span className="block text-[10px] text-slate-500">
                      {formatWhen(chat.updatedAt, now)} · {chat.messages.length} message{chat.messages.length === 1 ? "" : "s"}
                      {isActive ? " · open" : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(chat.id)}
                  disabled={disabled && isActive}
                  aria-label={`Delete chat: ${chat.title}`}
                  title="Delete this chat"
                  className="grid w-8 shrink-0 place-items-center rounded-md border border-[#e6ebf2] bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="text-[10px] leading-snug text-slate-500">Saved on this device only. Cleared when you sign out.</p>
        {chats.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete all saved chats on this device?")) onClearAll();
            }}
            disabled={disabled}
            className="shrink-0 text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
