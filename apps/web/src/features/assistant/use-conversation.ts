import type { AssistantReply, ChatMessage } from "@mt/assistant/types";
import { useCallback, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { sendMessages } from "./api.ts";

export type Turn = { from: "user"; text: string } | { from: "assistant"; reply: AssistantReply; at: number };

const MAX_MESSAGES = 12;
const MAX_CHARS = 500;

/** The last 12 messages, each cut to 500 characters: what the API gets as context. */
function toMessages(turns: Turn[]): ChatMessage[] {
  return turns
    .map((t): ChatMessage => (t.from === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.reply.text }))
    .slice(-MAX_MESSAGES)
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_CHARS) }));
}

/** The conversation, in memory only: it is not in the URL or in storage, and goes away when the page is reloaded. */
export function useConversation() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState(false);
  const turnsRef = useRef<Turn[]>([]);
  const busy = useRef(false);

  const request = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setThinking(true);
    setFailed(false);
    try {
      const reply = await sendMessages(toMessages(turnsRef.current));
      turnsRef.current = [...turnsRef.current, { from: "assistant", reply, at: Date.now() }];
      setTurns(turnsRef.current);
      track("assistant.answer.show", { outcome: reply.outcome, flow: reply.flow, municipality: reply.municipality });
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setThinking(false);
    }
  }, []);

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

  return { turns, thinking, failed, send, retry: request };
}
