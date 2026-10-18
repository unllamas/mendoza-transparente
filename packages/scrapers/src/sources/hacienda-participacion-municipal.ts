/**
 * Hacienda Mendoza: participación (coparticipación) municipal.
 *
 * Fuente: https://sitios.mendoza.gob.ar/haciendayfinanzas/participacion-municipal/
 * La página índice enlaza una subpágina por año (2018 a 2026, "Participación Municipal
 * <año>") y la "Evolución Participación Municipal 1997 a 2026". Cada subpágina trae un XLS
 * (hoja única) con una fila por municipio y una columna por mes; el XLS de evolución trae
 * el total anual por municipio desde 1997.
 *
 * Salidas (data/processed/hacienda-participacion-municipal/):
 *   - coparticipacion_mensual.csv: anio, mes, municipio, concepto, monto_pesos (formato largo)
 *   - coparticipacion_anual.csv:   anio, municipio, concepto, monto_pesos, parcial
 *
 * Concepto: la fuente publica un único total por municipio y mes ("participacion_total").
 * Según la nota de cada XLS incluye Fondo Compensador y Subsidio per cápita y, desde 2022,
 * Financiamiento Educativo. No hay desglose por recurso en estos archivos.
 */

import { fetchAndArchive, finiteNumber, get, latestRaw, normalizeMunicipio, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";

const SOURCE = "hacienda-participacion-municipal";
const INDEX_URL = "https://sitios.mendoza.gob.ar/haciendayfinanzas/participacion-municipal/";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

interface Found {
  kind: "mensual" | "anual";
  pageUrl: string;
  xlsUrl: string;
  filename: string;
}

/** Descubre las subpáginas de cada año y el XLS de cada una. */
async function discover(): Promise<Found[]> {
  const html = await (await get(INDEX_URL)).text();
  const $ = cheerio.load(html);
  const pages = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!/\/haciendayfinanzas\/\d{4}\/\d{2}\//.test(href)) return;
    if (/resoluc|proyecci/i.test(href)) return;
    if (/participacion-municipal/.test(href)) pages.add(href);
  });

  const found: Found[] = [];
  for (const pageUrl of [...pages].sort()) {
    await sleep(1000);
    const $p = cheerio.load(await (await get(pageUrl)).text());
    const links = new Set<string>();
    $p("a[href]").each((_, a) => {
      const href = $p(a).attr("href") ?? "";
      if (/\.xlsx?$/i.test(href)) links.add(href);
    });
    for (const xlsUrl of links) {
      const filename = decodeURIComponent(xlsUrl.split("/").pop()!);
      found.push({ kind: /anual|evolucion/i.test(pageUrl + filename) ? "anual" : "mensual", pageUrl, xlsUrl, filename });
    }
    if (!links.size) console.warn(`  sin XLS en ${pageUrl}`);
  }
  return found;
}

function sheetRows(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf);
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: null });
}

function parseMensual(rows: unknown[][], file: string, out: Row[]): void {
  const title = String(rows[0]?.[0] ?? "");
  const anio = Number(title.match(/(\d{4})/)?.[1]);
  if (!anio) throw new Error(`${file}: no encontré el año en el título "${title}"`);
  const hi = rows.findIndex(
    (r) =>
      String(r[0] ?? "")
        .trim()
        .toUpperCase() === "MUNICIPALIDADES",
  );
  if (hi < 0) throw new Error(`${file}: sin fila de encabezado`);
  const header = rows[hi]!.map((c) =>
    String(c ?? "")
      .trim()
      .toLowerCase(),
  );
  const monthCol = new Map<number, number>();
  MESES.forEach((m, i) => {
    const c = header.indexOf(m);
    if (c >= 0) monthCol.set(i + 1, c);
  });
  const totalCol = header.indexOf("total");
  const sumMonthsByMuni = new Map<string, number>();
  let n = 0;
  for (const r of rows.slice(hi + 1)) {
    const label = String(r[0] ?? "").trim();
    if (!label) continue;
    if (/^TOTALES/i.test(label)) break;
    const muni = normalizeMunicipio(label);
    if (!muni) {
      console.warn(`  ${file}: municipio no reconocido "${label}"`);
      continue;
    }
    let sum = 0;
    for (const [mes, c] of monthCol) {
      const v = finiteNumber(r[c]);
      if (v === null) continue;
      out.push({ anio, mes, municipio: muni, concepto: "participacion_total", monto_pesos: v });
      sum += v;
      n++;
    }
    sumMonthsByMuni.set(muni, sum);
    const t = totalCol >= 0 ? finiteNumber(r[totalCol]) : null;
    if (t !== null && Math.abs(t - sum) > 1) console.warn(`  ${file}: ${muni} suma de meses ${sum} != TOTAL ${t}`);
  }
  const note = rows.map((r) => String(r[0] ?? "")).find((s) => /^Los datos surgen/i.test(s));
  console.log(`  ${file}: anio ${anio}, ${n} filas${note ? ` | ${note.slice(0, 160)}` : ""}`);
}

function parseAnual(rows: unknown[][], file: string, out: Row[]): void {
  const hi = rows.findIndex((r) => r.some((c) => typeof c === "number" && c === 1997));
  if (hi < 0) throw new Error(`${file}: sin fila de años`);
  const yearRow = rows[hi]!;
  const cols: { c: number; anio: number; parcial: boolean }[] = [];
  yearRow.forEach((v, c) => {
    if (typeof v === "number" && v >= 1990 && v <= 2100) cols.push({ c, anio: v, parcial: false });
    else if (typeof v === "string" && /^AL\s+\d{1,2}\/\d{1,2}\/(\d{2})/i.test(v.trim())) {
      const yy = Number(v.trim().match(/\/(\d{2})$/)![1]);
      cols.push({ c, anio: 2000 + yy, parcial: true });
    }
  });
  let n = 0;
  for (const r of rows.slice(hi + 1)) {
    const label = String(r[0] ?? "").trim();
    if (!label) continue;
    if (/^TOTALES/i.test(label)) break;
    const muni = normalizeMunicipio(label);
    if (!muni) {
      console.warn(`  ${file}: municipio no reconocido "${label}"`);
      continue;
    }
    for (const { c, anio, parcial } of cols) {
      const v = finiteNumber(r[c]);
      if (v === null) continue;
      out.push({ anio, municipio: muni, concepto: "participacion_total", monto_pesos: v, parcial: parcial ? 1 : 0 });
      n++;
    }
  }
  console.log(
    `  ${file}: ${cols.length} años (${Math.min(...cols.map((c) => c.anio))}-${Math.max(...cols.map((c) => c.anio))}), ${n} filas`,
  );
}

export async function run(_args: string[]): Promise<void> {
  console.log("Descubriendo archivos...");
  const found = await discover();
  console.log(`${found.length} XLS encontrados`);

  // Los archivos son chicos (~50 KB): se piden todos; archive() no duplica si el contenido no cambió.
  for (const f of found) {
    await sleep(1000);
    const saved = await fetchAndArchive(SOURCE, f.xlsUrl, f.filename);
    console.log(`  ${saved ? "nuevo" : "sin cambios"}: ${f.filename}`);
  }

  const mensual: Row[] = [];
  const anual: Row[] = [];
  for (const f of found) {
    const path = await latestRaw(SOURCE, f.filename);
    if (!path) throw new Error(`no encontré ${f.filename} en el archivo crudo`);
    const rows = sheetRows(await readRaw(path));
    if (f.kind === "anual") parseAnual(rows, f.filename, anual);
    else parseMensual(rows, f.filename, mensual);
  }

  const key = (r: Row) => [r.anio, String(r.mes ?? 0).padStart(2, "0"), r.municipio].join("|");
  mensual.sort((a, b) => key(a).localeCompare(key(b)));
  anual.sort((a, b) => key(a).localeCompare(key(b)));

  const p1 = await writeProcessed(SOURCE, "coparticipacion_mensual.csv", mensual, ["anio", "mes", "municipio", "concepto", "monto_pesos"]);
  const p2 = await writeProcessed(SOURCE, "coparticipacion_anual.csv", anual, ["anio", "municipio", "concepto", "monto_pesos", "parcial"]);
  console.log(`${mensual.length} filas -> ${p1}\n${anual.length} filas -> ${p2}`);
}
