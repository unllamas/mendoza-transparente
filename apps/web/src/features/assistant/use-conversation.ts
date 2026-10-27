import type { AssistantReply, ChatMessage } from "@mt/assistant/types";
import { useCallback, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { AssistantApiError, sendMessages } from "./api.ts";

export type Turn = { from: "user"; text: string } | { from: "assistant"; reply: AssistantReply; at: number };

/** Why the last request failed: the per-IP rate limit (429), the Turnstile check (403) or anything else. */
export type ConversationError = "rate-limit" | "challenge" | "generic";

/** How long the first message waits for Turnstile before giving up with an error the person can retry. */
const TOKEN_WAIT_MS = 15_000;

const MAX_MESSAGES = 12;
const MAX_CHARS = 500;

/** The last 12 messages, each cut to 500 characters: what the API gets as context. */
function toMessages(turns: Turn[]): ChatMessage[] {
  return turns
    .map((t): ChatMessage => (t.from === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.reply.text }))
    .slice(-MAX_MESSAGES)
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_CHARS) }));
}

/**
 * The conversation, in memory only: it is not in the URL or in storage, and goes away when the page is reloaded.
 * With `challenge` (Turnstile on), the first request carries a Turnstile token and the next ones the pass that the
 * first answer brought back. `verification` says whether the Turnstile widget has to be on screen, and its `key`
 * changes to get a fresh token after a failed attempt (each token works once).
 */
export function useConversation(challenge = false) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<ConversationError | null>(null);
  const [verification, setVerification] = useState<{ needed: boolean; key: number }>({ needed: challenge, key: 0 });
  const turnsRef = useRef<Turn[]>([]);
  const busy = useRef(false);
  const pass = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string) => void) | null>(null);

  const onToken = useCallback((t: string | null) => {
    token.current = t;
    if (t && waiting.current) {
      waiting.current(t);
      waiting.current = null;
    }
  }, []);

  /** What proves this is a person: nothing, the pass, or a fresh token (waited for, if Turnstile is still working). */
  const proof = useCallback(async () => {
    if (!challenge) return {};
    if (pass.current) return { pass: pass.current };
    const t =
      token.current ??
      (await new Promise<string>((resolve, reject) => {
        waiting.current = resolve;
        setTimeout(() => reject(new Error("turnstile timeout")), TOKEN_WAIT_MS);
      }));
    token.current = null;
    return { turnstile: t };
  }, [challenge]);

  const request = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setThinking(true);
    setError(null);
    try {
      const reply = await sendMessages(toMessages(turnsRef.current), await proof());
      if (reply.pass) {
        pass.current = reply.pass;
        setVerification((v) => ({ ...v, needed: false }));
      }
      turnsRef.current = [...turnsRef.current, { from: "assistant", reply, at: Date.now() }];
      setTurns(turnsRef.current);
      track("assistant.answer.show", { outcome: reply.outcome, flow: reply.flow, municipality: reply.municipality });
    } catch (e) {
      const status = e instanceof AssistantApiError ? e.status : 0;
      setError(status === 429 ? "rate-limit" : status === 403 ? "challenge" : "generic");
      if (challenge && status !== 429) {
        // The token was spent (or the pass expired): show Turnstile again for a fresh one.
        if (status === 403) pass.current = null;
        if (!pass.current) setVerification((v) => ({ needed: true, key: v.key + 1 }));
      }
    } finally {
      busy.current = false;
      setThinking(false);
    }
  }, [proof, challenge]);

  const send = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || busy.current) return;
      turnsRef.current = [...turnsRef.current, { from: "user", text: clean }];
      setTurns(turnsRef.current);
      void request();
    },
    [request],
  );

  return { turns, thinking, error, send, retry: request, verification, onToken };
}
