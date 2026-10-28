/**
 * Proveedores del modelo: Vercel AI Gateway y OpenRouter, los dos con la API chat-completions de OpenAI. Se prueban en
 * orden y el siguiente toma la posta ante un error, un timeout o un 429/5xx. Las claves salen solo de los secretos de
 * la Function (AI_GATEWAY_API_KEY, OPENROUTER_API_KEY): nunca llegan al navegador, a la respuesta ni a los logs.
 */

export interface AssistantEnv {
  AI_GATEWAY_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Orden en que se prueban, separado por comas. Por defecto, "gateway,openrouter". */
  ASSISTANT_PROVIDERS?: string;
  /** Id del modelo, el mismo en los dos catálogos. Por defecto, anthropic/claude-haiku-5.5 (barato y rápido). */
  ASSISTANT_MODEL?: string;
  ASSISTANT_MODEL_GATEWAY?: string;
  ASSISTANT_MODEL_OPENROUTER?: string;
  /** Modelo que lee la pregunta y elige las herramientas. Si no está, usa el del proveedor. */
  ASSISTANT_MODEL_TOOLS?: string;
  /** Modelo que redacta el texto final, después de las herramientas. Si no está, escribe el de herramientas, sin otra llamada. */
  ASSISTANT_MODEL_ANSWER?: string;
  /** "on" pide Turnstile una vez por conversación (docs/procesos/asistente.md#límites-contra-el-abuso-y-el-gasto). */
  ASSISTANT_TURNSTILE?: string;
  /** Respuestas por día en todo el sitio, en producción. Por defecto, 3000 (quota.ts). */
  ASSISTANT_DAILY_LIMIT?: string;
}

/** Para qué es una llamada: elegir herramientas o redactar la respuesta. Cada una puede usar su propio modelo. */
export type Task = "tools" | "answer";

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
    // Cabeceras opcionales de atribución que lee OpenRouter: identifican al sitio, no a la persona.
    headers: { "HTTP-Referer": "https://mendoza-transparente.com", "X-Title": "Mendoza Transparente" },
  },
};

/** Los proveedores con clave, en el orden configurado. */
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

/**
 * Cada intento contra un proveedor, haya salido bien o no, para medir el consumo en el panel. Sin texto: solo modelo,
 * tokens, costo y tiempo. `costUsd` es el que informa el proveedor (OpenRouter lo manda en `usage.cost`); si no lo
 * informa, el panel lo estima con los precios públicos del modelo.
 */
export interface Attempt {
  task: Task;
  provider: ProviderId;
  model: string;
  /** "ok", "http_<código>", "timeout", "empty" (respuesta sin mensaje) o "error". */
  status: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export class ProvidersUnavailable extends Error {}

const TIMEOUT_MS = 20_000;
/**
 * Tope de salida por llamada. Aunque el texto tiene como máximo 280 caracteres, el modelo genera más (unos 200 tokens
 * de promedio en las evals): con 400, una de cada diez llamadas llegaba al tope y algunas respuestas salían cortadas.
 * 700 acota el gasto sin cortar.
 */
const MAX_TOKENS = 700;

/** El modelo de una tarea en un proveedor: el de la tarea si está, si no el del proveedor, si no el general. */
export function modelFor(env: AssistantEnv, provider: ProviderId, task: Task): string {
  const own = task === "answer" ? env.ASSISTANT_MODEL_ANSWER : env.ASSISTANT_MODEL_TOOLS;
  return own || PROVIDERS[provider].model(env);
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export async function complete(
  env: AssistantEnv,
  body: { messages: WireMessage[]; tools: readonly unknown[] },
  fetcher: Fetcher = fetch,
  task: Task = "tools",
  onAttempt?: (a: Attempt) => void,
): Promise<Completion> {
  const providers = configuredProviders(env);
  if (!providers.length) throw new ProvidersUnavailable("Sin proveedores configurados");
  const failures: string[] = [];
  for (const p of providers) {
    const model = modelFor(env, p.id, task);
    const started = Date.now();
    const attempt = (status: string, usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown }) =>
      onAttempt?.({
        task,
        provider: p.id,
        model,
        status,
        ms: Date.now() - started,
        ...(count(usage?.prompt_tokens) !== undefined ? { promptTokens: count(usage?.prompt_tokens) } : {}),
        ...(count(usage?.completion_tokens) !== undefined ? { completionTokens: count(usage?.completion_tokens) } : {}),
        ...(count(usage?.cost) !== undefined ? { costUsd: count(usage?.cost) } : {}),
      });
    try {
      const res = await fetcher(p.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${p.key(env)}`, ...p.headers },
        body: JSON.stringify({ model, messages: body.messages, tools: body.tools, max_tokens: MAX_TOKENS, temperature: 0.2 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // Al log va solo el código: el cuerpo de un error del proveedor puede repetir las cabeceras del pedido.
        failures.push(`${p.id}: HTTP ${res.status}`);
        attempt(`http_${res.status}`);
        continue;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
      };
      const message = json.choices?.[0]?.message;
      if (!message) {
        failures.push(`${p.id}: respuesta sin mensaje`);
        attempt("empty", json.usage);
        continue;
      }
      attempt("ok", json.usage);
      return { content: message.content ?? null, toolCalls: message.tool_calls ?? [], provider: p.id, model };
    } catch (err) {
      const name = (err as Error).name;
      failures.push(`${p.id}: ${name}`);
      attempt(name === "TimeoutError" || name === "AbortError" ? "timeout" : "error");
    }
  }
  throw new ProvidersUnavailable(failures.join("; "));
}
