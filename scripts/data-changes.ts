/**
 * Summary of the staged changes in data/ against a base branch, in Spanish Markdown: rows before and after
 * for each published CSV, rows that disappear, deleted files, and raw files that were touched (data/raw is
 * append-only). Data updates reach dev through a PR, and this is what the reviewer reads before merging.
 *
 * Usage (from the repo root, after `git add -A data`):
 *   bun scripts/data-changes.ts [--base origin/dev] [--out cambios.md]
 *     Prints the summary. When it finds something to review, it writes `alertas=true` to $GITHUB_OUTPUT
 *     (in GitHub Actions) and the summary carries the REVIEW_MARK heading.
 *
 * Used by `bun run actualizar` and by .github/workflows/actualizar-datos.yml.
 * Documented in docs/procesos/actualizacion-de-datos.md#revisar-el-pr-de-datos.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

export const REVIEW_MARK = "⚠️ Revisar antes de mergear";

// Append-only logs: they may grow, never change their earlier lines.
const APPEND_ONLY_LOG = /(^|\/)(manifest|archive-org)\.jsonl$/;
const TABLE = /^data\/(processed|curado)\/.+\.(csv|yaml)(\.gz)?$/;

export type Change = { status: string; path: string };
export type TableDiff = {
  path: string;
  before: number;
  after: number;
  added: number;
  changed: number;
  removed: number;
};
export type Report = { tables: TableDiff[]; deleted: string[]; rawTouched: string[]; logsRewritten: string[] };

const lines = (text: string) => text.split("\n").filter((l) => l.trim() !== "");

// Identity of a row: its first two CSV fields (anio,mes · cuit,razon_social · fecha,nro_boletin), or the
// key of a YAML line. A row that leaves and comes back with the same key was corrected, not deleted.
const KEY_FIELDS = 2;
function rowKey(line: string, csv: boolean): string {
  if (!csv) return line.split(":")[0] ?? line;
  let fields = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === "," && !quoted && ++fields === KEY_FIELDS) return line.slice(0, i);
  }
  return line;
}

/**
 * Rows (or YAML lines) compared as sets, so a reordered file counts as unchanged. Each row that disappears
 * is paired with a new row with the same key (changed); the ones left unpaired were removed.
 */
export function diffTable(path: string, before: string, after: string): TableDiff {
  const csv = /\.csv(\.gz)?$/.test(path);
  const a = lines(before).slice(csv ? 1 : 0);
  const b = lines(after).slice(csv ? 1 : 0);
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((l) => !setA.has(l));
  const gone = a.filter((l) => !setB.has(l));
  const newKeys = new Map<string, number>();
  for (const l of added) newKeys.set(rowKey(l, csv), (newKeys.get(rowKey(l, csv)) ?? 0) + 1);
  let changed = 0;
  for (const l of gone) {
    const k = rowKey(l, csv);
    const left = newKeys.get(k) ?? 0;
    if (left > 0) {
      newKeys.set(k, left - 1);
      changed++;
    }
  }
  return { path, before: a.length, after: b.length, added: added.length - changed, changed, removed: gone.length - changed };
}

export function buildReport(changes: Change[], read: (rev: "base" | "index", path: string) => string): Report {
  const report: Report = { tables: [], deleted: [], rawTouched: [], logsRewritten: [] };
  for (const { status, path } of changes) {
    if (status === "D") report.deleted.push(path);
    if (path.startsWith("data/raw/")) {
      if (status === "A") continue;
      if (APPEND_ONLY_LOG.test(path) && status === "M") {
        if (!read("index", path).startsWith(read("base", path))) report.logsRewritten.push(path);
      } else if (status !== "D") {
        report.rawTouched.push(path);
      }
      continue;
    }
    if (!TABLE.test(path)) continue;
    const before = status === "A" ? "" : read("base", path);
    const after = status === "D" ? "" : read("index", path);
    report.tables.push(diffTable(path, before, after));
  }
  return report;
}

export const needsReview = (r: Report) =>
  r.deleted.length > 0 || r.rawTouched.length > 0 || r.logsRewritten.length > 0 || r.tables.some((t) => t.removed > 0);

const n = (x: number) => x.toLocaleString("es-AR");

export function renderReport(r: Report, base: string): string {
  const out = [`### Cambios en los datos (contra \`${base}\`)`, ""];
  if (needsReview(r)) {
    out.push(`#### ${REVIEW_MARK}`, "");
    for (const p of r.deleted) out.push(`- Archivo borrado: \`${p}\``);
    for (const t of r.tables.filter((t) => t.removed > 0))
      out.push(`- \`${t.path}\`: ${n(t.removed)} filas que estaban ya no están, sin otra que las reemplace.`);
    for (const p of r.rawTouched) out.push(`- Crudo modificado: \`${p}\` (data/raw es de solo agregar).`);
    for (const p of r.logsRewritten) out.push(`- Registro reescrito, no solo ampliado: \`${p}\`.`);
    out.push("");
  } else {
    out.push("Sin filas ni archivos borrados, y los crudos solo suman archivos nuevos.", "");
  }
  const touched = r.tables.filter((t) => t.added + t.changed + t.removed > 0);
  if (touched.length > 0) {
    out.push("| Archivo | Filas antes | Filas después | Nuevas | Corregidas | Borradas |", "|---|--:|--:|--:|--:|--:|");
    for (const t of touched)
      out.push(`| \`${t.path}\` | ${n(t.before)} | ${n(t.after)} | ${n(t.added)} | ${n(t.changed)} | ${n(t.removed)} |`);
  } else {
    out.push("Ningún CSV publicado cambió: solo hay crudos nuevos.");
  }
  return out.join("\n");
}

function git(args: string[]): Buffer {
  const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const base = flag("base") ?? "origin/dev";
  const changes = git(["diff", "--cached", "--name-status", "--no-renames", base, "--", "data"])
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [status = "", path = ""] = l.split("\t");
      return { status, path };
    });
  const read = (rev: "base" | "index", path: string) => {
    const raw = git(["show", rev === "base" ? `${base}:${path}` : `:${path}`]);
    return (path.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  };
  const report = buildReport(changes, read);
  const text = renderReport(report, base);
  const out = flag("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${text}\n`);
  }
  console.log(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `alertas=${needsReview(report)}\n`);
}
