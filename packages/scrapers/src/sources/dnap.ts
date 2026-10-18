/**
 * Dirección Nacional de Asuntos Provinciales (DNAP, Secretaría de Hacienda de la Nación).
 *
 * Uso: `bun run scrape dnap [ron] [aif] [deuda] [ocupacion] [--refresh] [--solo-parsear]`
 * Sin argumentos corre las cuatro fuentes. Los datos se guardan bajo estos ids:
 *
 *  - dnap-ron       Transferencias automáticas (coparticipación y regímenes) de Nación a provincias.
 *                   Crudos: serie anual CSV/XLSX, "información consolidada" mensual por año (2003 a 2026)
 *                   y XLS diarios recientes. Salida: ron_mensual.csv (anio, mes, provincia, concepto, monto_pesos).
 *  - dnap-aif       Ejecución presupuestaria provincial (AIF, administración pública no financiera).
 *                   Salida: aif_trimestral.csv (anio, trimestre, provincia, concepto, valor, unidad).
 *  - dnap-ocupacion Empleo público y gasto salarial por provincia (anual).
 *                   Salida: ocupacion_salarios.csv (anio, trimestre vacío, provincia, concepto, valor, unidad).
 *  - dnap-deuda     Stock de deuda provincial por acreedor (trimestral).
 *                   Salida: deuda_stock.csv (anio, trimestre, provincia, concepto, valor, unidad).
 *
 * Los href de estas páginas vienen con el prefijo "blank:#", que se limpia acá.
 * La descarga es idempotente: lo que ya está archivado no se vuelve a bajar (salvo con --refresh).
 */

import { fetchAndArchive, get, latestRaw, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import { load } from "cheerio";
import * as XLSX from "xlsx";

const BASE = "https://www.argentina.gob.ar";
const PAGES = {
  ron: `${BASE}/economia/sechacienda/asuntosprovinciales/ron`,
  aif: `${BASE}/economia/sechacienda/coordinacion-fiscal-provincial/ejecucion-presupuestaria-provincial/ejecuciones`,
  ocupacion: `${BASE}/economia/sechacienda/coordinacion-fiscal-provincial/ejecucion-presupuestaria-provincial/ocupacion-y`,
  deuda: `${BASE}/economia/sechacienda/coordinacion-fiscal-provincial/deuda-publica-provincial/evolucion-de-stock`,
} as const;

type Fuente = keyof typeof PAGES;
const ID: Record<Fuente, string> = {
  ron: "dnap-ron",
  aif: "dnap-aif",
  ocupacion: "dnap-ocupacion",
  deuda: "dnap-deuda",
};

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

/** Limpia el prefijo "blank:#" de los href y devuelve una URL absoluta. */
export function cleanHref(href: string): string | null {
  let h = href.trim().replace(/^blank:#/, "");
  if (!h) return null;
  if (h.startsWith("//")) h = `https:${h}`;
  if (h.startsWith("/")) h = BASE + h;
  if (!/^https?:\/\//.test(h)) return null;
  return h.split("#")[0] ?? null;
}

/** Links a archivos descargables de una página, sin repetidos y en orden de aparición. */
async function listFiles(page: string, ext = /\.(csv|xlsx?|zip)$/i): Promise<string[]> {
  const html = await (await get(page)).text();
  const $ = load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const url = cleanHref($(el).attr("href") ?? "");
    if (url && ext.test(url.split("?")[0] ?? "") && !out.includes(url)) out.push(url);
  });
  return out;
}

const baseName = (url: string) => decodeURIComponent(url.split("/").pop() ?? url);

interface DownloadStats {
  nuevos: number;
  ya_estaban: number;
  errores: string[];
}

/** Archiva cada URL (en secuencia, con pausa). Omite lo que ya está en el manifest salvo `refresh`. */
async function download(source: string, urls: string[], refresh: boolean): Promise<DownloadStats> {
  const stats: DownloadStats = { nuevos: 0, ya_estaban: 0, errores: [] };
  for (const url of urls) {
    const name = baseName(url);
    if (!refresh && (await latestRaw(source, name))) {
      stats.ya_estaban++;
      continue;
    }
    try {
      const saved = await fetchAndArchive(source, url, name);
      if (saved) stats.nuevos++;
      else stats.ya_estaban++;
    } catch (err) {
      stats.errores.push(`${name}: ${(err as Error).message}`);
    }
    await sleep(700);
  }
  console.log(
    `[${source}] ${urls.length} archivos: ${stats.nuevos} nuevos, ${stats.ya_estaban} ya archivados, ${stats.errores.length} con error`,
  );
  for (const e of stats.errores) console.warn(`  ! ${e}`);
  return stats;
}

async function readWorkbook(source: string, filename: string): Promise<XLSX.WorkBook | null> {
  const path = await latestRaw(source, filename);
  if (!path) return null;
  return XLSX.read(await readRaw(path), { type: "buffer" });
}

// ---------------------------------------------------------------------------
// Utilidades comunes
// ---------------------------------------------------------------------------

type Cell = string | number | boolean | null;
type Grid = Cell[][];

function grid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

const flat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

const provKey = (s: string) => flat(s).replace(/[^a-z]/g, "");
const PROV_BY_KEY = new Map<string, string>(PROVINCIAS.map((p) => [provKey(p), p]));
for (const [alias, canon] of Object.entries({
  gcba: "CABA",
  gcbaa: "CABA",
  ciudad: "CABA",
  ciudaddebuenosaires: "CABA",
  ciudadautonomadebuenosaires: "CABA",
  capitalfederal: "CABA",
  santafe: "Santa Fe",
  sgodelestero: "Santiago del Estero",
  sgodelesterto: "Santiago del Estero",
  tierradelfuegoaeis: "Tierra del Fuego",
})) {
  PROV_BY_KEY.set(alias, canon);
}

/** Nombre canónico de provincia (o "CABA"), o null si la etiqueta no es una jurisdicción. */
function provincia(label: Cell): string | null {
  if (typeof label !== "string") return null;
  const k = provKey(label);
  const directo = PROV_BY_KEY.get(k);
  if (directo) return directo;
  // Algunos archivos usan "PROVINCIA DE X" / "PROVINCIA DEL X" en los encabezados.
  for (const prefijo of ["provinciadel", "provinciade"]) {
    if (k.startsWith(prefijo)) {
      const p = PROV_BY_KEY.get(k.slice(prefijo.length));
      if (p) return p;
    }
  }
  return null;
}

function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(/\s/g, "");
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return null;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// RON: transferencias automáticas
// ---------------------------------------------------------------------------

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type RonRegla = [RegExp, string];

/** Texto de encabezado -> concepto canónico. El orden importa (ver comentarios). */
function conceptoRon(header: string, estado: { energia: boolean }): string | "TOTAL" | null {
  const t = flat(header)
    .replace(/[.ºº°]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const compact = t.replace(/[^a-z0-9]/g, "");
  if (!compact) return null;
  if (compact.includes("total")) return "TOTAL";
  const reglas: RonRegla[] = [
    [/combustibles/, "combustibles_obras_infraestructura"],
    [/vialidad/, "combustibles_vialidad_provincial"],
    [/fonavi|24464/, "fonavi_ley_24464"],
    [/tarifa|24065/, "energia_electrica_fondo_compensador_tarifa"],
    [/transf a emp/, "energia_electrica_transferencia_empresas"],
    [/desequilib/, "fondo_compensador_desequilibrios"],
    [/simplif|24977|monotrib/, "monotributo_ley_24977"],
    [/cautelar|752/, "compensacion_medida_cautelar_csjn"],
    [/consenso|compensacion/, "compensacion_consenso_fiscal"],
    [/^cfi$/, "coparticipacion_federal"],
    [/activos|23906/, "activos_fondo_educativo_ley_23906"],
    [/\biva\b/, "iva_ley_23966_art_5"],
    [/neta|copartic/, "coparticipacion_federal"],
    [/financ.*educ|educativo/, "financiamiento_educativo_ley_26075"],
    [/24049|transfer\w* de servicios/, "transferencia_servicios_ley_24049"],
    [/basica social/, "ganancias_obras_infraestructura_basica_social"],
    [/caract|carct|conurb/, "ganancias_excedente_obras_caracter_social_bsas"],
    [/bienes personales/, "bienes_personales_ley_24699"],
    [/art 30/, "bienes_personales_ley_23966_art_30"],
    [/^ley (n )?24699$/, "ganancias_ley_24699"],
  ];
  if (/fedei/.test(compact)) return estado.energia ? "energia_electrica_fedei" : "combustibles_fedei";
  for (const [re, concepto] of reglas) {
    if (re.test(t)) {
      if (concepto.startsWith("energia_electrica")) estado.energia = true;
      // "Bienes personales ... Art. 30" lleva ambas marcas: gana el artículo.
      if (concepto === "bienes_personales_ley_24699" && /art 30/.test(t)) return "bienes_personales_ley_23966_art_30";
      return concepto;
    }
  }
  return `otro_${t.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

interface RonResultado {
  rows: Row[];
  advertencias: string[];
}

function parseRonLibro(wb: XLSX.WorkBook, anio: number, etiqueta: string): RonResultado {
  const rows: Row[] = [];
  const advertencias: string[] = [];
  for (const sheet of wb.SheetNames) {
    const mes = MESES.findIndex((m) => flat(sheet).trim().startsWith(m.slice(0, 3))) + 1; // hay hojas con typos ("septimbre")
    if (mes === 0) continue; // CONS y hojas auxiliares
    const g = grid(wb.Sheets[sheet] as XLSX.WorkSheet);
    const first = g.findIndex((r) => provKey(String(r[0] ?? "")) === "buenosaires");
    if (first < 0) {
      advertencias.push(`${etiqueta}/${sheet}: sin fila de Buenos Aires`);
      continue;
    }
    const nCols = Math.max(...g.slice(0, first + 1).map((r) => r.length));
    const estado = { energia: false };
    const columnas: { col: number; concepto: string }[] = [];
    const totales: number[] = [];
    for (let c = 1; c < nCols; c++) {
      const header = g
        .slice(0, first)
        .map((r) => r[c])
        .filter((x): x is string | number => x !== null && x !== "")
        .join(" ");
      const concepto = conceptoRon(header, estado);
      if (concepto === "TOTAL") totales.push(c);
      else if (concepto) {
        if (concepto.startsWith("otro_")) advertencias.push(`${etiqueta}/${sheet}: columna sin mapear "${concepto}"`);
        columnas.push({ col: c, concepto });
      }
    }
    const vistas = new Set<string>();
    for (let i = first; i < g.length; i++) {
      const fila = g[i] as Cell[];
      const prov = provincia(fila[0] ?? null);
      if (!prov || vistas.has(prov)) continue;
      vistas.add(prov);
      let suma = 0;
      for (const { col, concepto } of columnas) {
        const v = num(fila[col] ?? null);
        if (v === null || v === 0) continue;
        suma += v;
        rows.push({ anio, mes, provincia: prov, concepto, monto_pesos: Math.round(v * 1e6) });
      }
      // Control: la suma de las columnas hoja tiene que coincidir con alguna columna de total.
      if (prov === "Mendoza" && totales.length) {
        const ok = totales.some((c) => {
          const t = num(fila[c] ?? null);
          return t !== null && Math.abs(t - suma) <= Math.max(1, Math.abs(t) * 0.002);
        });
        if (!ok) {
          const t = totales.map((c) => num(fila[c] ?? null)).join("/");
          advertencias.push(`${etiqueta}/${sheet}: Mendoza suma ${round(suma, 1)} y los totales del libro son ${t}`);
        }
      }
    }
    if (vistas.size !== 24) advertencias.push(`${etiqueta}/${sheet}: ${vistas.size} jurisdicciones (esperadas 24)`);
  }
  return { rows, advertencias };
}

/** Serie anual oficial (ano;provincia;impuesto;regimen;monto, en millones): total por "anio|provincia". */
async function cargarSerieRon(): Promise<Map<string, number>> {
  const serie = new Map<string, number>();
  const path = await latestRaw("dnap-ron", "serie_ron_2003_2025.csv");
  if (!path) return serie;
  const texto = new TextDecoder("latin1").decode(await readRaw(path));
  for (const linea of texto.split(/\r?\n/).slice(1)) {
    const p = linea.split(";");
    if (p.length < 5) continue;
    const prov = provincia(p[1] ?? "");
    const monto = Number((p[4] ?? "").replace(",", "."));
    if (!prov || !Number.isFinite(monto)) continue;
    const k = `${p[0]}|${prov}`;
    serie.set(k, (serie.get(k) ?? 0) + monto);
  }
  return serie;
}

const totalPorClave = (rows: Row[]) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.anio}|${r.provincia}`;
    m.set(k, (m.get(k) ?? 0) + Number(r.monto_pesos) / 1e6);
  }
  return m;
};

function ronCompararSerie(rows: Row[], serie: Map<string, number>): void {
  const propio = totalPorClave(rows);
  let comparados = 0;
  const difs: string[] = [];
  for (const [k, v] of serie) {
    const mio = propio.get(k);
    if (mio === undefined) continue;
    comparados++;
    const dif = Math.abs(mio - v) / Math.max(1, Math.abs(v));
    if (dif > 0.001) difs.push(`${k}: mensual ${round(mio, 1)} vs serie ${round(v, 1)} (${round(dif * 100, 2)}%)`);
  }
  console.log(`[dnap-ron] contraste con serie anual: ${comparados} pares anio/provincia, ${difs.length} con diferencia >0,1%`);
  for (const d of difs.slice(0, 25)) console.log(`  ~ ${d}`);
}

async function ron(refresh: boolean, soloParsear: boolean): Promise<void> {
  const source = ID.ron;
  const links = await listFiles(PAGES.ron);
  const serie = links.filter((u) => /serie_ron_\d{4}_\d{4}\.(csv|xlsx)$/i.test(u)).sort((a, b) => baseName(a).localeCompare(baseName(b)));
  // Para la serie nos quedamos con la de fin de período más nuevo (CSV y XLSX).
  const ultimoFin = serie
    .map((u) => /_(\d{4})\.(csv|xlsx)$/i.exec(u)?.[1] ?? "")
    .sort()
    .pop();
  const consolidados = links.filter((u) => /informacion_consolidada/i.test(u));
  const diarios = links.filter((u) => /internet_diario/i.test(u) || /montos_diarios_-ano_2025/i.test(u));
  const aDescargar = [...serie.filter((u) => u.includes(`_${ultimoFin}.`)), ...consolidados, ...diarios];
  if (!soloParsear) await download(source, aDescargar, refresh);

  // Libros consolidados: uno por año; si hay varias versiones de un año, la de sufijo más alto.
  const porAnio = new Map<number, string>();
  for (const u of consolidados) {
    const m = /informacion_consolidada_?(\d{4})(?:_(\d+))?\./i.exec(baseName(u));
    if (!m) continue;
    const y = Number(m[1]);
    const actual = porAnio.get(y);
    if (!actual || baseName(u) > baseName(actual)) porAnio.set(y, u);
  }
  const rows: Row[] = [];
  const advertencias: string[] = [];
  const serieAnual = await cargarSerieRon();
  for (const [anio, url] of [...porAnio].sort((a, b) => a[0] - b[0])) {
    const name = baseName(url);
    const wb = await readWorkbook(source, name);
    if (!wb) {
      advertencias.push(`${name}: no está archivado`);
      continue;
    }
    const res = parseRonLibro(wb, anio, String(anio));
    // Hasta 2022 los libros vienen en miles de pesos y desde 2023 en millones, sin aviso en el archivo:
    // la unidad se deduce contra la serie anual oficial (en millones). Sin serie (2026) se asume millones.
    const mio = [...totalPorClave(res.rows)].filter(([k]) => serieAnual.has(k));
    const ref = mio.reduce((acc, [k]) => acc + (serieAnual.get(k) ?? 0), 0);
    const propio = mio.reduce((acc, [, v]) => acc + v, 0);
    if (ref > 0 && propio / ref > 100) {
      for (const r of res.rows) r.monto_pesos = Math.round(Number(r.monto_pesos) / 1000);
      console.log(`[${source}] ${anio}: libro en miles de pesos (reescalado)`);
    }
    rows.push(...res.rows);
    advertencias.push(...res.advertencias);
  }
  rows.sort(
    (a, b) =>
      Number(a.anio) - Number(b.anio) ||
      Number(a.mes) - Number(b.mes) ||
      String(a.provincia).localeCompare(String(b.provincia)) ||
      String(a.concepto).localeCompare(String(b.concepto)),
  );
  const out = await writeProcessed(source, "ron_mensual.csv", rows, ["anio", "mes", "provincia", "concepto", "monto_pesos"]);
  const mza = rows.filter((r) => r.provincia === "Mendoza").length;
  console.log(`[${source}] ${rows.length} filas (${mza} de Mendoza) -> ${out}`);
  for (const a of advertencias.slice(0, 40)) console.warn(`  ! ${a}`);
  if (advertencias.length > 40) console.warn(`  ! ... y ${advertencias.length - 40} advertencias más`);
  ronCompararSerie(rows, serieAnual);
}

// ---------------------------------------------------------------------------
// AIF: ejecución presupuestaria provincial
// ---------------------------------------------------------------------------

/**
 * Convierte la columna de conceptos de la AIF en una ruta jerárquica, p. ej.
 * "gastos corrientes > transferencias corrientes > al sector privado". Los niveles salen del
 * marcador de cada línea: numeral romano (nivel 0), ". " (nivel 1) y "- " (nivel 2).
 */
function rutasConcepto(etiquetas: Cell[]): (string | null)[] {
  const ruta: string[] = [];
  return etiquetas.map((e) => {
    if (typeof e !== "string" || !e.trim()) return null;
    let t = e.replace(/\s+/g, " ").trim();
    let nivel: number;
    if (/^[IVX]+\.\s/.test(t)) {
      nivel = 0;
      t = t.replace(/^[IVX]+\.\s*/, "");
    } else if (t.startsWith(". ")) {
      nivel = 1;
      t = t.slice(2);
    } else if (t.startsWith("- ")) {
      nivel = 2;
      t = t.slice(2);
    } else {
      return null; // notas al pie y títulos
    }
    // Fórmulas como "(I+IV)" o "(VII - Rentas de la Propiedad)" cambian de numeración entre archivos.
    t = t.replace(/\s*\([ivx]+\s*[-+][^)]*\)/gi, "").trim();
    t = flat(t);
    ruta.length = nivel;
    ruta[nivel] = t;
    return ruta.slice(0, nivel + 1).join(" > ");
  });
}

const ROMANOS: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

async function aif(refresh: boolean, soloParsear: boolean): Promise<void> {
  const source = ID.aif;
  const links = await listFiles(PAGES.aif, /\.(xlsx?|csv)$/i);
  if (!soloParsear) await download(source, links, refresh);

  const rows: Row[] = [];
  const advertencias: string[] = [];
  const vistos = new Set<string>();
  const push = (anio: number, trimestre: number, prov: string, concepto: string, valor: number) => {
    const k = `${anio}|${trimestre}|${prov}|${concepto}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    rows.push({ anio, trimestre, provincia: prov, concepto, valor: round(valor, 4), unidad: "millones_pesos" });
  };

  // 1) Serie anual (cuarto trimestre acumulado, 2005 en adelante): una hoja por provincia.
  const series = links
    .filter((u) => /serie_aif-apnf-\d{4}/i.test(u))
    .map(baseName)
    .sort();
  const serieName = series.pop();
  if (serieName) {
    const wb = await readWorkbook(source, serieName);
    if (wb) {
      for (const sheet of wb.SheetNames) {
        const prov = sheet.trim().toLowerCase() === "ciudad" ? "CABA" : provincia(sheet);
        if (!prov) continue;
        const g = grid(wb.Sheets[sheet] as XLSX.WorkSheet);
        const h = g.findIndex((r) => typeof r[0] === "string" && /^concepto/i.test(r[0].trim()));
        if (h < 0) {
          advertencias.push(`${serieName}/${sheet}: sin encabezado`);
          continue;
        }
        const anios = (g[h] as Cell[]).map((c) => num(c));
        const rutas = rutasConcepto(g.slice(h + 1).map((r) => r[0] ?? null));
        g.slice(h + 1).forEach((fila, i) => {
          const ruta = rutas[i];
          if (!ruta) return;
          anios.forEach((anio, c) => {
            if (anio === null || c === 0) return;
            const v = num(fila[c] ?? null);
            if (v !== null) push(anio, 4, prov, ruta, v);
          });
        });
      }
    }
  }

  // 2) Archivos trimestrales (acumulado del año hasta el trimestre): provincias en columnas.
  const trimestrales = links
    .map((u) => ({ u, m: /apnf_(\d{4})_-_trim[._]*\s*(iv|iii|ii|i)(?:[._]|$)/i.exec(baseName(u)) }))
    .filter((x) => x.m)
    .map((x) => ({ name: baseName(x.u), anio: Number(x.m?.[1]), trim: ROMANOS[(x.m?.[2] ?? "").toLowerCase()] as number }))
    .sort((a, b) => a.anio - b.anio || a.trim - b.trim);
  let trimParseados = 0;
  for (const { name, anio, trim } of trimestrales) {
    const wb = await readWorkbook(source, name);
    const ws = wb?.Sheets[wb.SheetNames[0] ?? ""];
    if (!wb || !ws) continue;
    const g = grid(ws);
    const h = g.findIndex((r) => typeof r[0] === "string" && /^concepto/i.test(r[0].trim()));
    if (h < 0) {
      advertencias.push(`${name}: sin encabezado "Concepto"`);
      continue;
    }
    const cols: { c: number; prov: string }[] = [];
    (g[h] as Cell[]).forEach((cell, c) => {
      const p = typeof cell === "string" ? provincia(cell) : null;
      if (p && c > 0) cols.push({ c, prov: p });
    });
    if (cols.length < 20) advertencias.push(`${name}: solo ${cols.length} provincias en el encabezado`);
    const rutas = rutasConcepto(g.slice(h + 1).map((r) => r[0] ?? null));
    let n = 0;
    g.slice(h + 1).forEach((fila, i) => {
      const ruta = rutas[i];
      if (!ruta) return;
      for (const { c, prov } of cols) {
        const v = num(fila[c] ?? null);
        if (v === null) continue;
        push(anio, trim, prov, ruta, v); // el cuarto trimestre ya viene de la serie: no se pisa
        n++;
      }
    });
    if (n > 0) trimParseados++;
  }
  console.log(`[${source}] archivos trimestrales leídos: ${trimParseados}/${trimestrales.length}`);

  rows.sort(
    (a, b) =>
      Number(a.anio) - Number(b.anio) ||
      Number(a.trimestre) - Number(b.trimestre) ||
      String(a.provincia).localeCompare(String(b.provincia)),
  );
  const out = await writeProcessed(source, "aif_trimestral.csv", rows, ["anio", "trimestre", "provincia", "concepto", "valor", "unidad"]);
  console.log(`[${source}] ${rows.length} filas -> ${out} (valores acumulados del año hasta el trimestre)`);
  for (const a of advertencias.slice(0, 30)) console.warn(`  ! ${a}`);
}

// ---------------------------------------------------------------------------
// Ocupación y salarios
// ---------------------------------------------------------------------------

async function ocupacion(refresh: boolean, soloParsear: boolean): Promise<void> {
  const source = ID.ocupacion;
  const links = await listFiles(PAGES.ocupacion, /\.(xlsx?|csv)$/i);
  if (!soloParsear) await download(source, links, refresh);
  // Since October 2026 the series comes split by period (ocupacion_salarios_2017_2025.xlsx, …), one sheet
  // per year; before that it was a single workbook. The same page also lists other tables (planta_ocupada,
  // escalafon_apnf_<year>, …) that this parser does not read.
  const names = links.map(baseName);
  const split = names.filter((n) => /^ocupacion_salarios_\d{4}_\d{4}\.xlsx?$/i.test(n)).sort();
  const single = names
    .filter((n) => /ocupacion_salarios/i.test(n))
    .sort()
    .pop();
  const books = split.length ? split : single ? [single] : [];
  const workbooks = (await Promise.all(books.map((n) => readWorkbook(source, n)))).filter((wb) => wb !== null);
  if (!workbooks.length || workbooks.length !== books.length) {
    console.warn(`[${source}] faltan libros archivados: ${books.join(", ") || "ninguno en la página"}`);
    return;
  }
  const sheets = workbooks.flatMap((wb) => wb.SheetNames.map((sheet) => ({ sheet, ws: wb.Sheets[sheet] as XLSX.WorkSheet })));
  const rows: Row[] = [];
  const advertencias: string[] = [];
  const columnas: [RegExp, string, string][] = [
    [/gasto en personal/, "gasto_personal", "miles_pesos"],
    [/planta/, "planta_ocupada", "cargos"],
    [/gasto medio/, "gasto_medio_mensual", "pesos"],
    [/cada mil/, "empleados_cada_mil_habitantes", "por_mil_habitantes"],
    [/habitantes/, "habitantes", "personas"],
  ];
  for (const { sheet, ws } of sheets) {
    const anio = Number(sheet);
    if (!Number.isInteger(anio)) continue;
    const g = grid(ws);
    const h = g.findIndex((r) => r.some((c) => typeof c === "string" && /^(jurisdicciones|provincias)$/i.test(c.trim())));
    if (h < 0) {
      advertencias.push(`${sheet}: sin encabezado`);
      continue;
    }
    const head = g[h] as Cell[];
    const mapa = new Map<number, [string, string]>();
    head.forEach((cell, c) => {
      if (typeof cell !== "string") return;
      const t = flat(cell).replace(/\s+/g, " ");
      const m = columnas.find(([re]) => re.test(t));
      if (m) mapa.set(c, [m[1], m[2]]);
    });
    if (mapa.size < 5) advertencias.push(`${sheet}: solo ${mapa.size} columnas reconocidas`);
    const vistas = new Set<string>();
    for (const fila of g.slice(h + 1)) {
      const label = fila.find((c) => typeof c === "string") ?? null;
      const prov = provincia(label);
      if (!prov || vistas.has(prov)) continue;
      vistas.add(prov);
      for (const [c, [concepto, unidad]] of mapa) {
        const v = num(fila[c] ?? null);
        if (v !== null) rows.push({ anio, trimestre: "", provincia: prov, concepto, valor: round(v, 4), unidad });
      }
    }
    if (vistas.size !== 24) advertencias.push(`${sheet}: ${vistas.size} jurisdicciones (esperadas 24)`);
  }
  const out = await writeProcessed(source, "ocupacion_salarios.csv", rows, [
    "anio",
    "trimestre",
    "provincia",
    "concepto",
    "valor",
    "unidad",
  ]);
  console.log(`[${source}] ${rows.length} filas -> ${out}`);
  for (const a of advertencias.slice(0, 30)) console.warn(`  ! ${a}`);
}

// ---------------------------------------------------------------------------
// Deuda provincial
// ---------------------------------------------------------------------------

/** Período (anio, trimestre) a partir del nombre del archivo de stock. */
function periodoDeuda(name: string): { anio: number; trim: number } | null {
  const n = name.toLowerCase();
  let m = /stock_consolidado_(\d{4})_-_(\d{2})(\d{2})/.exec(n);
  if (m) {
    const trim = { "03": 1, "06": 2, "09": 3, "12": 4 }[m[3] as string];
    return trim ? { anio: Number(m[1]), trim } : null;
  }
  m = /stock_de_deuda_(\d)t(\d{4})/.exec(n);
  if (m) return { anio: Number(m[2]), trim: Number(m[1]) };
  m = /stock_(i{1,3}|iv)_trim_(\d{4})/.exec(n);
  if (m) return { anio: Number(m[2]), trim: ROMANOS[m[1] as string] as number };
  return null;
}

function conceptoDeuda(header: string): string {
  const t = flat(header)
    .replace(/\(\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/fffir|infraestruc/.test(t)) return "fffir";
  if (/ffdp|desarrollo provincial/.test(t)) return "ffdp";
  if (/^titulos publicos$/.test(t)) return "bonos";
  if (/^entidades bancarias/.test(t)) return "bancos";
  return t.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function deuda(refresh: boolean, soloParsear: boolean): Promise<void> {
  const source = ID.deuda;
  const links = await listFiles(PAGES.deuda, /\.(xlsx?|csv)$/i);
  if (!soloParsear) await download(source, links, refresh);

  const stocks = links
    .map(baseName)
    .map((name) => ({ name, p: periodoDeuda(name) }))
    .filter((x): x is { name: string; p: { anio: number; trim: number } } => x.p !== null)
    .sort((a, b) => a.p.anio - b.p.anio || a.p.trim - b.p.trim || a.name.localeCompare(b.name));
  const rows: Row[] = [];
  const advertencias: string[] = [];
  const periodos = new Set<string>();
  for (const { name, p } of stocks) {
    const clave = `${p.anio}T${p.trim}`;
    if (periodos.has(clave)) {
      advertencias.push(`${name}: período ${clave} repetido, se usa el primer archivo`);
      continue;
    }
    const wb = await readWorkbook(source, name);
    const ws = wb?.Sheets[wb.SheetNames[0] ?? ""];
    if (!wb || !ws) {
      advertencias.push(`${name}: no está archivado`);
      continue;
    }
    const g = grid(ws);
    let hr = -1;
    let hc = 0;
    g.some((r, i) => {
      const c = r.findIndex((x) => typeof x === "string" && /^jurisdicci/i.test(flat(x).trim()));
      if (c >= 0) {
        hr = i;
        hc = c;
        return true;
      }
      return false;
    });
    if (hr < 0) {
      advertencias.push(`${name}: sin encabezado "Jurisdicción"`);
      continue;
    }
    // Unidad: la última mención "en miles/millones de pesos" por encima del encabezado.
    let divisor = 1;
    for (let i = 0; i <= hr; i++) {
      for (const cell of g[i] ?? []) {
        const m = typeof cell === "string" ? /en (miles|millones) de pesos/i.exec(flat(cell)) : null;
        if (m) divisor = m[1]?.toLowerCase() === "miles" ? 1000 : 1;
      }
    }
    const cols: { c: number; concepto: string }[] = [];
    (g[hr] as Cell[]).forEach((cell, c) => {
      if (c > hc && typeof cell === "string" && cell.trim()) cols.push({ c, concepto: conceptoDeuda(cell) });
    });
    const vistas = new Set<string>();
    for (const fila of g.slice(hr + 1)) {
      const prov = provincia(fila[hc] ?? null);
      if (!prov || vistas.has(prov)) continue;
      vistas.add(prov);
      for (const { c, concepto } of cols) {
        const v = num(fila[c] ?? null);
        if (v !== null)
          rows.push({ anio: p.anio, trimestre: p.trim, provincia: prov, concepto, valor: round(v / divisor, 4), unidad: "millones_pesos" });
      }
    }
    if (vistas.size !== 24) advertencias.push(`${name}: ${vistas.size} jurisdicciones (esperadas 24)`);
    periodos.add(clave);
  }
  const out = await writeProcessed(source, "deuda_stock.csv", rows, ["anio", "trimestre", "provincia", "concepto", "valor", "unidad"]);
  console.log(`[${source}] ${rows.length} filas, ${periodos.size} trimestres -> ${out}`);
  for (const a of advertencias.slice(0, 30)) console.warn(`  ! ${a}`);
}

// ---------------------------------------------------------------------------

export async function run(args: string[]): Promise<void> {
  const refresh = args.includes("--refresh");
  const soloParsear = args.includes("--solo-parsear");
  const pedidas = args.filter((a) => !a.startsWith("--")) as Fuente[];
  const fuentes: Fuente[] = pedidas.length ? pedidas : ["ron", "aif", "ocupacion", "deuda"];
  const tareas: Record<Fuente, () => Promise<void>> = {
    ron: () => ron(refresh, soloParsear),
    aif: () => aif(refresh, soloParsear),
    ocupacion: () => ocupacion(refresh, soloParsear),
    deuda: () => deuda(refresh, soloParsear),
  };
  for (const f of fuentes) {
    if (!tareas[f]) {
      console.error(`Fuente desconocida: ${f} (opciones: ${Object.keys(tareas).join(", ")})`);
      process.exit(1);
    }
  }
  for (const f of fuentes) await tareas[f]();
}
