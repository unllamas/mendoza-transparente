/**
 * Tries a municipality's finder without touching data/: `bun packages/scrapers/src/lrf/try-finder.ts <finder file>`
 * (for example `src/lrf/finders/maipu.ts`). Runs the finder, downloads every quarter into a cache outside the repo
 * (/tmp/lrf-try/, so a second run asks nothing to the site) and reads annexes 2, 3 and 5 with the same checks as the
 * source: printed period, printed annex number and the document's own arithmetic. Used to add a municipality, also by
 * agents working in parallel (docs/procesos/metodologia.md#presupuesto-y-gasto-de-cada-municipio).
 */

process.env.LRF_DRY_RUN = "1";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { headerAnnex, headerPeriod, parseDebtAnnex, parseRevenueAnnex, parseSpendingAnnex } from "./annexes.ts";
import type { Table } from "./read.ts";
import {
  ANNEXES,
  type Annex,
  type AnnexDocument,
  annexName,
  documentTables,
  downloadRelease,
  FIRST_YEAR,
  type Finder,
  type Release,
} from "./release.ts";

const PARSERS = { "2": parseSpendingAnnex, "3": parseRevenueAnnex, "5": parseDebtAnnex } as Partial<
  Record<Annex, (t: Table[]) => { lines: unknown[]; notes: string[] } | { error: string }>
>;

const target = process.argv[2];
if (!target) {
  console.error("Uso: bun packages/scrapers/src/lrf/try-finder.ts <archivo del buscador>");
  process.exit(1);
}
const { find } = (await import(resolve(target))) as { find: Finder };
const cacheDir = join("/tmp/lrf-try", target.split("/").pop()!.replace(/\.ts$/, ""));
mkdirSync(cacheDir, { recursive: true });

/** Downloads through a cache keyed by the release, so trying again does not hit the site. */
async function cachedDownload(r: Release): Promise<{ docs: AnnexDocument[]; problems: string[] }> {
  const key = createHash("sha256")
    .update(JSON.stringify([r.files, r.zip, r.report]))
    .digest("hex")
    .slice(0, 16);
  const index = join(cacheDir, `${r.year}-T${r.quarter}-${key}.json`);
  if (existsSync(index)) {
    const saved = JSON.parse(readFileSync(index, "utf8")) as { docs: Omit<AnnexDocument, "bytes">[]; problems: string[] };
    return {
      docs: saved.docs.map((d) => ({ ...d, bytes: new Uint8Array(readFileSync(join(cacheDir, `${key}-${d.annex}.${d.ext}`))) })),
      problems: saved.problems,
    };
  }
  const got = await downloadRelease(r, new Set(ANNEXES.filter((a) => !PARSERS[a])));
  for (const d of got.docs) writeFileSync(join(cacheDir, `${key}-${d.annex}.${d.ext}`), d.bytes);
  writeFileSync(index, JSON.stringify({ docs: got.docs.map(({ bytes: _, ...d }) => d), problems: got.problems }));
  return got;
}

const releases = (await find()).filter((r) => r.year >= FIRST_YEAR).sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter));
console.log(`${releases.length} trimestres: ${releases.map((r) => `${r.year}-T${r.quarter}`).join(", ")}`);
const ok: Record<string, number> = { "2": 0, "3": 0, "5": 0 };
for (const r of releases) {
  const { docs, problems } = await cachedDownload(r);
  const cells: string[] = [];
  for (const annex of ["2", "3", "5"] as Annex[]) {
    const d = docs.find((x) => x.annex === annex);
    if (!d) {
      cells.push(`anexo ${annexName(annex)}: no está`);
      continue;
    }
    const read = (axis: "h" | "v") => documentTables(d.bytes, d.ext, axis);
    const tables = await read("h");
    const period = headerPeriod(tables);
    const printed = headerAnnex(tables);
    let parsed = PARSERS[annex]!(tables);
    if ("error" in parsed && (d.ext === "pdf" || d.ext === "json")) {
      const retry = PARSERS[annex]!(await read("v"));
      if (!("error" in retry)) parsed = retry;
    }
    const checks = [
      period && (period.year !== r.year || period.quarter !== r.quarter) ? `dice ${period.year}-T${period.quarter}` : "",
      printed && printed !== annex ? `trae el anexo ${printed}` : "",
    ].filter(Boolean);
    if (!("error" in parsed) && !checks.length) ok[annex]!++;
    cells.push(
      `anexo ${annexName(annex)}: ${"error" in parsed ? `ERROR ${parsed.error}` : `${parsed.lines.length} filas${parsed.notes.length ? " (con observaciones)" : ""}`}${checks.length ? ` [${checks.join("; ")}]` : ""}${period ? "" : " (sin período impreso)"}`,
    );
  }
  console.log(`${r.year}-T${r.quarter}  ${cells.join(" | ")}${problems.length ? `  PROBLEMAS: ${problems.join("; ")}` : ""}`);
}
console.log(`Leídos sin observaciones de control: anexo 2 ${ok["2"]}, anexo 3 ${ok["3"]}, anexo 5 ${ok["5"]} de ${releases.length}.`);
