/**
 * Lado HTTP del asistente, servido por la Pages Function del sitio en /api/asistente:
 *   GET  /api/asistente           → { enabled }: si hay una clave de proveedor configurada (si no, el widget se oculta)
 *   POST /api/asistente           → AssistantReply para { messages }
 *   POST /api/asistente/opinion   → guarda un pulgar arriba o abajo en D1 (sin IP, sin conversación)
 * Cada respuesta también guarda en D1 lo que la gente preguntó y todavía no tenemos (`assistant_gaps`): un municipio,
 * una actividad o un trámite, en pocas palabras. Nunca la conversación.
 * Los pedidos tienen tope de tamaño y de largo; /api/* también tiene el límite por IP del sitio (10 cada 10 s). Con
 * ASSISTANT_TURNSTILE=on, cada conversación pasa Turnstile una vez (pass.ts).
 */

import { runAgent } from "./agent.ts";
import type { Knowledge } from "./knowledge.ts";
import { checkPass, issuePass } from "./pass.ts";
import { type AssistantEnv, configuredProviders, ProvidersUnavailable } from "./providers.ts";
import type { SiteData } from "./site-data.ts";
import type { AssistantStatus, ChatMessage, FeedbackRequest, Gap, Outcome, Progress } from "./types.ts";

/** El subconjunto de D1 que usa el endpoint de opiniones (misma forma que el Db de @mt/participation). */
export interface FeedbackDb {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}

const MAX_BODY = 16_000;
const MAX_MESSAGES = 12;
const MAX_CHARS = 500;

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff" },
  });
const fail = (message: string, status: number) => json({ error: message }, status);

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new Error("Se espera JSON");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error("Pedido demasiado largo");
  return JSON.parse(text);
}

/** Solo los últimos mensajes, cada uno acortado, terminando con el mensaje de la persona. Null si la forma no es válida. */
export function sanitizeMessages(body: unknown): ChatMessage[] | null {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || !raw.length) return null;
  const messages: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const trimmed = content.trim().slice(0, MAX_CHARS);
    if (trimmed) messages.push({ role, content: trimmed });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}

const OUTCOMES: Outcome[] = ["steps", "fee", "data", "unpublished", "ask", "answer", "no_answer"];

export function sanitizeFeedback(body: unknown): FeedbackRequest | null {
  const b = body as Partial<FeedbackRequest> | null;
  if (!b || (b.vote !== "up" && b.vote !== "down")) return null;
  const short = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const reason = b.vote === "down" && ["dato", "respuesta", "falta"].includes(String(b.reason)) ? b.reason : undefined;
  return {
    vote: b.vote,
    ...(reason ? { reason } : {}),
    ...(b.vote === "down" && short(b.note, MAX_CHARS) ? { note: short(b.note, MAX_CHARS) } : {}),
    ...(short(b.flow, 60) ? { flow: short(b.flow, 60) } : {}),
    ...(short(b.municipality, 40) ? { municipality: short(b.municipality, 40) } : {}),
    ...(OUTCOMES.includes(b.outcome as Outcome) ? { outcome: b.outcome } : {}),
  };
}

/** Guardar un faltante nunca rompe una respuesta: sin la tabla (migración 0005 todavía sin aplicar) solo deja un log. */
async function saveGaps(deps: AssistantDeps, gaps: Gap[]) {
  if (!deps.db || !gaps.length) return;
  const at = new Date().toISOString();
  try {
    for (const g of gaps) {
      await deps.db
        .prepare("INSERT INTO assistant_gaps (created_at, kind, municipality, value) VALUES (?, ?, ?, ?)")
        .bind(at, g.kind, g.municipality ?? null, g.value.slice(0, 60))
        .run();
    }
  } catch (err) {
    deps.log?.(`asistente: no se guardó un faltante (${(err as Error).name})`);
  }
}

export interface AssistantDeps {
  knowledge: Knowledge;
  env: AssistantEnv;
  db?: FeedbackDb;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  log?: (message: string) => void;
  /** Verifica un token de Turnstile (la llamada siteverify del sitio). Hace falta con ASSISTANT_TURNSTILE activado. */
  verifyHuman?: (token: string) => Promise<boolean>;
  /** Secreto que firma el pase de la conversación (el de Turnstile). Hace falta con ASSISTANT_TURNSTILE activado. */
  passKey?: string;
  /** Lo que publica el sitio (/data/asistente.json, de los estáticos), cargado solo si una herramienta lo necesita. */
  siteData?: () => Promise<SiteData | null>;
  /** Mantiene viva la Function hasta que se escribe una respuesta en streaming (waitUntil de Pages). */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Atiende /api/asistente*; devuelve null para cualquier otra ruta. */
export async function handleAssistant(req: Request, deps: AssistantDeps): Promise<Response | null> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path !== "/api/asistente" && path !== "/api/asistente/opinion") return null;
  const enabled = configuredProviders(deps.env).length > 0;
  const challenge = deps.env.ASSISTANT_TURNSTILE === "on";

  // Se pide en cada visita: cacheado 5 minutos en el borde para que no cueste una llamada a la Function por vista de página.
  if (path === "/api/asistente" && req.method === "GET")
    return json({ enabled, ...(challenge ? { challenge } : {}) } satisfies AssistantStatus, 200, "public, max-age=300");

  if (req.method !== "POST") return fail("Método no permitido", 405);
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (err) {
    return fail((err as Error).message === "Pedido demasiado largo" ? "Pedido demasiado largo" : "Pedido inválido", 400);
  }

  if (path === "/api/asistente/opinion") {
    const fb = sanitizeFeedback(body);
    if (!fb) return fail("Opinión inválida", 400);
    if (!deps.db) return fail("Sin base de datos", 503);
    await deps.db
      .prepare("INSERT INTO assistant_feedback (created_at, vote, reason, note, flow, municipality, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        new Date().toISOString(),
        fb.vote,
        fb.reason ?? null,
        fb.note ?? null,
        fb.flow ?? null,
        fb.municipality ?? null,
        fb.outcome ?? null,
      )
      .run();
    return json({ ok: true }, 201);
  }

  if (!enabled) return fail("El asistente no está configurado", 503);
  const messages = sanitizeMessages(body);
  if (!messages) return fail("Conversación inválida", 400);
  let pass: string | undefined;
  if (challenge) {
    // Falla cerrado: encendido sin el secreto, no pasa nadie en vez de pasar todos.
    if (!deps.verifyHuman || !deps.passKey) return fail("El asistente está en pausa por mantenimiento", 503);
    const proof = body as { pass?: unknown; turnstile?: unknown };
    const human =
      (await checkPass(deps.passKey, proof.pass)) ||
      (typeof proof.turnstile === "string" && proof.turnstile.length <= 2048 && (await deps.verifyHuman(proof.turnstile)));
    if (!human) return json({ error: "Falta la verificación", challenge: true }, 403);
    pass = await issuePass(deps.passKey);
  }
  const answer = async (onStatus?: (s: Progress) => void) => {
    const gaps: Gap[] = [];
    const reply = await runAgent(deps.knowledge, deps.env, messages, {
      fetcher: deps.fetcher,
      siteData: deps.siteData,
      onGap: (g) => gaps.push(g),
      onStatus,
      onCompletion: (c) =>
        deps.log?.(`asistente: ${c.provider} ${c.model} ${c.toolCalls.map((t) => t.function.name).join(",") || "texto"}`),
    });
    await saveGaps(deps, gaps);
    return pass ? { ...reply, pass } : reply;
  };
  const logError = (err: unknown) => deps.log?.(`asistente: ${err instanceof ProvidersUnavailable ? err.message : (err as Error).name}`);

  // El widget pide NDJSON: una línea por paso ({ status }) mientras Aco trabaja, y después { reply } o { error }. Así
  // puede decir "buscando la tasa" en vez de mostrar un spinner durante 20 segundos. Cualquier otro (los evals) recibe JSON.
  if ((req.headers.get("accept") ?? "").includes("application/x-ndjson")) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const send = (line: unknown) => writer.write(encoder.encode(`${JSON.stringify(line)}\n`)).catch(() => {});
    const work = (async () => {
      try {
        await send({ reply: await answer((status) => void send({ status })) });
      } catch (err) {
        logError(err);
        await send({ error: "No pude responder ahora" });
      } finally {
        await writer.close().catch(() => {});
      }
    })();
    deps.waitUntil?.(work);
    return new Response(readable, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  try {
    return json(await answer());
  } catch (err) {
    logError(err);
    return fail("No pude responder ahora", 502);
  }
}
