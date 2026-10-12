/**
 * Hacienda Mendoza: stock de deuda pública provincial ("Tablero de deuda").
 *
 * Fuentes:
 *   - https://sitios.mendoza.gob.ar/haciendayfinanzas/stock-vigente/  (XLSX del corte vigente; hoy 2026-03-31 y 2026-06-30)
 *   - https://sitios.mendoza.gob.ar/haciendayfinanzas/14619-2/        (2015 en XLSX; 2016 a 2025 en un ZIP por año con 4 XLSX trimestrales)
 *
 * Salidas (data/processed/hacienda-deuda-stock/):
 *   - deuda_stock.csv: una fila por instrumento por fecha de corte.
 *   - deuda_total_trimestral.csv: serie trimestral de deuda total (hoja "Evolución Deuda Total" del
 *     último tablero, desde 2014-T1), con el stock consolidado calculado desde los instrumentos.
 *
 * Formatos (la hoja de stock es siempre la primera):
 *   A) 2015 a 2019 ("Stock dd.mm.aa"): encabezado en la fila 1, columna A. Hay DOS columnas "Saldo":
 *      la primera en millones de ARS (también para los instrumentos en USD, convertidos) y la segunda
 *      en millones de USD. Hasta 2016 los textos están en inglés ("Federal Government", "Monthly").
 *   B) 2020 en adelante ("Servicios Deuda Anual"): encabezado en la fila 5 o 6, columna B. Trae
 *      "Saldo Millones Moneda Origen" (en la moneda del instrumento) y "Saldo Millones USD".
 * Para unificar, saldo_moneda_origen sale directo del formato B; en el A es el saldo en ARS si la moneda
 * no es USD y el saldo en USD si lo es (en 2015 a 2019 los saldos en pesos, "Pesos Ajustados" incluidos,
 * vienen ya expresados en ARS). Todos los saldos están en MILLONES.
 * consolidada=0 marca las "operaciones financieras no consolidadas" (Letras de Tesorería, 2021-2022), fuera del total.
 * Las filas de cabecera de grupo (Gobierno Federal, Multilateral...) no son instrumentos: se usan para
 * completar acreedor_grupo y acreedor (BID, BIRF dentro de Multilateral).
 */

import { unzipSync } from "fflate";
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import { fetchAndArchive, get, latestRaw, readRaw, writeProcessed, type Row } from "@mt/core";

const SOURCE = "hacienda-deuda-stock";
const PAGES = [
  "https://sitios.mendoza.gob.ar/haciendayfinanzas/stock-vigente/",
  "https://sitios.mendoza.gob.ar/haciendayfinanzas/14619-2/",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cell = unknown;
type Grid = Cell[][];

const clean = (v: Cell): string => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v: Cell): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Serial de Excel a YYYY-MM-DD. Si ya es texto, lo devuelve tal cual. */
function isoDate(v: Cell): string {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return clean(v);
}

function grid(wb: XLSX.WorkBook, sheet: string | number): Grid {
  const name = typeof sheet === "number" ? wb.SheetNames[sheet]! : wb.SheetNames.find((s) => s.trim() === sheet)!;
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null });
}

// Normalizaciones de textos (2015-2016 están en inglés).
const GRUPOS: Record<string, string> = {
  "federal government": "Gobierno Federal",
  "national bank of argentina": "Banco de la Nación Argentina",
  "international and other banks": "Bancos Nacionales e Internacionales",
  multilateral: "Multilaterales",
  bondholders: "Tenedores de Bonos",
};
const normGrupo = (s: string): string => {
  const k = s.toLowerCase();
  if (GRUPOS[k]) return GRUPOS[k]!;
  if (/^organismos multilat/i.test(s)) return "Multilaterales";
  if (/^multilateral/i.test(s)) return "Multilaterales";
  if (/^bancos (nacionales|internacionales)|^international and other/i.test(s)) return "Bancos Nacionales e Internacionales";
  return s;
};
const normMoneda = (s: string): string => {
  const k = s.toLowerCase();
  if (k === "usd") return "USD";
  if (/^pesos (ajustados|adjustados|adjusted)/.test(k)) return "Pesos ajustados";
  if (k === "pesos") return "Pesos";
  return s;
};
const FREC: Record<string, string> = { monthly: "Mensual", quarterly: "Trimestral", "semi annual": "Semestral", "semi-annual": "Semestral", annual: "Anual", "zero coupon": "Cupón cero", bullet: "Al vencimiento" };
const normFrec = (s: string): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return FREC[t.toLowerCase()] ?? t;
};
const normGarantia = (s: string): string => {
  const k = s.toLowerCase();
  if (k.startsWith("federal tax co-partici")) return "Coparticipación Federal de Impuestos";
  if (k.startsWith("other federal transfer") || k.startsWith("otros recursos nacionales")) return "Otras Transferencias Nacionales";
  if (k.startsWith("oil & gas royalties") || k.startsWith("regal")) return "Regalías hidrocarburíferas";
  if (k === "unsecured") return "Sin garantía";
  return s;
};
function tasaTexto(v: Cell): string {
  if (typeof v === "number") return `fija ${+(v * 100).toFixed(3)}%`;
  return clean(v);
}

interface Layout {
  header: number;
  cols: Partial<Record<"acreedor" | "id" | "moneda" | "origen" | "ars" | "usd" | "garantia" | "inicio" | "tasa" | "duracion" | "frecuencia" | "vto" | "pago" | "tipo", number>>;
}

function findLayout(g: Grid): Layout {
  for (let i = 0; i < 12; i++) {
    const r = g[i] ?? [];
    const a = r.findIndex((c) => /^acreedor/i.test(clean(c)));
    if (a < 0) continue;
    const cols: Layout["cols"] = { acreedor: a };
    let saldos = 0;
    r.forEach((c, j) => {
      const t = clean(c).toLowerCase();
      if (!t || j === a) return;
      if (t === "id") cols.id = j;
      else if (t.startsWith("moneda")) cols.moneda = j;
      else if (/saldo.*(mon(eda)? ?orig|millones mon)/.test(t)) cols.origen = j;
      else if (/saldo.*usd/.test(t)) cols.usd = j;
      else if (t.startsWith("saldo")) {
        // formato A: primera columna "Saldo" en ARS, segunda en USD
        if (saldos++ === 0) cols.ars = j;
        else cols.usd = j;
      } else if (t.startsWith("garant")) cols.garantia = j;
      else if (t.startsWith("fecha inic") || t.startsWith("fecha incio")) cols.inicio = j;
      else if (t.startsWith("cup") || t === "tasa") cols.tasa = j;
      else if (t.startsWith("duraci")) cols.duracion = j;
      else if (t.startsWith("frecuen")) cols.frecuencia = j;
      else if (t.startsWith("fecha v")) cols.vto = j;
      else if (t.startsWith("forma de pago")) cols.pago = j;
      else if (t.startsWith("tipo de acreedor")) cols.tipo = j;
    });
    return { header: i, cols };
  }
  throw new Error("no encontré el encabezado de la tabla de stock");
}

interface Corte {
  fecha: string;
  tipoCambio: number | null;
  totalUsd: number | null;
  rows: Row[];
}

const consolidado = (c: Corte): number => c.rows.filter((r) => r.consolidada).reduce((s, r) => s + (Number(r.saldo_usd) || 0), 0);

function parseStock(wb: XLSX.WorkBook, archivo: string): Corte {
  const g = grid(wb, 0);
  const { header, cols } = findLayout(g);
  const formato = cols.origen !== undefined ? "B" : "A";

  // fecha de corte: serial de Excel en las filas siguientes al encabezado
  let fecha = "";
  for (let i = header + 1; i < header + 4 && !fecha; i++) {
    const v = (g[i] ?? []).find((c) => typeof c === "number" && c > 40000 && c < 60000);
    if (v !== undefined) fecha = isoDate(v);
  }
  if (!fecha) throw new Error(`${archivo}: sin fecha de corte`);

  const get = (r: Cell[], k: keyof Layout["cols"]): Cell => (cols[k] === undefined ? null : r[cols[k]!]);
  const rows: Row[] = [];
  let grupo = "";
  let sub = "";
  let tipoCambio: number | null = null;
  let totalUsd: number | null = null;
  // "consol": instrumentos de la deuda consolidada; "despues": tras su total (se ignora todo salvo las
  // operaciones no consolidadas de 2021-2022, como las Letras de Tesorería); "noconsol": esas operaciones.
  let zona: "consol" | "despues" | "noconsol" = "consol";

  for (const r of g.slice(header + 3)) {
    const label = clean(r[cols.acreedor!]);
    if (/^TOTAL DEUDA CONSOLIDADA\s*\+/i.test(label)) break;
    if (/^TOTAL DEUDA/i.test(label)) {
      totalUsd ??= num(get(r, "usd"));
      zona = "despues";
      continue;
    }
    if (/^(tipo de cambio|exchange rate|exchage rate)/i.test(label)) {
      tipoCambio = r.slice(cols.acreedor! + 1).map(num).find((v) => v !== null && v > 0) ?? null;
      continue;
    }
    if (/^operaciones financieras no consolidadas/i.test(label)) {
      zona = "noconsol";
      continue;
    }
    if (zona === "despues") continue;
    if (/^\(\d\)|^PERFIL/i.test(label)) break;
    if (!label) continue;
    const moneda = clean(get(r, "moneda"));
    const idStr = clean(get(r, "id"));
    if (!moneda && !idStr) {
      // fila de grupo o subgrupo (solo con saldo USD)
      if (num(get(r, "usd")) === null) continue;
      if (/^\d+\.\d+\.?\s/.test(label)) sub = label.replace(/^\d+\.\d+\.?\s*/, "").trim();
      else {
        grupo = normGrupo(label);
        sub = "";
      }
      continue;
    }

    const usd = num(get(r, "usd"));
    const monedaN = normMoneda(moneda);
    let origen = formato === "B" ? num(get(r, "origen")) : monedaN === "USD" ? usd : num(get(r, "ars"));
    if (origen === null && formato === "A") origen = num(get(r, "ars"));
    rows.push({
      fecha_corte: fecha,
      consolidada: zona === "consol" ? 1 : 0,
      instrumento: label,
      id_instrumento: idStr,
      acreedor: sub || grupo,
      acreedor_grupo: grupo,
      moneda: monedaN,
      saldo_moneda_origen: origen,
      saldo_usd: usd,
      tasa: tasaTexto(get(r, "tasa")),
      vencimiento: isoDate(get(r, "vto")),
      fecha_inicio: isoDate(get(r, "inicio")),
      duracion_meses: num(get(r, "duracion")),
      frecuencia_pago: normFrec(clean(get(r, "frecuencia"))),
      garantia: normGarantia(clean(get(r, "garantia"))),
      forma_pago: clean(get(r, "pago")),
      formato,
      archivo_origen: archivo,
    });
  }
  return { fecha, tipoCambio, totalUsd, rows };
}

/** Serie trimestral de la hoja "Evolución Deuda Total" (desde 2014-T1). */
function parseEvolucion(wb: XLSX.WorkBook): Row[] {
  const name = wb.SheetNames.find((s) => /evoluci/i.test(s));
  if (!name) throw new Error("sin hoja de evolución");
  const g = grid(wb, name);
  const dateRow = g.findIndex((r) => r.filter((c) => typeof c === "number" && c > 40000).length > 8);
  const dates = g[dateRow]!;
  const pick = (re: RegExp) => g.slice(dateRow + 1).find((r) => re.test(clean(r[0])));
  const rConsol = pick(/^\(1\) /);
  const rFlot = pick(/^\(2\) /);
  const rTotal = pick(/^\(1\+2\)/);
  const rIpc = pick(/^\(A\)/);
  const rReal = pick(/^\(3\) x \(A\)/);
  const rTc = pick(/^\(B\)/);
  const rUsd = pick(/^\(3\) \/ \(B\)/);
  const rFlotDesc = pick(/^\(4\)/);
  const rPbg = pick(/^Deuda TOTAL\/PBG/i);
  if (!rConsol || !rTotal || !rTc || !rUsd) throw new Error("no encontré las filas esperadas en Evolución Deuda Total");
  const out: Row[] = [];
  dates.forEach((d, c) => {
    if (typeof d !== "number" || d < 40000) return;
    const tc = num(rTc[c]);
    const consol = num(rConsol[c]);
    out.push({
      fecha_corte: isoDate(d),
      deuda_consolidada_ars_mill: consol,
      deuda_flotante_ars_mill: num(rFlot?.[c]),
      deuda_total_ars_mill: num(rTotal[c]),
      tipo_cambio_com3500: tc,
      deuda_consolidada_usd_mill: consol !== null && tc ? +(consol / tc).toFixed(3) : null,
      deuda_total_usd_mill: num(rUsd[c]),
      deuda_flotante_descentralizadas_ars_mill: num(rFlotDesc?.[c]),
      factor_ipc: num(rIpc?.[c]),
      deuda_total_ars_reales_mill: num(rReal?.[c]),
      deuda_total_sobre_pbg: num(rPbg?.[c]),
    });
  });
  return out;
}

async function discover(): Promise<{ url: string; filename: string }[]> {
  const urls = new Map<string, string>();
  for (const page of PAGES) {
    const $ = cheerio.load(await (await get(page)).text());
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      if (/uploads\/.*\.(xlsx|zip)$/i.test(href)) urls.set(href, decodeURIComponent(href.split("/").pop()!));
    });
    await sleep(1000);
  }
  return [...urls].map(([url, filename]) => ({ url, filename }));
}

export async function run(_args: string[]): Promise<void> {
  console.log("Descubriendo archivos...");
  const files = await discover();
  console.log(`${files.length} archivos (XLSX/ZIP)`);

  for (const f of files) {
    // Los históricos (2015 a 2025) no cambian; los del corte vigente se vuelven a pedir.
    const vigente = /^2[6-9]-\d\d-\d\d-/.test(f.filename);
    if (!vigente && (await latestRaw(SOURCE, f.filename))) {
      console.log(`  ya archivado: ${f.filename}`);
      continue;
    }
    await sleep(1000);
    const saved = await fetchAndArchive(SOURCE, f.url, f.filename);
    console.log(`  ${saved ? "nuevo" : "sin cambios"}: ${f.filename}`);
  }

  // Libros: los XLSX directos y el contenido de cada ZIP.
  const books: { name: string; wb: XLSX.WorkBook }[] = [];
  for (const f of files) {
    const path = await latestRaw(SOURCE, f.filename);
    if (!path) throw new Error(`no encontré ${f.filename} archivado`);
    const buf = await readRaw(path);
    if (/\.zip$/i.test(f.filename)) {
      for (const [inner, data] of Object.entries(unzipSync(new Uint8Array(buf)))) {
        if (/\.xlsx$/i.test(inner) && !inner.startsWith("__MACOSX")) books.push({ name: `${f.filename}:${inner}`, wb: XLSX.read(data) });
      }
    } else books.push({ name: f.filename, wb: XLSX.read(buf) });
  }

  const cortes = new Map<string, { corte: Corte; wb: XLSX.WorkBook }>();
  for (const { name, wb } of books) {
    const corte = parseStock(wb, name);
    const prev = cortes.get(corte.fecha);
    if (prev) console.warn(`  corte duplicado ${corte.fecha}: ${name} reemplaza a ${prev.corte.rows[0]?.archivo_origen}`);
    cortes.set(corte.fecha, { corte, wb });
    const sum = consolidado(corte);
    const dif = corte.totalUsd === null ? "sin total" : `dif ${(sum - corte.totalUsd).toFixed(2)}`;
    console.log(`  ${corte.fecha}: ${corte.rows.length} instrumentos, suma USD ${sum.toFixed(1)} (total tablero ${corte.totalUsd?.toFixed(1)}; ${dif}) [${name}]`);
  }

  const fechas = [...cortes.keys()].sort();
  const stock = fechas.flatMap((f) => cortes.get(f)!.corte.rows);
  const cols = [
    "fecha_corte", "consolidada", "instrumento", "id_instrumento", "acreedor", "acreedor_grupo", "moneda", "saldo_moneda_origen", "saldo_usd",
    "tasa", "vencimiento", "fecha_inicio", "duracion_meses", "frecuencia_pago", "garantia", "forma_pago", "formato", "archivo_origen",
  ];
  const p1 = await writeProcessed(SOURCE, "deuda_stock.csv", stock, cols);

  // Serie trimestral: del tablero más reciente, más el consolidado sumado desde los instrumentos de cada corte.
  const ultimo = cortes.get(fechas.at(-1)!)!;
  // Se une por año-mes: la fecha del tablero puede ser el último día hábil (p. ej. 2024-03-27 vs 2024-03-31).
  const porMes = new Map(fechas.map((f) => [f.slice(0, 7), cortes.get(f)!.corte]));
  const serie = parseEvolucion(ultimo.wb).map((r) => {
    const c = porMes.get(String(r.fecha_corte).slice(0, 7));
    return { ...r, fecha_corte_tablero: c?.fecha ?? null, stock_instrumentos_usd_mill: c ? +consolidado(c).toFixed(3) : null };
  });
  const p2 = await writeProcessed(SOURCE, "deuda_total_trimestral.csv", serie, [
    "fecha_corte", "deuda_consolidada_ars_mill", "deuda_flotante_ars_mill", "deuda_total_ars_mill", "tipo_cambio_com3500",
    "deuda_consolidada_usd_mill", "deuda_total_usd_mill", "deuda_flotante_descentralizadas_ars_mill", "factor_ipc",
    "deuda_total_ars_reales_mill", "deuda_total_sobre_pbg", "fecha_corte_tablero", "stock_instrumentos_usd_mill",
  ]);
  console.log(`${stock.length} filas (${fechas.length} cortes, ${fechas[0]} a ${fechas.at(-1)}) -> ${p1}\n${serie.length} filas -> ${p2}`);
}
