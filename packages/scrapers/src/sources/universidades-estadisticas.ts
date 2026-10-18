/**
 * Anuario de Estadísticas Universitarias: Universidad Nacional de Cuyo (UNCuyo) y Universidad Tecnológica Nacional (UTN).
 *
 * Fuente: Subsecretaría de Políticas Universitarias, Ministerio de Capital Humano.
 *   https://www.argentina.gob.ar/educacion/universidades/informacion/publicaciones/anuarios  (redirige a /capital-humano/...)
 * Los ZIP de cada anuario se descubren desde esa página (los links cambian de nombre y de carpeta de un año a otro) y se archivan
 * como anuario_<año>.zip (anuario_2024_adelanto.zip si el link dice "Adelanto"). Dentro hay un XLSX (o XLS) por capítulo.
 * Cada anuario se lee con fflate y se parsea por TÍTULO de cuadro y por TEXTO de encabezado, no por posición de hoja ni de columna:
 * los capítulos cambian de nombre y de orden entre años. Los de 2014 a 2017 usan otro diseño de libro y no se leen (ver MIN_YEAR).
 *
 * Instituciones (en el Anuario figuran como "Cuyo" y "Tecnológica Nacional"):
 *   - uncuyo: alcance "mendoza". La UNCuyo tiene sedes en Mendoza, San Rafael, General Alvear, Valle de Uco y el Este, pero
 *     las fuentes nacionales la tratan como una sola institución con sede en la provincia.
 *   - utn: alcance "nacional". La UTN reporta como UNA sola universidad para todo el país: ningún cuadro separa las facultades
 *     regionales de Mendoza ni de San Rafael. La región CPRES "Nuevo Cuyo" mezcla cuatro provincias y NO se usa como dato de Mendoza.
 *
 * Salidas (data/processed/universidades-estadisticas/), una fila por universidad, año y desglose:
 *   - estudiantes.csv: nivel pregrado_grado (cuadros 2.1.1 estudiantes, 2.1.2 nuevos inscriptos, 2.1.3 reinscriptos, 2.1.4 egresados;
 *     en 2018 a 2021 no hay cuadro de reinscriptos y el de egresados es el 2.1.3) y posgrado (3.1.1 a 3.1.3, sin reinscriptos).
 *     Son series de varios años: cada anuario trae 10 o 11 años y se queda el dato del anuario más nuevo que lo trae.
 *   - personal.csv (capítulo 4): docentes universitarios por dedicación (4.4: total, exclusiva, semiexclusiva, simple y otro), docentes
 *     preuniversitarios (4.9), autoridades superiores y personal no docente por categoría (4.20 en 2020 a 2024; 4.21 en 2018).
 *     `cargos` es la cantidad de cargos; `personas` sale del cuadro 4.1 (personas por escalafón, una por escalafón) y solo está en
 *     la fila de total. Una persona puede tener varios cargos: no son comparables. Los años sin anuario con detalle (2019, 2022 y antes
 *     de 2018) se completan con las series de dedicación 4.5 a 4.7 (2014 a 2024 entre todos los anuarios), sin total ni "otro".
 *   - presupuesto.csv (capítulo 5): TODOS los montos en PESOS NOMINALES (corrientes de cada año), con centavos.
 *       inversion_estado_total (5.2 serie desde 2015 y 5.2.2 del año): lo que la Nación le transfirió a la universidad, todas las fuentes;
 *       inversion_estado_tesoro_nacional / _recursos_propios / _afectacion_especifica / _transferencias_externas / _credito_externo (5.2.2);
 *       recursos_propios_recaudados (5.4 serie): lo que la universidad recaudó por su cuenta;
 *       gasto_total y gasto_fuente_* (5.13): ejecución del año por fuente de financiamiento (incluye remanentes de años anteriores);
 *       gasto_inciso_* (5.6): ejecución por objeto del gasto (personal, bienes de consumo, servicios no personales, bienes de uso,
 *         transferencias, otros incisos);
 *       gasto_corriente, gasto_capital, gasto_por_estudiante(_corriente, _capital) (5.14).
 *     No se usa el cuadro 5.3 (crédito de otras fuentes): mezcla miles de pesos y pesos entre años.
 *     UNIDAD: los cuadros 5.14 y 5.15 dicen "en miles de pesos" en el título pero traen PESOS (gasto total 121.714.722.158,57 de la
 *     UNCuyo en 2024, que es el mismo valor en pesos del 5.6 y del 5.13). Por eso la escala de 5.14 se calcula comparando su total contra
 *     el del 5.13 de cada anuario, en vez de fiarse del título. Un "-" en los cuadros de presupuesto es cero.
 *
 * Cobertura: anuarios 2018, 2020, 2021, 2023 y 2024. No hay anuario 2019 ni 2022 en formato XLSX (2022 solo está en CSV, solo con
 * los capítulos 2 y 3, que no agregan nada). El 2024 es un ADELANTO parcial (capítulos 1 a 5) que puede corregirse: cuando salga el
 * definitivo el link cambia y el scraper lo archiva como una versión nueva.
 *
 * Datos personales: ninguno. Son totales por universidad.
 */

import { archive, fetchAndArchive, finiteNumber, get, latestRaw, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

const SOURCE = "universidades-estadisticas";
const PAGE = "https://www.argentina.gob.ar/educacion/universidades/informacion/publicaciones/anuarios";
/** Los anuarios de 2014 a 2017 usan otros libros (por ejemplo "Cuadros_pregrado_grado_estatal_2016.xlsx") y no se leen. */
const MIN_YEAR = 2018;

export type InstId = "uncuyo" | "utn";
export const INSTITUTIONS: Record<InstId, { name: string; alcance: "mendoza" | "nacional"; match: RegExp }> = {
  uncuyo: { name: "Universidad Nacional de Cuyo", alcance: "mendoza", match: /^(universidad nacional de )?cuyo$/ },
  utn: { name: "Universidad Tecnológica Nacional", alcance: "nacional", match: /^(universidad )?tecnologica( nacional)?$/ },
};
const INST_IDS = Object.keys(INSTITUTIONS) as InstId[];

type Cell = unknown;
export type Grid = Cell[][];

export const norm = (v: Cell): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/** Año de encabezado: número o texto ("2011" en el anuario 2021). */
const asYear = (v: Cell): number | null => {
  const n = typeof v === "string" && /^\s*\d{4}\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1990 && n <= 2040 ? n : null;
};
/** Número del cuadro; "-" y vacío son sin dato (null). */
/** En los cuadros de desglose un "-" significa cero. */
const numOrZero = (v: Cell): number | null => (typeof v === "string" && v.trim() === "-" ? 0 : finiteNumber(v));
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// Lectura de libros
// ---------------------------------------------------------------------------------------------------------------------

export interface Table {
  sheet: string;
  grid: Grid;
  /** Número tal como lo imprime el título ("2.1.1", "5.2.2"). */
  num: string;
  /** Título normalizado (sin tildes, minúsculas, sin el prefijo "Cuadro N -"). */
  title: string;
  /** Año del título ("Año 2024"), si lo trae en las primeras filas. */
  year: number | null;
}

const TITLE_RE = /^\s*(?:cuadro\s+)?(\d+(?:\.\d+)+)\s*\.?\s*[a-z]?\s*[-–]\s*(.*)$/is;

export function tableOf(sheet: string, grid: Grid): Table | null {
  for (const row of grid.slice(0, 8)) {
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const m = TITLE_RE.exec(cell);
      if (!m) continue;
      const head = grid
        .slice(0, 8)
        .flat()
        .filter((c): c is string => typeof c === "string")
        .join(" ");
      const y = /a[ñn]o\s+(20\d\d)/i.exec(head);
      return { sheet, grid, num: m[1]!, title: norm(m[2]), year: y ? Number(y[1]) : null };
    }
  }
  return null;
}

export function tablesOf(wb: XLSX.WorkBook): Table[] {
  const out: Table[] = [];
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    if (!ws || /indice|carat/i.test(norm(sheet))) continue; // el índice repite los títulos de todos los cuadros
    const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null });
    const t = tableOf(sheet, grid);
    if (t) out.push(t);
  }
  return out;
}

/** Fila de cada institución buscada: primera celda de texto entre las 3 primeras columnas que coincide. */
export function institutionRows(grid: Grid): Partial<Record<InstId, Cell[]>> {
  const found: Partial<Record<InstId, Cell[]>> = {};
  for (const row of grid) {
    const label = row.slice(0, 3).find((c) => typeof c === "string" && c.trim() !== "");
    if (label === undefined) continue;
    const n = norm(label);
    for (const id of INST_IDS) if (!found[id] && INSTITUTIONS[id].match.test(n)) found[id] = row;
  }
  return found;
}

/** Serie por año: encabezado = primera fila (de las 12 primeras) con al menos 3 años. */
export function parseSeries(grid: Grid): Partial<Record<InstId, Map<number, number>>> {
  const header = grid.slice(0, 12).find((r) => r.filter((c) => asYear(c) !== null).length >= 3);
  if (!header) return {};
  const cols = header.map((c, i) => [i, asYear(c)] as const).filter((x): x is readonly [number, number] => x[1] !== null);
  const out: Partial<Record<InstId, Map<number, number>>> = {};
  const rows = institutionRows(grid);
  for (const id of INST_IDS) {
    const row = rows[id];
    if (!row) continue;
    const m = new Map<number, number>();
    for (const [col, year] of cols) {
      const v = finiteNumber(row[col]);
      if (v !== null) m.set(year, v);
    }
    out[id] = m;
  }
  return out;
}

/** Fila de encabezado (de las primeras `limit`) que contiene todos los textos pedidos. */
function headerRow(grid: Grid, texts: string[], limit = 10): Cell[] | undefined {
  return grid.slice(0, limit).find((r) => {
    const cells = r.map(norm);
    return texts.every((t) => cells.includes(t));
  });
}
/** Índice de columna de la n-ésima celda de `row` cuyo texto normalizado es `text`. */
function colOf(row: Cell[], text: string, nth = 0): number {
  let seen = 0;
  for (let i = 0; i < row.length; i++) {
    if (norm(row[i]) === text && seen++ === nth) return i;
  }
  return -1;
}

type Cols = Record<string, number>;
function valuesBy(grid: Grid, cols: Cols, zero = false): Partial<Record<InstId, Record<string, number | null>>> {
  const out: Partial<Record<InstId, Record<string, number | null>>> = {};
  const rows = institutionRows(grid);
  for (const id of INST_IDS) {
    const row = rows[id];
    if (!row) continue;
    const rec: Record<string, number | null> = {};
    for (const [k, c] of Object.entries(cols)) rec[k] = c < 0 ? null : zero ? numOrZero(row[c]) : finiteNumber(row[c]);
    out[id] = rec;
  }
  return out;
}

type ByInst = Partial<Record<InstId, Record<string, number | null>>>;

/** 4.1: personas por escalafón. */
export function parsePersonas(grid: Grid): ByInst {
  const h = headerRow(grid, ["docentes nivel universitario", "no docentes"]);
  if (!h) return {};
  return valuesBy(
    grid,
    {
      total: colOf(h, "total"),
      docente: colOf(h, "docentes nivel universitario"),
      preuniversitario: colOf(h, "docentes nivel preuniversitario"),
      autoridades_superiores: colOf(h, "autoridades superiores"),
      no_docente: colOf(h, "no docentes"),
    },
    true,
  );
}

/** 4.4: cargos docentes universitarios por dedicación (columnas "Total" del subencabezado: exclusiva, semi, simple, otro). */
export function parseDocentes(grid: Grid): ByInst {
  const h = headerRow(grid, ["total cargos docentes universitarios"]);
  const sub = grid.slice(0, 10).find((r) => r.map(norm).includes("titular") && r.map(norm).filter((c) => c === "total").length >= 4);
  if (!h || !sub) return {};
  return valuesBy(
    grid,
    {
      total: colOf(h, "total cargos docentes universitarios"),
      exclusiva: colOf(sub, "total", 0),
      semiexclusiva: colOf(sub, "total", 1),
      simple: colOf(sub, "total", 2),
      otro: colOf(sub, "total", 3),
    },
    true,
  );
}

/** 4.9: cargos docentes preuniversitarios (total). */
export function parsePreuniversitario(grid: Grid): ByInst {
  const h = headerRow(grid, ["total de cargos"]);
  if (!h) return {};
  return valuesBy(grid, { total: colOf(h, "total de cargos") }, true);
}

/** 4.20 (4.21 en 2018): cargos no docentes por categoría. */
export function parseNoDocentes(grid: Grid): ByInst {
  const h = headerRow(grid, ["personal directivo", "personal superior", "personal de apoyo", "total"]);
  if (!h) return {};
  return valuesBy(
    grid,
    {
      total: colOf(h, "total"),
      directivo: colOf(h, "personal directivo"),
      superior: colOf(h, "personal superior"),
      apoyo: colOf(h, "personal de apoyo"),
      otros: colOf(h, "otros"),
    },
    true,
  );
}

/** 5.2.2: inversión del Estado nacional por fuente. */
export function parseInversionPorFuente(grid: Grid): ByInst {
  const h = headerRow(grid, ["total", "tesoro nacional", "recursos propios"]);
  if (!h) return {};
  return valuesBy(
    grid,
    {
      inversion_estado_total: colOf(h, "total"),
      inversion_estado_tesoro_nacional: colOf(h, "tesoro nacional"),
      inversion_estado_recursos_propios: colOf(h, "recursos propios"),
      inversion_estado_afectacion_especifica: colOf(h, "recursos con afectacion especifica"),
      inversion_estado_transferencias_externas: colOf(h, "transferencias externas"),
      inversion_estado_credito_externo: colOf(h, "credito externo"),
    },
    true,
  );
}

/** 5.13: ejecución total por fuente de financiamiento. */
export function parseEjecucionPorFuente(grid: Grid): ByInst {
  const h = headerRow(grid, ["total", "tesoro nacional", "reman.ej. anteriores"]);
  if (!h) return {};
  return valuesBy(
    grid,
    {
      gasto_total: colOf(h, "total"),
      gasto_fuente_tesoro_nacional: colOf(h, "tesoro nacional"),
      gasto_fuente_recursos_propios: colOf(h, "recursos propios"),
      gasto_fuente_remanente_anterior: colOf(h, "reman.ej. anteriores"),
      gasto_fuente_otras: colOf(h, "otras fuentes"),
    },
    true,
  );
}

/** 5.6: ejecución total por objeto del gasto (inciso). */
export function parseEjecucionPorInciso(grid: Grid): ByInst {
  const h = headerRow(grid, ["1 - personal", "otros incisos"]);
  const t = headerRow(grid, ["total", "objeto del gasto"]);
  if (!h || !t) return {};
  return valuesBy(
    grid,
    {
      gasto_total: colOf(t, "total"),
      gasto_inciso_personal: colOf(h, "1 - personal"),
      gasto_inciso_bienes_consumo: colOf(h, "2 - bienes de consumo"),
      gasto_inciso_servicios_no_personales: colOf(h, "3 - ss. no personales"),
      gasto_inciso_bienes_uso: colOf(h, "4 - bienes de uso"),
      gasto_inciso_transferencias: colOf(h, "5 - transferencias"),
      gasto_inciso_otros: colOf(h, "otros incisos"),
    },
    true,
  );
}

/** 5.14: gasto corriente y de capital, total y por estudiante. */
export function parseGastoPorEstudiante(grid: Grid): ByInst {
  const sub = grid.slice(0, 10).find((r) => r.map(norm).includes("corrientes") && r.map(norm).includes("de capital"));
  const est = grid.slice(0, 10).find((r) => r.map(norm).some((c) => c.startsWith("cantidad de estudiantes")));
  if (!sub || !est) return {};
  return valuesBy(
    grid,
    {
      gasto_total: colOf(sub, "total", 0),
      gasto_corriente: colOf(sub, "corrientes", 0),
      gasto_capital: colOf(sub, "de capital", 0),
      estudiantes: est.findIndex((c) => norm(c).startsWith("cantidad de estudiantes")),
      gasto_por_estudiante: colOf(sub, "total", 1),
      gasto_por_estudiante_corriente: colOf(sub, "corrientes", 1),
      gasto_por_estudiante_capital: colOf(sub, "de capital", 1),
    },
    true,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Descubrimiento y descarga
// ---------------------------------------------------------------------------------------------------------------------

export interface AnuarioLink {
  year: number;
  adelanto: boolean;
  url: string;
  filename: string;
}

/** Anuarios con XLSX (no los de "csv") que figuran en la página, uno por año (el definitivo gana al adelanto). */
export function parseAnuarioLinks(html: string, baseUrl: string): AnuarioLink[] {
  const $ = cheerio.load(html);
  const byYear = new Map<number, AnuarioLink>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (!/\.zip(\?|$)/i.test(href) || /csv/i.test(href) || /csv/i.test(text)) return;
    const y = /anuario[^0-9]*(20\d\d)/i.exec(text);
    if (!y) return;
    const year = Number(y[1]);
    const adelanto = /adelanto/i.test(text) || /adelanto/i.test(href);
    const prev = byYear.get(year);
    if (prev && !prev.adelanto) return;
    if (prev && prev.adelanto === adelanto) return;
    byYear.set(year, {
      year,
      adelanto,
      url: new URL(href, baseUrl).toString(),
      filename: `anuario_${year}${adelanto ? "_adelanto" : ""}.zip`,
    });
  });
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

// ---------------------------------------------------------------------------------------------------------------------
// Extracción por anuario
// ---------------------------------------------------------------------------------------------------------------------

/** Capítulos que se leen: 2.1, 3.1, 4 y 5 (gestión estatal), por nombre de archivo. */
const CHAPTER_FILE = /^(?:z\s+)?(?:2\.1|3\.1|4|5)(?:\.|\s|-)/i;
/** Nombre del archivo dentro del ZIP. Los ZIP de 2018 a 2021 traen los nombres en CP437 ("Gesti¢n"): se pasan a UTF-8. */
const basename = (p: string) =>
  (p.split("/").pop() ?? p)
    .replaceAll("¢", "ó")
    .replaceAll("¡", "í")
    .replaceAll("‚", "é")
    .replaceAll("\u00a0", "á")
    .replaceAll("£", "ú")
    .replaceAll("¤", "ñ");
const wantedFile = (name: string) => {
  const b = basename(name);
  return /\.xlsx?$/i.test(b) && CHAPTER_FILE.test(b) && !/privada|copia|piesci/i.test(b);
};

interface Candidate {
  key: string;
  /** Mayor gana: [1 si es detalle del año / 0 si viene de una serie, año del anuario]. */
  rank: number;
  row: Row;
}

interface Extraction {
  year: number;
  zip: string;
  students: Candidate[];
  staff: Candidate[];
  budget: Candidate[];
  notes: string[];
  /** Avisos que no son un problema (errores de tipeo de la fuente que se verificaron). */
  info: string[];
}

const near = (a: number, b: number, tol = 0.001) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * tol;

export function extractAnuario(link: AnuarioLink, zipBytes: Uint8Array): Extraction {
  const files = unzipSync(zipBytes, { filter: (f) => wantedFile(f.name) });
  const ex: Extraction = { year: link.year, zip: link.filename, students: [], staff: [], budget: [], notes: [], info: [] };
  const warn = (m: string) => ex.notes.push(`${link.filename}: ${m}`);

  // Tablas de cada capítulo: { archivo, tabla }
  const tables: { file: string; t: Table }[] = [];
  for (const [name, data] of Object.entries(files)) {
    const wb = XLSX.read(data, { type: "array" });
    for (const t of tablesOf(wb)) tables.push({ file: basename(name), t });
  }
  const find = (re: RegExp, chapter: string) =>
    tables.find(({ t }) => re.test(t.title) && t.num.startsWith(chapter) && Object.keys(institutionRows(t.grid)).length > 0);
  const prio = (detail: boolean) => (detail ? 1000 : 0) + link.year;
  const base = { anuario: link.year };

  // --- Estudiantes -------------------------------------------------------------------------------------------------
  const studentSets: { level: "pregrado_grado" | "posgrado"; chapter: string; measures: Record<string, RegExp> }[] = [
    {
      level: "pregrado_grado",
      chapter: "2.1",
      measures: {
        estudiantes: /^estudiantes de titulos de pregrado y grado y tasa/,
        nuevos_inscriptos: /^nuev\S* inscript\S* de titulos de pregrado y grado y tasa/,
        reinscriptos: /^reinscript\S* de titulos de pregrado y grado y tasa/,
        egresados: /^egresad\S* de titulos de pregrado y grado y tasa/,
      },
    },
    {
      level: "posgrado",
      chapter: "3.1",
      measures: {
        estudiantes: /^estudiantes de titulos de posgrado\. instituciones/,
        nuevos_inscriptos: /^nuev\S* inscript\S* de titulos de posgrado\. instituciones/,
        egresados: /^egresad\S* de titulos de posgrado\. instituciones/,
      },
    },
  ];
  for (const set of studentSets) {
    const series: Record<string, Partial<Record<InstId, Map<number, number>>>> = {};
    const used: string[] = [];
    let file = "";
    for (const [measure, re] of Object.entries(set.measures)) {
      const f = find(re, set.chapter);
      if (!f) continue;
      series[measure] = parseSeries(f.t.grid);
      used.push(f.t.num);
      file = f.file;
    }
    if (!series.estudiantes) {
      warn(`sin cuadro de estudiantes de ${set.level}`);
      continue;
    }
    const cuadro = [...new Set(used)].join(", ");
    for (const id of INST_IDS) {
      const years = new Set<number>();
      for (const s of Object.values(series)) for (const y of s[id]?.keys() ?? []) years.add(y);
      if (!series.estudiantes[id]) warn(`${id} no está en el cuadro de estudiantes de ${set.level}`);
      for (const y of years) {
        const get = (m: string) => series[m]?.[id]?.get(y) ?? null;
        const e = get("estudiantes");
        if (e === null) continue;
        const n = get("nuevos_inscriptos");
        const r = get("reinscriptos");
        if (n !== null && r !== null && n + r !== e)
          warn(`${id} ${y} ${set.level}: nuevos + reinscriptos (${n + r}) != estudiantes (${e})`);
        ex.students.push({
          key: `${id}|${y}|${set.level}`,
          rank: prio(true),
          row: {
            anio: y,
            universidad_id: id,
            universidad: INSTITUTIONS[id].name,
            nivel: set.level,
            estudiantes: e,
            nuevos_inscriptos: n,
            reinscriptos: r,
            egresados: get("egresados"),
            alcance: INSTITUTIONS[id].alcance,
            ...base,
            fuente_archivo: `${link.filename}/${file}`,
            cuadro,
          },
        });
      }
    }
  }

  // --- Personal ----------------------------------------------------------------------------------------------------
  const personas = find(/^cantidad de personas clasificadas por escalafon, segun universidad/, "4.");
  const docentes = find(/^escalafon docente universitario: cantidad de cargos clasificados por dedicacion y categoria/, "4.");
  const preu = find(/^escalafon docente preuniversitario: cantidad de cargos clasificados por dedicacion y categoria/, "4.");
  const noDoc = find(/^escalafon personal no docente: cantidad de cargos clasificados por categoria, segun universidad/, "4.");
  const per = personas ? parsePersonas(personas.t.grid) : {};
  const doc = docentes ? parseDocentes(docentes.t.grid) : {};
  const pre = preu ? parsePreuniversitario(preu.t.grid) : {};
  const nod = noDoc ? parseNoDocentes(noDoc.t.grid) : {};
  const staffYear = docentes?.t.year ?? personas?.t.year ?? null;
  if (!personas || !docentes || !preu || !noDoc) warn("faltan cuadros del capítulo 4");
  else if (staffYear !== link.year) warn(`el capítulo 4 dice año ${staffYear}`);

  const staffRow = (
    id: InstId,
    tipo: string,
    dedicacion: string,
    categoria: string,
    cargos: number | null,
    personasN: number | null,
    cuadro: string,
    file: string,
  ): Row => ({
    anio: link.year,
    universidad_id: id,
    universidad: INSTITUTIONS[id].name,
    tipo,
    dedicacion,
    categoria,
    cargos,
    personas: personasN,
    alcance: INSTITUTIONS[id].alcance,
    ...base,
    fuente_archivo: `${link.filename}/${file}`,
    cuadro,
  });
  const pushStaff = (row: Row, detail: boolean) =>
    ex.staff.push({ key: `${row.universidad_id}|${row.anio}|${row.tipo}|${row.dedicacion}|${row.categoria}`, rank: prio(detail), row });

  for (const id of INST_IDS) {
    const p = per[id];
    const d = doc[id];
    const pr = pre[id];
    const n = nod[id];
    if (d && personas && docentes) {
      const sum = (d.exclusiva ?? 0) + (d.semiexclusiva ?? 0) + (d.simple ?? 0) + (d.otro ?? 0);
      if (d.total != null && !near(sum, d.total, 0)) warn(`${id}: cargos docentes por dedicación (${sum}) != total (${d.total})`);
      const cq = `${docentes.t.num}, ${personas.t.num}`;
      pushStaff(staffRow(id, "docente", "total", "", d.total ?? null, p?.docente ?? null, cq, docentes.file), true);
      for (const k of ["exclusiva", "semiexclusiva", "simple", "otro"])
        pushStaff(staffRow(id, "docente", k, "", d[k] ?? null, null, docentes.t.num, docentes.file), true);
    }
    if (pr && preu)
      pushStaff(
        staffRow(
          id,
          "preuniversitario",
          "total",
          "",
          pr.total ?? null,
          p?.preuniversitario ?? null,
          `${preu.t.num}, ${personas?.t.num}`,
          preu.file,
        ),
        true,
      );
    if (p && personas)
      pushStaff(
        staffRow(id, "autoridades_superiores", "total", "", null, p.autoridades_superiores ?? null, personas.t.num, personas.file),
        true,
      );
    if (n && noDoc) {
      const sum = (n.directivo ?? 0) + (n.superior ?? 0) + (n.apoyo ?? 0) + (n.otros ?? 0);
      if (n.total !== null && !near(sum, n.total!, 0)) warn(`${id}: cargos no docentes por categoría (${sum}) != total (${n.total})`);
      pushStaff(
        staffRow(id, "no_docente", "", "total", n.total ?? null, p?.no_docente ?? null, `${noDoc.t.num}, ${personas?.t.num}`, noDoc.file),
        true,
      );
      for (const k of ["directivo", "superior", "apoyo", "otros"])
        pushStaff(staffRow(id, "no_docente", "", k, n[k] ?? null, null, noDoc.t.num, noDoc.file), true);
    }
    if (p && personas && p.total !== null) {
      const s = (p.docente ?? 0) + (p.preuniversitario ?? 0) + (p.autoridades_superiores ?? 0) + (p.no_docente ?? 0);
      if (!near(s, p.total!, 0)) warn(`${id}: personas por escalafón (${s}) != total (${p.total})`);
    }
  }
  // Series de dedicación (4.5 a 4.7): sirven para años sin anuario con detalle (2022).
  const dedicationSeries: [string, RegExp][] = [
    ["exclusiva", /^escalafon docente universitario: cantidad de cargos con dedicacion exclusiva segun universidad/],
    ["semiexclusiva", /^escalafon docente universitario: cantidad de cargos con dedicacion semiexclusiva segun universidad/],
    ["simple", /^escalafon docente universitario: cantidad de cargos con dedicacion simple segun universidad/],
  ];
  for (const [dedicacion, re] of dedicationSeries) {
    const f = find(re, "4.");
    if (!f) continue;
    const s = parseSeries(f.t.grid);
    for (const id of INST_IDS)
      for (const [y, v] of s[id] ?? [])
        ex.staff.push({
          key: `${id}|${y}|docente|${dedicacion}|`,
          rank: prio(false),
          row: {
            ...staffRow(id, "docente", dedicacion, "", v, null, f.t.num, f.file),
            anio: y,
          },
        });
  }

  // --- Presupuesto -------------------------------------------------------------------------------------------------
  const pushBudget = (
    id: InstId,
    year: number,
    concept: string,
    value: number | null,
    cuadro: string,
    file: string,
    detail: boolean,
    factor = 1,
  ) => {
    if (value === null) return;
    ex.budget.push({
      key: `${id}|${year}|${concept}`,
      rank: prio(detail),
      row: {
        anio: year,
        universidad_id: id,
        universidad: INSTITUTIONS[id].name,
        concepto: concept,
        monto: round2(value * factor),
        alcance: INSTITUTIONS[id].alcance,
        ...base,
        fuente_archivo: `${link.filename}/${file}`,
        cuadro,
      },
    });
  };
  // Series: 5.2 (inversión total) y 5.4 (recursos propios recaudados).
  const s52 = find(/^inversion del estado nacional\. total de fuentes de financiamiento/, "5.");
  const s54 = find(/^variacion de la recaudacion de recursos propios/, "5.");
  for (const [f, concept] of [
    [s52, "inversion_estado_total"],
    [s54, "recursos_propios_recaudados"],
  ] as const) {
    if (!f) {
      warn(`falta la serie ${concept}`);
      continue;
    }
    const s = parseSeries(f.t.grid);
    for (const id of INST_IDS) for (const [y, v] of s[id] ?? []) pushBudget(id, y, concept, v, f.t.num, f.file, false);
  }
  // Detalle del año.
  const t522 = find(/^inversion del estado nacional por fuente de financiamiento/, "5.");
  const t513 = find(/^ejecucion presupuestaria total, clasificada por fuente de financiamiento/, "5.");
  const t56 = find(/^ejecucion presupuestaria total clasificada por objeto del gasto/, "5.");
  const t514 = find(/^ejecucion presupuestaria de los gastos corrientes y de capital por estudiante/, "5.");
  const detail: [Table | undefined, string, ByInst][] = [
    [t522?.t, t522?.file ?? "", t522 ? parseInversionPorFuente(t522.t.grid) : {}],
    [t513?.t, t513?.file ?? "", t513 ? parseEjecucionPorFuente(t513.t.grid) : {}],
    [t56?.t, t56?.file ?? "", t56 ? parseEjecucionPorInciso(t56.t.grid) : {}],
  ];
  // Control cruzado: la inversión del Estado (5.2.2) tiene que ser igual a la del año en la serie 5.2. Si no, se descarta el 5.2.2 de esa
  // universidad (en el anuario 2020 el total de la UTN está mal: 3.796 millones contra 13.219 millones de la serie).
  const skipInversion = new Set<InstId>();
  if (s52 && t522) {
    const series = parseSeries(s52.t.grid);
    const v = parseInversionPorFuente(t522.t.grid);
    for (const id of INST_IDS) {
      const a = series[id]?.get(link.year);
      const b = v[id]?.inversion_estado_total;
      if (a !== undefined && b != null && !near(a, b, 1e-6)) {
        warn(`${id}: 5.2 (${a}) != 5.2.2 (${b}) en ${link.year}: se descarta el 5.2.2`);
        skipInversion.add(id);
      }
    }
  }
  for (const [t, file, vals] of detail) {
    if (!t) {
      warn("falta un cuadro de presupuesto del año");
      continue;
    }
    if (t.year !== link.year)
      ex.info.push(`${link.filename}: el cuadro ${t.num} dice año ${t.year} (se toma ${link.year}; los totales coinciden con el 5.14)`);
    for (const id of INST_IDS) {
      if (!vals[id]) warn(`${id} no está en el cuadro ${t.num}`);
      for (const [concept, v] of Object.entries(vals[id] ?? {})) {
        // 5.6 y 5.13 traen el mismo gasto_total: se emite una sola vez, desde el 5.13.
        if (t === t56?.t && concept === "gasto_total") continue;
        if (skipInversion.has(id) && concept.startsWith("inversion_estado_")) continue;
        pushBudget(id, link.year, concept, v, t.num, file, true);
      }
    }
  }
  if (t514) {
    const v514 = parseGastoPorEstudiante(t514.t.grid);
    const v513 = t513 ? parseEjecucionPorFuente(t513.t.grid) : {};
    for (const id of INST_IDS) {
      const v = v514[id];
      if (!v) {
        warn(`${id} no está en el cuadro ${t514.t.num}`);
        continue;
      }
      // Los títulos dicen "en miles de pesos", pero el gasto está en pesos. La escala del gasto sale de compararlo con el 5.13 y la del
      // gasto por estudiante, de dividir el gasto por los estudiantes: en 2020 y 2021 ese cociente sí viene en miles de pesos.
      const ref = v513[id]?.gasto_total;
      let factor = 1;
      if (ref && v.gasto_total) {
        if (near(v.gasto_total, ref)) factor = 1;
        else if (near(v.gasto_total * 1000, ref)) factor = 1000;
        else warn(`${id}: el gasto total del ${t514.t.num} (${v.gasto_total}) no coincide con el del 5.13 (${ref})`);
      }
      if (
        v.gasto_total != null &&
        v.gasto_corriente != null &&
        v.gasto_capital != null &&
        !near(v.gasto_corriente + v.gasto_capital, v.gasto_total, 1e-6)
      )
        warn(`${id}: corriente + capital != total en el ${t514.t.num}`);
      let perStudent = 1;
      if (v.estudiantes && v.gasto_total && v.gasto_por_estudiante) {
        const expected = (v.gasto_total * factor) / v.estudiantes;
        if (near(expected, v.gasto_por_estudiante, 0.001)) perStudent = 1;
        else if (near(expected, v.gasto_por_estudiante * 1000, 0.001)) perStudent = 1000;
        else warn(`${id}: gasto por estudiante del ${t514.t.num} no es gasto / estudiantes`);
      }
      for (const concept of ["gasto_corriente", "gasto_capital"])
        pushBudget(id, link.year, concept, v[concept] ?? null, t514.t.num, t514.file, true, factor);
      for (const concept of ["gasto_por_estudiante", "gasto_por_estudiante_corriente", "gasto_por_estudiante_capital"])
        pushBudget(id, link.year, concept, v[concept] ?? null, t514.t.num, t514.file, true, perStudent);
    }
  } else warn("falta el cuadro de gasto por estudiante (5.14)");

  return ex;
}

// ---------------------------------------------------------------------------------------------------------------------
// Unión de anuarios y salidas
// ---------------------------------------------------------------------------------------------------------------------

/** Por clave se queda el candidato de mayor rango (detalle del año antes que serie; después, anuario más nuevo). */
export function pickBest(cands: Candidate[]): { rows: Row[]; revisions: number } {
  const best = new Map<string, Candidate>();
  let revisions = 0;
  const sorted = [...cands].sort((a, b) => b.rank - a.rank);
  for (const c of sorted) {
    const cur = best.get(c.key);
    if (!cur) {
      best.set(c.key, c);
      continue;
    }
    const a = cur.row.monto ?? cur.row.estudiantes ?? cur.row.cargos;
    const b = c.row.monto ?? c.row.estudiantes ?? c.row.cargos;
    if (typeof a === "number" && typeof b === "number" && !near(a, b, 1e-9)) revisions++;
  }
  return { rows: [...best.values()].map((c) => c.row), revisions };
}

const bySort = (cols: string[]) => (a: Row, b: Row) => {
  for (const c of cols) {
    const x = a[c] ?? "";
    const y = b[c] ?? "";
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
};

const STUDENT_COLS = [
  "anio",
  "universidad_id",
  "universidad",
  "nivel",
  "estudiantes",
  "nuevos_inscriptos",
  "reinscriptos",
  "egresados",
  "alcance",
  "anuario",
  "fuente_archivo",
  "cuadro",
];
const STAFF_COLS = [
  "anio",
  "universidad_id",
  "universidad",
  "tipo",
  "dedicacion",
  "categoria",
  "cargos",
  "personas",
  "alcance",
  "anuario",
  "fuente_archivo",
  "cuadro",
];
const BUDGET_COLS = ["anio", "universidad_id", "universidad", "concepto", "monto", "alcance", "anuario", "fuente_archivo", "cuadro"];

export async function run(_args: string[]): Promise<void> {
  // 1) Página de anuarios: se archiva y se leen los links.
  const resp = await get(PAGE);
  const html = await resp.text();
  await archive(SOURCE, "anuarios.html", html, { url: resp.url });
  const links = parseAnuarioLinks(html, resp.url).filter((l) => l.year >= MIN_YEAR);
  if (!links.length) throw new Error("No se encontró ningún ZIP de anuario en la página");
  console.log(
    `Anuarios en la página (${MIN_YEAR} en adelante): ${links.map((l) => `${l.year}${l.adelanto ? " (adelanto)" : ""}`).join(", ")}`,
  );

  // 2) Descarga. Los dos más nuevos se vuelven a pedir en cada corrida (pueden corregirse); los viejos solo si faltan.
  const recent = new Set(links.slice(0, 2).map((l) => l.year));
  const extractions: Extraction[] = [];
  for (const link of links) {
    let path = await latestRaw(SOURCE, link.filename);
    if (!path || recent.has(link.year)) {
      try {
        const saved = await fetchAndArchive(SOURCE, link.url, link.filename);
        console.log(saved ? `Archivado ${link.filename}` : `Sin cambios ${link.filename}`);
      } catch (err) {
        if (!path) {
          console.log(`::warning title=universidades-estadisticas::No se pudo bajar ${link.filename}: ${(err as Error).message}`);
          continue;
        }
        console.log(`::warning title=universidades-estadisticas::No se pudo actualizar ${link.filename}, se usa la copia archivada`);
      }
      await sleep(2000);
      path = await latestRaw(SOURCE, link.filename);
    }
    if (!path) continue;
    const ex = extractAnuario(link, new Uint8Array(await readRaw(path)));
    extractions.push(ex);
    console.log(
      `  ${link.filename}: ${ex.students.length} candidatos de estudiantes, ${ex.staff.length} de personal, ${ex.budget.length} de presupuesto`,
    );
  }
  if (!extractions.length) throw new Error("No se pudo leer ningún anuario");
  for (const ex of extractions) for (const n of ex.info) console.log(n);
  for (const ex of extractions) for (const n of ex.notes) console.log(`::warning title=universidades-estadisticas::${n}`);

  // 3) Unión: el anuario más nuevo gana por clave.
  const students = pickBest(extractions.flatMap((e) => e.students));
  const staff = pickBest(extractions.flatMap((e) => e.staff));
  const budget = pickBest(extractions.flatMap((e) => e.budget));
  const outputs: [string, Row[], string[], string[]][] = [
    ["estudiantes.csv", students.rows.sort(bySort(["universidad_id", "nivel", "anio"])), STUDENT_COLS, ["anio"]],
    ["personal.csv", staff.rows.sort(bySort(["universidad_id", "tipo", "dedicacion", "categoria", "anio"])), STAFF_COLS, ["anio"]],
    ["presupuesto.csv", budget.rows.sort(bySort(["universidad_id", "concepto", "anio"])), BUDGET_COLS, ["anio"]],
  ];
  for (const [file, rows, cols] of outputs) {
    await writeProcessed(SOURCE, file, rows, cols);
    const years = rows.map((r) => Number(r.anio));
    console.log(`${file}: ${rows.length} filas, ${Math.min(...years)} a ${Math.max(...years)}`);
  }
  console.log(
    `Valores corregidos entre anuarios: estudiantes ${students.revisions}, personal ${staff.revisions}, presupuesto ${budget.revisions}`,
  );
}
