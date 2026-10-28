/**
 * Lecturas del panel sobre lo que el asistente (Aco) guarda en D1: los votos 👍 y 👎 (`assistant_feedback`) y lo que
 * la gente pidió y no tenemos (`assistant_gaps`). Documentado en docs/procesos/asistente.md. La nota del 👎 y la
 * conversación votada pueden traer datos personales: nunca van en una lista, solo en `assistantFeedbackNote`, cuya
 * lectura audita el panel.
 */

import type { Db } from "./db.ts";

export const ASSISTANT_REASONS = ["dato", "respuesta", "falta"] as const;
export type AssistantReason = (typeof ASSISTANT_REASONS)[number];

export interface AssistantVote {
  id: number;
  createdAt: string;
  vote: "up" | "down";
  reason: AssistantReason | null;
  flow: string | null;
  municipality: string | null;
  /** Solo si hay nota; el texto se lee de a un voto. */
  hasNote: boolean;
  /** Solo si se guardó la conversación (votos desde la migración 0006); se lee de a un voto. */
  hasConversation: boolean;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantCount {
  /** Vacío cuando el voto no traía el campo. */
  key: string;
  n: number;
}

export interface AssistantGap {
  kind: "municipio" | "rubro" | "tramite";
  municipality: string | null;
  value: string;
  n: number;
  lastAt: string;
}

export const RECENT_VOTES = 50;
export const GAP_ROWS = 200;

const downBy = (column: "reason" | "flow" | "municipality", limit = 50) =>
  `SELECT COALESCE(${column}, '') AS key, COUNT(*) AS n FROM assistant_feedback WHERE vote = 'down' GROUP BY 1 ORDER BY n DESC LIMIT ${limit}`;

export async function assistantFeedback(db: Db) {
  const [totals, byReason, byFlow, byMunicipality, recent] = await Promise.all([
    db
      .prepare("SELECT COALESCE(SUM(vote = 'up'), 0) AS up, COALESCE(SUM(vote = 'down'), 0) AS down FROM assistant_feedback")
      .first<{ up: number; down: number }>(),
    db.prepare(downBy("reason")).all<AssistantCount>(),
    db.prepare(downBy("flow")).all<AssistantCount>(),
    db.prepare(downBy("municipality", 20)).all<AssistantCount>(),
    db
      .prepare(
        `SELECT id, created_at AS createdAt, vote, reason, flow, municipality, (note IS NOT NULL AND note != '') AS hasNote,
         (conversation IS NOT NULL) AS hasConversation
         FROM assistant_feedback ORDER BY id DESC LIMIT ?`,
      )
      .bind(RECENT_VOTES)
      .all<Omit<AssistantVote, "hasNote" | "hasConversation"> & { hasNote: number; hasConversation: number }>(),
  ]);
  return {
    up: totals?.up ?? 0,
    down: totals?.down ?? 0,
    byReason: byReason.results,
    byFlow: byFlow.results,
    byMunicipality: byMunicipality.results,
    recent: recent.results.map((v) => ({ ...v, hasNote: !!v.hasNote, hasConversation: !!v.hasConversation })) as AssistantVote[],
  };
}

export type AssistantFeedback = Awaited<ReturnType<typeof assistantFeedback>>;

export type AssistantVoteDetail = Omit<AssistantVote, "hasNote" | "hasConversation"> & {
  note: string;
  conversation: AssistantMessage[];
};

/**
 * Un voto con su nota y la conversación votada, o null si el voto no existe. `note` queda vacía si la persona no dejó
 * nota, y `conversation` vacía en los votos anteriores a la migración 0006.
 */
export async function assistantFeedbackNote(db: Db, id: number): Promise<AssistantVoteDetail | null> {
  const row = await db
    .prepare(
      `SELECT id, created_at AS createdAt, vote, reason, flow, municipality, COALESCE(note, '') AS note, conversation
       FROM assistant_feedback WHERE id = ?`,
    )
    .bind(id)
    .first<Omit<AssistantVoteDetail, "conversation"> & { conversation: string | null }>();
  if (!row) return null;
  return { ...row, conversation: parseConversation(row.conversation) };
}

function parseConversation(raw: string | null): AssistantMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((m): m is AssistantMessage => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      : [];
  } catch {
    return [];
  }
}

/** Lo que se pidió y no tenemos, agrupado, de lo más pedido a lo menos. */
export async function assistantGaps(db: Db): Promise<AssistantGap[]> {
  const { results } = await db
    .prepare(
      `SELECT kind, municipality, value, COUNT(*) AS n, MAX(created_at) AS lastAt FROM assistant_gaps
       GROUP BY kind, municipality, value ORDER BY n DESC, lastAt DESC LIMIT ?`,
    )
    .bind(GAP_ROWS)
    .all<AssistantGap>();
  return results;
}
