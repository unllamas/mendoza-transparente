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
 *   - First municipalities: San Rafael (one PDF per annex) and San Martín (one workbook per quarter). The rest are
 *     added as finders here; the reading layers do not change.
 */

import { existsSync } from "node:fs";
import { archive, get, latestRaw, type Municipio, normalizeMunicipio, type Row, readRaw, USER_AGENT, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
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
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };

/**
 * Annex named in a link text or file name, in any of the spellings found: "anexo2bis.pdf", "Anexo-II.pdf",
 * "ANEXO-2-DE-LA-EJECUCION…", "Anxo-2-bis-…", "Anexi-III.pdf". Null if it is not one of the annexes archived here.
 * The printed title is checked later (`headerAnnex`): a file can be published under the wrong name.
 */
export function annexFromName(name: string): Annex | null {
  let text = name;
  try {
    text = decodeURIComponent(name);
  } catch {
    /* not encoded */
  }
  const m = /an[e]?x[oi]?[\s_-]*(vi|iv|v|i{1,3}|\d{1,2})[\s_-]*(bis)?(?![a-z\d])/i.exec(text);
  if (!m) return null;
  const n = ROMAN[m[1]!.toLowerCase()] ?? String(Number(m[1]));
  const annex = (m[2] ? `${n}bis` : n) as Annex;
  return ANNEXES.includes(annex) ? annex : null;
}

// ---------------------------------------------------------------- 1. find

async function page(url: string, filename: string): Promise<cheerio.CheerioAPI> {
  const text = await (await get(url)).text();
  if (filename) await archive(SOURCE, filename, text, { url });
  await sleep(800);
  return cheerio.load(text);
}

/** Links of a page, absolute. */
function links($: cheerio.CheerioAPI, base: string): { text: string; href: string }[] {
  return $("a")
    .toArray()
    .flatMap((a) => {
      const href = $(a).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript")) return [];
      try {
        return [{ text: $(a).text().replace(/\s+/g, " ").trim(), href: new URL(href.trim().replace(/ /g, "%20"), base).toString() }];
      } catch {
        return [];
      }
    });
}

/** The archived annexes among a page's PDF links, recognized by the file name or the link text. */
function annexLinks(found: { text: string; href: string }[]): Partial<Record<Annex, string>> {
  const files: Partial<Record<Annex, string>> = {};
  for (const l of found) {
    if (!/\.pdf(\?|$)/i.test(l.href)) continue;
    const annex = annexFromName(l.href.split("/").pop() ?? "") ?? annexFromName(l.text);
    if (annex && !files[annex]) files[annex] = l.href;
  }
  return files;
}

const FINDERS: Record<string, () => Promise<Release[]>> = {
  /**
   * General Alvear: one tab per quarter ("2° Trimestre | 2026") with every annex at /resp-fiscal/<folder>/anexoN.pdf.
   * The folder name is NOT the quarter from 2023-T4 to 2024-T3 (2023-T4 is in "archivos-1t-2024"): the links are
   * taken from the tab, and the period printed in each annex is checked. Annex 1 is yearly, in other tabs; not used.
   */
  async "General Alvear"() {
    const base = "https://alvearmendoza.gob.ar/ley-de-responsabilidad-fiscal/";
    const $ = await page(base, "indice-general-alvear.html");
    const releases: Release[] = [];
    $(".tab-pane").each((_, pane) => {
      const m = /(\d)°?\s*trimestre\|(\d{4})/i.exec($(pane).attr("aria-labelledby") ?? "");
      if (!m || +m[2]! < FIRST_YEAR) return;
      const files = annexLinks(links(cheerio.load($(pane).html() ?? ""), base));
      delete files["1"];
      releases.push({ municipality: "General Alvear", year: +m[2]!, quarter: +m[1]!, files });
    });
    return releases;
  },

  /**
   * Malargüe: one page per quarter, listed in the sitemap ("/responsabilidad-fiscal-2o-trimestre-2024/", and from 2025
   * "-2-trimestre-"). Some quarters have a second page ending in "-2" and only one of them has the files (2023-T1 and
   * T4 are in the "-2" one): the page with PDFs wins. File names change every quarter (roman or arabic numbers, typos).
   * The site is slow: about a minute per page.
   */
  async Malargüe() {
    const pages = new Map<string, { period: Period; urls: string[] }>();
    for (const n of [1, 2, 3]) {
      const xml = await (await get(`https://www.malargue.gov.ar/wp-sitemap-posts-post-${n}.xml`)).text();
      await sleep(800);
      for (const m of xml.matchAll(
        /<loc>(https:\/\/www\.malargue\.gov\.ar\/responsabilidad-fiscal-(\d)o?-trimestre-(\d{4})(?:-\d)?\/)<\/loc>/g,
      )) {
        if (+m[3]! < FIRST_YEAR) continue;
        const key = `${m[3]}-${m[2]}`;
        const entry = pages.get(key) ?? { period: { year: +m[3]!, quarter: +m[2]! }, urls: [] };
        entry.urls.push(m[1]!);
        pages.set(key, entry);
      }
    }
    const releases: Release[] = [];
    for (const { period, urls } of pages.values()) {
      for (const url of urls.sort((a, b) => a.length - b.length)) {
        const files = annexLinks(links(await page(url, ""), url));
        if (Object.keys(files).length) {
          releases.push({ municipality: "Malargüe", ...period, files });
          break;
        }
      }
    }
    return releases;
  },

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
async function annexTables(r: Release, annex: Annex, axis: "h" | "v" = "h"): Promise<Table[] | null> {
  if (r.workbook) {
    const path = await latestRaw(SOURCE, workbookName(r));
    if (!path || !existsSync(path)) return null;
    const sheet = sheetTables(new Uint8Array(await readRaw(path)), { blankAsZero: true }).find((s) => sheetMatches(s.name, annex));
    return sheet ? [sheet.rows] : null;
  }
  const path = await latestRaw(SOURCE, fileName(r, annex));
  return path && existsSync(path) ? pdfTables(new Uint8Array(await readRaw(path)), axis) : null;
}

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
        const url = r.workbook ?? r.files[annex]!;
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
