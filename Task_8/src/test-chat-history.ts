/**
 * Chat history tests: saved on this device only, per user, never keeping tokens, and robust against bad data.
 * No browser needed: a fake Storage is used.
 */

import {
  HISTORY_KEY_PREFIX,
  MAX_CHATS,
  MAX_MESSAGES_PER_CHAT,
  clearAllChatHistory,
  closeActive,
  deleteChat,
  emptyStore,
  findChat,
  formatWhen,
  historyKey,
  loadHistory,
  parseStore,
  persistHistory,
  saveConversation,
  titleFrom,
  toStoredMessages,
  type SavableMessage,
  type StorageLike,
} from "./lib/assistant/chat-history";

let total = 0;
let failed = 0;

function assert(condition: boolean, name: string, details?: string) {
  total++;
  if (condition) console.log(`  ✅ PASS: ${name}`);
  else {
    console.error(`  ❌ FAIL: ${name}${details ? ` (${details})` : ""}`);
    failed++;
  }
}

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  /** Max total characters before setItem throws, to imitate a full browser quota. */
  quota = Infinity;
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    const others = [...this.data.entries()].filter(([key]) => key !== k).reduce((n, [, val]) => n + val.length, 0);
    if (others + v.length > this.quota) throw new Error("QuotaExceededError");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let idCounter = 0;
const makeId = () => `chat_${++idCounter}`;
const user = (content: string): SavableMessage => ({ role: "user", content });
const bot = (content: string, extra: Partial<SavableMessage> = {}): SavableMessage => ({ role: "assistant", content, ...extra });

console.log("\n--- Chat history: saving and restoring ---");

const t0 = 1_700_000_000_000;
const r1 = saveConversation(emptyStore(), null, [user("Find a cardiologist please"), bot("Dr. Mehta is available.")], t0, makeId);
assert(r1.chatId === "chat_1" && r1.store.chats.length === 1 && r1.store.activeId === "chat_1", "the first message creates a chat and makes it the open one");
assert(r1.store.chats[0].title === "Find a cardiologist please", "the title is the first thing the user asked");
assert(saveConversation(emptyStore(), null, [bot("Hi! I can help.")], t0, makeId).store.chats.length === 0, "a conversation with no user message is never saved");
assert(saveConversation(emptyStore(), null, [], t0, makeId).chatId === null, "an empty conversation saves nothing");

const r2 = saveConversation(r1.store, r1.chatId, [user("Find a cardiologist please"), bot("Dr. Mehta is available."), user("Book tomorrow 10:00"), bot("Done.")], t0 + 5000, makeId);
assert(r2.store.chats.length === 1 && r2.store.chats[0].messages.length === 4 && r2.store.chats[0].createdAt === t0, "continuing a chat updates it instead of creating a second one");
assert(r2.store.chats[0].title === "Find a cardiologist please", "the title does not change as the chat grows");

const r3 = saveConversation(r2.store, null, [user("Show my payments")], t0 + 9000, makeId);
assert(r3.store.chats.length === 2 && r3.store.chats[0].title === "Show my payments", "a new chat goes to the top of the list");
assert(r3.store.chats[1].messages.length === 4, "the older chat is kept untouched");

assert(titleFrom([user("   hello    there   ")]) === "hello there" && titleFrom([bot("hi")]) === "New chat", "titles are tidied, and fall back to 'New chat'");
assert(titleFrom([user("x".repeat(200))]).length <= 42 && titleFrom([user("x".repeat(200))]).endsWith("…"), "long titles are shortened with an ellipsis");

console.log("\n--- Chat history: what is never saved ---");

const risky: SavableMessage[] = [
  user("Book Dr. Mehta tomorrow"),
  bot("Please press Confirm.", {
    cards: [
      { kind: "CONFIRM", title: "Book Dr. Mehta", lines: ["Thu 10:00"], confirm: { token: "SECRET.TOKEN", action: "BOOK", label: "Confirm", expiresAt: "x" } },
      { kind: "INFO", title: "Working hours", lines: ["9 shifts"], href: "/doctor/availability", linkLabel: "Manage shifts" },
      { kind: "SLOTS", title: "Other times", lines: ["Tap a time"], options: [{ label: "Fri 09:00", message: "Book Dr. Mehta on 2026-11-20 at 09:00" }] },
    ],
    payment: { orderId: "order_1", paymentId: "pay_1" },
  }),
  bot("Something went wrong.", { isError: true }),
  bot("   "),
];
const safe = toStoredMessages(risky);
const dump = JSON.stringify(safe);
assert(!dump.includes("SECRET.TOKEN") && !dump.includes("CONFIRM") && !dump.includes("order_1") && !dump.includes("pay_1"), "confirmation tokens, confirm cards and payment holds are never stored");
assert(safe.length === 2 && safe[1].cards?.length === 2, "harmless info and slot cards are kept");
assert(safe[1].cards?.[1].options?.[0].message.includes("Book Dr. Mehta") === true, "tappable slot options survive");
assert(!dump.includes("Something went wrong") && !dump.includes("   "), "error messages and blank messages are dropped");
const badLink = toStoredMessages([bot("x", { cards: [{ kind: "INFO", title: "t", lines: [], href: "https://evil.example/phish", linkLabel: "Open" }] })]);
assert(badLink[0].cards?.[0].href === undefined, "only in-app links are kept, never an outside address");
assert(toStoredMessages([user("y".repeat(5000))])[0].content.length === 2000, "very long messages are capped");
assert(toStoredMessages(Array.from({ length: 200 }, (_, i) => user(`m${i}`))).length === MAX_MESSAGES_PER_CHAT, "a chat keeps only its latest messages");

let big = emptyStore();
for (let i = 0; i < MAX_CHATS + 10; i++) big = saveConversation(big, null, [user(`q${i}`)], t0 + i, makeId).store;
assert(big.chats.length === MAX_CHATS && big.chats[0].title === `q${MAX_CHATS + 9}` && !big.chats.some((c) => c.title === "q0"), "only the newest chats are kept, the oldest drop off");

console.log("\n--- Chat history: opening, deleting, new chat ---");

assert(findChat(r3.store, r3.chatId)?.title === "Show my payments" && findChat(r3.store, "nope") === undefined && findChat(r3.store, null) === undefined, "a chat can be found by id");
const afterNew = closeActive(r3.store);
assert(afterNew.activeId === null && afterNew.chats.length === 2, "New chat keeps the old chats and opens nothing");
const afterDelete = deleteChat(r3.store, r3.chatId!);
assert(afterDelete.chats.length === 1 && afterDelete.activeId === null, "deleting the open chat removes it and closes it");
assert(deleteChat(r3.store, "chat_1").activeId === r3.chatId, "deleting another chat does not close the open one");

console.log("\n--- Chat history: browser storage ---");

const storage = new FakeStorage();
assert(persistHistory(storage, "usr-A", r3.store) !== null && loadHistory(storage, "usr-A").chats.length === 2, "history round-trips through storage");
assert(loadHistory(storage, "usr-B").chats.length === 0, "another user on the same browser sees nothing");
persistHistory(storage, "usr-B", saveConversation(emptyStore(), null, [user("B's private question")], t0, makeId).store);
assert(!JSON.stringify(loadHistory(storage, "usr-A")).includes("private question"), "two users' histories stay separate");
assert(historyKey("../../evil key").startsWith(HISTORY_KEY_PREFIX) && !historyKey("../../evil key").includes("/") && !historyKey("../../evil key").includes(" "), "a user id can never break out of the storage key");

storage.setItem(historyKey("usr-C"), "{not json");
assert(loadHistory(storage, "usr-C").chats.length === 0, "damaged saved data is ignored, not a crash");
storage.setItem(historyKey("usr-C"), JSON.stringify({ version: 99, chats: [{ id: "x", messages: [] }] }));
assert(loadHistory(storage, "usr-C").chats.length === 0, "data from another version is ignored");
storage.setItem(historyKey("usr-C"), JSON.stringify({ version: 1, activeId: "gone", chats: [{ id: "a", title: "ok", createdAt: 1, updatedAt: 2, messages: [{ role: "user", content: "hi" }, { role: "system", content: "evil" }, 5] }, { id: 7 }] }));
const tolerant = loadHistory(storage, "usr-C");
assert(tolerant.chats.length === 1 && tolerant.chats[0].messages.length === 1 && tolerant.activeId === null, "bad entries are dropped, good ones are kept");
assert(parseStore(JSON.stringify({ version: 1, chats: [{ id: "a", createdAt: 1, messages: [{ role: "user", content: "inject", cards: [{ kind: "CONFIRM", title: "t", lines: [], confirm: { token: "T" } }] }] }] })).chats[0].messages[0].cards === undefined, "even hand-edited data cannot bring a confirm card back");

const tiny = new FakeStorage();
tiny.quota = 1500;
let crowded = emptyStore();
for (let i = 0; i < 12; i++) crowded = saveConversation(crowded, null, [user(`question number ${i} ${"x".repeat(150)}`)], t0 + i, makeId).store;
const saved = persistHistory(tiny, "usr-Q", crowded);
assert(saved !== null && saved.chats.length < 12 && saved.chats[0].title.startsWith("question number 11"), "when the browser is full, the oldest chats are dropped to make room", `kept ${saved?.chats.length}`);
assert(persistHistory(null, "usr-Q", crowded) === null && loadHistory(null, "usr-Q").chats.length === 0, "no storage at all is handled quietly");
const refuse = new FakeStorage();
refuse.quota = 5;
assert(persistHistory(refuse, "usr-Q", saveConversation(emptyStore(), null, [user("hi")], t0, makeId).store) === null, "a browser that refuses all writes does not crash the chat");
persistHistory(storage, "usr-A", emptyStore());
assert(storage.getItem(historyKey("usr-A")) === null, "saving an empty history removes the entry");

console.log("\n--- Chat history: cleared at sign-out ---");

const shared = new FakeStorage();
persistHistory(shared, "usr-A", r3.store);
persistHistory(shared, "usr-B", r3.store);
shared.setItem("medrella.voice.prefs", "{}");
shared.setItem("unrelated", "keep");
assert(clearAllChatHistory(shared) === 2, "sign-out removes every user's assistant chats on this device");
assert(shared.getItem("medrella.voice.prefs") === "{}" && shared.getItem("unrelated") === "keep" && !([...shared.data.keys()].some((k) => k.startsWith(HISTORY_KEY_PREFIX))), "it leaves voice settings and other data alone");
assert(clearAllChatHistory(null) === 0, "clearing with no storage is harmless");

console.log("\n--- Chat history: dates ---");

const now = new Date(2026, 10, 16, 15, 0).getTime(); // 16 Nov 2026, 15:00 local
assert(formatWhen(new Date(2026, 10, 16, 9, 5).getTime(), now) === "Today 09:05", "today shows the time");
assert(formatWhen(new Date(2026, 10, 15, 22, 40).getTime(), now) === "Yesterday 22:40", "yesterday shows the time");
assert(formatWhen(new Date(2026, 10, 3, 12, 0).getTime(), now) === "3 Nov", "older chats show the date");
assert(formatWhen(new Date(2025, 11, 30, 12, 0).getTime(), now) === "30 Dec 2025", "a chat from another year shows the year");

console.log(`\nChat history tests: ${total - failed} passed, ${failed} failed (of ${total})`);
if (failed > 0) process.exit(1);
