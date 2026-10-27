import type { AssistantReply, AssistantRequest, AssistantStatus, ChatMessage, FeedbackRequest } from "@mt/assistant/types";

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

/** Sends the conversation and returns Aco's reply. Throws on network errors and non-2xx (`AssistantApiError`) so the caller can offer a retry. */
export async function sendMessages(messages: ChatMessage[], proof: Omit<AssistantRequest, "messages"> = {}): Promise<AssistantReply> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, ...proof } satisfies AssistantRequest),
  });
  if (!res.ok) throw new AssistantApiError(res.status);
  return (await res.json()) as AssistantReply;
}

/** Fire and forget: a failed vote is not worth interrupting the person. */
export function sendFeedback(feedback: FeedbackRequest): void {
  fetch(`${ENDPOINT}/opinion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedback),
  }).catch(() => {});
}
