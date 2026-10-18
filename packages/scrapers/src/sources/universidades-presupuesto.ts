/**
 * Transferencias del Tesoro nacional a las universidades nacionales con sede en Mendoza
 * (UNCuyo y UTN), desde los datasets de Presupuesto Abierto (Ministerio de Economía).
 *
 * Uso: `bun run scrape universidades-presupuesto [--refresh] [--solo-parsear] [--desde AAAA]`
 *
 * Fuente:
 *  - Catálogo: https://www.presupuestoabierto.gob.ar/sici/rest-api/catalog/site
 *    (de ahí salen las URLs de cada ejercicio y su fecha de actualización).
 *  - Ejecución anual: https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/<año>/credito-anual-<año>.zip
 *    ZIP de ~3 MB con un CSV UTF-8 con BOM de 20 a 110 MB, coma decimal. IMPORTES EN MILLONES DE PESOS.
 *    Se procesa en streaming (descompresión por trozos y CSV incremental): nunca se carga el CSV entero.
 *
 * Filtro (por CÓDIGO, no por nombre: los nombres cambian de mayúsculas y tildes entre años):
 *  inciso_id = 5 (Transferencias), principal_id = 6 (Transferencias a universidades nacionales) y
 *  subparcial_id = 811 (Universidad Nacional de Cuyo) o 835 (Universidad Tecnológica Nacional).
 *  `entidad_desc` no sirve: ahí figura la Secretaría de Educación.
 *
 * Por qué la UTN es "nacional": la UTN figura como una sola universidad para todo el país. Ninguna fuente
 * separa las facultades regionales de Mendoza y San Rafael, y sus pagos figuran en CABA. Por eso sus filas
 * llevan alcance = "nacional" (la UNCuyo, "mendoza") y no se pueden atribuir a la provincia.
 *
 * Cobertura: desde 1996. El ejercicio 1995 no abre las transferencias por universidad (subparcial 0), así
 * que no se puede filtrar. Del resto se descartan los ejercicios que el catálogo no lista.
 *
 * UTN en 2004: no falta. Mantiene el subparcial 835 todos los años (el hueco aparente salió de una lectura
 * truncada en el relevamiento); no hay códigos alternativos para la misma universidad.
 *
 * Archivo crudo: cada ZIP original se baja a un directorio temporal (fuera del repo) y NO se archiva (son ~3 MB
 * por año y ~90 MB en total para quedarnos con unas decenas de filas). En data/raw se guarda por año solo un
 * extracto (extracto-<año>.csv: las filas originales, con todas sus columnas, que pasan el filtro) y
 * origen-<año>.json con la URL del ZIP, su sha256 y los conteos. Si el sha256 del ZIP no cambió, no se archiva nada.
 * El procesado sale siempre de los extractos, así que --solo-parsear funciona sin red.
 *
 * Salida: data/processed/universidades-presupuesto/transferencias_anuales.csv (+ .meta.json), en PESOS
 * nominales (millones x 1.000.000, exacto al centavo: la suma se hace con enteros, sin coma flotante).
 *
 * Idempotente: los ejercicios cerrados ya archivados no se vuelven a pedir (salvo --refresh); el del año actual
 * y el anterior se piden siempre y solo se archivan si cambió el sha256 del ZIP.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archive, get, latestRaw, PROCESSED_DIR, parseCsv, type Row, readRaw, sleep, toCsv, writeProcessed } from "@mt/core";
import { Unzip, UnzipInflate } from "fflate";

const SOURCE = "universidades-presupuesto";
const CATALOG_URL = "https://www.presupuestoabierto.gob.ar/sici/rest-api/catalog/site";
const FIRST_YEAR = 1996;
const OUTPUT = "transferencias_anuales.csv";

const INCISO_TRANSFERS = "5";
const PRINCIPAL_UNIVERSITIES = "6";
const UNIVERSITIES: Record<string, { id: "uncuyo" | "utn"; name: string; scope: "mendoza" | "nacional" }> = {
  "811": { id: "uncuyo", name: "Universidad Nacional de Cuyo", scope: "mendoza" },
  "835": { id: "utn", name: "Universidad Tecnológica Nacional", scope: "nacional" },
};

// ---------------------------------------------------------------------------
// Catálogo y descarga
// ---------------------------------------------------------------------------

interface CatalogEntry {
  urlArchivo?: string;
  fechaDeActualizacion?: string;
  ejercicios?: number[];
}

const MONTHS: Record<string, string> = {
  ene: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  sep: "09",
  set: "09",
  oct: "10",
  nov: "11",
  dic: "12",
};

/** "14 oct 2026", "01 Julio 2025" -> "2026-10-14". Null si no se reconoce. */
export function parseSpanishDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{4})/i);
  const month = m?.[2] ? MONTHS[m[2].slice(0, 3).toLowerCase()] : undefined;
  if (!m || !month) return null;
  return `${m[3]}-${month}-${m[1]?.padStart(2, "0")}`;
}

interface YearSource {
  year: number;
  url: string;
  filename: string;
  catalogDate: string | null;
}

/** Ejercicios disponibles según el catálogo (con la URL y la fecha de actualización de cada uno). */
async function discoverYears(): Promise<YearSource[]> {
  const catalog = (await (await get(CATALOG_URL)).json()) as { ejercicioActual?: number; distribuciones?: CatalogEntry[] };
  const out: YearSource[] = [];
  for (const d of catalog.distribuciones ?? []) {
    const m = d.urlArchivo?.match(/\/credito-anual-(\d{4})\.zip$/);
    if (!m || !d.urlArchivo) continue;
    const year = Number(m[1]);
    if (year < FIRST_YEAR) continue;
    out.push({
      year,
      url: d.urlArchivo,
      filename: `credito-anual-${year}.zip`,
      catalogDate: parseSpanishDate(d.fechaDeActualizacion ?? ""),
    });
  }
  if (!out.length) throw new Error("El catálogo de Presupuesto Abierto no lista ejecuciones anuales (¿cambió el formato?)");
  out.sort((a, b) => a.year - b.year);
  return out;
}

/** Directorio temporal fuera del repo: los ZIP originales (~3 MB, hasta 110 MB descomprimidos) no se archivan. */
const TMP = join(tmpdir(), "mt-universidades-presupuesto");

const extractName = (year: number) => `extracto-${year}.csv`;
const originName = (year: number) => `origen-${year}.json`;

interface Origin {
  anio: number;
  url: string;
  sha256: string;
  bytes: number;
  fecha_catalogo: string | null;
  filas_originales: number;
  filas_extracto: number;
}

async function readOrigin(year: number): Promise<Origin | null> {
  const path = await latestRaw(SOURCE, originName(year));
  return path ? (JSON.parse((await readRaw(path)).toString("utf8")) as Origin) : null;
}

/**
 * Baja cada ZIP a un directorio temporal, saca el extracto (las filas originales que pasan el filtro) y archiva
 * en data/raw solo ese extracto, más un JSON con la URL y el sha256 del ZIP original. Si el sha256 del ZIP no
 * cambió respecto del último archivado, no se archiva nada. Los ejercicios cerrados ya archivados no se piden.
 */
async function sync(years: YearSource[], refresh: boolean): Promise<void> {
  const current = Math.max(...years.map((y) => y.year));
  let fresh = 0;
  let unchanged = 0;
  let skipped = 0;
  const errors: string[] = [];
  await mkdir(TMP, { recursive: true });
  try {
    for (const y of years) {
      const previous = await readOrigin(y.year);
      if (previous && !refresh && y.year < current - 1) {
        skipped++;
        continue;
      }
      try {
        const resp = await get(y.url);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (previous?.sha256 === sha256) {
          unchanged++;
        } else {
          const zipPath = join(TMP, y.filename);
          await writeFile(zipPath, bytes);
          const extract = await extractYear(y.year, new Uint8Array(await readFile(zipPath)));
          const csv = toCsv(
            extract.rows.map((r) => Object.fromEntries(extract.header.map((h, i) => [h, r[i] ?? ""]))),
            extract.header,
          );
          const origin: Origin = {
            anio: y.year,
            url: y.url,
            sha256,
            bytes: bytes.length,
            fecha_catalogo: y.catalogDate,
            filas_originales: extract.totalRows,
            filas_extracto: extract.rows.length,
          };
          await archive(SOURCE, extractName(y.year), csv, { url: y.url });
          await archive(SOURCE, originName(y.year), `${JSON.stringify(origin, null, 2)}\n`, { url: y.url });
          fresh++;
          await rm(zipPath, { force: true });
        }
      } catch (err) {
        errors.push(`${y.filename}: ${(err as Error).message}`);
      }
      await sleep(700);
    }
  } finally {
    await rm(TMP, { recursive: true, force: true });
  }
  console.log(
    `[${SOURCE}] ${years.length} ejercicios: ${fresh} archivados, ${unchanged} sin cambios, ${skipped} ya archivados, ${errors.length} con error`,
  );
  for (const e of errors) console.warn(`  ! ${e}`);
}

// ---------------------------------------------------------------------------
// Lectura en streaming
// ---------------------------------------------------------------------------

/** Parser CSV incremental (RFC 4180): se alimenta por trozos y llama a `onRow` por cada fila completa. */
export class CsvStream {
  private row: string[] = [];
  private field = "";
  private quoted = false;
  private pendingQuote = false; // vimos una comilla dentro de un campo entrecomillado
  private pendingCr = false;
  private first = true;
  constructor(private onRow: (row: string[]) => void) {}

  private endRow() {
    this.row.push(this.field);
    this.field = "";
    this.onRow(this.row);
    this.row = [];
  }

  push(chunk: string) {
    let text = chunk;
    if (this.first) {
      this.first = false;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (this.pendingCr) {
        this.pendingCr = false;
        if (c === "\n") continue;
      }
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (c === '"') {
          this.field += '"';
          continue;
        }
        this.quoted = false; // la comilla anterior cerraba el campo; este carácter se procesa normal
      }
      if (this.quoted) {
        if (c === '"') this.pendingQuote = true;
        else this.field += c;
      } else if (c === '"') this.quoted = true;
      else if (c === ",") {
        this.row.push(this.field);
        this.field = "";
      } else if (c === "\n") this.endRow();
      else if (c === "\r") {
        this.endRow();
        this.pendingCr = true;
      } else this.field += c;
    }
  }

  end() {
    if (this.field || this.row.length) this.endRow();
  }
}

/** Importe en millones de pesos con coma decimal ("6,18", "-1,5") -> centavos de peso (BigInt), exacto. */
export function millionsToCents(text: string): bigint {
  const s = text.trim();
  if (!s) return 0n;
  const m = s.match(/^(-?)(\d+)(?:,(\d+))?$/);
  if (!m) throw new Error(`Importe con formato inesperado: "${s}"`);
  const frac = m[3] ?? "";
  // millones -> centavos: desplazar 8 lugares (6 de millón + 2 de centavo); lo que sobra se redondea.
  const digits = (m[2] + frac.padEnd(8, "0").slice(0, 8)).replace(/^0+(?=\d)/, "");
  let cents = BigInt(digits);
  if (frac.length > 8 && Number(frac[8]) >= 5) cents += 1n;
  return m[1] ? -cents : cents;
}

export function centsToText(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const s = abs.toString().padStart(3, "0");
  return `${negative ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

interface Accum {
  year: number;
  universityKey: string;
  program: string;
  activity: string;
  inciso: string;
  source: string;
  programId: string;
  activityId: string;
  initial: bigint;
  current: bigint;
  accrued: bigint;
  paid: bigint;
  cutoff: string;
}

const REQUIRED = [
  "inciso_id",
  "inciso_desc",
  "principal_id",
  "subparcial_id",
  "programa_id",
  "programa_desc",
  "actividad_id",
  "actividad_desc",
  "fuente_financiamiento_id",
  "fuente_financiamiento_desc",
  "credito_presupuestado",
  "credito_vigente",
  "credito_devengado",
  "credito_pagado",
] as const;

interface Extract {
  header: string[];
  rows: string[][];
  totalRows: number;
}

/** Lee el ZIP por trozos y devuelve las filas originales (todas sus columnas) que pasan el filtro por código. */
async function extractYear(year: number, zip: Uint8Array): Promise<Extract> {
  let header: string[] | null = null;
  let idx: Record<string, number> = {};
  let totalRows = 0;
  let sawFile = false;
  const rows: string[][] = [];

  const csv = new CsvStream((row) => {
    if (!header) {
      header = row.map((h) => h.trim());
      checkHeader(year, header);
      idx = Object.fromEntries(REQUIRED.map((name) => [name, (header as string[]).indexOf(name)]));
      return;
    }
    totalRows++;
    if (row[idx.inciso_id as number] !== INCISO_TRANSFERS || row[idx.principal_id as number] !== PRINCIPAL_UNIVERSITIES) return;
    if (UNIVERSITIES[row[idx.subparcial_id as number] ?? ""]) rows.push(row);
  });

  const decoder = new TextDecoder("utf-8");
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    if (!file.name.toLowerCase().endsWith(".csv")) return;
    sawFile = true;
    file.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      try {
        csv.push(decoder.decode(chunk, { stream: !final }));
        if (final) csv.end();
      } catch (e) {
        failure = e as Error;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  // Se empuja el ZIP de a 64 KB; cada trozo descomprimido se parsea y se descarta.
  const STEP = 64 * 1024;
  for (let at = 0; at < zip.length && !failure; at += STEP) unzip.push(zip.subarray(at, at + STEP), at + STEP >= zip.length);
  if (failure) throw failure;
  if (!sawFile || !header) throw new Error(`Ejercicio ${year}: el ZIP no trae un CSV legible`);
  return { header, rows, totalRows };
}

function checkHeader(year: number, header: string[]) {
  for (const name of REQUIRED)
    if (!header.includes(name)) throw new Error(`Ejercicio ${year}: falta la columna ${name} (cambió el esquema)`);
}

interface YearResult {
  rows: Accum[];
}

/** Agrega el extracto por (universidad, programa, actividad, inciso, fuente de financiamiento). */
function aggregateYear(year: number, header: string[], rawRows: string[][], fallbackDate: string | null): YearResult {
  checkHeader(year, header);
  const col = (name: string) => header.indexOf(name);
  const cutoffAt = col("ultima_actualizacion_fecha");
  const groups = new Map<string, Accum>();
  for (const row of rawRows) {
    const get = (name: string) => row[col(name)] ?? "";
    const university = UNIVERSITIES[get("subparcial_id")];
    if (!university) continue;
    const cutoff = (cutoffAt >= 0 ? parseSpanishDate(row[cutoffAt] ?? "") : null) ?? fallbackDate ?? "";
    const key = [university.id, get("programa_id"), get("actividad_id"), get("inciso_id"), get("fuente_financiamiento_id")].join("|");
    let g = groups.get(key);
    if (!g) {
      g = {
        year,
        universityKey: university.id,
        program: get("programa_desc").trim(),
        activity: get("actividad_desc").trim(),
        inciso: get("inciso_desc").trim(),
        source: get("fuente_financiamiento_desc").trim(),
        programId: get("programa_id"),
        activityId: get("actividad_id"),
        initial: 0n,
        current: 0n,
        accrued: 0n,
        paid: 0n,
        cutoff,
      };
      groups.set(key, g);
    }
    g.initial += millionsToCents(get("credito_presupuestado"));
    g.current += millionsToCents(get("credito_vigente"));
    g.accrued += millionsToCents(get("credito_devengado"));
    g.paid += millionsToCents(get("credito_pagado"));
    if (cutoff > g.cutoff) g.cutoff = cutoff;
  }
  return { rows: [...groups.values()] };
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const COLUMNS = [
  "anio",
  "universidad_id",
  "universidad",
  "alcance",
  "programa_id",
  "programa",
  "actividad_id",
  "actividad",
  "inciso",
  "fuente_financiamiento",
  "credito_inicial",
  "credito_vigente",
  "devengado",
  "pagado",
  "fecha_corte",
];

const META = {
  titulo: "Transferencias de Nación a las universidades nacionales de Mendoza",
  descripcion:
    "Cada fila es lo que el Tesoro nacional presupuestó, devengó y pagó en un año a la UNCuyo o a la UTN, por programa, actividad y fuente de financiamiento. Montos en pesos nominales, sin ajustar por inflación. Ojo con la UTN: figura como una sola universidad para todo el país y no se puede separar lo que va a las facultades regionales de Mendoza y San Rafael (sus pagos figuran en Capital Federal), así que sus filas son un total nacional y no deben leerse como plata de Mendoza. La UNCuyo sí es una institución con sede en la provincia. Los datos del año en curso son parciales: llegan hasta la fecha de corte.",
  columnas: {
    anio: { etiqueta: "Año", tipo: "anio" },
    universidad_id: { etiqueta: "Código de universidad", tipo: "texto", oculta: true },
    universidad: { etiqueta: "Universidad", tipo: "texto" },
    alcance: {
      etiqueta: "Alcance",
      tipo: "texto",
      descripcion:
        "«Mendoza» es una universidad con sede en la provincia. «Nacional» es el total de una universidad que reporta una sola cifra para todo el país (la UTN).",
      valores: { mendoza: "Mendoza", nacional: "Todo el país" },
    },
    programa_id: { etiqueta: "Código de programa", tipo: "texto", oculta: true },
    programa: {
      etiqueta: "Programa",
      tipo: "texto",
      descripcion: "Programa presupuestario del Ministerio de Capital Humano que transfiere el dinero.",
    },
    actividad_id: { etiqueta: "Código de actividad", tipo: "texto", oculta: true },
    actividad: {
      etiqueta: "Actividad",
      tipo: "texto",
      descripcion: "Para qué se transfiere (salario docente, no docente, funcionamiento, hospitales, ciencia y técnica, etc.).",
    },
    inciso: { etiqueta: "Tipo de gasto", tipo: "texto" },
    fuente_financiamiento: {
      etiqueta: "Fuente de financiamiento",
      tipo: "texto",
      descripcion: "De dónde sale la plata: Tesoro Nacional, crédito externo, etc.",
    },
    credito_inicial: {
      etiqueta: "Presupuesto inicial",
      tipo: "moneda",
      moneda: "ARS",
      escala: 1,
      descripcion: "Lo que fijó la ley de presupuesto al empezar el año.",
    },
    credito_vigente: {
      etiqueta: "Presupuesto vigente",
      tipo: "moneda",
      moneda: "ARS",
      escala: 1,
      descripcion: "Presupuesto con las modificaciones hechas durante el año, a la fecha de corte.",
    },
    devengado: {
      etiqueta: "Devengado",
      tipo: "moneda",
      moneda: "ARS",
      escala: 1,
      descripcion: "Gasto reconocido (la obligación de pago ya nació), a la fecha de corte.",
    },
    pagado: {
      etiqueta: "Pagado",
      tipo: "moneda",
      moneda: "ARS",
      escala: 1,
      descripcion: "Lo efectivamente transferido, a la fecha de corte.",
    },
    fecha_corte: {
      etiqueta: "Fecha de corte",
      tipo: "fecha",
      descripcion: "Última actualización de Presupuesto Abierto para ese ejercicio.",
    },
  },
  orden: [
    "anio",
    "universidad",
    "alcance",
    "actividad",
    "devengado",
    "credito_vigente",
    "pagado",
    "credito_inicial",
    "programa",
    "fuente_financiamiento",
    "fecha_corte",
  ],
  agruparPor: "universidad",
};

async function writeMeta() {
  await writeFile(join(PROCESSED_DIR, SOURCE, "transferencias_anuales.meta.json"), `${JSON.stringify(META, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export async function run(args: string[]) {
  const refresh = args.includes("--refresh");
  const onlyParse = args.includes("--solo-parsear");
  const fromAt = args.indexOf("--desde");
  const from = fromAt >= 0 ? Number(args[fromAt + 1]) : FIRST_YEAR;
  const started = Date.now();

  const years = (await discoverYears()).filter((y) => y.year >= Math.max(from, FIRST_YEAR));
  if (!onlyParse) await sync(years, refresh);

  const rows: Row[] = [];
  const summary: string[] = [];
  const all: Accum[] = [];
  for (const y of years) {
    const path = await latestRaw(SOURCE, extractName(y.year));
    if (!path) {
      console.warn(`  ! ${y.year}: no hay extracto archivado, se omite`);
      continue;
    }
    const [header, ...extract] = parseCsv((await readRaw(path)).toString("utf8")).filter((r) => r.length > 1 || r[0]);
    const origin = await readOrigin(y.year);
    const result = aggregateYear(y.year, header ?? [], extract, y.catalogDate);
    all.push(...result.rows);
    const perUni = (id: string) => result.rows.filter((r) => r.universityKey === id).length;
    summary.push(
      `${y.year}: ${origin?.filas_originales ?? "?"} filas originales, ${extract.length} en el extracto, uncuyo ${perUni("uncuyo")} y utn ${perUni("utn")} filas agregadas`,
    );
    if (!perUni("uncuyo") || !perUni("utn"))
      console.warn(`  ! ${y.year}: falta alguna universidad (uncuyo ${perUni("uncuyo")}, utn ${perUni("utn")})`);
  }
  for (const line of summary) console.log(`  ${line}`);

  const info = Object.fromEntries(Object.values(UNIVERSITIES).map((u) => [u.id, u]));
  all.sort(
    (a, b) =>
      a.year - b.year ||
      a.universityKey.localeCompare(b.universityKey) ||
      Number(a.programId) - Number(b.programId) ||
      Number(a.activityId) - Number(b.activityId) ||
      a.source.localeCompare(b.source),
  );
  for (const g of all) {
    const u = info[g.universityKey];
    if (!u) continue;
    rows.push({
      anio: g.year,
      universidad_id: u.id,
      universidad: u.name,
      alcance: u.scope,
      programa_id: g.programId,
      programa: g.program,
      actividad_id: g.activityId,
      actividad: g.activity,
      inciso: g.inciso,
      fuente_financiamiento: g.source,
      credito_inicial: centsToText(g.initial),
      credito_vigente: centsToText(g.current),
      devengado: centsToText(g.accrued),
      pagado: centsToText(g.paid),
      fecha_corte: g.cutoff,
    });
  }
  if (!rows.length) throw new Error("No se obtuvo ninguna fila: no se escribe el CSV");
  const path = await writeProcessed(SOURCE, OUTPUT, rows, COLUMNS);
  await writeMeta();

  // Totales por año y universidad (en millones) para comparar a ojo con el Anuario y Presupuesto Abierto.
  const totals = new Map<string, bigint>();
  for (const g of all) totals.set(`${g.year} ${g.universityKey}`, (totals.get(`${g.year} ${g.universityKey}`) ?? 0n) + g.accrued);
  console.log(`[${SOURCE}] ${rows.length} filas -> ${path}`);
  for (const [k, v] of totals) if (/^(2024|2025|2026) /.test(k)) console.log(`  devengado ${k}: $${centsToText(v)}`);
  console.log(`[${SOURCE}] listo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
