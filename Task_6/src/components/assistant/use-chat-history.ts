"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeActive,
  deleteChat,
  emptyStore,
  findChat,
  loadHistory,
  persistHistory,
  saveConversation,
  toStoredMessages,
  type HistoryStore,
  type SavableMessage,
  type StoredMessage,
} from "@/lib/assistant/chat-history";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // storage blocked (private mode, strict settings)
  }
}

const newId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * The assistant's saved conversations for one signed-in user, kept in this browser only.
 * Without a `userKey` nothing is saved (the history feature is simply off).
 */
export function useChatHistory(userKey?: string) {
  const [store, setStore] = useState<HistoryStore>(emptyStore);
  const [ready, setReady] = useState(false);
  const storeRef = useRef<HistoryStore>(store);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userKey) {
      setReady(true);
      return;
    }
    const loaded = loadHistory(browserStorage(), userKey);
    storeRef.current = loaded;
    activeIdRef.current = loaded.activeId;
    setStore(loaded);
    setReady(true);
  }, [userKey]);

  const commit = useCallback(
    (next: HistoryStore) => {
      if (!userKey) return;
      // If storage is unavailable the chats still work for this visit, they just are not remembered.
      const saved = persistHistory(browserStorage(), userKey, next) ?? next;
      storeRef.current = saved;
      activeIdRef.current = saved.activeId;
      setStore(saved);
    },
    [userKey]
  );

  /** Saves the live conversation (creates the chat on the user's first message). */
  const save = useCallback(
    (messages: SavableMessage[]) => {
      if (!userKey) return;
      const current = findChat(storeRef.current, activeIdRef.current);
      // Opening or restoring a chat must not count as activity (it would reorder the list and change its date).
      if (current && JSON.stringify(current.messages) === JSON.stringify(toStoredMessages(messages))) return;
      const result = saveConversation(storeRef.current, activeIdRef.current, messages, Date.now(), newId);
      if (result.store === storeRef.current) return;
      activeIdRef.current = result.chatId;
      commit(result.store);
    },
    [userKey, commit]
  );

  const startNew = useCallback(() => commit(closeActive(storeRef.current)), [commit]);

  const open = useCallback(
    (id: string): StoredMessage[] | null => {
      const chat = findChat(storeRef.current, id);
      if (!chat) return null;
      commit({ ...storeRef.current, activeId: id });
      return chat.messages;
    },
    [commit]
  );

  const remove = useCallback((id: string) => commit(deleteChat(storeRef.current, id)), [commit]);
  const clearAll = useCallback(() => commit(emptyStore()), [commit]);

  /** The conversation that was open last time (restored when the assistant loads). */
  const restoreActive = useCallback((): StoredMessage[] | null => {
    return findChat(storeRef.current, storeRef.current.activeId)?.messages ?? null;
  }, []);

  return {
    enabled: Boolean(userKey),
    ready,
    chats: store.chats,
    activeId: store.activeId,
    save,
    startNew,
    open,
    remove,
    clearAll,
    restoreActive,
  };
}
