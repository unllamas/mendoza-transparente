/**
 * Ley de Responsabilidad Fiscal de Mendoza (Ministerio de Hacienda y Finanzas): personal y costo por organismo.
 *
 * Fuente: https://sitios.mendoza.gob.ar/haciendayfinanzas/ley-de-responsabilidad-fiscal/
 * La página lista un informe por trimestre (hay uno de la Subsecretaría de Hacienda y otro de la Caja de Seguro
 * Mutual, que se ignora). Cada informe trae ZIP con PDF; de ahí se toman dos anexos:
 *   - Anexo 19 (LRFA19_<trimestre>_<aa>.zip, a veces un PDF suelto): "Detalle de la planta de personal y contratos
 *     de locación". Una fila por organismo con cargos y horas cátedra de planta permanente y temporaria, cantidad
 *     de contratados de locación, y los importes liquidados.
 *   - Anexo 20 (LRFA20_<trimestre>_<aa>.zip, un PDF por grupo): "Altas y bajas de contratos de locación de
 *     servicio" por organismo, con código de jurisdicción y unidad.
 *
 * Salidas (data/processed/lrf-personal/):
 *   - personal.csv: una fila por (anio, trimestre, grupo, organismo, tipo_personal), con tipo_personal en
 *     permanente | temporaria | contratos_locacion. Las filas de subtotal de grupo y el TOTALES no se incluyen
 *     (se recalculan) y se usan solo para validar. Las filas todo en cero se omiten.
 *   - contratos.csv: una fila por (anio, trimestre, organismo): contratados de locación al inicio y al fin del
 *     trimestre, altas, bajas e importe, con los códigos de jurisdicción y unidad que trae el anexo 20. Ojo: acá
 *     el importe es DEL TRIMESTRE (no acumulado como en el anexo 19); se comprobó que acumulado de T2 menos
 *     acumulado de T1 del anexo 19 coincide con el importe de contratos del anexo 20 de T2.
 *
 * Unidades y decisiones:
 *   - Los importes son pesos nominales, ACUMULADOS desde enero hasta el fin del trimestre (no mensuales ni
 *     trimestrales): para obtener lo del trimestre hay que restar el acumulado del trimestre anterior (en T1
 *     coincide). Son lo "liquidado" (SIDICO), no necesariamente lo pagado.
 *   - "cantidad" son cargos (SIGNOS), no personas: una persona con dos cargos cuenta dos. En
 *     contratos_locacion son contratados. "horas_catedra" son horas de docentes (solo educación).
 *   - Un guion en el importe de un organismo con cargos significa "no informado" (por ejemplo OSEP, que informa
 *     aparte): se deja vacío, no cero. Algunos organismos (Poder Legislativo) informan importe y no cargos.
 *   - Los nombres de organismo quedan como los imprime el PDF; cambian entre gestiones (por ejemplo "Dcción.
 *     Gral. de Escuelas" y "Min. Educación, Cultura, Infancias y DGE"). La unificación va en otra tabla.
 *   - No se publican nombres ni datos personales: no hay nada que redactar.
 *   - Los archivos de trimestres anteriores no se vuelven a descargar; solo se consultan las páginas de los
 *     trimestres que todavía no tienen ambos anexos y de los dos últimos.
 */

import { unzipSync } from "fflate";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { archive, fetchAndArchive, get, RAW_DIR, ROOT, readRaw, writeProcessed, type Row } from "@mt/core";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "lrf-personal";
const INDEX = "https://sitios.mendoza.gob.ar/haciendayfinanzas/ley-de-responsabilidad-fiscal/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- descarga

interface Report {
  year: number;
  quarter: number;
  page: string;
}

const periodKey = (year: number, quarter: number) => `${year}-T${quarter}`;
const quarterEnd = (year: number, quarter: number) => ["03-31", "06-30", "09-30", "12-31"][quarter - 1]!.replace(/^/, `${year}-`);

async function listReports(): Promise<Report[]> {
  const html = await (await get(INDEX)).text();
  await archive(SOURCE, "indice.html", html, { url: INDEX });
  const $ = cheerio.load(html);
  const reports: Report[] = [];
  $("#tabla-entradas a").each((_, a) => {
    const title = $(a).text().replace(/\s+/g, " ");
    if (!/subsecretar/i.test(title)) return;
    const m = /(\d{4})\s*[–-]\s*(\d)\s*°\s*trimestre/i.exec(title);
    if (!m) {
      console.log(`::warning title=lrf-personal::título sin año y trimestre: ${title}`);
      return;
    }
    reports.push({ year: +m[1]!, quarter: +m[2]!, page: $(a).attr("href")! });
  });
  return reports.sort((a, b) => b.year * 10 + b.quarter - (a.year * 10 + a.quarter));
}

interface ManifestFile {
  filename: string;
  url: string;
}

async function manifestFiles(): Promise<ManifestFile[]> {
  const path = join(RAW_DIR, SOURCE, "manifest.jsonl");
  if (!existsSync(path)) return [];
  const latest = new Map<string, ManifestFile>();
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line) as ManifestFile & { path: string };
    if (/^LRFA(19|20)_\d_\d\d/.test(e.filename)) latest.set(e.filename, e);
  }
  return [...latest.values()];
}

/** Año y trimestre de un nombre como LRFA19_2_26.zip. */
function periodOf(filename: string): { annex: 19 | 20; year: number; quarter: number } {
  const m = /^LRFA(19|20)_(\d)_(\d\d)/.exec(filename)!;
  return { annex: +m[1]! as 19 | 20, year: 2000 + +m[3]!, quarter: +m[2]! };
}

async function download(): Promise<void> {
  const reports = await listReports();
  console.log(`${reports.length} informes de la Subsecretaría de Hacienda`);
  const have = new Set((await manifestFiles()).map((f) => `${periodKey(periodOf(f.filename).year, periodOf(f.filename).quarter)}:${periodOf(f.filename).annex}`));

  for (const [i, r] of reports.entries()) {
    const key = periodKey(r.year, r.quarter);
    if (i >= 2 && have.has(`${key}:19`) && have.has(`${key}:20`)) continue;
    await sleep(1000);
    const html = await (await get(r.page)).text();
    const links = $pageLinks(html);
    if (i < 2) await archive(SOURCE, `pagina_${r.year}_T${r.quarter}.html`, html, { url: r.page });
    for (const href of links) {
      const filename = href.split("/").pop()!;
      const p = periodOf(filename);
      if (p.year !== r.year || p.quarter !== r.quarter) {
        console.log(`::warning title=lrf-personal::${filename} en la página de ${key}: período distinto, se ignora`);
        continue;
      }
      // Los informes de trimestres anteriores no cambian; los dos últimos se vuelven a pedir.
      if (i >= 2 && have.has(`${key}:${p.annex}`)) continue;
      await sleep(1500);
      try {
        const saved = await fetchAndArchive(SOURCE, href, filename);
        console.log(`  ${saved ? "nuevo" : "sin cambios"}: ${filename}`);
      } catch (err) {
        // El sitio tiene links rotos (S3 devuelve 403 si el objeto no existe).
        console.log(`::warning title=lrf-personal::no se pudo bajar ${filename} (${String(err).slice(0, 60)}): el anexo ${p.annex} de ${key} falta`);
      }
    }
  }
}

function $pageLinks(html: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (/\/LRFA(19|20)_\d_\d\d[^/]*\.(zip|pdf)$/i.test(href)) out.add(href);
  });
  return [...out];
}

// ---------------------------------------------------------------- lectura de PDF

/** Líneas de texto de un PDF, agrupadas por posición vertical y ordenadas de izquierda a derecha. */
async function pdfLines(bytes: Uint8Array): Promise<string[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const lines: string[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    // Las cifras de una misma fila pueden variar 1 punto en vertical: se agrupa con tolerancia.
    const items = (content.items as { str: string; transform: number[] }[])
      .flatMap((it) => {
        // Un PDF (anexo 20 de 2019 T1, cuentas especiales) trae el texto con la tipografía desplazada 29 códigos.
        const raw = /\u0003/.test(it.str) ? it.str.replace(/[\u0001-\u007f]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 29)) : it.str;
        const parts = raw === it.str ? [raw.trim()] : raw.trim().split(/\s+/);
        return parts.map((s) => ({ x: it.transform[4]!, y: it.transform[5]!, s }));
      })
      .filter((it) => it.s)
      .sort((a, b) => b.y - a.y);
    let current: typeof items = [];
    const flush = () => {
      if (current.length) lines.push(current.sort((a, b) => a.x - b.x).map((t) => t.s));
      current = [];
    };
    for (const it of items) {
      if (current.length && current[0]!.y - it.y > 3) flush();
      current.push(it);
    }
    flush();
  }
  return lines;
}

/** Líneas de texto de un PDF en el orden de lectura que da unpdf (más fiel que la posición en los anexos con columnas). */
async function pdfTextLines(bytes: Uint8Array): Promise<string[][]> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
  return text.split("\n").map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((t) => t.length);
}

/** Los PDF de un archivo archivado (ZIP con PDF adentro, o PDF suelto). */
async function pdfsOf(filename: string): Promise<{ name: string; bytes: Uint8Array }[]> {
  const buf = new Uint8Array(await readRaw(join(ROOT, await rawPath(filename))));
  if (/\.pdf$/i.test(filename)) return [{ name: filename, bytes: buf }];
  return Object.entries(unzipSync(buf))
    .filter(([n]) => /\.pdf$/i.test(n) && !n.startsWith("__MACOSX"))
    .map(([name, bytes]) => ({ name, bytes }));
}

async function rawPath(filename: string): Promise<string> {
  const text = await readFile(join(RAW_DIR, SOURCE, "manifest.jsonl"), "utf8");
  let last = "";
  for (const line of text.split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line) as { filename: string; path: string };
    if (e.filename === filename) last = e.path;
  }
  return last;
}

const NUM = /^(?:-|\d[\d.]*(?:,\d+)?)$/;

/** "1.234,56" → 1234.56; "5626739118" → 5626739118; "-" → 0. */
function parseNum(s: string): number {
  if (s === "-") return 0;
  return Number(s.replace(/\./g, "").replace(",", "."));
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- anexo 19

const GROUPS = new Map<string, string>([
  ["ADMINISTRACION CENTRAL", "Administración central"],
  ["ORGANISMO DESCENTRALIZADOS", "Organismos descentralizados"],
  ["ORGANISMOS DESCENTRALIZADOS", "Organismos descentralizados"],
  ["CUENTAS ESPECIALES", "Cuentas especiales"],
  ["OTRAS ENTIDADES", "Otras entidades"],
]);

/** Las 11 cifras de una fila: permanente (cargos, horas, importe), temporaria, total y contratos (cantidad, importe). */
type Cells = number[];

interface Annex19 {
  rows: { group: string; name: string; cells: Cells; raw: string[] }[];
  groupTotals: Map<string, Cells>;
  totals: Cells | null;
  year: number | null;
  quarter: number | null;
  dateQuarter: number | null;
  unmatched: string[];
}

function parseAnnex19(lines: string[][]): Annex19 {
  const out: Annex19 = { rows: [], groupTotals: new Map(), totals: null, year: null, quarter: null, dateQuarter: null, unmatched: [] };
  let group = "";
  for (const line of lines) {
    // "Ente Mendoza Turismo Ley 8845": el número de la ley no es una cifra.
    const toks = line.map((t, i) => (t === "8845" && line[i - 1] === "Ley" ? "Ley_8845" : t)).filter((t, i, a) => !(t === "Ley" && a[i + 1] === "Ley_8845"));
    const text = toks.join(" ");
    const y = /EJERCICIO:\s*(\d{4})/.exec(text);
    if (y) out.year = +y[1]!;
    // El rótulo "n TRIMESTRE" a veces está mal (el PDF de 2021 T2 dice "1 TRIMESTRE"): se guarda también el
    // trimestre de la fecha de corte, que solo es confiable cuando va junto a "AL FIN DE CADA TRIMESTRE".
    const d = /FIN DE CADA TRIMESTRE\s*(\d{2})\/(\d{2})\/(\d{2,4})/.exec(text);
    if (d) out.dateQuarter = Math.ceil(+d[2]! / 3);
    const q = /Trimestre:\s*(\d)/i.exec(text) ?? /^(\d)\s*TRIMESTRE/i.exec(text) ?? /(\d)\s*TRIMESTRE\b/i.exec(text);
    if (q && !out.quarter) out.quarter = +q[1]!;

    // Cifras = las últimas 11 fichas numéricas; el resto es el nombre.
    let k = toks.length;
    while (k > 0 && NUM.test(toks[k - 1]!)) k--;
    const nums = toks.slice(k);
    // Filas con celdas vacías: sin cantidad de contratos (10 cifras) o con todo en cero y solo contratos (7 cifras).
    if (nums.length === 10 || nums.length === 7) {
      // 10 cifras: o falta la cantidad de contratos (la última es "-") o falta el importe de la planta temporaria.
      if (nums.length === 10) nums.splice(0, 10, ...(nums[9] === "-" ? [...nums.slice(0, 9), "0", "-"] : [...nums.slice(0, 5), "0", ...nums.slice(5)]));
      else if (nums.slice(0, 5).every((v) => parseNum(v) === 0)) nums.splice(0, 7, ...nums.slice(0, 5), "0", "0", "0", "0", nums[5]!, nums[6]!);
    }
    if (nums.length < 11) {
      if (/\d{2}\/\d{2}\/\d{2,4}/.test(text) || /Fuentes|SIGNOS|SIDICO|OSEP|Nota|REPARTICI|ANEXO|IMPORTES|Importe|al fin|PLANTA|CONTRATOS|PERMANENTE|ORGANISMO$|Cargos|Trimestre|EJERCICIO|^\d TRIMESTRE/i.test(text) || nums.length === 0) continue;
      out.unmatched.push(text);
      continue;
    }
    // Si el nombre termina en un número ("Ley 8845"), quedó pegado a las cifras: se le devuelve.
    const extra = nums.length - 11;
    const name = clean([...toks.slice(0, k), ...nums.slice(0, extra)].join(" ").replace("Ley_8845", "Ley 8845"));
    const cells = nums.slice(extra).map(parseNum);
    const raw = nums.slice(extra);
    if (/^TOTALES$/i.test(name)) {
      out.totals = cells;
      continue;
    }
    const g = GROUPS.get(name.toUpperCase());
    if (g) {
      group = g;
      out.groupTotals.set(g, cells);
      continue;
    }
    if (!group) {
      out.unmatched.push(text);
      continue;
    }
    out.rows.push({ group, name, cells, raw });
  }
  return out;
}

const TYPES = [
  { tipo: "permanente", i: 0 },
  { tipo: "temporaria", i: 3 },
] as const;

function annex19Rows(year: number, quarter: number, a: Annex19): Row[] {
  const rows: Row[] = [];
  for (const r of a.rows) {
    const base = { anio: year, trimestre: quarter, fecha_corte: quarterEnd(year, quarter), grupo: r.group, organismo: r.name };
    for (const t of TYPES) {
      const [count, hours, amount] = [r.cells[t.i]!, r.cells[t.i + 1]!, r.cells[t.i + 2]!];
      if (!count && !hours && !amount) continue;
      // Importe "-" o 0 con cargos: no informado, no cero.
      const reported = !(amount === 0 && (count > 0 || hours > 0));
      rows.push({ ...base, tipo_personal: t.tipo, cantidad: count, horas_catedra: hours, importe: reported ? round2(amount) : "" });
    }
    const [count, amount] = [r.cells[9]!, r.cells[10]!];
    if (count || amount) rows.push({ ...base, tipo_personal: "contratos_locacion", cantidad: count, horas_catedra: 0, importe: round2(amount) });
  }
  return rows;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- anexo 20

const CHARACTER_GROUP: Record<string, string> = {
  "1": "Administración central",
  "2": "Organismos descentralizados",
  "3": "Cuentas especiales",
  "5": "Otras entidades",
};

interface ContractRow {
  group: string;
  code: string;
  jurisdiction: string;
  unit: string;
  name: string;
  start: number;
  hires: number;
  exits: number;
  end: number;
  amount: number;
}

function parseAnnex20(lines: string[][], file: string): { rows: ContractRow[]; total: number[] | null; year: number | null; quarter: number | null; unmatched: string[] } {
  const rows: ContractRow[] = [];
  const unmatched: string[] = [];
  let total: number[] | null = null;
  let year: number | null = null;
  let quarter: number | null = null;
  for (const toks of lines) {
    const text = toks.join(" ");
    const e = /Ejercicio:\s*(\d{4})\s+Trimestre:\s*(\d)/.exec(text);
    if (e) [year, quarter] = [+e[1]!, +e[2]!];
    // El encabezado nuevo viene en fichas sueltas: "Trimestre:" "2024" "3".
    if (/^Trimestre:/.test(text) && !e) {
      const m = /Trimestre:\s*(\d{4})\s+(\d)/.exec(text) ?? /(\d{4})/.exec(text);
      if (m) [year, quarter] = [+m[1]!, m[2] ? +m[2] : quarter];
    }
    let k = toks.length;
    while (k > 0 && NUM.test(toks[k - 1]!)) k--;
    const nums = toks.slice(k).map(parseNum);
    if (toks[0] === "TOTALES") {
      total = toks.slice(1).filter((t) => NUM.test(t)).map(parseNum);
      continue;
    }
    if (nums.length < 5) continue;
    // Código: fichas del inicio hasta la primera con letras ("1/", "02" → "1/02"; "5/", "06", "/", "02" → "5/06/02").
    const first = toks.findIndex((t) => /[A-Za-zÁÉÍÓÚáéíóú]{2,}/.test(t));
    const code = toks.slice(0, first).join("").replace(/\s+/g, "");
    const m = /^(\d)\/?(\d{2})(?:\/?(\d{2}))?$/.exec(code);
    if (!m || first < 0) {
      unmatched.push(`${file}: ${text}`);
      continue;
    }
    const name = clean(toks.slice(first, k).join(" "));
    const [start, hires, exits, end, amount] = nums.slice(-5) as [number, number, number, number, number];
    rows.push({ group: CHARACTER_GROUP[m[1]!] ?? `Carácter ${m[1]}`, code, jurisdiction: m[2]!, unit: m[3] ?? "", name, start, hires, exits, end, amount });
  }
  return { rows, total, year, quarter, unmatched };
}

// ---------------------------------------------------------------- corrida

export async function run(_args: string[]): Promise<void> {
  await download();

  const files = (await manifestFiles()).map((f) => f.filename).sort();
  const personal: Row[] = [];
  const contracts: Row[] = [];
  const periods = new Set<string>();
  const missing: string[] = [];
  const problems: string[] = [];

  const byPeriod = new Map<string, { a19: string[]; a20: string[] }>();
  for (const f of files) {
    const p = periodOf(f);
    const k = periodKey(p.year, p.quarter);
    if (!byPeriod.has(k)) byPeriod.set(k, { a19: [], a20: [] });
    byPeriod.get(k)![p.annex === 19 ? "a19" : "a20"].push(f);
  }

  for (const [key, set] of [...byPeriod.entries()].sort()) {
    const [year, quarter] = [+key.slice(0, 4), +key.slice(-1)];
    // Anexo 19
    if (!set.a19.length) missing.push(`${key} anexo 19`);
    for (const f of set.a19.slice(-1)) {
      const pdfs = await pdfsOf(f);
      const a = parseAnnex19(await pdfTextLines(pdfs[0]!.bytes));
      if (a.year !== null && a.year !== year) problems.push(`${f}: el PDF dice ejercicio ${a.year}`);
      if (a.quarter !== null && a.quarter !== quarter && a.dateQuarter !== quarter) problems.push(`${f}: el PDF dice trimestre ${a.quarter}`);
      for (const u of a.unmatched) problems.push(`${f}: línea sin interpretar: ${u}`);
      // Validación: suma de los organismos contra el subtotal de su grupo y el TOTALES del PDF.
      const sums = new Map<string, number[]>();
      for (const r of a.rows) {
        const s = sums.get(r.group) ?? new Array(11).fill(0);
        r.cells.forEach((v, i) => (s[i] += v));
        sums.set(r.group, s);
      }
      for (const [g, cells] of a.groupTotals) {
        const s = sums.get(g) ?? new Array(11).fill(0);
        const bad = cells.map((v, i) => ({ i, d: s[i]! - v })).filter((x) => Math.abs(x.d) > (x.i % 3 === 2 || x.i === 10 ? 5 : 0.5));
        if (bad.length) problems.push(`${key} ${g}: la suma de organismos difiere del subtotal en columnas ${bad.map((b) => `${b.i}(${b.d.toFixed(0)})`).join(", ")}`);
      }
      if (a.totals) {
        const s = new Array(11).fill(0);
        for (const c of a.groupTotals.values()) c.forEach((v, i) => (s[i] += v));
        const bad = a.totals.map((v, i) => ({ i, d: s[i]! - v })).filter((x) => Math.abs(x.d) > (x.i % 3 === 2 || x.i === 10 ? 5 : 0.5));
        if (bad.length) problems.push(`${key}: subtotales de grupo difieren del TOTALES en columnas ${bad.map((b) => `${b.i}(${b.d.toFixed(0)})`).join(", ")}`);
      } else problems.push(`${key}: sin fila TOTALES`);
      personal.push(...annex19Rows(year, quarter, a));
      periods.add(key);
    }
    // Anexo 20
    if (!set.a20.length) missing.push(`${key} anexo 20`);
    for (const f of set.a20.slice(-1)) {
      for (const pdf of await pdfsOf(f)) {
        const c = parseAnnex20(await pdfLines(pdf.bytes), `${f}:${pdf.name}`);
        for (const u of c.unmatched) problems.push(`${u}`);
        if (c.year !== null && (c.year !== year || c.quarter !== quarter)) problems.push(`${f}:${pdf.name}: el PDF dice ${c.year} T${c.quarter}`);
        const s = [0, 0, 0, 0, 0];
        for (const r of c.rows) {
          if (r.start + r.hires - r.exits !== r.end) problems.push(`${f}:${pdf.name} ${r.code}: inicio+altas-bajas != fin (${r.start}+${r.hires}-${r.exits}!=${r.end})`);
          [r.start, r.hires, r.exits, r.end, r.amount].forEach((v, i) => (s[i] = (s[i] ?? 0) + v));
          contracts.push({
            anio: year,
            trimestre: quarter,
            fecha_corte: quarterEnd(year, quarter),
            grupo: r.group,
            codigo_jurisdiccion: r.jurisdiction,
            codigo_unidad: r.unit,
            organismo: r.name,
            contratados_inicio: r.start,
            altas: r.hires,
            bajas: r.exits,
            contratados_fin: r.end,
            importe_trimestre: round2(r.amount),
          });
        }
        if (c.total && c.total.length >= 5) {
          const t = c.total.slice(-5);
          if (s.some((v, i) => Math.abs(v - t[i]!) > (i === 4 ? 5 : 0))) problems.push(`${f}:${pdf.name}: la suma de filas (${s.map((v) => Math.round(v))}) difiere del TOTALES (${t.map(Math.round)})`);
        } else problems.push(`${f}:${pdf.name}: sin fila TOTALES`);
      }
    }
  }

  const key = (r: Row) => [r.anio, r.trimestre, r.grupo, r.organismo, r.tipo_personal ?? ""].join("|");
  personal.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  contracts.sort((a, b) => (key(a) < key(b) ? -1 : 1));

  await writeProcessed(
    SOURCE,
    "personal.csv",
    personal,
    ["anio", "trimestre", "fecha_corte", "grupo", "organismo", "tipo_personal", "cantidad", "horas_catedra", "importe"],
  );
  await writeProcessed(
    SOURCE,
    "contratos.csv",
    contracts,
    ["anio", "trimestre", "fecha_corte", "grupo", "codigo_jurisdiccion", "codigo_unidad", "organismo", "contratados_inicio", "altas", "bajas", "contratados_fin", "importe_trimestre"],
  );

  console.log(`${periods.size} trimestres, ${personal.length} filas de personal, ${contracts.length} filas de contratos`);
  if (missing.length) console.log(`::warning title=lrf-personal::faltan en el sitio: ${missing.join("; ")}`);
  for (const p of problems) console.log(`::warning title=lrf-personal::${p}`);
}
