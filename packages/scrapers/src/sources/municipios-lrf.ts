/**
 * Municipal budgets from the Fiscal Responsibility Law annexes (Ley 7314, Acuerdo 3949 of the Tribunal de Cuentas).
 *
 * Every municipality publishes, each quarter, the same set of annexes on its own site: 1 (financial programming),
 * 2 and 2 bis (spending against appropriations), 3 (revenue), 4 (quarter result) and 5 (debt). The content is fixed by
 * the Tribunal de Cuentas; what changes is the container (one PDF per annex, a ZIP, one workbook with every annex) and
 * the level of detail. The pipeline has one layer per concern:
 *
 *   1. Find (one per municipality, `FINDERS`): the documents of each quarter.
 *   2. Read (one per format, `lrf/read.ts`): PDF or workbook → rows of tokens.
 *   3. Interpret (one per annex, `lrf/annexes.ts`): rows → figures, checked against the document's own arithmetic.
 *   4. Classify (`lrf/classify.ts`): each municipality's item codes → one common code.
 *
 * Outputs (data/processed/municipios-lrf/):
 *   - ejecucion_gastos.csv: one row per (municipality, year, quarter, item) from Annex 2. Amounts are nominal pesos
 *     ACCUMULATED from January to the end of the quarter; the fourth quarter is the whole year.
 *   - documentos.csv: every document found, whether it was read and, if not, why. It is the coverage record.
 *
 * Decisions:
 *   - From 2023 on (`FIRST_YEAR`): the site shows the last four years.
 *   - Only annexes 1 to 5 are archived. Annexes 22 and 23 list debtors with names and are never downloaded; from a
 *     workbook with every annex (San Martín) only the sheets of annexes 1 to 5 are kept, as a new XLSX.
 *   - A quarter already archived is not downloaded again (a published quarter does not change); only listings are.
 *   - A document whose items do not satisfy the printed identities or do not add up to its TOTALES row is left out
 *     of the CSV and recorded in documentos.csv with the reason.
 *   - First municipalities: San Rafael (one PDF per annex) and San Martín (one workbook per quarter). The rest are
 *     added as finders here; the reading layers do not change.
 */

import { existsSync } from "node:fs";
import { archive, get, latestRaw, type Municipio, normalizeMunicipio, type Row, readRaw, USER_AGENT, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import { headerPeriod, type Period, parseSpendingAnnex, type SpendingAnnex } from "../lrf/annexes.ts";
import { SPENDING_OBJECTS } from "../lrf/classify.ts";
import { pdfTables, sheetTables, type Table } from "../lrf/read.ts";

const SOURCE = "municipios-lrf";
const FIRST_YEAR = 2023;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const warn = (msg: string) => console.log(`::warning title=${SOURCE}::${msg}`);

/** Annexes archived for each quarter. */
const ANNEXES = ["1", "2", "2bis", "3", "4", "5"] as const;
type Annex = (typeof ANNEXES)[number];

/** The documents of one quarter: one file per annex, or one workbook with a sheet per annex. */
interface Release extends Period {
  municipality: Municipio;
  files: Partial<Record<Annex, string>>;
  workbook?: string;
}

const slug = (m: Municipio) =>
  m
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

const periodKey = (p: Period) => `${p.year}-T${p.quarter}`;
const quarterEnd = (p: Period) => `${p.year}-${["03-31", "06-30", "09-30", "12-31"][p.quarter - 1]}`;
const fileName = (r: Release, annex: Annex) => `${slug(r.municipality)}-${periodKey(r)}-anexo${annex}.pdf`;
const workbookName = (r: Release) => `${slug(r.municipality)}-${periodKey(r)}-anexos.xlsx`;
const annexName = (annex: Annex) => (annex === "2bis" ? "2 bis" : annex);

// ---------------------------------------------------------------- 1. find

async function page(url: string, filename: string): Promise<cheerio.CheerioAPI> {
  const text = await (await get(url)).text();
  if (filename) await archive(SOURCE, filename, text, { url });
  await sleep(800);
  return cheerio.load(text);
}

const FINDERS: Record<string, () => Promise<Release[]>> = {
  /** San Rafael: one page per year with every annex of each quarter at /archivos-muni/fiscal/AAAA_Nt/anexoN.pdf. */
  async "San Rafael"() {
    const base = "https://www.sanrafael.gov.ar/informacion-publica/ley-resp-fiscal/";
    const index = await page(base, "indice-san-rafael.html");
    const years = new Set<string>();
    index("a").each((_, a) => {
      const href = index(a).attr("href") ?? "";
      const m = /ley-de-responsabilidad-fiscal-(\d{4})\/?$/.exec(href);
      if (m && +m[1]! >= FIRST_YEAR) years.add(new URL(href, base).toString());
    });
    const releases = new Map<string, Release>();
    for (const url of years) {
      const $ = await page(url, "");
      $("a").each((_, a) => {
        const href = $(a).attr("href") ?? "";
        const m = /\/fiscal\/(\d{4})_(\d)t\/anexo(\d+(?:bis)?)\.pdf$/i.exec(href);
        const annex = m?.[3]?.toLowerCase() as Annex | undefined;
        if (!m || !annex || !ANNEXES.includes(annex)) return;
        const period = { year: +m[1]!, quarter: +m[2]! };
        const key = periodKey(period);
        const release = releases.get(key) ?? { municipality: "San Rafael", ...period, files: {} };
        release.files[annex] = new URL(href, url).toString();
        releases.set(key, release);
      });
    }
    return [...releases.values()];
  },

  /**
   * San Martín: Hacienda publishes one workbook per quarter with every annex at web.sanmartinmza.gob.ar/hacienda/
   * (the folder index answers 403 and no page links them). The file name pattern is tried with a HEAD request.
   */
  async "San Martín"() {
    const base = "https://web.sanmartinmza.gob.ar/hacienda/";
    const releases: Release[] = [];
    for (let year = FIRST_YEAR; year <= new Date().getFullYear(); year++) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        for (const ext of ["xlsx", "xls"]) {
          const url = `${base}ley_resp_${String(year).slice(2)}_${quarter}.${ext}`;
          const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
          await sleep(400);
          if (head.ok) {
            releases.push({ municipality: "San Martín", year, quarter, files: {}, workbook: url });
            break;
          }
        }
      }
    }
    return releases;
  },
};

// ---------------------------------------------------------------- download and archive

/** Archives what is missing of a release. Returns the problems found (empty if everything is in place). */
async function ensureArchived(r: Release): Promise<string[]> {
  const problems: string[] = [];
  if (r.workbook) {
    if (await latestRaw(SOURCE, workbookName(r))) return problems;
    const bytes = new Uint8Array(await (await get(r.workbook)).arrayBuffer());
    await sleep(1000);
    const wb = XLSX.read(bytes, { type: "array" });
    const single = XLSX.utils.book_new();
    for (const annex of ANNEXES) {
      const name = wb.SheetNames.find((n) => sheetMatches(n, annex));
      if (name) XLSX.utils.book_append_sheet(single, wb.Sheets[name]!, `ANEXO ${annexName(annex).toUpperCase()}`);
      else problems.push(`el libro no tiene la hoja del anexo ${annexName(annex)}`);
    }
    if (single.SheetNames.length)
      await archive(SOURCE, workbookName(r), new Uint8Array(XLSX.write(single, { type: "array", bookType: "xlsx" }) as ArrayBuffer), {
        url: r.workbook,
      });
    return problems;
  }
  for (const annex of ANNEXES) {
    const url = r.files[annex];
    if (!url || (await latestRaw(SOURCE, fileName(r, annex)))) continue;
    try {
      const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
      await archive(SOURCE, fileName(r, annex), bytes, { url });
    } catch (err) {
      problems.push(`anexo ${annexName(annex)}: ${(err as Error).message}`);
    }
    await sleep(1000);
  }
  return problems;
}

const sheetMatches = (sheet: string, annex: Annex) =>
  new RegExp(`^anexo\\s*${annexName(annex).replace(" ", "\\s*")}$`, "i").test(sheet.trim());

// ---------------------------------------------------------------- 2. read

/** The archived annex as tables, whatever its format; null if it was not published or archived. */
async function annexTables(r: Release, annex: Annex): Promise<Table[] | null> {
  if (r.workbook) {
    const path = await latestRaw(SOURCE, workbookName(r));
    if (!path || !existsSync(path)) return null;
    const sheet = sheetTables(new Uint8Array(await readRaw(path))).find((s) => sheetMatches(s.name, annex));
    return sheet ? [sheet.rows] : null;
  }
  const path = await latestRaw(SOURCE, fileName(r, annex));
  return path && existsSync(path) ? pdfTables(new Uint8Array(await readRaw(path))) : null;
}

// ---------------------------------------------------------------- 3 and 4. interpret and classify

function spendingRows(r: Release, annex: SpendingAnnex, url: string): Row[] {
  return annex.lines.map((l) => ({
    municipio: r.municipality,
    anio: r.year,
    trimestre: r.quarter,
    fecha_corte: quarterEnd(r),
    jurisdiccion: l.jurisdiction,
    unidad: l.unit,
    partida_codigo: l.code,
    partida: l.label,
    objeto_codigo: l.objectCode,
    objeto: SPENDING_OBJECTS[l.objectCode] ?? l.label,
    credito_votado: cents(l.votedCredit),
    aumentos: cents(l.increases),
    disminuciones: cents(l.decreases),
    credito_vigente: cents(l.currentCredit),
    comprometido: cents(l.committed),
    devengado: cents(l.accrued),
    mandado_a_pagar: cents(l.ordered),
    pagado: cents(l.paid),
    fuente_url: url,
  }));
}

const cents = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- run

export async function run(_args: string[]): Promise<void> {
  const spending: Row[] = [];
  const documents: Row[] = [];
  const record = (r: Release, annex: Annex, estado: string, detalle: string) =>
    documents.push({
      municipio: r.municipality,
      anio: r.year,
      trimestre: r.quarter,
      anexo: annexName(annex),
      estado,
      detalle,
      fuente_url: r.workbook ?? r.files[annex] ?? "",
    });

  for (const [name, find] of Object.entries(FINDERS)) {
    if (!normalizeMunicipio(name)) throw new Error(`municipio desconocido: ${name}`);
    let releases: Release[];
    try {
      releases = (await find()).filter((r) => r.year >= FIRST_YEAR);
    } catch (err) {
      warn(`${name}: no se pudo leer el listado (${(err as Error).message})`);
      continue;
    }
    releases.sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter));
    console.log(`${name}: ${releases.length} trimestres (${releases.map(periodKey).join(", ")})`);

    for (const r of releases) {
      for (const problem of await ensureArchived(r)) warn(`${name} ${periodKey(r)}: ${problem}`);
      for (const annex of ANNEXES) {
        const tables = await annexTables(r, annex);
        if (!tables) {
          record(r, annex, "no_encontrado", "El trimestre no trae este anexo.");
          continue;
        }
        // Annex 1 (financial programming) is yearly: some municipalities print a different quarter on it.
        const printed = headerPeriod(tables);
        const mismatch = printed && (annex === "1" ? printed.year !== r.year : periodKey(printed) !== periodKey(r));
        if (printed && mismatch) {
          record(r, annex, "error", `El documento dice ${periodKey(printed)}.`);
          warn(`${name} ${periodKey(r)} anexo ${annexName(annex)}: el documento dice ${periodKey(printed)}`);
          continue;
        }
        if (annex !== "2") {
          record(r, annex, "archivado", "Archivado; todavía no se interpreta.");
          continue;
        }
        const parsed = parseSpendingAnnex(tables);
        if ("error" in parsed) {
          record(r, annex, "error", parsed.error);
          warn(`${name} ${periodKey(r)} anexo 2: ${parsed.error}`);
          continue;
        }
        const url = r.workbook ?? r.files[annex]!;
        spending.push(...spendingRows(r, parsed, url));
        const notes = parsed.notes.length ? ` Observaciones: ${parsed.notes.join(". ")}.` : "";
        record(r, annex, "leido", `${parsed.lines.length} partidas; cierran con la fila TOTALES.${notes}`);
      }
    }
  }

  await writeProcessed(SOURCE, "ejecucion_gastos.csv", spending, [
    "municipio",
    "anio",
    "trimestre",
    "fecha_corte",
    "jurisdiccion",
    "unidad",
    "partida_codigo",
    "partida",
    "objeto_codigo",
    "objeto",
    "credito_votado",
    "aumentos",
    "disminuciones",
    "credito_vigente",
    "comprometido",
    "devengado",
    "mandado_a_pagar",
    "pagado",
    "fuente_url",
  ]);
  await writeProcessed(SOURCE, "documentos.csv", documents, ["municipio", "anio", "trimestre", "anexo", "estado", "detalle", "fuente_url"]);
  const read = documents.filter((d) => d.estado === "leido").length;
  console.log(`ejecucion_gastos.csv: ${spending.length} filas; anexo 2 leído en ${read} trimestres`);
}
