/**
 * Every query of the participation API, over a `Db` (D1 in production, local SQLite in development and tests).
 * The public side only ever reads through `publicRegistry` and `requestStats`, which pick their columns one by
 * one: nothing private can reach the site by adding a column to a table.
 */

import type { Db } from "./db.ts";
import { type CodePrefix, newCode } from "./secrets.ts";

export type FeedbackKind = "error" | "dato" | "otro";
export type RequestStatus = "presentado" | "respondido" | "parcial" | "denegado" | "sin_respuesta";
export type AnswerStatus = Exclude<RequestStatus, "presentado">;
export type ReviewStatus = "new" | "in_review" | "resolved" | "discarded" | "spam";
export type SubmissionType = "request" | "error" | "data" | "photo" | "other";

export const REVIEW_STATUSES: readonly ReviewStatus[] = ["new", "in_review", "resolved", "discarded", "spam"];
export const SUBMISSION_TYPES: readonly SubmissionType[] = ["request", "error", "data", "photo", "other"];
export const ANSWER_STATUSES: readonly AnswerStatus[] = ["respondido", "parcial", "denegado", "sin_respuesta"];

/** Ley 9070: 15 business days to answer; ~21 calendar days, the threshold to count a request as overdue. */
export const OVERDUE_DAYS = 21;
/** IP hashes are only needed for the hourly rate limit; after this they are erased. */
const IP_HASH_RETENTION_DAYS = 30;

const DAY = 864e5;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const overdueBefore = (now: Date) => isoDay(new Date(now.getTime() - OVERDUE_DAYS * DAY));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** Excluded from every count: what the team marked as spam or discarded is not a real request. */
const COUNTED = "review_status NOT IN ('spam', 'discarded')";

const FEEDBACK_TYPE =
  "CASE WHEN kind = 'error' THEN 'error' WHEN kind = 'dato' THEN 'data' WHEN page = 'foto' THEN 'photo' ELSE 'other' END";

// ------------------------------------------------------------------ writes from the public API

/** Inserts with a fresh random code, retrying on the (unlikely) collision with an existing one. */
export async function insertWithCode(prefix: CodePrefix, insert: (code: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newCode(prefix);
    try {
      if (await insert(code)) return code;
    } catch (e) {
      if (!String(e).includes("UNIQUE") || !String(e).includes("code")) throw e;
    }
  }
  throw new Error("No se pudo generar un código único");
}

export async function addFeedback(
  db: Db,
  f: { kind: FeedbackKind; message: string; page: string | null; email: string | null; ipHash: string; createdAt: string },
): Promise<string> {
  return insertWithCode("R", async (code) => {
    await db
      .prepare("INSERT INTO feedback (code, created_at, kind, message, page, email, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(code, f.createdAt, f.kind, f.message, f.page, f.email, f.ipHash)
      .run();
    return true;
  });
}

/** Returns null if the same filing number was already registered for that item. */
export async function addRequest(
  db: Db,
  r: {
    itemId: string;
    agency: string | null;
    filedOn: string;
    filingNumber: string;
    detail: string | null;
    email: string | null;
    editKeyHash: string;
    ipHash: string;
    createdAt: string;
  },
): Promise<string | null> {
  const exists = await db.prepare("SELECT 1 AS x FROM pedidos WHERE item_id = ? AND tramite = ?").bind(r.itemId, r.filingNumber).first();
  if (exists) return null;
  return insertWithCode("P", async (code) => {
    const res = await db
      .prepare(
        "INSERT OR IGNORE INTO pedidos (code, created_at, item_id, organismo, fecha_presentacion, tramite, detalle, email, edit_key_hash, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(code, r.createdAt, r.itemId, r.agency, r.filedOn, r.filingNumber, r.detail, r.email, r.editKeyHash, r.ipHash)
      .run();
    return res.meta.changes > 0;
  });
}

export interface RequestRef {
  id: number;
  code: string;
  filedOn: string;
  editKeyHash: string | null;
}

export async function requestByCode(db: Db, code: string): Promise<RequestRef | null> {
  return db
    .prepare("SELECT id, code, fecha_presentacion AS filedOn, edit_key_hash AS editKeyHash FROM pedidos WHERE code = ?")
    .bind(code)
    .first<RequestRef>();
}

export async function requestsByFilingNumber(db: Db, filingNumber: string): Promise<RequestRef[]> {
  const { results } = await db
    .prepare("SELECT id, code, fecha_presentacion AS filedOn, edit_key_hash AS editKeyHash FROM pedidos WHERE tramite = ?")
    .bind(filingNumber)
    .all<RequestRef>();
  return results;
}

export interface AnswerInput {
  status: AnswerStatus;
  answeredOn: string | null;
  summary: string | null;
  url: string | null;
}

/** Records an answer. Verified answers (right edit key) are applied to the request right away. */
export async function addAnswer(
  db: Db,
  requestId: number,
  a: AnswerInput & { verified: boolean; ipHash: string; createdAt: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO answers (created_at, request_id, status, answered_on, summary, url, ip_hash, verified, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      a.createdAt,
      requestId,
      a.status,
      a.answeredOn,
      a.summary,
      a.url,
      a.ipHash,
      a.verified ? 1 : 0,
      a.verified ? "applied" : "pending",
    )
    .run();
  if (a.verified) await applyAnswerToRequest(db, requestId, a, a.createdAt);
}

async function applyAnswerToRequest(db: Db, requestId: number, a: AnswerInput, at: string) {
  await db
    .prepare("UPDATE pedidos SET estado = ?, fecha_respuesta = ?, respuesta_resumen = ?, respuesta_url = ?, updated_at = ? WHERE id = ?")
    .bind(a.status, a.answeredOn, a.summary, a.url, at, requestId)
    .run();
}

/** Submissions from this IP hash since the given ISO time (for rate limiting). */
export async function countRecent(db: Db, ipHash: string, since: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM feedback WHERE ip_hash = ?1 AND created_at >= ?2)
            + (SELECT COUNT(*) FROM pedidos WHERE ip_hash = ?1 AND created_at >= ?2)
            + (SELECT COUNT(*) FROM answers WHERE ip_hash = ?1 AND created_at >= ?2) AS n`,
    )
    .bind(ipHash, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ public reads

export interface ItemStats {
  requests: number;
  answered: number;
  denied: number;
  overdue: number;
}

export async function requestStats(db: Db, now = new Date()) {
  const { results } = await db
    .prepare(
      `SELECT item_id AS itemId, COUNT(*) AS requests,
              SUM(estado IN ('respondido', 'parcial')) AS answered,
              SUM(estado = 'denegado') AS denied,
              SUM(estado = 'sin_respuesta' OR (estado = 'presentado' AND fecha_presentacion < ?)) AS overdue
       FROM pedidos WHERE ${COUNTED} GROUP BY item_id`,
    )
    .bind(overdueBefore(now))
    .all<ItemStats & { itemId: string }>();
  const items: Record<string, ItemStats> = {};
  const total: ItemStats = { requests: 0, answered: 0, denied: 0, overdue: 0 };
  for (const { itemId, ...s } of results) {
    const clean = { requests: Number(s.requests), answered: Number(s.answered), denied: Number(s.denied), overdue: Number(s.overdue) };
    items[itemId] = clean;
    for (const k of Object.keys(total) as (keyof ItemStats)[]) total[k] += clean[k];
  }
  return { items, total, updatedAt: now.toISOString() };
}

/** What the site shows of a published request. Every field is chosen here, one by one. */
export interface PublicRequest {
  code: string;
  itemId: string;
  agency: string | null;
  filedOn: string;
  status: RequestStatus;
  overdue: boolean;
  /** Days from filing to the answer, or to today if there is none yet. */
  days: number;
  answeredOn: string | null;
  summary: string | null;
  answerUrl: string | null;
}

export interface PublicCorrection {
  code: string;
  type: "error" | "data";
  page: string | null;
  summary: string;
  reportedOn: string;
  resolvedOn: string | null;
}

interface PublicRequestRow {
  code: string;
  itemId: string;
  agency: string | null;
  filedOn: string;
  status: RequestStatus;
  answeredOn: string | null;
  summary: string | null;
  answerUrl: string | null;
}

const PUBLIC_REQUEST_SQL = `SELECT code, item_id AS itemId, COALESCE(agency_normalized, organismo) AS agency, fecha_presentacion AS filedOn,
       estado AS status, fecha_respuesta AS answeredOn, public_summary AS summary, respuesta_url AS answerUrl
FROM pedidos WHERE is_public = 1 AND ${COUNTED}`;

function toPublicRequest(r: PublicRequestRow, now: Date): PublicRequest {
  const today = isoDay(now);
  const answered = r.status !== "presentado" && r.status !== "sin_respuesta";
  return {
    code: r.code,
    itemId: r.itemId,
    agency: r.agency,
    filedOn: r.filedOn,
    status: r.status,
    overdue: r.status === "sin_respuesta" || (r.status === "presentado" && r.filedOn < overdueBefore(now)),
    days: Math.max(0, daysBetween(r.filedOn, answered && r.answeredOn ? r.answeredOn : today)),
    answeredOn: r.answeredOn,
    summary: r.summary,
    answerUrl: r.answerUrl,
  };
}

interface PublicCorrectionRow {
  code: string;
  kind: FeedbackKind;
  page: string | null;
  summary: string;
  createdAt: string;
  reviewedAt: string | null;
}

const PUBLIC_CORRECTION_SQL = `SELECT code, kind, page, public_summary AS summary, created_at AS createdAt, reviewed_at AS reviewedAt
FROM feedback WHERE is_public = 1 AND review_status = 'resolved' AND kind IN ('error', 'dato') AND public_summary IS NOT NULL`;

function toPublicCorrection(r: PublicCorrectionRow): PublicCorrection {
  let page: string | null = null;
  try {
    page = r.page ? new URL(r.page, "https://mendoza-transparente.com").pathname : null;
  } catch {}
  return {
    code: r.code,
    type: r.kind === "error" ? "error" : "data",
    page,
    summary: r.summary,
    reportedOn: r.createdAt.slice(0, 10),
    resolvedOn: r.reviewedAt?.slice(0, 10) ?? null,
  };
}

export async function publicRegistry(db: Db, now = new Date()) {
  const [requests, corrections] = await Promise.all([
    db.prepare(`${PUBLIC_REQUEST_SQL} ORDER BY fecha_presentacion DESC LIMIT 1000`).all<PublicRequestRow>(),
    db.prepare(`${PUBLIC_CORRECTION_SQL} ORDER BY reviewed_at DESC LIMIT 1000`).all<PublicCorrectionRow>(),
  ]);
  return {
    requests: requests.results.map((r) => toPublicRequest(r, now)),
    corrections: corrections.results.map(toPublicCorrection),
    updatedAt: now.toISOString(),
  };
}

export async function publicSubmission(db: Db, code: string, now = new Date()) {
  if (code.startsWith("P-")) {
    const r = await db.prepare(`${PUBLIC_REQUEST_SQL} AND code = ?`).bind(code).first<PublicRequestRow>();
    return r ? { request: toPublicRequest(r, now) } : null;
  }
  const c = await db.prepare(`${PUBLIC_CORRECTION_SQL} AND code = ?`).bind(code).first<PublicCorrectionRow>();
  return c ? { correction: toPublicCorrection(c) } : null;
}

// ------------------------------------------------------------------ panel reads

export interface InboxItem {
  code: string;
  type: SubmissionType;
  createdAt: string;
  reviewStatus: ReviewStatus;
  isPublic: boolean;
  preview: string;
  /** Agency for requests; page for reports. */
  context: string | null;
  itemId: string | null;
  requestStatus: RequestStatus | null;
  filedOn: string | null;
  overdue: boolean;
  pendingAnswers: number;
}

export interface InboxFilter {
  reviewStatus: ReviewStatus | "all";
  type: SubmissionType | "all";
  q: string | null;
  from: string | null;
  to: string | null;
}

const INBOX_UNION = `(
  SELECT p.code, 'request' AS type, p.created_at AS createdAt, p.review_status AS reviewStatus, p.is_public AS isPublic,
         COALESCE(p.detalle, p.item_id) AS preview, COALESCE(p.agency_normalized, p.organismo) AS context, p.item_id AS itemId,
         p.estado AS requestStatus, p.fecha_presentacion AS filedOn,
         (SELECT COUNT(*) FROM answers a WHERE a.request_id = p.id AND a.review_status = 'pending') AS pendingAnswers,
         lower(p.code || ' ' || p.item_id || ' ' || COALESCE(p.detalle, '') || ' ' || COALESCE(p.organismo, '') || ' ' || p.tramite || ' ' || COALESCE(p.email, '') || ' ' || p.tags) AS haystack
  FROM pedidos p
  UNION ALL
  SELECT f.code, ${FEEDBACK_TYPE}, f.created_at, f.review_status, f.is_public, f.message, f.page, NULL, NULL, NULL, 0,
         lower(f.code || ' ' || f.message || ' ' || COALESCE(f.page, '') || ' ' || COALESCE(f.email, '') || ' ' || f.tags)
  FROM feedback f
)`;

function inboxWhere(f: Omit<InboxFilter, "reviewStatus">) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.type !== "all") {
    where.push("type = ?");
    params.push(f.type);
  }
  if (f.q) {
    // Every word has to appear, in any order.
    for (const word of f.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
      where.push("haystack LIKE ? ESCAPE '\\'");
      params.push(`%${word.replace(/[\\%_]/g, "\\$&")}%`);
    }
  }
  if (f.from) {
    where.push("createdAt >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("createdAt < ?");
    params.push(isoDay(new Date(Date.parse(f.to) + DAY)));
  }
  return { where, params };
}

export async function inbox(db: Db, f: InboxFilter, now = new Date()) {
  const { where, params } = inboxWhere(f);
  const listWhere = f.reviewStatus === "all" ? where : [...where, "reviewStatus = ?"];
  const listParams = f.reviewStatus === "all" ? params : [...params, f.reviewStatus];
  const clause = (w: string[]) => (w.length ? ` WHERE ${w.join(" AND ")}` : "");
  const [list, counts] = await Promise.all([
    db
      .prepare(`SELECT * FROM ${INBOX_UNION}${clause(listWhere)} ORDER BY createdAt DESC LIMIT 500`)
      .bind(...listParams)
      .all<Omit<InboxItem, "isPublic" | "overdue"> & { isPublic: number; haystack: string }>(),
    db
      .prepare(`SELECT reviewStatus, COUNT(*) AS n FROM ${INBOX_UNION}${clause(where)} GROUP BY reviewStatus`)
      .bind(...params)
      .all<{ reviewStatus: ReviewStatus; n: number }>(),
  ]);
  const before = overdueBefore(now);
  const byStatus = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0])) as Record<ReviewStatus | "all", number>;
  byStatus.all = 0;
  for (const c of counts.results) {
    byStatus[c.reviewStatus] = Number(c.n);
    byStatus.all += Number(c.n);
  }
  return {
    items: list.results.map(
      // The search text carries emails and filing numbers: it is only for the WHERE, never sent back.
      ({ isPublic, haystack: _, ...i }): InboxItem => ({
        ...i,
        isPublic: isPublic === 1,
        pendingAnswers: Number(i.pendingAnswers),
        overdue: i.requestStatus === "sin_respuesta" || (i.requestStatus === "presentado" && !!i.filedOn && i.filedOn < before),
      }),
    ),
    counts: byStatus,
  };
}

export interface Answer {
  id: number;
  createdAt: string;
  status: AnswerStatus;
  answeredOn: string | null;
  summary: string | null;
  url: string | null;
  verified: boolean;
  reviewStatus: "pending" | "applied" | "rejected";
  reviewedBy: string | null;
}

export interface Note {
  id: number;
  createdAt: string;
  author: string;
  body: string;
}

export interface AuditEntry {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  targetCode: string | null;
  detail: Record<string, unknown>;
}

export interface SubmissionDetail {
  code: string;
  type: SubmissionType;
  createdAt: string;
  reviewStatus: ReviewStatus;
  isPublic: boolean;
  publicSummary: string | null;
  tags: string[];
  reviewedAt: string | null;
  reviewedBy: string | null;
  anonymizedAt: string | null;
  email: string | null;
  request: {
    itemId: string;
    agency: string | null;
    agencyNormalized: string | null;
    filedOn: string;
    filingNumber: string;
    detail: string | null;
    status: RequestStatus;
    overdue: boolean;
    answeredOn: string | null;
    answerSummary: string | null;
    answerUrl: string | null;
    hasEditKey: boolean;
  } | null;
  feedback: { kind: FeedbackKind; message: string; page: string | null } | null;
  answers: Answer[];
  notes: Note[];
  audit: AuditEntry[];
}

const parseTags = (t: string | null) => {
  try {
    const v = JSON.parse(t ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export async function submission(db: Db, code: string, now = new Date()): Promise<SubmissionDetail | null> {
  const [notes, audit] = await Promise.all([
    db.prepare("SELECT id, created_at AS createdAt, author, body FROM notes WHERE target_code = ? ORDER BY id").bind(code).all<Note>(),
    db
      .prepare(
        "SELECT id, created_at AS createdAt, actor, action, target_code AS targetCode, detail FROM audit_log WHERE target_code = ? ORDER BY id DESC LIMIT 100",
      )
      .bind(code)
      .all<Omit<AuditEntry, "detail"> & { detail: string }>(),
  ]);
  const base = {
    notes: notes.results,
    audit: audit.results.map((a) => ({ ...a, detail: JSON.parse(a.detail) as Record<string, unknown> })),
  };

  if (code.startsWith("P-")) {
    const p = await db
      .prepare(
        `SELECT id, code, created_at, review_status, is_public, public_summary, tags, reviewed_at, reviewed_by, anonymized_at, email,
                item_id, organismo, agency_normalized, fecha_presentacion, tramite, detalle, estado, fecha_respuesta, respuesta_resumen,
                respuesta_url, edit_key_hash
         FROM pedidos WHERE code = ?`,
      )
      .bind(code)
      .first<Record<string, string | number | null>>();
    if (!p) return null;
    const answers = await db
      .prepare(
        `SELECT id, created_at AS createdAt, status, answered_on AS answeredOn, summary, url, verified, review_status AS reviewStatus,
                reviewed_by AS reviewedBy
         FROM answers WHERE request_id = ? ORDER BY id DESC`,
      )
      .bind(p.id)
      .all<Omit<Answer, "verified"> & { verified: number }>();
    const status = p.estado as RequestStatus;
    const filedOn = String(p.fecha_presentacion);
    return {
      ...base,
      ...common(p),
      type: "request",
      request: {
        itemId: String(p.item_id),
        agency: p.organismo as string | null,
        agencyNormalized: p.agency_normalized as string | null,
        filedOn,
        filingNumber: String(p.tramite),
        detail: p.detalle as string | null,
        status,
        overdue: status === "sin_respuesta" || (status === "presentado" && filedOn < overdueBefore(now)),
        answeredOn: p.fecha_respuesta as string | null,
        answerSummary: p.respuesta_resumen as string | null,
        answerUrl: p.respuesta_url as string | null,
        hasEditKey: !!p.edit_key_hash,
      },
      feedback: null,
      answers: answers.results.map((a) => ({ ...a, verified: a.verified === 1 })),
    };
  }

  const f = await db
    .prepare(
      `SELECT code, created_at, review_status, is_public, public_summary, tags, reviewed_at, reviewed_by, anonymized_at, email,
              kind, message, page, ${FEEDBACK_TYPE} AS type
       FROM feedback WHERE code = ?`,
    )
    .bind(code)
    .first<Record<string, string | number | null>>();
  if (!f) return null;
  return {
    ...base,
    ...common(f),
    type: f.type as SubmissionType,
    request: null,
    feedback: { kind: f.kind as FeedbackKind, message: String(f.message), page: f.page as string | null },
    answers: [],
  };
}

function common(r: Record<string, string | number | null>) {
  return {
    code: String(r.code),
    createdAt: String(r.created_at),
    reviewStatus: r.review_status as ReviewStatus,
    isPublic: r.is_public === 1,
    publicSummary: r.public_summary as string | null,
    tags: parseTags(r.tags as string | null),
    reviewedAt: r.reviewed_at as string | null,
    reviewedBy: r.reviewed_by as string | null,
    anonymizedAt: r.anonymized_at as string | null,
    email: r.email as string | null,
  };
}

// ------------------------------------------------------------------ panel writes

const tableOf = (code: string) => (code.startsWith("P-") ? "pedidos" : "feedback");

export interface SubmissionPatch {
  reviewStatus?: ReviewStatus;
  isPublic?: boolean;
  publicSummary?: string | null;
  tags?: string[];
  /** Requests only. */
  agencyNormalized?: string | null;
  requestStatus?: RequestStatus;
  answeredOn?: string | null;
}

export async function updateSubmission(db: Db, code: string, patch: SubmissionPatch, actor: string, at: string) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (patch.reviewStatus !== undefined) set("review_status", patch.reviewStatus);
  if (patch.isPublic !== undefined) set("is_public", patch.isPublic ? 1 : 0);
  if (patch.publicSummary !== undefined) set("public_summary", patch.publicSummary);
  if (patch.tags !== undefined) set("tags", JSON.stringify(patch.tags));
  if (tableOf(code) === "pedidos") {
    if (patch.agencyNormalized !== undefined) set("agency_normalized", patch.agencyNormalized);
    if (patch.requestStatus !== undefined) set("estado", patch.requestStatus);
    if (patch.answeredOn !== undefined) set("fecha_respuesta", patch.answeredOn);
  }
  if (!sets.length) return 0;
  set("reviewed_at", at);
  set("reviewed_by", actor);
  const res = await db
    .prepare(`UPDATE ${tableOf(code)} SET ${sets.join(", ")} WHERE code = ?`)
    .bind(...params, code)
    .run();
  return res.meta.changes;
}

/** Applies or rejects an answer that arrived without the edit key. */
export async function reviewAnswer(db: Db, answerId: number, action: "apply" | "reject", actor: string, at: string) {
  const a = await db
    .prepare(
      `SELECT a.request_id AS requestId, a.status, a.answered_on AS answeredOn, a.summary, a.url, p.code
       FROM answers a JOIN pedidos p ON p.id = a.request_id WHERE a.id = ? AND a.review_status = 'pending'`,
    )
    .bind(answerId)
    .first<AnswerInput & { requestId: number; code: string }>();
  if (!a) return null;
  await db
    .prepare("UPDATE answers SET review_status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?")
    .bind(action === "apply" ? "applied" : "rejected", at, actor, answerId)
    .run();
  if (action === "apply") await applyAnswerToRequest(db, a.requestId, a, at);
  return a.code;
}

export async function addNote(db: Db, code: string, author: string, body: string, at: string) {
  await db.prepare("INSERT INTO notes (created_at, author, target_code, body) VALUES (?, ?, ?, ?)").bind(at, author, code, body).run();
}

/**
 * Right to erasure (Ley 25.326): removes everything that can identify the person and what they wrote, and
 * keeps what counts (item, agency, dates, status). The code stays so published links show it is gone.
 */
export async function anonymize(db: Db, code: string, at: string) {
  if (tableOf(code) === "pedidos") {
    const p = await db.prepare("SELECT id FROM pedidos WHERE code = ?").bind(code).first<{ id: number }>();
    if (!p) return 0;
    await db
      .prepare(
        `UPDATE pedidos SET email = NULL, detalle = NULL, tramite = 'ANONIMIZADO-' || id, respuesta_resumen = NULL, respuesta_url = NULL,
                edit_key_hash = NULL, ip_hash = '', public_summary = NULL, is_public = 0, anonymized_at = ? WHERE id = ?`,
      )
      .bind(at, p.id)
      .run();
    await db.prepare("UPDATE answers SET summary = NULL, url = NULL, ip_hash = '' WHERE request_id = ?").bind(p.id).run();
    await db.prepare("DELETE FROM notes WHERE target_code = ?").bind(code).run();
    return 1;
  }
  const res = await db
    .prepare(
      "UPDATE feedback SET email = NULL, message = '[anonimizado]', page = NULL, ip_hash = '', public_summary = NULL, is_public = 0, anonymized_at = ? WHERE code = ?",
    )
    .bind(at, code)
    .run();
  await db.prepare("DELETE FROM notes WHERE target_code = ?").bind(code).run();
  return res.meta.changes;
}

export async function audit(db: Db, actor: string, action: string, targetCode: string | null, detail: Record<string, unknown>, at: string) {
  await db
    .prepare("INSERT INTO audit_log (created_at, actor, action, target_code, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(at, actor, action, targetCode, JSON.stringify(detail))
    .run();
}

export async function auditLog(db: Db, limit = 200): Promise<AuditEntry[]> {
  const { results } = await db
    .prepare("SELECT id, created_at AS createdAt, actor, action, target_code AS targetCode, detail FROM audit_log ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all<Omit<AuditEntry, "detail"> & { detail: string }>();
  return results.map((a) => ({ ...a, detail: JSON.parse(a.detail) as Record<string, unknown> }));
}

/** Erases IP hashes older than the retention period. Cheap; runs whenever the panel loads the inbox. */
export async function purgeOldIpHashes(db: Db, now = new Date()) {
  const before = new Date(now.getTime() - IP_HASH_RETENTION_DAYS * DAY).toISOString();
  for (const table of ["feedback", "pedidos", "answers"])
    await db.prepare(`UPDATE ${table} SET ip_hash = '' WHERE ip_hash != '' AND created_at < ?`).bind(before).run();
}

// ------------------------------------------------------------------ panel statistics

export interface AgencyStats {
  agency: string;
  requests: number;
  answered: number;
  denied: number;
  overdue: number;
  pending: number;
  medianDays: number | null;
}

export async function panelStats(db: Db, now = new Date()) {
  const before = overdueBefore(now);
  const [requests, feedback, pendingAnswers, monthly] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(agency_normalized, organismo, 'Sin organismo') AS agency, item_id AS itemId, estado AS status,
                fecha_presentacion AS filedOn, fecha_respuesta AS answeredOn
         FROM pedidos WHERE ${COUNTED}`,
      )
      .all<{ agency: string; itemId: string; status: RequestStatus; filedOn: string; answeredOn: string | null }>(),
    db
      .prepare(`SELECT ${FEEDBACK_TYPE} AS type, review_status AS reviewStatus, COUNT(*) AS n FROM feedback GROUP BY 1, 2`)
      .all<{ type: SubmissionType; reviewStatus: ReviewStatus; n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM answers WHERE review_status = 'pending'").first<{ n: number }>(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 7) AS month, type, COUNT(*) AS n FROM (
           SELECT created_at, 'request' AS type FROM pedidos WHERE ${COUNTED}
           UNION ALL SELECT created_at, ${FEEDBACK_TYPE} FROM feedback WHERE ${COUNTED}
         ) GROUP BY 1, 2 ORDER BY 1`,
      )
      .all<{ month: string; type: SubmissionType; n: number }>(),
  ]);

  const agencies = new Map<string, AgencyStats & { days: number[] }>();
  for (const r of requests.results) {
    const a = agencies.get(r.agency) ?? {
      agency: r.agency,
      requests: 0,
      answered: 0,
      denied: 0,
      overdue: 0,
      pending: 0,
      medianDays: null,
      days: [],
    };
    agencies.set(r.agency, a);
    a.requests++;
    if (r.status === "respondido" || r.status === "parcial") {
      a.answered++;
      if (r.answeredOn && r.answeredOn >= r.filedOn) a.days.push(daysBetween(r.filedOn, r.answeredOn));
    } else if (r.status === "denegado") a.denied++;
    else if (r.status === "sin_respuesta" || r.filedOn < before) a.overdue++;
    else a.pending++;
  }
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? (s[m] ?? null) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
  };
  const byAgency = [...agencies.values()]
    .map(({ days, ...a }) => ({ ...a, medianDays: median(days) }))
    .sort((x, y) => y.requests - x.requests || x.agency.localeCompare(y.agency));
  const allDays = [...agencies.values()].flatMap((a) => a.days);
  const total = byAgency.reduce(
    (t, a) => ({
      requests: t.requests + a.requests,
      answered: t.answered + a.answered,
      denied: t.denied + a.denied,
      overdue: t.overdue + a.overdue,
      pending: t.pending + a.pending,
    }),
    { requests: 0, answered: 0, denied: 0, overdue: 0, pending: 0 },
  );
  return {
    requests: { ...total, medianDays: median(allDays) },
    byAgency,
    feedback: feedback.results.map((f) => ({ ...f, n: Number(f.n) })),
    pendingAnswers: Number(pendingAnswers?.n ?? 0),
    monthly: monthly.results.map((m) => ({ ...m, n: Number(m.n) })),
    updatedAt: now.toISOString(),
  };
}
