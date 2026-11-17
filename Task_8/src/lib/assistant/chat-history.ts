/**
 * Chat history for the AI assistant, kept ON THIS DEVICE ONLY (the browser's localStorage), separately for
 * every signed-in user. Nothing is sent to the server: the server deliberately never stores message text,
 * because these conversations can contain health details.
 *
 * Pure functions plus a tiny storage adapter, so everything here is unit-tested without a browser.
 *
 * What is saved: the text of each message and harmless info/slot cards. What is NOT saved: confirmation
 * cards and payment cards. They carry short-lived signed tokens and live payment holds, so an old copy must
 * never be clickable again.
 */

export const HISTORY_VERSION = 1;
export const HISTORY_KEY_PREFIX = "medrella.chat.";
export const MAX_CHATS = 30;
export const MAX_MESSAGES_PER_CHAT = 60;
const MAX_CONTENT_CHARS = 2000;
const MAX_TITLE_CHARS = 42;
const MAX_CARD_LINES = 8;
const MAX_CARD_OPTIONS = 8;

export interface StoredCard {
  kind: "INFO" | "SLOTS";
  title: string;
  lines: string[];
  href?: string;
  linkLabel?: string;
  options?: { label: string; message: string }[];
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  cards?: StoredCard[];
}

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

export interface HistoryStore {
  version: typeof HISTORY_VERSION;
  /** The conversation that was open last, restored when the assistant loads. */
  activeId: string | null;
  /** Newest first. */
  chats: StoredChat[];
}

/** The part of a live chat message that can be saved (the UI's own message type is a superset). */
export interface SavableMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  payment?: unknown;
  cards?: {
    kind: string;
    title: string;
    lines: string[];
    href?: string;
    linkLabel?: string;
    options?: { label: string; message: string }[];
    confirm?: unknown;
  }[];
}

/** The subset of the Web Storage API that is used (so tests can pass a fake). */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function emptyStore(): HistoryStore {
  return { version: HISTORY_VERSION, activeId: null, chats: [] };
}

/** One key per signed-in user, so two people sharing a browser never see each other's chats. */
export function historyKey(userKey: string): string {
  return `${HISTORY_KEY_PREFIX}v${HISTORY_VERSION}.${userKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}`;
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** Keeps only what is safe and useful to restore later. */
export function toStoredMessages(messages: SavableMessage[]): StoredMessage[] {
  const kept: StoredMessage[] = [];
  for (const m of messages) {
    if (m.isError) continue; // transient failures are noise in a history
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;

    const stored: StoredMessage = { role: m.role, content: clip(m.content, MAX_CONTENT_CHARS) };
    const cards = (m.cards ?? [])
      .filter((c) => (c.kind === "INFO" || c.kind === "SLOTS") && !c.confirm)
      .slice(0, 3)
      .map<StoredCard>((c) => ({
        kind: c.kind as "INFO" | "SLOTS",
        title: clip(String(c.title ?? ""), 120),
        lines: (Array.isArray(c.lines) ? c.lines : []).slice(0, MAX_CARD_LINES).map((l) => clip(String(l), 240)),
        ...(typeof c.href === "string" && c.href.startsWith("/") ? { href: c.href } : {}),
        ...(typeof c.linkLabel === "string" ? { linkLabel: clip(c.linkLabel, 60) } : {}),
        ...(Array.isArray(c.options)
          ? {
              options: c.options
                .slice(0, MAX_CARD_OPTIONS)
                .map((o) => ({ label: clip(String(o.label), 80), message: clip(String(o.message), 200) })),
            }
          : {}),
      }));
    if (cards.length) stored.cards = cards;
    kept.push(stored);
  }
  return kept.slice(-MAX_MESSAGES_PER_CHAT);
}

/** The chat's title: the first thing the user asked, shortened. */
export function titleFrom(messages: { role: string; content: string }[]): string {
  const first = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim();
  if (!first) return "New chat";
  return first.length > MAX_TITLE_CHARS ? `${first.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : first;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads saved history defensively: anything damaged, edited by hand or from another version is dropped. */
export function parseStore(raw: string | null | undefined): HistoryStore {
  if (!raw) return emptyStore();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyStore();
  }
  if (!isRecord(data) || data.version !== HISTORY_VERSION || !Array.isArray(data.chats)) return emptyStore();

  const chats: StoredChat[] = [];
  for (const c of data.chats) {
    if (!isRecord(c) || typeof c.id !== "string" || !Array.isArray(c.messages)) continue;
    const messages = toStoredMessages(c.messages as SavableMessage[]);
    if (messages.length === 0) continue;
    const createdAt = typeof c.createdAt === "number" ? c.createdAt : 0;
    const updatedAt = typeof c.updatedAt === "number" ? c.updatedAt : createdAt;
    chats.push({
      id: clip(c.id, 64),
      title: typeof c.title === "string" && c.title.trim() ? clip(c.title, 80) : titleFrom(messages),
      createdAt,
      updatedAt,
      messages,
    });
  }
  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  const limited = chats.slice(0, MAX_CHATS);
  const activeId = typeof data.activeId === "string" && limited.some((c) => c.id === data.activeId) ? data.activeId : null;
  return { version: HISTORY_VERSION, activeId, chats: limited };
}

/**
 * Saves the live conversation. Creates the chat the first time the user has said something, then keeps
 * updating the same one. A conversation with no user message is never saved.
 */
export function saveConversation(
  store: HistoryStore,
  chatId: string | null,
  messages: SavableMessage[],
  now: number,
  makeId: () => string
): { store: HistoryStore; chatId: string | null } {
  const stored = toStoredMessages(messages);
  if (!stored.some((m) => m.role === "user")) return { store, chatId };

  const existing = chatId ? store.chats.find((c) => c.id === chatId) : undefined;
  const id = existing?.id ?? makeId();
  const chat: StoredChat = {
    id,
    title: existing?.title ?? titleFrom(stored),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages: stored,
  };
  const others = store.chats.filter((c) => c.id !== id);
  const chats = [chat, ...others].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
  return { store: { version: HISTORY_VERSION, activeId: id, chats }, chatId: id };
}

export function deleteChat(store: HistoryStore, id: string): HistoryStore {
  return {
    version: HISTORY_VERSION,
    activeId: store.activeId === id ? null : store.activeId,
    chats: store.chats.filter((c) => c.id !== id),
  };
}

/** "New chat": the current conversation stays in the list, and nothing is open any more. */
export function closeActive(store: HistoryStore): HistoryStore {
  return { ...store, activeId: null };
}

export function findChat(store: HistoryStore, id: string | null): StoredChat | undefined {
  return id ? store.chats.find((c) => c.id === id) : undefined;
}

// ---- storage ----------------------------------------------------------------------------------

export function loadHistory(storage: StorageLike | null, userKey: string): HistoryStore {
  if (!storage) return emptyStore();
  try {
    return parseStore(storage.getItem(historyKey(userKey)));
  } catch {
    return emptyStore(); // storage blocked
  }
}

/**
 * Writes the history. If the browser's quota is full, the oldest chats are dropped one at a time until it fits.
 * Returns what actually got saved (so the screen matches it), or null when storage is unavailable.
 */
export function persistHistory(storage: StorageLike | null, userKey: string, store: HistoryStore): HistoryStore | null {
  if (!storage) return null;
  let current = store;
  for (let attempt = 0; attempt <= MAX_CHATS; attempt++) {
    try {
      if (current.chats.length === 0) storage.removeItem(historyKey(userKey));
      else storage.setItem(historyKey(userKey), JSON.stringify(current));
      return current;
    } catch {
      if (current.chats.length <= 1) return null;
      const dropped = current.chats[current.chats.length - 1];
      current = {
        version: HISTORY_VERSION,
        activeId: current.activeId === dropped.id ? null : current.activeId,
        chats: current.chats.slice(0, -1),
      };
    }
  }
  return null;
}

/** Removes every saved assistant conversation of every user on this device (used at sign-out). */
export function clearAllChatHistory(storage: StorageLike | null): number {
  if (!storage) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(HISTORY_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

// ---- display ----------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today 10:32", "Yesterday 18:05", or "12 Nov". Local time. */
export function formatWhen(timestamp: number, now: number): string {
  const d = new Date(timestamp);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === n.getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}
