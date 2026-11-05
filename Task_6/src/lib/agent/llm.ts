/** Minimal chat-completions client for Sarvam AI (OpenAI-style API with tool calling). */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LlmTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmReply {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface ChatInput {
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  /** "required" forces the model to call a tool. */
  toolChoice?: "auto" | "required";
}

export interface LlmClient {
  readonly name: string;
  chat(input: ChatInput): Promise<LlmReply>;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}

const SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions";
const DEFAULT_MODEL = "sarvam-105b-conversations";
const REQUEST_TIMEOUT_MS = 25_000;

/** Models may wrap their reasoning in <think> tags; patients must never see it. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
}

export class SarvamClient implements LlmClient {
  readonly name = "sarvam";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL
  ) {}

  async chat(input: ChatInput): Promise<LlmReply> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: input.messages,
      temperature: 0.2,
      max_tokens: input.maxTokens ?? 700,
    };
    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = input.toolChoice ?? "auto";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(SARVAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new LlmError(err?.name === "AbortError" ? "The language model timed out." : "Could not reach the language model.");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Never surface the provider's body: it can echo request details.
      throw new LlmError(`The language model returned HTTP ${res.status}.`, res.status);
    }

    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    } | null;
    const message = data?.choices?.[0]?.message;
    if (!message) throw new LlmError("The language model returned an empty response.");

    return {
      content: typeof message.content === "string" ? stripReasoning(message.content) : null,
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    };
  }
}

/** The configured model client, or null when no API key is set. */
export function getLlmClient(): LlmClient | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return null;
  return new SarvamClient(key, process.env.SARVAM_MODEL?.trim() || DEFAULT_MODEL);
}
