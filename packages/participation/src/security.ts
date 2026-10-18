/**
 * Security findings: problems in State websites that the team finds while gathering sources, kept until they
 * are reported to whoever is responsible. Panel only: nothing in the public API imports this module, the
 * table has no public flag and the inbox export does not read it. Documented in docs/procesos/seguridad.md.
 */

import type { Db } from "./db.ts";
import { insertWithCode } from "./store.ts";

export type FindingKind = "personal_data" | "vulnerability" | "misconfiguration" | "compromised_site" | "other";
export type FindingSeverity = "low" | "medium" | "high";
export type FindingStatus = "new" | "reported" | "acknowledged" | "fixed" | "discarded";

export const FINDING_KINDS: readonly FindingKind[] = ["personal_data", "vulnerability", "misconfiguration", "compromised_site", "other"];
export const FINDING_SEVERITIES: readonly FindingSeverity[] = ["low", "medium", "high"];
export const FINDING_STATUSES: readonly FindingStatus[] = ["new", "reported", "acknowledged", "fixed", "discarded"];

export interface Finding {
  code: string;
  createdAt: string;
  createdBy: string;
  title: string;
  agency: string | null;
  location: string | null;
  kind: FindingKind;
  exposesPersonalData: boolean;
  severity: FindingSeverity;
  description: string;
  status: FindingStatus;
  reportedTo: string | null;
  reportedOn: string | null;
  reportReference: string | null;
  fixedOn: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Everything the team can set. `undefined` leaves a field as it is; `null` clears it. */
export interface FindingInput {
  title?: string;
  agency?: string | null;
  location?: string | null;
  kind?: FindingKind;
  exposesPersonalData?: boolean;
  severity?: FindingSeverity;
  description?: string;
  status?: FindingStatus;
  reportedTo?: string | null;
  reportedOn?: string | null;
  reportReference?: string | null;
  fixedOn?: string | null;
}

const COLUMNS: Record<keyof FindingInput, string> = {
  title: "title",
  agency: "agency",
  location: "location",
  kind: "kind",
  exposesPersonalData: "exposes_personal_data",
  severity: "severity",
  description: "description",
  status: "status",
  reportedTo: "reported_to",
  reportedOn: "reported_on",
  reportReference: "report_reference",
  fixedOn: "fixed_on",
};

const SELECT = `SELECT code, created_at AS createdAt, created_by AS createdBy, title, agency, location, kind,
  exposes_personal_data AS exposesPersonalData, severity, description, status, reported_to AS reportedTo,
  reported_on AS reportedOn, report_reference AS reportReference, fixed_on AS fixedOn, updated_at AS updatedAt,
  updated_by AS updatedBy FROM security_findings`;

const toFinding = (r: Finding & { exposesPersonalData: number | boolean }): Finding => ({
  ...r,
  exposesPersonalData: !!r.exposesPersonalData,
});

export async function addFinding(
  db: Db,
  f: Required<Pick<FindingInput, "title" | "kind" | "description">> & FindingInput,
  actor: string,
  at: string,
): Promise<string> {
  // Every field the team filled in, with the column names from the fixed list (never from the request).
  const keys = (Object.keys(COLUMNS) as (keyof FindingInput)[]).filter((k) => f[k] !== undefined && f[k] !== null);
  const values = keys.map((k) => (typeof f[k] === "boolean" ? Number(f[k]) : f[k]));
  return insertWithCode("S", async (code) => {
    await db
      .prepare(
        `INSERT INTO security_findings (code, created_at, created_by, ${keys.map((k) => COLUMNS[k]).join(", ")})
         VALUES (?, ?, ?, ${keys.map(() => "?").join(", ")})`,
      )
      .bind(code, at, actor, ...values)
      .run();
    return true;
  });
}

/** Open first (new, then reported, then acknowledged), the closed ones after; newest first inside each. */
export async function findings(db: Db): Promise<Finding[]> {
  const { results } = await db
    .prepare(
      `${SELECT} ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reported' THEN 1 WHEN 'acknowledged' THEN 2 ELSE 3 END, created_at DESC`,
    )
    .all<Finding & { exposesPersonalData: number }>();
  return results.map(toFinding);
}

export async function finding(db: Db, code: string): Promise<Finding | null> {
  const r = await db.prepare(`${SELECT} WHERE code = ?`).bind(code).first<Finding & { exposesPersonalData: number }>();
  return r ? toFinding(r) : null;
}

export async function updateFinding(db: Db, code: string, patch: FindingInput, actor: string, at: string): Promise<number> {
  const keys = (Object.keys(patch) as (keyof FindingInput)[]).filter((k) => patch[k] !== undefined);
  if (!keys.length) return 0;
  const values = keys.map((k) => (typeof patch[k] === "boolean" ? Number(patch[k]) : patch[k]));
  const res = await db
    .prepare(
      `UPDATE security_findings SET ${keys.map((k) => `${COLUMNS[k]} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE code = ?`,
    )
    .bind(...values, at, actor, code)
    .run();
  return res.meta.changes;
}

/**
 * An open finding about the same thing: the same address or, without one, the same title for the same agency.
 * Several sessions can run into the same problem; it is loaded once.
 */
export async function openDuplicate(db: Db, f: Pick<FindingInput, "location" | "title" | "agency">): Promise<string | null> {
  const open = "status IN ('new', 'reported', 'acknowledged')";
  const r = f.location
    ? await db.prepare(`SELECT code FROM security_findings WHERE ${open} AND location = ?`).bind(f.location).first<{ code: string }>()
    : await db
        .prepare(`SELECT code FROM security_findings WHERE ${open} AND lower(title) = lower(?) AND lower(COALESCE(agency, '')) = lower(?)`)
        .bind(f.title ?? "", f.agency ?? "")
        .first<{ code: string }>();
  return r?.code ?? null;
}
