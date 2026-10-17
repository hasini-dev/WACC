// Server/worker only. Minimal JSON-returning chat client for Ollama (local or cloud).
import { z } from "zod";

export interface LlmConfig {
  provider: "ollama" | "none";
  host: string;
  model: string;
  apiKey?: string;
}

export function llmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = env.LLM_PROVIDER === "ollama" ? "ollama" : "none";
  return {
    provider,
    host: (env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, ""),
    model: env.OLLAMA_MODEL || "gemma4:12b",
    apiKey: env.OLLAMA_API_KEY || undefined,
  };
}

export type LlmResult<T> = { ok: true; data: T; model: string } | { ok: false; error: string };

/** Pull the JSON object out of a reply that may be wrapped in ``` fences or prose. */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

async function ollamaChat(cfg: LlmConfig, messages: Array<{ role: string; content: string }>, format: unknown): Promise<string> {
  const res = await fetch(`${cfg.host}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model, stream: false, format, options: { temperature: 0 }, messages }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content ?? "";
}

/**
 * Ask for JSON matching `schema`. Local Ollama enforces the JSON schema via
 * `format`; Ollama cloud doesn't yet, so the schema is also in the prompt and
 * the reply is validated with Zod. One retry with the validation error.
 */
export async function chatJson<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  cfg?: LlmConfig;
}): Promise<LlmResult<T>> {
  const cfg = params.cfg ?? llmConfig();
  if (cfg.provider === "none") return { ok: false, error: "LLM disabled (LLM_PROVIDER not set)" };
  const jsonSchema = z.toJSONSchema(params.schema);
  const system = `${params.system}\n\nReply with a single JSON object that matches this JSON Schema. No prose, no code fences.\n${JSON.stringify(jsonSchema)}`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: params.user },
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await ollamaChat(cfg, messages, jsonSchema);
      const parsed = params.schema.safeParse(extractJsonObject(reply));
      if (parsed.success) return { ok: true, data: parsed.data, model: cfg.model };
      lastError = z.prettifyError(parsed.error).slice(0, 600);
      messages.push({ role: "assistant", content: reply }, { role: "user", content: `That JSON did not validate:\n${lastError}\nReturn corrected JSON only.` });
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { ok: false, error: lastError };
}
