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
 *   - ejecucion_recursos.csv: one row per revenue item from Annex 3, accumulated the same way.
 *   - deuda.csv: one row per debt from Annex 5, with the movements of the quarter (not accumulated).
 *   - documentos.csv: every document found, whether it was read and, if not, why. It is the coverage record.
 *
 * Decisions:
 *   - From 2023 on (`FIRST_YEAR`): the site shows the last four years.
 *   - Only annexes 1 to 5 are archived. Annexes 22 and 23 list debtors with names and are never downloaded; from a
 *     workbook with every annex (San Martín) only the sheets of annexes 1 to 5 are kept, as a new XLSX.
 *   - A quarter already archived is not downloaded again (a published quarter does not change); only listings are.
 *   - A document whose items do not satisfy the printed identities or do not add up to its TOTALES row is left out
 *     of the CSV and recorded in documentos.csv with the reason.
 *   - Each municipality's finder lives in lrf/finders/<municipality>.ts and is registered in FINDERS. Adding one does not
 *     change the reading layers.
 */

import { existsSync } from "node:fs";
import { archive, get, latestRaw, normalizeMunicipio, type Row, readRaw, writeProcessed } from "@mt/core";
import * as XLSX from "xlsx";
import {
  type DebtAnnex,
  headerAnnex,
  headerPeriod,
  type Period,
  parseDebtAnnex,
  parseRevenueAnnex,
  parseSpendingAnnex,
  type RevenueAnnex,
  type SpendingAnnex,
} from "../lrf/annexes.ts";
import { revenueKind, SPENDING_OBJECTS } from "../lrf/classify.ts";
import { find as capital } from "../lrf/finders/capital.ts";
import { find as generalAlvear } from "../lrf/finders/general-alvear.ts";
import { find as godoyCruz } from "../lrf/finders/godoy-cruz.ts";
import { find as guaymallen } from "../lrf/finders/guaymallen.ts";
import { find as laPaz } from "../lrf/finders/la-paz.ts";
import { find as lavalle } from "../lrf/finders/lavalle.ts";
import { find as maipu } from "../lrf/finders/maipu.ts";
import { find as malargue } from "../lrf/finders/malargue.ts";
import { find as rivadavia } from "../lrf/finders/rivadavia.ts";
import { find as sanCarlos } from "../lrf/finders/san-carlos.ts";
import { find as sanMartin } from "../lrf/finders/san-martin.ts";
import { find as sanRafael } from "../lrf/finders/san-rafael.ts";
import { find as santaRosa } from "../lrf/finders/santa-rosa.ts";
import { find as tunuyan } from "../lrf/finders/tunuyan.ts";
import { find as tupungato } from "../lrf/finders/tupungato.ts";
import { sheetTables, type Table } from "../lrf/read.ts";
import {
  ANNEXES,
  type Annex,
  annexName,
  type DocumentExt,
  documentTables,
  downloadRelease,
  FIRST_YEAR,
  type Finder,
  type Release,
  LRF_SOURCE as SOURCE,
  sleep,
} from "../lrf/release.ts";

const warn = (msg: string) => console.log(`::warning title=${SOURCE}::${msg}`);

/** One finder per municipality, each in lrf/finders/<municipality>.ts. */
const FINDERS: Record<string, Finder> = {
  Capital: capital,
  "General Alvear": generalAlvear,
  "Godoy Cruz": godoyCruz,
  Guaymallén: guaymallen,
  "La Paz": laPaz,
  Lavalle: lavalle,
  Maipú: maipu,
  Malargüe: malargue,
  Rivadavia: rivadavia,
  "San Carlos": sanCarlos,
  "San Martín": sanMartin,
  "San Rafael": sanRafael,
  "Santa Rosa": santaRosa,
  Tunuyán: tunuyan,
  Tupungato: tupungato,
};

const slug = (m: string) =>
  m
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

const periodKey = (p: Period) => `${p.year}-T${p.quarter}`;
const quarterEnd = (p: Period) => `${p.year}-${["03-31", "06-30", "09-30", "12-31"][p.quarter - 1]}`;
const EXTS: DocumentExt[] = ["pdf", "xlsx", "xls", "html", "mht", "json"];
const fileName = (r: Release, annex: Annex, ext: DocumentExt) => `${slug(r.municipality)}-${periodKey(r)}-anexo${annex}.${ext}`;
const workbookName = (r: Release) => `${slug(r.municipality)}-${periodKey(r)}-anexos.xlsx`;

/** The archived file of an annex, whatever its extension; null if it was never archived. */
async function archivedAnnex(r: Release, annex: Annex): Promise<{ path: string; ext: DocumentExt } | null> {
  for (const ext of EXTS) {
    const path = await latestRaw(SOURCE, fileName(r, annex, ext));
    if (path && existsSync(path)) return { path, ext };
  }
  return null;
}

// ---------------------------------------------------------------- download and archive

/** Archives what is missing of a release. Returns the problems found (empty if everything is in place). */
async function ensureArchived(r: Release): Promise<string[]> {
  if (r.workbook) return archiveWorkbook(r);
  const skip = new Set<Annex>();
  for (const annex of ANNEXES) if (!(r.zip || r.report || r.files[annex]) || (await archivedAnnex(r, annex))) skip.add(annex);
  const { docs, problems } = await downloadRelease(r, skip);
  for (const d of docs) await archive(SOURCE, fileName(r, d.annex, d.ext), d.bytes, { url: d.url });
  return problems;
}

/** A workbook with every annex (San Martín): only the sheets of the archived annexes are kept, as a new XLSX. */
async function archiveWorkbook(r: Release): Promise<string[]> {
  const problems: string[] = [];
  if (await latestRaw(SOURCE, workbookName(r))) return problems;
  const bytes = new Uint8Array(await (await get(r.workbook!)).arrayBuffer());
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
      url: r.workbook!,
    });
  return problems;
}

const sheetMatches = (sheet: string, annex: Annex) =>
  new RegExp(`^anexo\\s*${annexName(annex).replace(" ", "\\s*")}$`, "i").test(sheet.trim());

// ---------------------------------------------------------------- 2. read

/** The archived annex as tables, whatever its format; null if it was not published or archived. */
async function annexTables(r: Release, annex: Annex, axis: "h" | "v" = "h"): Promise<Table[] | null> {
  if (r.workbook) {
    const path = await latestRaw(SOURCE, workbookName(r));
    if (!path || !existsSync(path)) return null;
    const sheet = sheetTables(new Uint8Array(await readRaw(path)), { blankAsZero: true }).find((s) => sheetMatches(s.name, annex));
    return sheet ? [sheet.rows] : null;
  }
  const file = await archivedAnnex(r, annex);
  if (!file) return null;
  return documentTables(new Uint8Array(await readRaw(file.path)), file.ext, axis);
}

/** Source URL of an annex, for the tables and documentos.csv. */
const annexUrl = (r: Release, annex: Annex) => r.workbook ?? r.zip ?? r.report ?? r.files[annex] ?? "";

// ---------------------------------------------------------------- 3 and 4. interpret and classify

const cents = (n: number) => Math.round(n * 100) / 100;

/** One output table per interpreted annex: how to read it, its rows and its columns. */
interface Reader {
  file: string;
  noun: string;
  parse: (tables: Table[]) => { lines: unknown[]; notes: string[] } | { error: string };
  rows: (r: Release, parsed: never, url: string) => Row[];
  columns: string[];
}

const period = (r: Release) => ({ municipio: r.municipality, anio: r.year, trimestre: r.quarter, fecha_corte: quarterEnd(r) });
const PERIOD_COLUMNS = ["municipio", "anio", "trimestre", "fecha_corte"];

const READERS: Partial<Record<Annex, Reader>> = {
  "2": {
    file: "ejecucion_gastos.csv",
    noun: "partidas",
    parse: parseSpendingAnnex,
    rows: (r: Release, parsed: SpendingAnnex, url: string) =>
      parsed.lines.map((l) => ({
        ...period(r),
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
      })),
    columns: [
      ...PERIOD_COLUMNS,
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
    ],
  },
  "3": {
    file: "ejecucion_recursos.csv",
    noun: "recursos",
    parse: parseRevenueAnnex,
    rows: (r: Release, parsed: RevenueAnnex, url: string) =>
      parsed.lines.map((l) => ({
        ...period(r),
        recurso_codigo: l.code,
        recurso: l.label,
        tipo: revenueKind(l.code) ?? "",
        calculo_original: cents(l.originalEstimate),
        aumentos: cents(l.increases),
        disminuciones: cents(l.decreases),
        calculo_vigente: cents(l.finalEstimate),
        ingresado: cents(l.collected),
        ingresado_trimestre: cents(l.collectedInQuarter),
        fuente_url: url,
      })),
    columns: [
      ...PERIOD_COLUMNS,
      "recurso_codigo",
      "recurso",
      "tipo",
      "calculo_original",
      "aumentos",
      "disminuciones",
      "calculo_vigente",
      "ingresado",
      "ingresado_trimestre",
      "fuente_url",
    ],
  },
  "5": {
    file: "deuda.csv",
    noun: "deudas",
    parse: parseDebtAnnex,
    rows: (r: Release, parsed: DebtAnnex, url: string) =>
      parsed.lines.map((l) => ({
        ...period(r),
        deuda: l.label,
        moneda: l.currency,
        saldo_inicio: cents(l.openingBalance),
        pagos: cents(l.payments),
        deuda_contraida: cents(l.newDebt),
        renegociacion: cents(l.renegotiation),
        saldo_final: cents(l.closingBalance),
        fuente_url: url,
      })),
    columns: [
      ...PERIOD_COLUMNS,
      "deuda",
      "moneda",
      "saldo_inicio",
      "pagos",
      "deuda_contraida",
      "renegociacion",
      "saldo_final",
      "fuente_url",
    ],
  },
};

// ---------------------------------------------------------------- run

export async function run(_args: string[]): Promise<void> {
  const outputs = new Map<Annex, Row[]>();
  const documents: Row[] = [];
  const record = (r: Release, annex: Annex, estado: string, detalle: string) =>
    documents.push({
      municipio: r.municipality,
      anio: r.year,
      trimestre: r.quarter,
      anexo: annexName(annex),
      estado,
      detalle,
      fuente_url: annexUrl(r, annex),
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
        let tables: Table[] | null;
        try {
          tables = await annexTables(r, annex);
        } catch (err) {
          record(r, annex, "error", `No se pudo abrir el archivo: ${(err as Error).message}.`);
          warn(`${name} ${periodKey(r)} anexo ${annexName(annex)}: no se pudo abrir (${(err as Error).message})`);
          continue;
        }
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
        const printedAnnex = headerAnnex(tables);
        if (printedAnnex && printedAnnex !== annex) {
          record(
            r,
            annex,
            "error",
            `El archivo publicado como anexo ${annexName(annex)} trae el anexo ${annexName(printedAnnex as Annex)}.`,
          );
          warn(`${name} ${periodKey(r)} anexo ${annexName(annex)}: el archivo trae el anexo ${printedAnnex}`);
          continue;
        }
        const reader = READERS[annex];
        if (!reader) {
          record(r, annex, "archivado", "Archivado; todavía no se interpreta.");
          continue;
        }
        let parsed = reader.parse(tables);
        // A PDF printed sideways only reads along the other axis.
        if ("error" in parsed && !r.workbook) {
          const sideways = await annexTables(r, annex, "v");
          const retry = sideways ? reader.parse(sideways) : parsed;
          if (!("error" in retry)) parsed = retry;
        }
        if ("error" in parsed) {
          record(r, annex, "error", parsed.error);
          warn(`${name} ${periodKey(r)} anexo ${annexName(annex)}: ${parsed.error}`);
          continue;
        }
        const url = annexUrl(r, annex);
        outputs.set(annex, [...(outputs.get(annex) ?? []), ...reader.rows(r, parsed as never, url)]);
        const notes = parsed.notes.length ? ` Observaciones: ${parsed.notes.join(". ")}.` : "";
        record(r, annex, "leido", `${parsed.lines.length} ${reader.noun}; cierran con la fila TOTALES.${notes}`);
      }
    }
  }

  for (const [annex, reader] of Object.entries(READERS) as [Annex, Reader][]) {
    const rows = outputs.get(annex) ?? [];
    await writeProcessed(SOURCE, reader.file, rows, reader.columns);
    const read = documents.filter((d) => d.anexo === annexName(annex) && d.estado === "leido").length;
    console.log(`${reader.file}: ${rows.length} filas, anexo ${annexName(annex)} leído en ${read} trimestres`);
  }
  await writeProcessed(SOURCE, "documentos.csv", documents, ["municipio", "anio", "trimestre", "anexo", "estado", "detalle", "fuente_url"]);
}
