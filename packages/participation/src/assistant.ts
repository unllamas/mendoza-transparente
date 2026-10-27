/**
 * Panel reads of what the assistant (Aco) stores in D1: the thumbs up/down votes (`assistant_feedback`) and what
 * people asked for and we do not have (`assistant_gaps`). Documented in docs/procesos/asistente.md. The free note
 * of a thumbs down can carry personal data: it never goes in a list, only in `assistantFeedbackNote`, which the
 * panel audits.
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
  /** Only whether there is a note; its text is read one by one. */
  hasNote: boolean;
}

export interface AssistantCount {
  /** Empty when the vote did not carry the field. */
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
        `SELECT id, created_at AS createdAt, vote, reason, flow, municipality, (note IS NOT NULL AND note != '') AS hasNote
         FROM assistant_feedback ORDER BY id DESC LIMIT ?`,
      )
      .bind(RECENT_VOTES)
      .all<Omit<AssistantVote, "hasNote"> & { hasNote: number }>(),
  ]);
  return {
    up: totals?.up ?? 0,
    down: totals?.down ?? 0,
    byReason: byReason.results,
    byFlow: byFlow.results,
    byMunicipality: byMunicipality.results,
    recent: recent.results.map((v) => ({ ...v, hasNote: !!v.hasNote })) as AssistantVote[],
  };
}

export type AssistantFeedback = Awaited<ReturnType<typeof assistantFeedback>>;

/** The free note of one vote, or null when the vote does not exist. `note` is empty when the person left none. */
export async function assistantFeedbackNote(db: Db, id: number) {
  return db
    .prepare(
      "SELECT id, created_at AS createdAt, vote, reason, flow, municipality, COALESCE(note, '') AS note FROM assistant_feedback WHERE id = ?",
    )
    .bind(id)
    .first<Omit<AssistantVote, "hasNote"> & { note: string }>();
}

/** What was asked and we do not have, grouped, most asked first. */
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
