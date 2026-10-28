import type { AssistantReply, AssistantRequest, AssistantStatus, ChatMessage, FeedbackRequest, Progress } from "@mt/assistant/types";

const ENDPOINT = "/api/asistente";

/** Si el asistente está configurado y si pide Turnstile. Cualquier falla cuenta como «no disponible»: el widget no aparece. */
export async function fetchStatus(): Promise<AssistantStatus | null> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const status = (await res.json()) as AssistantStatus;
    return status.enabled === true ? status : null;
  } catch {
    return null;
  }
}

/**
 * Una respuesta que no es 2xx. 429 es un límite de uso: sin `limit`, el del WAF (10 pedidos cada 10 s por IP); con
 * `limit`, uno de Aco (quota.ts: ráfaga, día por IP o día del sitio). 403, Turnstile que falló o una conversación que
 * llegó a su tope de mensajes.
 */
export class AssistantApiError extends Error {
  constructor(
    readonly status: number,
    readonly limit?: string,
  ) {
    super(`assistant ${status}`);
  }
}

/** Pasado este tiempo se abandona la respuesta y la persona ve «Reintentar» en vez de esperar para siempre. */
const ANSWER_TIMEOUT_MS = 60_000;

/**
 * Manda la conversación y devuelve la respuesta de Aco. La API manda una línea NDJSON por paso ({ status }) y después
 * la respuesta, así `onProgress` puede decir qué está haciendo Aco. Tira un error ante una falla de red, una respuesta
 * que no es 2xx (`AssistantApiError`), un error en el stream o el tiempo agotado, para que se pueda reintentar.
 */
export async function sendMessages(
  messages: ChatMessage[],
  proof: Omit<AssistantRequest, "messages"> = {},
  onProgress?: (p: Progress) => void,
): Promise<AssistantReply> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify({ messages, ...proof } satisfies AssistantRequest),
    signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  });
  if (!res.ok) {
    // El 429 del WAF no es JSON: entonces no trae `limit`.
    const limit = res.status === 429 ? ((await res.json().catch(() => null)) as { limit?: string } | null)?.limit : undefined;
    throw new AssistantApiError(res.status, limit);
  }
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) return (await res.json()) as AssistantReply;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { status?: Progress; reply?: AssistantReply; error?: string };
      if (msg.status) onProgress?.(msg.status);
      if (msg.reply) return msg.reply;
      if (msg.error) throw new AssistantApiError(502);
    }
    if (done) throw new AssistantApiError(502);
  }
}

/** Se manda y se olvida: un voto que falla no justifica interrumpir a la persona. */
export function sendFeedback(feedback: FeedbackRequest): void {
  fetch(`${ENDPOINT}/opinion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedback),
  }).catch(() => {});
}
