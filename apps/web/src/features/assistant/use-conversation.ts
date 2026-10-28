import type { AssistantReply, ChatMessage, Progress } from "@mt/assistant/types";
import { useCallback, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { AssistantApiError, sendMessages } from "./api.ts";

export type Turn = { from: "user"; text: string } | { from: "assistant"; reply: AssistantReply; at: number };

/** Por qué falló el último pedido: el límite por IP (429), la verificación de Turnstile (403) u otra cosa. */
export type ConversationError = "rate-limit" | "challenge" | "generic";

/** Cuánto espera el primer mensaje a Turnstile antes de rendirse con un error que la persona puede reintentar. */
const TOKEN_WAIT_MS = 15_000;

/** Lo que Aco está haciendo, en palabras de la persona: corto, y nunca el nombre de la herramienta. */
export function progressText(p: Progress | null): string {
  if (!p || p.phase === "thinking") return "Leyendo tu pregunta";
  if (p.phase === "writing") return "Escribiendo la respuesta";
  switch (p.tool) {
    case "get_procedure":
      return "Buscando los pasos del trámite";
    case "find_trade_fee":
      return "Buscando la tasa en la ordenanza";
    case "search_unpublished":
      return "Revisando qué no se publica";
    case "list_procedures":
      return "Mirando qué trámites tenemos";
    case "ask_user":
      return "Preparando una pregunta";
    case "search_purchases":
      return "Buscando en las compras";
    case "search_people":
      return "Buscando en las autoridades";
    case "get_municipality":
      return "Mirando la ficha del municipio";
    case "search_laws":
      return "Buscando en las leyes";
    case "find_site_page":
      return "Buscando en el sitio";
    default:
      return "Buscando en las fuentes";
  }
}

const MAX_MESSAGES = 12;
const MAX_CHARS = 500;

/** Los últimos 12 mensajes, cada uno acortado a 500 caracteres: lo que recibe la API como contexto. */
function toMessages(turns: Turn[]): ChatMessage[] {
  return turns
    .map((t): ChatMessage => (t.from === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.reply.text }))
    .slice(-MAX_MESSAGES)
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_CHARS) }));
}

/**
 * La conversación, solo en memoria: no está en la URL ni en el almacenamiento, y desaparece al recargar la página.
 * Con `challenge` (Turnstile activado), el primer pedido lleva un token de Turnstile y los siguientes el pase que trajo
 * la primera respuesta. `verification` dice si el widget de Turnstile tiene que estar en pantalla, y su `key` cambia
 * para conseguir un token nuevo tras un intento fallido (cada token sirve una vez).
 */
export function useConversation(challenge = false) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
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

  /** Lo que prueba que es una persona: nada, el pase, o un token nuevo (se espera, si Turnstile todavía está trabajando). */
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
    setProgress(null);
    setError(null);
    try {
      const reply = await sendMessages(toMessages(turnsRef.current), await proof(), setProgress);
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
        // El token se gastó (o el pase venció): mostrar Turnstile de nuevo para conseguir uno nuevo.
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

  /** Empezar de cero: una conversación trabada o terminada no debería pedir una recarga. Se conserva el pase de Turnstile. */
  const reset = useCallback(() => {
    if (busy.current) return;
    turnsRef.current = [];
    setTurns([]);
    setError(null);
    setProgress(null);
  }, []);

  return { turns, thinking, progress, error, send, retry: request, reset, verification, onToken };
}
