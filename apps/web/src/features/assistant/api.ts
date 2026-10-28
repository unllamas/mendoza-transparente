import type { AssistantReply, AssistantRequest, AssistantStatus, ChatMessage, FeedbackRequest, Progress } from "@mt/assistant/types";

const ENDPOINT = "/api/asistente";

/** Whether the assistant is configured, and whether it asks for Turnstile. Any failure counts as "not available": the widget stays hidden. */
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

/** A non-2xx answer from the API. `status` 429 means the per-IP rate limit (10 requests every 10 s); 403, a failed Turnstile check. */
export class AssistantApiError extends Error {
  constructor(readonly status: number) {
    super(`assistant ${status}`);
  }
}

/** Past this, the answer is given up and the person gets "Reintentar" instead of waiting forever. */
const ANSWER_TIMEOUT_MS = 60_000;

/**
 * Sends the conversation and returns Aco's reply. The API streams one NDJSON line per step ({ status }) and then the
 * reply, so `onProgress` can say what Aco is doing. Throws on network errors, non-2xx (`AssistantApiError`), a
 * streamed error or the timeout, so the caller can offer a retry.
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
  if (!res.ok) throw new AssistantApiError(res.status);
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

/** Fire and forget: a failed vote is not worth interrupting the person. */
export function sendFeedback(feedback: FeedbackRequest): void {
  fetch(`${ENDPOINT}/opinion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedback),
  }).catch(() => {});
}
