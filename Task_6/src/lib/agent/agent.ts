import crypto from "crypto";
import type { MedrellaRepository, PatientEntity } from "@/db/repo";
import { LlmError, type LlmClient, type LlmMessage } from "./llm";
import { buildSystemPrompt } from "./prompt";
import {
  EMERGENCY_REPLY,
  MAX_HISTORY_MESSAGES,
  MAX_USER_MESSAGE_CHARS,
  cleanUserMessage,
  detectReplyLanguage,
  isEmergencyMessage,
} from "./safety";
import { LLM_TOOLS, findTool, type AgentCard } from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  reply: string;
  cards: AgentCard[];
  toolsUsed: string[];
  emergency?: boolean;
}

const MAX_ROUNDS = 6;
const MAX_TOOL_CALLS_PER_ROUND = 3;
const MAX_TOOL_RESULT_CHARS = 4000;
const STATES_FACTS = /₹|\bDr\.?\s|डॉ\.?\s|\b\d{1,2}:\d{2}\b/;
const FALLBACK_REPLY =
  "I could not complete that just now. Please try again, or use the Doctors page to book directly.";

async function audit(
  repo: MedrellaRepository,
  userId: string,
  kind: "MESSAGE" | "TOOL_CALL" | "ACTION" | "ERROR",
  tool: string | null,
  detail: string | null
): Promise<void> {
  try {
    await repo.createAgentEvent({ id: `agt_${crypto.randomUUID()}`, userId, kind, tool, detail: detail?.slice(0, 300) ?? null });
  } catch {
    // Auditing must never break the conversation.
  }
}

/** Only plain user/assistant text from the browser is trusted as history; roles are re-checked and text is bounded. */
export function sanitizeHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: ChatTurn[] = [];
  for (const item of history) {
    const role = (item as { role?: unknown })?.role;
    const content = cleanUserMessage((item as { content?: unknown })?.content);
    if ((role === "user" || role === "assistant") && content) {
      turns.push({ role, content: content.slice(0, MAX_USER_MESSAGE_CHARS) });
    }
  }
  return turns.slice(-MAX_HISTORY_MESSAGES);
}

export async function runAgent(input: {
  repo: MedrellaRepository;
  llm: LlmClient;
  userId: string;
  patient: PatientEntity;
  history: unknown;
  message: string;
  now?: Date;
}): Promise<AgentResult> {
  const now = input.now ?? new Date();
  const message = cleanUserMessage(input.message);
  if (!message) return { reply: "Please type a message.", cards: [], toolsUsed: [] };

  // Metadata only: the text itself may contain health details, so it is not stored.
  await audit(input.repo, input.userId, "MESSAGE", null, `user message, ${message.length} chars`);

  if (isEmergencyMessage(message)) {
    await audit(input.repo, input.userId, "ACTION", "emergency_guidance", "emergency wording detected");
    return { reply: EMERGENCY_REPLY, cards: [], toolsUsed: [], emergency: true };
  }

  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt({ patientFirstName: input.patient.firstName, now }) },
    ...sanitizeHistory(input.history).map((t) => ({ role: t.role, content: t.content }) as LlmMessage),
    { role: "user", content: languageDirective(message) },
  ];

  const cards: AgentCard[] = [];
  const toolsUsed: string[] = [];
  const ctx = { repo: input.repo, userId: input.userId, patient: input.patient, now };

  let forceTool = false;
  let groundingRetried = false;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const reply = await input.llm.chat({
        messages,
        tools: LLM_TOOLS,
        toolChoice: forceTool ? "required" : "auto",
      });
      forceTool = false;

      if (reply.toolCalls.length === 0) {
        const text = reply.content?.trim();
        // Doctor names, prices and times must come from a tool, never from the model's memory.
        if (text && toolsUsed.length === 0 && !groundingRetried && STATES_FACTS.test(text)) {
          groundingRetried = true;
          forceTool = true;
          messages.push({
            role: "system",
            content:
              "Your last answer stated doctors, prices or times without looking them up. Call the right tool now and answer only from its result.",
          });
          continue;
        }
        if (text && toolsUsed.length === 0 && groundingRetried && STATES_FACTS.test(text)) {
          return { reply: FALLBACK_REPLY, cards: [], toolsUsed };
        }
        return { reply: text || FALLBACK_REPLY, cards: dedupeCards(cards), toolsUsed };
      }

      const calls = reply.toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
      messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: calls });

      for (const call of calls) {
        const name = call.function?.name ?? "";
        const tool = findTool(name);
        let result: unknown;

        if (!tool) {
          result = { error: "Unknown tool." };
        } else {
          let args: unknown = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = null;
          }
          const parsed = args === null ? null : tool.schema.safeParse(args);
          if (!parsed || !parsed.success) {
            result = { error: "Invalid arguments for this tool." };
          } else {
            toolsUsed.push(name);
            await audit(input.repo, input.userId, "TOOL_CALL", name, JSON.stringify(parsed.data));
            try {
              const output = await tool.run(ctx, parsed.data);
              result = output.data;
              if (output.cards) cards.push(...output.cards);
            } catch (err: any) {
              await audit(input.repo, input.userId, "ERROR", name, String(err?.message || err));
              result = { error: "That lookup failed. Please try again." };
            }
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      }
    }
  } catch (err) {
    await audit(input.repo, input.userId, "ERROR", "llm", err instanceof Error ? err.message : "unknown");
    throw err instanceof LlmError ? err : new LlmError("The assistant is unavailable right now.");
  }

  const prepared = dedupeCards(cards);
  return {
    reply: prepared.length ? "I have prepared this for you. Please review the details below." : FALLBACK_REPLY,
    cards: prepared,
    toolsUsed,
  };
}

/** Models drift to English after tool calls, so name the reply language explicitly for Hindi and Marathi. */
function languageDirective(message: string): string {
  const language = detectReplyLanguage(message);
  return language
    ? `${message}

[Instruction: write your entire reply in ${language} using Devanagari script. Keep doctor names and times unchanged.]`
    : message;
}

function dedupeCards(cards: AgentCard[]): AgentCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const key = `${c.kind}|${c.href ?? ""}|${c.action?.appointmentId ?? ""}|${c.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
