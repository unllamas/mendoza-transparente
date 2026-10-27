/**
 * Model providers: Vercel AI Gateway and OpenRouter, both with the OpenAI chat-completions API. They are tried in
 * order and the next one takes over on an error, a timeout or a 429/5xx. Keys come only from the Function's
 * secrets (AI_GATEWAY_API_KEY, OPENROUTER_API_KEY): they never reach the browser, the response or the logs.
 */

export interface AssistantEnv {
  AI_GATEWAY_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Order to try, comma separated. Default "gateway,openrouter". */
  ASSISTANT_PROVIDERS?: string;
  /** Model id, the same in both catalogs. Default anthropic/claude-haiku-5.5 (cheap and fast). */
  ASSISTANT_MODEL?: string;
  ASSISTANT_MODEL_GATEWAY?: string;
  ASSISTANT_MODEL_OPENROUTER?: string;
}

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export type ProviderId = "gateway" | "openrouter";

interface ProviderSpec {
  id: ProviderId;
  url: string;
  key: (env: AssistantEnv) => string | undefined;
  model: (env: AssistantEnv) => string;
  headers?: Record<string, string>;
}

const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  gateway: {
    id: "gateway",
    url: "https://ai-gateway.vercel.sh/v1/chat/completions",
    key: (env) => env.AI_GATEWAY_API_KEY,
    model: (env) => env.ASSISTANT_MODEL_GATEWAY || env.ASSISTANT_MODEL || DEFAULT_MODEL,
  },
  openrouter: {
    id: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: (env) => env.OPENROUTER_API_KEY,
    model: (env) => env.ASSISTANT_MODEL_OPENROUTER || env.ASSISTANT_MODEL || DEFAULT_MODEL,
    // Optional attribution headers OpenRouter reads; they identify the site, not the person.
    headers: { "HTTP-Referer": "https://mendoza-transparente.com", "X-Title": "Mendoza Transparente" },
  },
};

/** Providers with a key, in the configured order. */
export function configuredProviders(env: AssistantEnv): ProviderSpec[] {
  const order = (env.ASSISTANT_PROVIDERS || "gateway,openrouter")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ProviderId => s in PROVIDERS);
  return order.map((id) => PROVIDERS[id]).filter((p) => Boolean(p.key(env)));
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface Completion {
  content: string | null;
  toolCalls: ToolCall[];
  provider: ProviderId;
  model: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export class ProvidersUnavailable extends Error {}

const TIMEOUT_MS = 20_000;
/** Hard caps per call: a short answer is enough, and it bounds the cost of a single request. */
const MAX_TOKENS = 700;

export async function complete(
  env: AssistantEnv,
  body: { messages: WireMessage[]; tools: readonly unknown[] },
  fetcher: Fetcher = fetch,
): Promise<Completion> {
  const providers = configuredProviders(env);
  if (!providers.length) throw new ProvidersUnavailable("Sin proveedores configurados");
  const failures: string[] = [];
  for (const p of providers) {
    const model = p.model(env);
    try {
      const res = await fetcher(p.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${p.key(env)}`, ...p.headers },
        body: JSON.stringify({ model, messages: body.messages, tools: body.tools, max_tokens: MAX_TOKENS, temperature: 0.2 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // Only the status goes to the log: provider error bodies can echo request headers.
        failures.push(`${p.id}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
      const message = json.choices?.[0]?.message;
      if (!message) {
        failures.push(`${p.id}: respuesta sin mensaje`);
        continue;
      }
      return { content: message.content ?? null, toolCalls: message.tool_calls ?? [], provider: p.id, model };
    } catch (err) {
      failures.push(`${p.id}: ${(err as Error).name}`);
    }
  }
  throw new ProvidersUnavailable(failures.join("; "));
}
