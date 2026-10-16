/**
 * Personal de los municipios de Mendoza: Anexo 19 de la Ley de Responsabilidad Fiscal (Ley 7314, Acuerdo 3949 del
 * Tribunal de Cuentas).
 *
 * Fuente: cada municipio publica, trimestre a trimestre, el "Anexo 19: Detalle de la planta de personal y contratos
 * de locación, importes liquidados acumulados al fin del trimestre" en su propio sitio (no hay un lugar único: el
 * Tribunal de Cuentas lo recibe por un sistema con usuario y el Ministerio de Hacienda solo publica el gasto en
 * personal, sin cantidad de cargos). Cada sitio tiene su forma de listar los informes; hay un "descubridor" por
 * municipio (ver `DISCOVERERS`). Los municipios que no publican el Anexo 19 en ningún lado que se haya podido
 * encontrar (Godoy Cruz, Las Heras) quedan afuera y se anotan en `no-publicado.yaml`.
 *
 * Qué trae el anexo: una fila por jurisdicción con (cargos, importe) de planta permanente, planta temporaria, total
 * de planta, horas cátedra y (cantidad, importe) de contratos de locación de servicios u obras. De cada documento se
 * toma la fila TOTALES (o, si el municipio no la completó, la única fila de datos, o la suma de las filas).
 *
 * Salidas (data/processed/municipios-personal/):
 *   - personal.csv: una fila por (municipio, anio, trimestre, tipo_personal). `tipo_personal` es permanente |
 *     temporaria | total_planta | horas_catedra | contratos_locacion. `cantidad` son cargos (una persona con dos
 *     cargos cuenta dos), salvo en contratos_locacion (contratos) y horas_catedra (horas). `importe_acumulado` es en
 *     pesos nominales ACUMULADOS desde enero hasta el fin del trimestre (para el gasto de un trimestre hay que restar
 *     el acumulado del anterior). Es lo "liquidado" según los registros contables del municipio.
 *   - personal_capital_mensual.csv: serie MENSUAL de la Ciudad de Mendoza (planta + locaciones y su costo mensual),
 *     que Capital publica aparte en su portal de datos abiertos. No es el Anexo 19: otra definición, otra periodicidad.
 *
 * Decisiones:
 *   - Los PDF se leen por posición (x, y) de cada texto, no por el orden del texto: varios municipios (San Rafael,
 *     Junín, Tupungato) generan PDF cuyo texto sale desordenado, y Junín viene con la página rotada.
 *   - Validación: cada documento debe cumplir permanente + temporaria = total de planta, en cargos e importe. Si no
 *     cumple, no entra al CSV y queda un aviso (`::warning`) con el motivo.
 *   - El período sale del listado del sitio (no de la fecha de subida); si el documento dice otro año, avisa.
 *   - Archivo crudo: los ZIP traen todos los anexos (hasta 10 MB por trimestre) y los PDF de Tupungato son el informe
 *     completo de más de 100 páginas con datos personales de deudores (anexos 22 y 23). Para no inflar el repo ni
 *     publicar esos datos, se archiva solo el Anexo 19 (extraído del ZIP) o la página del Anexo 19 de Tupungato
 *     (como JSON con los textos y su posición y el sha256 del PDF original). En el manifiesto, la URL de cada archivo es la
 *     del ZIP o PDF original.
 *   - Lavalle: el sitio viejo (/old/acuerdo3949) lista los trimestres en un formulario (POST con `acuerdo=AAAAT`). Su PDF
 *     trae dos filas, la Municipalidad y el Honorable Concejo Deliberante, sin fila de totales: como con los demás
 *     municipios que no completan los totales, se toma la fila única de datos (la Municipalidad). El HCD queda afuera.
 *   - San Martín: un Excel por trimestre con TODOS los anexos (1 a 2 MB, y los anexos 22 y 23 traen datos de
 *     contribuyentes). No se encontró la página que los lista: se prueba el patrón `hacienda/ley_resp_AA_T.xlsx` (o
 *     `.xls` en 2018 y 2019) con un pedido HEAD por trimestre. Se archiva solo la hoja "ANEXO 19", como XLSX nuevo.
 *   - Los documentos ya archivados no se vuelven a descargar (un trimestre publicado no cambia); solo se consultan
 *     los listados.
 *   - No hay nombres ni datos personales en el Anexo 19: no hay nada que redactar.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  archive,
  get,
  latestRaw,
  type Municipio,
  normalizeMunicipio,
  RAW_DIR,
  ROOT,
  type Row,
  readRaw,
  USER_AGENT,
  writeProcessed,
} from "@mt/core";
import * as cheerio from "cheerio";
import { unzipSync } from "fflate";
import { getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";

const SOURCE = "municipios-personal";
const FIRST_YEAR = 2018;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const warn = (msg: string) => console.log(`::warning title=${SOURCE}::${msg}`);

// ---------------------------------------------------------------- lectura de PDF y planillas

/** Un texto del PDF con su posición. */
export interface Item {
  x: number;
  y: number;
  s: string;
  /** Alto del texto: define la tolerancia para agrupar filas (hay PDF impresos a escala chica). */
  h?: number;
}

/** Una ficha de una fila: texto y, si es una cifra, su valor. */
export interface Tok {
  text: string;
  num: number | null;
}

// Español ("1.234,56", "1.234") o inglés ("1,234.56"; algunos municipios exportan así) o "-" (vacío).
const NUM_ES = /^(?:-|\d[\d.]*(?:,\d+)?)$/;
const NUM_EN = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})$/;

/** "1.234,56" → 1234.56; "1,234.56" → 1234.56; "5626739118" → 5626739118; "-" → 0. */
export function parseNum(s: string): number {
  if (s === "-") return 0;
  if (NUM_EN.test(s)) return Number(s.replace(/,/g, ""));
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function tokenize(text: string): Tok[] {
  return text
    .replace(/\$/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, num: NUM_EN.test(t) || NUM_ES.test(t) ? parseNum(t) : null }));
}

/** Los textos de una página de PDF con su posición (un texto con varias fichas se reparte en x). */
async function pageItems(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number): Promise<Item[]> {
  const content = await (await pdf.getPage(n)).getTextContent();
  const items: Item[] = [];
  for (const it of content.items as { str: string; transform: number[]; height: number }[]) {
    const parts = it.str.replace(/\$/g, " ").trim().split(/\s+/).filter(Boolean);
    parts.forEach((s, i) =>
      items.push({ x: it.transform[4]! + i * 0.5, y: it.transform[5]!, s, h: Math.abs(it.transform[3]!) || it.height }),
    );
  }
  return items;
}

/** Agrupa los textos en filas por cercanía en un eje (3 puntos de tolerancia) y los ordena a lo largo del otro. */
export function rowsOf(rawItems: Item[], axis: "h" | "v"): Tok[][] {
  // Varios PDF imprimen cada texto dos veces en el mismo lugar (negrita simulada): se descartan los repetidos.
  const items = rawItems.filter(
    (a, i) => !rawItems.slice(0, i).some((b) => b.s === a.s && Math.abs(b.x - a.x) < 0.3 && Math.abs(b.y - a.y) < 0.3),
  );
  const along = (i: Item) => (axis === "h" ? i.x : i.y);
  const across = (i: Item) => (axis === "h" ? -i.y : i.x);
  const heights = items
    .map((i) => i.h ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const tolerance = heights.length ? Math.min(3, Math.max(0.4, 0.4 * heights[Math.floor(heights.length / 2)]!)) : 3;
  const sorted = [...items].sort((a, b) => across(a) - across(b));
  const rows: Item[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(across(last[0]!) - across(it)) <= tolerance) last.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => along(a) - along(b)).flatMap((i) => tokenize(i.s)));
}

const isTotalsLabel = (label: string) => /^t\.?o\.?t\.?a\.?l/.test(label);

/**
 * De las filas de un anexo 19 devuelve las 10 cifras de los totales:
 * permanente (cargos, importe), temporaria, total de planta, horas cátedra y contratos (cantidad, importe).
 * Primero busca una fila "TOTALES" completa en cualquiera de las lecturas; si no hay, la única fila de datos
 * (municipios que no completan los totales) o la suma de las filas.
 */
export function pickTotals(rowsList: Tok[][][], blankHoursCount = false): { cells: number[]; how: string } | null {
  const parsed = rowsList.map((rows) =>
    rows
      .map((r) => ({
        label: r
          .filter((t) => t.num === null)
          .map((t) => t.text)
          .join("")
          .toLowerCase(),
        nums: r.filter((t) => t.num !== null).map((t) => t.num!),
      }))
      // Si el municipio dejó en blanco las horas cátedra, la fila trae 8 cifras: se completan con ceros.
      .map((p) => (p.nums.length === 8 ? { ...p, nums: [...p.nums.slice(0, 6), 0, 0, ...p.nums.slice(6)] } : p))
      // Lavalle (2020) deja en blanco solo la cantidad de horas cátedra y trae el importe: 9 cifras. Solo con
      // `blankHoursCount`: en Guaymallén 2022-T1 también hay 9 cifras y no está claro cuál falta.
      .map((p) =>
        blankHoursCount && p.nums.length === 9 && p.nums[6] === 0 ? { ...p, nums: [...p.nums.slice(0, 6), 0, ...p.nums.slice(6)] } : p,
      ),
  );
  for (const rows of parsed) {
    const totals = rows.filter((p) => isTotalsLabel(p.label) && p.nums.length >= 10);
    if (totals.length) return { cells: totals[totals.length - 1]!.nums.slice(-10), how: "totales" };
  }
  for (const rows of parsed) {
    const data = rows.filter((p) => p.nums.length >= 10);
    if (data.length === 1) return { cells: data[0]!.nums.slice(-10), how: "fila única" };
    if (data.length > 1) {
      const sum = Array.from({ length: 10 }, (_, i) => data.reduce((a, p) => a + p.nums.slice(-10)[i]!, 0));
      return { cells: sum, how: `suma de ${data.length} filas` };
    }
  }
  return null;
}

/**
 * Controla que las cifras leídas sean las de la fila de totales: permanente + temporaria debería dar el total de planta.
 * Devuelve `error` si está muy lejos (se leyó mal una fila, no se publica) y `note` si el documento mismo no cuadra por
 * poco (por ejemplo, un renglón de ART o SEOS que está en el total y no en las dos plantas): se publica lo que dice el
 * documento y se aclara.
 */
export function checkTotals(c: number[]): { error?: string; note?: string } {
  const [pc, pi, tc, ti, oc, oi] = c as [number, number, number, number, number, number];
  const off = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  if (off(pc + tc, oc) > 0.15 || off(pi + ti, oi) > 0.15)
    return {
      error: `permanente + temporaria (${pc} + ${tc} cargos, ${Math.round(pi + ti)} pesos) está lejos del total de planta (${oc} cargos, ${Math.round(oi)} pesos)`,
    };
  const notes: string[] = [];
  if (pc + tc !== oc) notes.push(`cargos: permanente + temporaria = ${pc + tc}, el total de planta dice ${oc}`);
  if (Math.abs(pi + ti - oi) > Math.max(5, oi * 0.001))
    notes.push(`importe: permanente + temporaria = ${Math.round(pi + ti)}, el total de planta dice ${Math.round(oi)}`);
  return notes.length ? { note: `El documento no cuadra (${notes.join("; ")}). Se publican las cifras del documento.` } : {};
}

/**
 * Fila de totales anclada a la etiqueta "Totales": todas las cifras a menos de ~7 puntos de su altura (o de su ancho,
 * si la página está rotada). Hace falta porque algunos PDF (San Rafael) dibujan las celdas de una misma fila con
 * hasta 8 puntos de diferencia vertical, más que la tolerancia con la que se agrupan las filas.
 */
function anchoredTotals(items: Item[]): Tok[][] {
  const out: Tok[][] = [];
  for (const label of items.filter((i) => /^t\s?o\s?t\s?a\s?l\s?e?\s?s?$/i.test(i.s.trim()))) {
    for (const axis of ["h", "v"] as const) {
      const across = (i: Item) => (axis === "h" ? i.y : i.x);
      const along = (i: Item) => (axis === "h" ? i.x : i.y);
      const tol = Math.min(7, 0.9 * (label.h ?? 8));
      const near = items
        .filter((i) => i !== label && Math.abs(across(i) - across(label)) <= tol)
        .filter((a, k, arr) => !arr.slice(0, k).some((b) => b.s === a.s && Math.abs(b.x - a.x) < 0.3 && Math.abs(b.y - a.y) < 0.3))
        .sort((a, b) => along(a) - along(b));
      const toks = near.flatMap((i) => tokenize(i.s));
      if (toks.filter((t) => t.num !== null).length >= 10) out.push([{ text: "totales", num: null }, ...toks]);
    }
  }
  return out;
}

/** Filas de una página de PDF: horizontales, rotadas (Junín, Santa Rosa) y ancladas a "Totales". */
export function pdfRows(items: Item[]): Tok[][][] {
  return [rowsOf(items, "h"), rowsOf(items, "v"), anchoredTotals(items)];
}

/** Filas de una planilla XLS/XLSX: cada celda es una ficha (los números ya vienen como número). */
export function sheetRows(bytes: Uint8Array): Tok[][][] {
  const wb = XLSX.read(bytes, { type: "array" });
  const out: Tok[][][] = [];
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: "" });
    out.push(
      aoa.map((r) =>
        r.flatMap((c): Tok[] => {
          if (typeof c === "number") return [{ text: String(c), num: c }];
          return tokenize(String(c));
        }),
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------- períodos

const QUARTER_WORDS: [RegExp, number][] = [
  [/primer|\b1er\b|1°|1º|\b1\b/i, 1],
  [/segund|\b2do\b|2°|2º|\b2\b/i, 2],
  [/tercer|\b3er\b|3°|3º|\b3\b/i, 3],
  [/cuart|\b4to\b|4°|4º|\b4\b/i, 4],
];

function quarterOf(raw: string): number | null {
  const text = raw.replace(/_/g, " ");
  for (const [re, q] of QUARTER_WORDS) if (re.test(text)) return q;
  return null;
}

const periodKey = (year: number, quarter: number) => `${year}-T${quarter}`;
const quarterEnd = (year: number, quarter: number) => `${year}-${["03-31", "06-30", "09-30", "12-31"][quarter - 1]}`;

interface Period {
  year: number;
  quarter: number;
}

/**
 * Período a partir de un texto (rótulo del enlace o nombre del archivo). Si no dice el año:
 *  - con `prev` (listados ordenados por año, con los trimestres de cada año en orden), sigue al anterior;
 *  - con la fecha de subida (`/uploads/AAAA/MM/`), el año de subida, salvo el cuarto trimestre subido antes de julio.
 */
function periodFromLabel(label: string, url: string, prev?: Period): Period | null {
  const file = decodeURIComponent(url.split("/").pop() ?? "");
  const q = quarterOf(label) ?? quarterOf(file);
  if (!q) return null;
  const y = /\b(20[12]\d)\b/.exec(label) ?? /(20[12]\d)/.exec(file);
  if (y) return { year: +y[1]!, quarter: q };
  if (prev) return { year: q === 1 ? prev.year - 1 : prev.year, quarter: q };
  const up = /uploads\/(\d{4})\/(\d{2})\//.exec(url);
  if (up) return { year: q === 4 && +up[2]! <= 6 ? +up[1]! - 1 : +up[1]!, quarter: q };
  return null;
}

/** Período que dice el propio anexo ("Ejercicio: 2026", "Trimestre: 2" o "SEGUNDO TRIMESTRE"). */
function yearFromItems(items: Item[]): number | null {
  const m = /EJERCICIO\s*:?\s*(\d{4})/i.exec(items.map((i) => i.s).join(" "));
  return m ? +m[1]! : null;
}

function periodFromItems(items: Item[]): Period | null {
  // Se prueba con el orden de lectura del PDF y con el orden por posición: según el generador, uno u otro junta
  // "Ejercicio:" con su valor.
  const texts = [
    items.map((i) => i.s).join(" "),
    rowsOf(items, "h")
      .map((r) => r.map((t) => t.text).join(" "))
      .join("\n"),
  ];
  for (const text of texts) {
    const y = /EJERCICIO\s*:?\s*(\d{4})/i.exec(text);
    const q =
      /TRIMESTRE\s*:?\s*([1-4])\b/i.exec(text)?.[1] ??
      /(PRIMER|SEGUND|TERCER|CUART)\w*\s+TRIMESTRE/i.exec(text)?.[1] ??
      /TRIMESTRE\s*:?\s*(PRIMER|SEGUND|TERCER|CUART)/i.exec(text)?.[1];
    if (y && q) return { year: +y[1]!, quarter: /^\d$/.test(q) ? +q : quarterOf(q)! };
  }
  return null;
}

// ---------------------------------------------------------------- documentos a bajar

type Kind = "pdf" | "zip" | "bigpdf" | "drive" | "workbook";

interface Doc {
  municipality: Municipio;
  /** 0 si el listado no dice el período: se toma del propio anexo al bajarlo. */
  year: number;
  quarter: number;
  url: string;
  kind: Kind;
}

const slug = (m: Municipio) =>
  m
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

const docName = (m: Municipio, p: Period, ext: string) => `${slug(m)}-${p.year}-T${p.quarter}-anexo19.${ext}`;

/** Baja una página de listado, la archiva (con pausa) y la devuelve ya parseada. */
async function indexPage(url: string, filename: string): Promise<cheerio.CheerioAPI> {
  const text = await (await get(url)).text();
  await archive(SOURCE, filename, text, { url });
  await sleep(800);
  return cheerio.load(text);
}

/** Página auxiliar de un listado (un trimestre, un año): se lee pero no se archiva; el anexo sí queda archivado. */
async function subPage(url: string): Promise<cheerio.CheerioAPI> {
  const text = await (await get(url)).text();
  await sleep(800);
  return cheerio.load(text);
}

function anchors($: cheerio.CheerioAPI, base: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  $("a").each((_, a) => {
    const href = $(a).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript")) return;
    try {
      out.push({ text: $(a).text().replace(/\s+/g, " ").trim(), href: abs(href, base) });
    } catch {
      /* enlace inválido */
    }
  });
  return out;
}

const abs = (href: string, base: string) => new URL(href.trim().replace(/ /g, "%20"), base).toString();
const isAnnex19 = (s: string) =>
  /anexo[\s_.\-–%20]*(0?19(?!\d)|xix\b)/i.test(decodeURIComponent(s)) || /\b19\b.{0,12}(detalle de la )?planta de personal/i.test(s);

type Discoverer = () => Promise<Doc[]>;

const DISCOVERERS: Record<string, Discoverer> = {
  /** Ciudad de Mendoza: el último trimestre está suelto en la página principal y los anteriores, en ZIP por trimestre. */
  async Capital() {
    const base = "https://ciudaddemendoza.gob.ar/responsabilidad-fiscal/";
    const docs: Doc[] = [];
    const cur = await indexPage(base, "indice-capital.html");
    const m = /(primer|segund|tercer|cuart)\w*\s+trimestre\s+(20\d\d)/i.exec(cur("body").text().replace(/\s+/g, " "));
    const link = anchors(cur, base).find((a) => /\.pdf$/i.test(a.href) && isAnnex19(`${a.text} ${a.href}`));
    if (m && link) docs.push({ municipality: "Capital", year: +m[2]!, quarter: quarterOf(m[1]!)!, url: link.href, kind: "pdf" });
    const hist = await indexPage(`${base}historico`, "indice-capital-historico.html");
    let prev: Period | undefined;
    for (const a of anchors(hist, `${base}historico/`)) {
      if (!/\.zip$/i.test(a.href)) continue;
      const p = periodFromLabel(a.text, a.href, prev);
      if (!p) continue;
      prev = p;
      docs.push({ municipality: "Capital", ...p, url: a.href, kind: "zip" });
    }
    return docs;
  },

  /** General Alvear: una pestaña por trimestre ("2° Trimestre | 2026") con el enlace a anexo19.pdf. */
  async "General Alvear"() {
    const base = "https://alvearmendoza.gob.ar/ley-de-responsabilidad-fiscal/";
    const $ = await indexPage(base, "indice-general-alvear.html");
    const docs: Doc[] = [];
    $(".tab-pane").each((_, pane) => {
      const label = $(pane).attr("aria-labelledby") ?? "";
      const m = /(\d)°?\s*trimestre\|(\d{4})/i.exec(label);
      if (!m) return;
      const a = $(pane)
        .find("a")
        .toArray()
        .map((e) => $(e).attr("href") ?? "")
        .find((h) => /anexo19/i.test(h));
      if (a) docs.push({ municipality: "General Alvear", year: +m[2]!, quarter: +m[1]!, url: abs(a, base), kind: "pdf" });
    });
    return docs;
  },

  /** Guaymallén: una página por trimestre ("Primer Trimestre 2026") con enlaces a cada anexo. */
  async Guaymallén() {
    const base = "https://www.guaymallen.gob.ar/ley-de-responsabilidad-fiscal/";
    const $ = await indexPage(base, "indice-guaymallen.html");
    const docs: Doc[] = [];
    for (const a of anchors($, base)) {
      const m = /^(primer|segundo|tercer|cuarto)\s+trimestre\s+(20\d\d)$/i.exec(a.text);
      if (!m || +m[2]! < FIRST_YEAR) continue;
      const page = await subPage(a.href);
      const link = anchors(page, a.href).find((l) => /anexo ?19/i.test(l.text) || /anexo19/i.test(l.href));
      if (link) docs.push({ municipality: "Guaymallén", year: +m[2]!, quarter: quarterOf(m[1]!)!, url: link.href, kind: "pdf" });
      else warn(`Guaymallén ${a.text}: la página no tiene el anexo 19`);
    }
    return docs;
  },

  /** Junín: ZIP por trimestre (/fiscal/AAAA/N.zip) y, suelto, el del trimestre en curso. */
  async Junín() {
    const base = "https://www.juninmendoza.gov.ar/?page_id=425";
    const cur = await indexPage(base, "indice-junin.html");
    const old = await indexPage("https://www.juninmendoza.gov.ar/?page_id=212273", "indice-junin-anteriores.html");
    const docs: Doc[] = [];
    let last: Period = { year: 0, quarter: 0 };
    for (const a of anchors(old, base)) {
      const m = /\/fiscal\/(\d{4})\/(\d)\.zip$/.exec(a.href);
      if (!m || +m[1]! < FIRST_YEAR) continue;
      docs.push({ municipality: "Junín", year: +m[1]!, quarter: +m[2]!, url: a.href, kind: "zip" });
      if (+m[1]! * 4 + +m[2]! > last.year * 4 + last.quarter) last = { year: +m[1]!, quarter: +m[2]! };
    }
    // El de la página principal es el trimestre siguiente al último ZIP (la página no lo dice).
    const link = anchors(cur, base).find((a) => /\.pdf$/i.test(a.href) && isAnnex19(a.href));
    if (link && last.year)
      docs.push({
        municipality: "Junín",
        year: last.quarter === 4 ? last.year + 1 : last.year,
        quarter: last.quarter === 4 ? 1 : last.quarter + 1,
        url: link.href,
        kind: "pdf",
      });
    return docs;
  },

  /** La Paz: la portada lista todos los archivos en carpetas AAAA/NN_TRIMESTRE; el nombre cambia casi cada vez. */
  async "La Paz"() {
    const base = "https://lapazmendoza.gob.ar/";
    const $ = await indexPage(base, "indice-la-paz.html");
    const docs: Doc[] = [];
    for (const a of anchors($, base)) {
      const dec = decodeURIComponent(a.href);
      const m = /Documentos\/Informaci[oó]n publica\/(\d{4})\/\d+_(\w+)[ _]TRIMESTRE\/(.+)$/i.exec(dec);
      if (!m || !isAnnex19(m[3]!)) continue;
      const q = quarterOf(m[2]!);
      if (!q) continue;
      // El año de la carpeta a veces es el de publicación: manda el que dice el nombre del archivo.
      const inName = /\(\s*\d\w*\s*°?\s*trimestre\s*(\d{4})\s*\)/i.exec(m[3]!);
      const year = inName ? +inName[1]! : +m[1]!;
      if (year < FIRST_YEAR) continue;
      docs.push({ municipality: "La Paz", year, quarter: q, url: a.href, kind: "pdf" });
    }
    // Primero los PDF y después las planillas, para usar el primero que se pueda leer.
    return docs.sort((a, b) => Number(/\.xlsx?$/i.test(a.url)) - Number(/\.xlsx?$/i.test(b.url)));
  },

  /** Maipú: tabla con una columna por trimestre (T1..T4); solo están los dos últimos en el sitio. */
  async Maipú() {
    const base = "https://www.maipu.gob.ar/responsabilidad-fiscal/";
    const $ = await indexPage(base, "indice-maipu.html");
    const docs: Doc[] = [];
    $("table").each((_, table) => {
      const head = $(table)
        .find("thead th")
        .toArray()
        .map((th) => $(th).text().trim());
      if (head.join("|") !== "Anexo|Descripción|T1|T2|T3|T4") return;
      $(table)
        .find("tr")
        .each((_, tr) => {
          const tds = $(tr).find("td").toArray();
          if (!isAnnex19(`${$(tds[1]).text()} ${$(tds[0]).text().replace(/^/, "Anexo ")}`)) return;
          tds.slice(2).forEach((td, i) => {
            const href = $(td).find("a").attr("href");
            const up = href ? /uploads\/(\d{4})\//.exec(href) : null;
            if (href && up) docs.push({ municipality: "Maipú", year: +up[1]!, quarter: i + 1, url: abs(href, base), kind: "pdf" });
          });
        });
    });
    return docs;
  },

  /** Malargüe: una página por trimestre (/responsabilidad-fiscal-1-trimestre-2025/), que sale del mapa del sitio. */
  async Malargüe() {
    const docs: Doc[] = [];
    const pages = new Map<string, { period: Period; url: string }>();
    for (const n of [1, 2, 3]) {
      const xml = await (await get(`https://www.malargue.gov.ar/wp-sitemap-posts-post-${n}.xml`)).text();
      await sleep(800);
      for (const m of xml.matchAll(
        /<loc>(https:\/\/www\.malargue\.gov\.ar\/responsabilidad-fiscal-(\d)o?-trimestre-(\d{4})(-\d)?\/)<\/loc>/g,
      )) {
        // Hay páginas repetidas con sufijo -2: se prefiere la que no lo tiene.
        const key = `${m[3]}-${m[2]}`;
        if (+m[3]! >= FIRST_YEAR && (!pages.has(key) || !m[4])) pages.set(key, { period: { year: +m[3]!, quarter: +m[2]! }, url: m[1]! });
      }
    }
    for (const { period, url } of pages.values()) {
      const page = await subPage(url);
      const link = anchors(page, url).find((a) => /\.pdf$/i.test(a.href) && isAnnex19(a.href));
      if (link) docs.push({ municipality: "Malargüe", ...period, url: link.href, kind: "pdf" });
      else warn(`Malargüe ${period.year}-T${period.quarter}: la página no tiene el anexo 19`);
    }
    return docs;
  },

  /** Rivadavia: una entrada de blog por trimestre ("2026 – LRF 2º Trimestre"), paginada. */
  async Rivadavia() {
    const first = "https://rivadaviamendoza.gob.ar/transparencia/?page_id=8440";
    const docs: Doc[] = [];
    let url: string | null = first;
    for (let page = 1; url && page <= 8; page++) {
      const $ = await indexPage(url, `indice-rivadavia-${page}.html`);
      for (const a of anchors($, url)) {
        const m = /(\d{4})\s*[–-]\s*LRF\s*(\d)º\s*Trimestre/i.exec(a.text);
        if (!m || +m[1]! < FIRST_YEAR) continue;
        const post = await subPage(a.href);
        const link = anchors(post, a.href).find((l) => isAnnex19(l.text) && /\.pdf$/i.test(l.href));
        if (link) docs.push({ municipality: "Rivadavia", year: +m[1]!, quarter: +m[2]!, url: link.href, kind: "pdf" });
        else warn(`Rivadavia ${m[1]} T${m[2]}: la entrada no tiene el anexo 19`);
      }
      const older: { href: string } | undefined = anchors($, url).find((a) => /Entradas más antiguas/i.test(a.text));
      url = older ? older.href.replace(/&#038;/g, "&") : null;
    }
    return docs;
  },

  /** San Carlos: ZIP por trimestre con todos los anexos (PDF y, desde 2026, XLS). */
  async "San Carlos"() {
    const base = "https://sancarlos.gob.ar/responsabilidad-fiscal/";
    const $ = await indexPage(base, "indice-san-carlos.html");
    const docs: Doc[] = [];
    for (const a of anchors($, base)) {
      if (!/\.zip$/i.test(a.href)) continue;
      const p = periodFromLabel("", a.href);
      if (!p || p.year < FIRST_YEAR) continue;
      docs.push({ municipality: "San Carlos", ...p, url: a.href, kind: "zip" });
    }
    return docs;
  },

  /** San Rafael: una página por año; los anexos están en /archivos-muni/fiscal/AAAA_Nt/anexo19.pdf. */
  async "San Rafael"() {
    const base = "https://www.sanrafael.gov.ar/ley-resp-fiscal";
    const idx = await indexPage(base, "indice-san-rafael.html");
    const docs: Doc[] = [];
    const years = anchors(idx, base)
      .map((a) => ({ a, m: /ley-de-responsabilidad-fiscal-(\d{4})\/?$/.exec(a.href) }))
      .filter((x) => x.m && +x.m[1]! >= FIRST_YEAR);
    for (const { a } of years) {
      const page = await subPage(a.href);
      for (const l of anchors(page, a.href)) {
        const m = /\/fiscal\/(\d{4})_(\d)t\/anexo19\.pdf$/i.exec(l.href);
        if (m) docs.push({ municipality: "San Rafael", year: +m[1]!, quarter: +m[2]!, url: l.href, kind: "pdf" });
      }
    }
    return docs;
  },

  /** Santa Rosa: un Google Sites con una página por trimestre; los anexos son archivos de Drive. */
  async "Santa Rosa"() {
    const base = "https://sites.google.com/site/municipalidadsantarosamendoza/";
    const $ = await indexPage(base, "indice-santa-rosa.html");
    const docs: Doc[] = [];
    const seen = new Set<string>();
    for (const a of anchors($, base)) {
      if (!a.href.startsWith(base) || seen.has(a.href)) continue;
      const m = /(primer|segund|tercer|cuart)\w*\s*trimestre\s*(?:de\s*)?(20\d\d)\s*$/i.exec(a.text);
      if (!m || +m[2]! < FIRST_YEAR) continue;
      seen.add(a.href);
      const page = await subPage(a.href);
      const link = anchors(page, a.href).find((l) => /drive\.google\.com\/file\/d\//.test(l.href) && isAnnex19(l.text));
      if (link) docs.push({ municipality: "Santa Rosa", year: +m[2]!, quarter: quarterOf(m[1]!)!, url: link.href, kind: "drive" });
      else warn(`Santa Rosa ${a.text}: la página no tiene el anexo 19`);
    }
    return docs;
  },

  /** Tunuyán: ZIP por trimestre desde 2025. */
  async Tunuyán() {
    const base = "https://www.tunuyan.gov.ar/site/resp-fiscal/";
    const $ = await indexPage(base, "indice-tunuyan.html");
    const docs: Doc[] = [];
    for (const a of anchors($, base)) {
      if (!/\.zip$/i.test(a.href)) continue;
      const p = periodFromLabel("", a.href);
      if (p) docs.push({ municipality: "Tunuyán", ...p, url: a.href, kind: "zip" });
    }
    return docs;
  },

  /**
   * Tupungato: un PDF por trimestre con TODO el informe (más de 100 páginas, con deudores con nombre y CUIT en los
   * anexos 22 y 23). Los rótulos del listado a veces no coinciden con el archivo: el período se toma del anexo.
   */
  async Tupungato() {
    const base = "https://tupungato.gov.ar/?page_id=3094";
    const $ = await indexPage(base, "indice-tupungato.html");
    const docs: Doc[] = [];
    const seen = new Set<string>();
    for (const a of anchors($, base)) {
      if (!/\.pdf$/i.test(a.href) || !/trimestre/i.test(a.text) || /programaci/i.test(a.text) || seen.has(a.href)) continue;
      const y = /(20[12]\d)/.exec(a.text) ?? /(20[12]\d)/.exec(a.href);
      if (y && +y[1]! < 2020) continue;
      seen.add(a.href);
      docs.push({ municipality: "Tupungato", year: 0, quarter: 0, url: a.href, kind: "bigpdf" });
    }
    return docs;
  },

  /** Lavalle: un formulario (POST `acuerdo=AAAAT`) devuelve los anexos de cada trimestre; el PDF es `Anexo 19(AAAA-T).pdf`. */
  async Lavalle() {
    const base = "https://lavallemendoza.gob.ar/old/acuerdo3949";
    const $ = await indexPage(base, "indice-lavalle.html");
    const docs: Doc[] = [];
    const periods = $("select#acuerdo option")
      .toArray()
      .map((o) => /^(\d{4})([1-4])$/.exec($(o).attr("value") ?? ""))
      .filter((m): m is RegExpExecArray => !!m && +m[1]! >= FIRST_YEAR);
    for (const m of periods) {
      const resp = await get(base, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `acuerdo=${m[1]}${m[2]}`,
      });
      const page = cheerio.load(await resp.text());
      await sleep(800);
      const link = anchors(page, base).find((a) => /\.pdf$/i.test(a.href) && isAnnex19(a.href));
      if (link) docs.push({ municipality: "Lavalle", year: +m[1]!, quarter: +m[2]!, url: link.href, kind: "pdf" });
      else warn(`Lavalle ${m[1]}-T${m[2]}: el listado no tiene el anexo 19`);
    }
    return docs;
  },

  /**
   * San Martín: Hacienda publica un Excel por trimestre con todos los anexos en web.sanmartinmza.gob.ar/hacienda/
   * (el índice de la carpeta da 403 y no se encontró la página que los enlaza). Se prueba el patrón del nombre.
   */
  async "San Martín"() {
    const base = "https://web.sanmartinmza.gob.ar/hacienda/";
    const docs: Doc[] = [];
    const lastYear = new Date().getFullYear();
    for (let year = FIRST_YEAR; year <= lastYear; year++) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        for (const ext of year < 2020 ? ["xls", "xlsx"] : ["xlsx", "xls"]) {
          const url = `${base}ley_resp_${String(year).slice(2)}_${quarter}.${ext}`;
          const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
          await sleep(400);
          if (head.ok) {
            docs.push({ municipality: "San Martín", year, quarter, url, kind: "workbook" });
            break;
          }
        }
      }
    }
    return docs;
  },

  /** Luján de Cuyo: la página muestra solo el último trimestre, con los anexos en Drive. */
  async "Luján de Cuyo"() {
    const base = "https://lujandecuyo.gob.ar/responsabilidad-fiscal/";
    const $ = await indexPage(base, "indice-lujan-de-cuyo.html");
    const docs: Doc[] = [];
    const text = $("body").html() ?? "";
    // Cada anexo es un bloque "Anexo N: título" seguido de su botón "Descargar Anexo".
    for (const m of text.matchAll(/Anexo\s*19\s*:[^<]*<[\s\S]*?href="(https:\/\/drive\.google\.com\/file\/d\/[^"]+)"/gi)) {
      docs.push({ municipality: "Luján de Cuyo", year: 0, quarter: 0, url: m[1]!, kind: "drive" });
      break;
    }
    return docs;
  },
};

/** Municipios sin Anexo 19 publicado en ningún sitio oficial que se haya encontrado. */
export const NOT_PUBLISHED: Record<string, string> = {
  "Godoy Cruz": "los anexos están en un sistema (webapps.godoycruz.gob.ar/responsabilidadfiscal) que no expone enlaces de descarga",
  "Las Heras": "los anexos están en una aplicación Oracle APEX (web6.lasheras.gob.ar/apex) que no se puede recorrer sin sesión",
};

// ---------------------------------------------------------------- descarga y archivo

interface ManifestEntry {
  filename: string;
  path: string;
  url: string;
}

async function manifestByUrl(): Promise<Map<string, ManifestEntry>> {
  const file = join(RAW_DIR, SOURCE, "manifest.jsonl");
  const map = new Map<string, ManifestEntry>();
  if (!existsSync(file)) return map;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line) as ManifestEntry;
    if (/anexo19\./.test(e.filename)) map.set(e.url, e);
  }
  return map;
}

const driveUrl = (url: string) => {
  const id = /\/file\/d\/([^/]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
};

function magicExt(bytes: Uint8Array): string {
  const head = Array.from(bytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (head === "25504446") return "pdf";
  if (head === "d0cf11e0") return "xls";
  if (head === "504b0304") return "xlsx";
  return "bin";
}

/** Los textos de la página del anexo 19 de un PDF grande. */
async function annexPageItems(bytes: Uint8Array): Promise<{ page: number; items: Item[] } | null> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = await pageItems(pdf, n);
    const text = items.map((i) => i.s).join(" ");
    // La carta de presentación (página 1) también nombra el anexo 19: se pide que la página tenga la fila de totales.
    if (/ANEXO\s*:?\s*19\b/i.test(text) && /PLANTA DE PERSONAL/i.test(text) && pickTotals(pdfRows(items))) return { page: n, items };
  }
  return null;
}

/** Baja el documento y archiva lo que corresponde. Devuelve la entrada del manifiesto o null si no se pudo. */
async function download(doc: Doc, manifest: Map<string, ManifestEntry>): Promise<ManifestEntry | null> {
  const known = manifest.get(doc.url);
  if (known) return known;
  const resp = await get(doc.kind === "drive" ? driveUrl(doc.url) : doc.url);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  await sleep(1000);
  let period: Period | null = doc.year ? { year: doc.year, quarter: doc.quarter } : null;
  let out: { bytes: Uint8Array; ext: string };

  if (doc.kind === "zip") {
    if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72) {
      warn(`${doc.municipality} ${doc.url}: el archivo es RAR, no ZIP (no hay con qué abrirlo)`);
      return null;
    }
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      warn(`${doc.municipality} ${doc.url}: ZIP dañado en el sitio del municipio (${bytes.length} bytes)`);
      return null;
    }
    const entries = Object.entries(files).filter(
      ([n]) => !n.startsWith("__MACOSX") && /\.(pdf|xlsx?)$/i.test(n) && isAnnex19(n.split("/").pop()!),
    );
    if (!entries.length) {
      warn(`${doc.municipality} ${doc.url}: el ZIP no trae un anexo 19`);
      return null;
    }
    entries.sort((a, b) => Number(/\.pdf$/i.test(b[0])) - Number(/\.pdf$/i.test(a[0])));
    const [name, data] = entries[0]!;
    out = { bytes: data, ext: name.split(".").pop()!.toLowerCase() };
  } else if (doc.kind === "workbook") {
    // Un Excel con todos los anexos: se guarda solo la hoja "ANEXO 19" (los anexos 22 y 23 traen datos de contribuyentes).
    const wb = XLSX.read(bytes, { type: "array" });
    const name = wb.SheetNames.find((n) => /^anexo\s*19$/i.test(n.trim()));
    if (!name) {
      warn(`${doc.municipality} ${doc.url}: el Excel no tiene la hoja del anexo 19`);
      return null;
    }
    const sheet = wb.Sheets[name]!;
    const text = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }).flat().join(" ");
    const y = /EJERCICIO\s*:?\s*(\d{4})/i.exec(text)?.[1];
    const q = /TRIMESTRE\s*:?\s*([1-4])\b/i.exec(text)?.[1];
    if ((y && +y !== doc.year) || (q && +q !== doc.quarter)) {
      warn(`${doc.municipality} ${doc.url}: la hoja dice ejercicio ${y} trimestre ${q}, no ${doc.year}-T${doc.quarter}; no se usa`);
      return null;
    }
    const single = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(single, sheet, "ANEXO 19");
    out = { bytes: new Uint8Array(XLSX.write(single, { type: "array", bookType: "xlsx" }) as ArrayBuffer), ext: "xlsx" };
  } else if (doc.kind === "bigpdf") {
    const found = await annexPageItems(bytes);
    if (!found) {
      warn(`${doc.municipality} ${doc.url}: no se encontró la página del anexo 19 (¿PDF escaneado?)`);
      return null;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const json = JSON.stringify({
      url: doc.url,
      sha256_original: sha256,
      bytes_original: bytes.length,
      page: found.page,
      items: found.items.map((i) => ({
        x: Math.round(i.x * 100) / 100,
        y: Math.round(i.y * 100) / 100,
        s: i.s,
        h: Math.round((i.h ?? 0) * 100) / 100,
      })),
    });
    out = { bytes: new TextEncoder().encode(json), ext: "json" };
    period = period ?? periodFromItems(found.items);
  } else {
    const ext =
      doc.kind === "drive"
        ? magicExt(bytes)
        : /\.(xlsx?|pdf)$/i.test(doc.url.split("?")[0]!)
          ? doc.url.split("?")[0]!.split(".").pop()!.toLowerCase()
          : magicExt(bytes);
    if (ext === "bin") {
      warn(`${doc.municipality} ${doc.url}: el archivo no es PDF ni planilla`);
      return null;
    }
    out = { bytes, ext };
  }

  if (!period) {
    const items = out.ext === "pdf" ? (await allPageItems(out.bytes)).flat() : out.ext === "json" ? [] : [];
    period = periodFromItems(items);
  }
  if (!period) {
    warn(`${doc.municipality} ${doc.url}: no se pudo determinar el período`);
    return null;
  }
  const filename = docName(doc.municipality, period, out.ext);
  const path = await archive(SOURCE, filename, out.bytes, { url: doc.url });
  const entry: ManifestEntry = {
    filename,
    path: path ? path.replace(`${ROOT}/`, "") : ((await latestRaw(SOURCE, filename)) ?? "").replace(`${ROOT}/`, ""),
    url: doc.url,
  };
  manifest.set(doc.url, entry);
  return entry;
}

async function allPageItems(bytes: Uint8Array): Promise<Item[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: Item[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) pages.push(await pageItems(pdf, n));
  return pages;
}

// ---------------------------------------------------------------- lectura del anexo archivado

interface Parsed {
  cells: number[];
  how: string;
  year: number | null;
  note: string;
}

async function parseArchived(entry: ManifestEntry): Promise<Parsed | { error: string }> {
  const bytes = new Uint8Array(await readRaw(join(ROOT, entry.path)));
  const ext = entry.filename.split(".").pop()!;
  let rows: Tok[][][] = [];
  let docYear: number | null = null;
  const lenient = entry.filename.startsWith("lavalle-");
  if (ext === "json") {
    const items = (JSON.parse(new TextDecoder().decode(bytes)) as { items: Item[] }).items;
    rows = pdfRows(items);
    docYear = yearFromItems(items);
  } else if (ext === "pdf") {
    // Los anexos largos (Capital: 8 páginas con el detalle por escalafón) traen los totales recién en la última página;
    // en uno de una sola página, la fila de totales o la única fila de datos.
    const pages = await allPageItems(bytes);
    const picks = pages.map((items) => ({ items, pick: pickTotals(pdfRows(items), lenient) })).filter((p) => p.pick);
    const withTotals = picks.filter((p) => p.pick!.how === "totales");
    // Sin fila de totales vale la página con la única fila de datos. En Lavalle el PDF trae una segunda página vacía o
    // la fila partida en otra página (2020); en los demás, solo un documento de una página.
    const chosen = withTotals.length
      ? withTotals[withTotals.length - 1]
      : (lenient ? picks.length === 1 : pages.length === 1)
        ? picks[0]
        : undefined;
    if (chosen) {
      rows = pdfRows(chosen.items);
      docYear = yearFromItems(chosen.items) ?? yearFromItems(pages[0]!);
    } else if (picks.length) return { error: `el anexo tiene ${pages.length} páginas y ninguna fila de totales` };
  } else {
    rows = sheetRows(bytes);
  }
  // `rows` ya es una lista de alternativas (horizontal y rotada, o una por hoja).
  const picked = pickTotals(rows, lenient);
  if (!picked) return { error: "no se encontró la fila de totales" };
  const check = checkTotals(picked.cells);
  if (check.error) return { error: `no cuadra (${check.error})` };
  const sumNote = picked.how.startsWith("suma")
    ? "El documento no trae la fila de totales completa: las cifras son la suma de sus filas (verificar contra el original). "
    : "";
  return { ...picked, year: docYear, note: `${sumNote}${check.note ?? ""}`.trim() };
}

const TYPES = ["permanente", "temporaria", "total_planta", "horas_catedra", "contratos_locacion"] as const;

function annexRows(m: Municipio, p: Period, cells: number[], url: string, note: string): Row[] {
  const rows: Row[] = [];
  TYPES.forEach((tipo, i) => {
    const [count, amount] = [cells[i * 2]!, cells[i * 2 + 1]!];
    if (tipo === "horas_catedra" && !count && !amount) return;
    rows.push({
      municipio: m,
      anio: p.year,
      trimestre: p.quarter,
      fecha_corte: quarterEnd(p.year, p.quarter),
      tipo_personal: tipo,
      cantidad: count,
      importe_acumulado: Math.round(amount * 100) / 100,
      fuente: "Ley de Responsabilidad Fiscal, Anexo 19 (sitio del municipio)",
      fuente_url: url,
      observacion: tipo === "total_planta" || tipo === "permanente" || tipo === "temporaria" ? note : "",
    });
  });
  return rows;
}

// ---------------------------------------------------------------- Capital: serie mensual

const CKAN = "https://datos.ciudaddemendoza.gob.ar/api/3/action/package_show?id=comparacion-personal-de-planta-y-locacion";

async function capitalMonthly(): Promise<Row[]> {
  const pkg = (await (await get(CKAN)).json()) as { result: { resources: { name: string; url: string }[] } };
  await archive(SOURCE, "capital-comparacion-planta-locacion.json", JSON.stringify(pkg), { url: CKAN });
  const rows: Row[] = [];
  for (const r of pkg.result.resources) {
    if (!/\.pdf$/i.test(r.url)) continue;
    const filename = `capital-${r.url.split("/").pop()}`;
    const known = await latestRaw(SOURCE, filename);
    let bytes: Uint8Array;
    if (known) bytes = new Uint8Array(await readRaw(known));
    else {
      bytes = new Uint8Array(await (await get(r.url)).arrayBuffer());
      await archive(SOURCE, filename, bytes, { url: r.url });
      await sleep(1000);
    }
    // Algunas páginas cortan la última columna: el "$" del último mes aparece como primera cifra de la página siguiente.
    const state: { orphan: Row | null } = { orphan: null };
    for (const items of await allPageItems(bytes)) {
      const months = items
        .filter((i) => /^\d{2}\/\d{2}$/.test(i.s))
        .sort((a, b) => a.x - b.x)
        .map((i) => i.s);
      // Cada página tiene entre 1 y 5 meses, de a cuatro columnas (planta, locaciones, total y $). La última fila con
      // cifras de todos los meses es "Total con H.C.D.".
      const need = months.length * 4;
      const numRows = rowsOf(items, "h")
        .map((row) => row.filter((t) => t.num !== null).map((t) => t.num!))
        .filter((n) => n.length >= need - 1);
      const total = numRows[numRows.length - 1];
      if (!total || !months.length) continue;
      let nums = total;
      if (state.orphan && nums.length === need + 1) {
        state.orphan.gasto_mensual = nums[0]!;
        rows.push(state.orphan);
        nums = nums.slice(1);
      } else if (nums.length === need + 1) nums = nums.slice(1);
      state.orphan = null;
      months.forEach((mm, i) => {
        const [mes, yy] = mm.split("/").map(Number) as [number, number];
        const cols = nums.slice(-Math.min(need, nums.length)).slice(i * 4, i * 4 + 4);
        const [planta, locaciones, suma] = cols as [number, number, number];
        if (cols.length < 3 || planta + locaciones !== suma) {
          warn(`Capital ${mm}: planta + locaciones no suma el total`);
          return;
        }
        const year = 2000 + yy;
        const row: Row = {
          municipio: "Capital",
          anio: year,
          mes,
          fecha_corte: `${year}-${String(mes).padStart(2, "0")}-${new Date(year, mes, 0).getDate()}`,
          planta,
          locaciones,
          total: suma,
          gasto_mensual: cols[3] ?? "",
          fuente: "Municipalidad de la Ciudad de Mendoza, datos abiertos: Comparación personal de planta y locación",
          fuente_url: r.url,
        };
        if (cols.length === 3) state.orphan = row;
        else rows.push(row);
      });
    }
    if (state.orphan) rows.push(state.orphan);
  }
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const key = `${r.anio}-${r.mes}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => +a.anio! * 100 + +a.mes! - (+b.anio! * 100 + +b.mes!));
}

// ---------------------------------------------------------------- corrida

export async function run(_args: string[]): Promise<void> {
  const manifest = await manifestByUrl();
  const out: Row[] = [];
  const failures: string[] = [];
  const covered = new Map<string, Set<string>>();

  for (const [name, discover] of Object.entries(DISCOVERERS)) {
    const municipality = normalizeMunicipio(name);
    if (!municipality) throw new Error(`municipio desconocido: ${name}`);
    let docs: Doc[];
    try {
      docs = await discover();
    } catch (err) {
      warn(`${name}: no se pudo leer el listado (${(err as Error).message})`);
      failures.push(name);
      continue;
    }
    docs = docs.filter((d) => !d.year || d.year >= FIRST_YEAR);
    console.log(`${name}: ${docs.length} documentos en el listado`);
    const done = new Set<string>();
    const results: { period: Period; cells: number[]; url: string; note: string }[] = [];
    for (const doc of docs) {
      if (doc.year && done.has(periodKey(doc.year, doc.quarter))) continue;
      let entry: ManifestEntry | null = null;
      try {
        entry = await download(doc, manifest);
      } catch (err) {
        warn(`${name} ${doc.url}: ${(err as Error).message}`);
        continue;
      }
      if (!entry) continue;
      const m = /-(\d{4})-T(\d)-anexo19\./.exec(entry.filename)!;
      const period: Period = { year: +m[1]!, quarter: +m[2]! };
      const key = periodKey(period.year, period.quarter);
      if (done.has(key)) continue;
      const parsed = await parseArchived(entry);
      if ("error" in parsed) {
        warn(`${name} ${key}: ${parsed.error} (${doc.url})`);
        continue;
      }
      if (parsed.year && parsed.year !== period.year) {
        // Pasa cuando la página del trimestre enlaza el archivo del año anterior (Guaymallén 2025-T4).
        warn(`${name} ${key}: el anexo dice ejercicio ${parsed.year}, no se usa (${doc.url})`);
        continue;
      }
      done.add(key);
      results.push({ period, cells: parsed.cells, url: doc.url, note: parsed.note });
    }
    results.sort((a, b) => a.period.year * 4 + a.period.quarter - (b.period.year * 4 + b.period.quarter));
    results.forEach((r, i) => {
      const prev = results[i - 1];
      // Un acumulado igual al del trimestre anterior es casi seguro un archivo subido dos veces.
      if (
        prev &&
        prev.period.year * 4 + prev.period.quarter + 1 === r.period.year * 4 + r.period.quarter &&
        r.cells.some((c) => c !== 0) &&
        r.cells.every((c, k) => c === prev.cells[k])
      ) {
        r.note =
          `${r.note} Las cifras son idénticas a las del trimestre anterior: posible archivo repetido en el sitio del municipio.`.trim();
        warn(`${name} ${periodKey(r.period.year, r.period.quarter)}: cifras idénticas a las del trimestre anterior`);
      }
      out.push(...annexRows(municipality, r.period, r.cells, r.url, r.note));
    });
    covered.set(name, done);
  }
  for (const [name, why] of Object.entries(NOT_PUBLISHED)) console.log(`${name}: sin anexo 19 publicado (${why})`);

  const order = new Map<string, number>(TYPES.map((t, i) => [t, i]));
  out.sort(
    (a, b) =>
      String(a.municipio).localeCompare(String(b.municipio), "es") ||
      +a.anio! - +b.anio! ||
      +a.trimestre! - +b.trimestre! ||
      order.get(String(a.tipo_personal))! - order.get(String(b.tipo_personal))!,
  );
  await writeProcessed(SOURCE, "personal.csv", out, [
    "municipio",
    "anio",
    "trimestre",
    "fecha_corte",
    "tipo_personal",
    "cantidad",
    "importe_acumulado",
    "fuente",
    "fuente_url",
    "observacion",
  ]);
  console.log(`personal.csv: ${out.length} filas, ${new Set(out.map((r) => r.municipio)).size} municipios`);

  try {
    const monthly = await capitalMonthly();
    await writeProcessed(SOURCE, "personal_capital_mensual.csv", monthly, [
      "municipio",
      "anio",
      "mes",
      "fecha_corte",
      "planta",
      "locaciones",
      "total",
      "gasto_mensual",
      "fuente",
      "fuente_url",
    ]);
    console.log(`personal_capital_mensual.csv: ${monthly.length} filas`);
  } catch (err) {
    warn(`Capital mensual: ${(err as Error).message}`);
  }
  if (failures.length) console.log(`Listados con error: ${failures.join(", ")}`);
}
