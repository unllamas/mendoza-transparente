/**
 * Resultados electorales provinciales del portal de datos abiertos de Mendoza (CKAN).
 *
 * Uso: `bun run scrape elecciones-datos-abiertos`
 *
 * Salida (data/processed/elecciones-datos-abiertos/), con el esquema común de la app de votación:
 *  - resultados.csv     Una fila por (elección, escrutinio, cargo, unidad geográfica, opción). Nivel `mesa` cuando la
 *                       fuente lo da, más los totales de sección y departamento que la fuente imprime (sirven para validar).
 *  - participacion.csv  Mesas, electores y votantes por (elección, escrutinio, cargo, unidad geográfica).
 *
 * Fuente: https://datosabiertos.mendoza.gov.ar (API CKAN). Datasets leídos (ids fijos, ver DATASETS):
 *  - elecciones generales provinciales 2015 (definitivo), PASO 2017 (provisorio, solo concejales),
 *    PASO 2019 (provisorio y definitivo), generales municipales 2019-09-01 (definitivo) y generales 2019-09-29 (provisorio).
 * Quedan afuera a propósito: precandidatos 2019 y ubicación de mesas 2017 (no son resultados) y las legislativas
 * provinciales de 2017 (los CSV traen solo códigos numéricos de lista y de tipo de voto, sin la tabla que los explique).
 *
 * El parser es estricto: una columna, una etiqueta de voto, un departamento o un total que no reconoce corta con un error
 * en vez de publicar datos dudosos. Las incoherencias de la propia fuente (un TOTAL que no cierra con la suma) se cuentan
 * y se imprimen al final.
 *
 * Reglas:
 *  - Nada de nombres de personas salvo el candidato que el cierre departamental imprime junto a la lista (gobernador e
 *    intendente en 2015 y 2019). No hay DNI ni domicilios en estos archivos.
 *  - La agrupación es la que dice la fuente. Cuando una planilla de mesas trae solo el código de la lista (PASO 2019) o una
 *    sigla (cierres de 2015), el nombre sale de la misma elección: del encabezado de las planillas de mesas o, si no, del
 *    cierre departamental (`NAMES`).
 *  - A nivel mesa no se escriben las filas con 0 votos de una lista: la ausencia equivale a cero (los tipos de voto
 *    blanco/nulo/recurrido/impugnado sí se escriben siempre).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync as nodeGzip } from "node:zlib";
import { collapseSpaces, fetchOrReuse, get, normalizeMunicipio, PROCESSED_DIR, type Row, toCsv, writeProcessed } from "@mt/core";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

const ID = "elecciones-datos-abiertos";
const CKAN = "https://datosabiertos.mendoza.gov.ar";
const CKAN_SEARCH = `${CKAN}/api/3/action/package_search?q=elecciones&rows=50`;

// ---------------------------------------------------------------------------
// Tipos y constantes
// ---------------------------------------------------------------------------

type Cargo = "gobernador" | "senadores" | "diputados" | "intendente" | "concejales";
type TipoVoto = "positivo" | "blanco" | "nulo" | "recurrido" | "impugnado" | "comando_electoral";
type Nivel = "provincia" | "seccion" | "departamento" | "mesa";
type Scope = "provincial" | "municipal";

const CARGO_BY_SHEET: Record<string, Cargo> = {
  gobernador: "gobernador",
  "senador provincial": "senadores",
  "diputado provincial": "diputados",
  intendente: "intendente",
  concejal: "concejales",
};
const SCOPE: Record<Cargo, Scope> = {
  gobernador: "provincial",
  senadores: "provincial",
  diputados: "provincial",
  intendente: "municipal",
  concejales: "municipal",
};
const CARGO_ORDER: Cargo[] = ["gobernador", "senadores", "diputados", "intendente", "concejales"];

/**
 * Sección electoral de cada departamento. No viene en la fuente: es la única partición de los 18 departamentos en 4 grupos
 * que reproduce los totales por sección que imprime el cierre de 2015 (y se vuelve a confirmar en cada corrida, ver `validate`).
 */
const SECTION_OF: Record<string, number> = {
  Capital: 1,
  Guaymallén: 1,
  "Las Heras": 1,
  Lavalle: 1,
  Junín: 2,
  "La Paz": 2,
  Maipú: 2,
  Rivadavia: 2,
  "San Martín": 2,
  "Santa Rosa": 2,
  "Godoy Cruz": 3,
  "Luján de Cuyo": 3,
  "San Carlos": 3,
  Tunuyán: 3,
  Tupungato: 3,
  "General Alvear": 4,
  Malargüe: 4,
  "San Rafael": 4,
};

interface Dataset {
  /** Nombre del archivo en data/raw/elecciones-datos-abiertos/. */
  file: string;
  /** Dataset de CKAN de donde sale (para citarlo en el meta). */
  dataset: string;
  url: string;
}

const R = (dataset: string, resource: string, name: string) => `${CKAN}/dataset/${dataset}/resource/${resource}/download/${name}`;

const DATASETS = {
  g2015: {
    file: "2015-general.zip",
    dataset: "resultados-elecciones-generales-provinciales-2015",
    url: R(
      "77bec2e9-9e99-4014-bcdd-c8cd08106ab3",
      "c5bf089a-156a-4731-abfa-30cb80dbebb5",
      "generales-provinciales-escrutinio-definitivo-2015-3.zip",
    ),
  },
  paso2017: {
    file: "2017-paso.csv",
    dataset: "resultados-elecciones-legislativas-primarias-abiertas-simultaneas-y-obligatorias-2017",
    url: R("e0ec8dd8-f34d-475f-af00-992c6d3f2ee4", "6aefa9d2-fccb-4027-9cbe-43d0490f9e1e", "escrutinio-provisorio-mesas-paso-2017.csv"),
  },
  pasoProv2019: {
    file: "2019-paso-provisorio.zip",
    dataset: "elecciones-paso-provinciales-2019",
    url: R(
      "6583a2b0-13d4-4b0a-8423-bf7356abf1e0",
      "aa185a32-abbb-4b34-b0e0-3a834647f9fa",
      "resultados-escrutinio-provisorio-por-departamento.zip",
    ),
  },
  pasoDef2019: {
    file: "2019-paso-definitivo.zip",
    dataset: "elecciones-paso-provinciales-2019",
    url: R(
      "6583a2b0-13d4-4b0a-8423-bf7356abf1e0",
      "ddd011fa-a6b7-4e26-a5ab-39305bb325c7",
      "resultados-escrutinio-definitivo-paso-2019.zip",
    ),
  },
  muni2019: {
    file: "2019-municipal-definitivo.zip",
    dataset: "resultados-elecciones-generales-municipales-2019",
    url: R(
      "9039772a-3ef7-4e82-ab64-65258f485f2e",
      "33b7508a-2ac2-4555-a8ea-665034596f87",
      "escrutinio-definitivo-municipales-01092019.zip",
    ),
  },
  g2019: {
    file: "2019-general.zip",
    dataset: "resultados-elecciones-generales-provinciales-2019",
    url: R(
      "f006d3b9-7d2d-4d80-b4ff-9a3b0dcd9d91",
      "89399cd2-e12b-4661-b2b7-a57d5300f484",
      "generales-provinciales-escrutinio-provisorio-29-09-2019.zip",
    ),
  },
} satisfies Record<string, Dataset>;

interface Election {
  key: string;
  eleccion: string;
  tipo: "paso" | "general" | "municipal";
  escrutinio: "provisorio" | "definitivo";
  dataset: Dataset;
  /** Cómo reconocer, dentro del ZIP, cada tipo de planilla. */
  mesa?: RegExp;
  dept?: RegExp;
  province?: RegExp;
  section?: RegExp;
  csv?: boolean;
}

const ELECTIONS: Election[] = [
  {
    key: "g2015",
    eleccion: "2015-06-21",
    tipo: "general",
    escrutinio: "definitivo",
    dataset: DATASETS.g2015,
    mesa: /Resumen-mesas-/,
    dept: /ExportStat01-/,
    province: /NivelProvincial/,
    section: /Por_Seccion/,
  },
  { key: "paso2017", eleccion: "2017-08-13", tipo: "paso", escrutinio: "provisorio", dataset: DATASETS.paso2017, csv: true },
  {
    key: "pasoProv2019",
    eleccion: "2019-06-09",
    tipo: "paso",
    escrutinio: "provisorio",
    dataset: DATASETS.pasoProv2019,
    mesa: /Resumen-mesas-/,
  },
  {
    key: "pasoDef2019",
    eleccion: "2019-06-09",
    tipo: "paso",
    escrutinio: "definitivo",
    dataset: DATASETS.pasoDef2019,
    mesa: /PorConceptoMesa/,
    dept: /PorConceptoCircuito/,
    section: /Concepto_Seccion/,
  },
  {
    key: "muni2019",
    eleccion: "2019-09-01",
    tipo: "municipal",
    escrutinio: "definitivo",
    dataset: DATASETS.muni2019,
    mesa: /Dpto(Mesa|Mesas)_/,
    dept: /DptoCircuito_/,
  },
  {
    key: "g2019",
    eleccion: "2019-09-29",
    tipo: "general",
    escrutinio: "provisorio",
    dataset: DATASETS.g2019,
    mesa: /PorConceptoMesa/,
    dept: /CierreProvisorio_Concepto_Dpto/,
    province: /CierreProvisorio_NivelProvincia/,
  },
];

const RESULT_COLUMNS = [
  "eleccion",
  "tipo_eleccion",
  "escrutinio",
  "cargo",
  "nivel",
  "seccion_electoral",
  "departamento",
  "circuito",
  "mesa",
  "tipo_voto",
  "agrupacion",
  "lista",
  "candidato",
  "votos",
];
const PARTICIPATION_COLUMNS = [
  "eleccion",
  "tipo_eleccion",
  "escrutinio",
  "cargo",
  "nivel",
  "seccion_electoral",
  "departamento",
  "circuito",
  "mesa",
  "mesas_habilitadas",
  "mesas_escrutadas",
  "electores",
  "votantes",
];

// ---------------------------------------------------------------------------
// Lectura de planillas
// ---------------------------------------------------------------------------

type Sheet = string[][];

/** Cada hoja del libro como matriz de texto (celdas recortadas; números como texto sin formato). */
function readSheets(bytes: Uint8Array): { name: string; rows: Sheet }[] {
  const wb = XLSX.read(bytes);
  return wb.SheetNames.map((name) => {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, defval: "" });
    return { name, rows: raw.map((r) => r.map((c) => (typeof c === "string" ? collapseSpaces(c) : String(c)))) };
  });
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function cargoOfSheet(name: string): Cargo | null {
  return CARGO_BY_SHEET[fold(name).replace(/\s+/g, " ").trim()] ?? null;
}

function toInt(s: string | undefined, what: string): number {
  const n = Number(s);
  if (s === undefined || s === "" || !Number.isInteger(n) || n < 0) throw new Error(`${what}: se esperaba un entero y vino «${s}»`);
  return n;
}

/** Clasifica una etiqueta de tipo de voto («VOTOS EN BLANCO», «Votos nulos»…). Devuelve null si no es un tipo de voto. */
export function classifyVoteType(label: string): TipoVoto | null {
  const l = fold(label);
  if (/^positivos?$/.test(l)) return "positivo";
  if (/\bblancos?\b/.test(l)) return "blanco";
  if (/\bnulos?\b/.test(l)) return "nulo";
  if (/recurrid/.test(l)) return "recurrido";
  if (/impugnad/.test(l)) return "impugnado";
  if (/comando/.test(l)) return "comando_electoral";
  return null;
}

/** Departamento a partir de «12 - TUNUYAN», «02-Godoy Cruz» o «Departamento 14-Santa Rosa». */
export function parseDepartment(text: string): string | null {
  const m = text.match(/^(?:Departamento:?\s*)?(\d{1,2})\s*-\s*(.+)$/);
  if (!m) return null;
  const dept = normalizeMunicipio(m[2]!);
  if (!dept) throw new Error(`Departamento desconocido: «${text}»`);
  return dept;
}

/** «Lista 222 - Nombre (APELLIDO, Nombre)» o «501 - FIT (BARBEITO, Noelia)» → número, nombre y candidato. */
export function parsePartyLabel(label: string): { num: string; name: string; candidate: string } | null {
  const m = label.match(/^(?:Lista\s+)?(\d+)\s*-\s*(.+)$/);
  if (!m) return null;
  let name = m[2]!;
  let candidate = "";
  const c = name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (c) {
    name = c[1]!;
    candidate = c[2]!;
  }
  return { num: m[1]!, name: collapseSpaces(name), candidate: collapseSpaces(candidate) };
}

// ---------------------------------------------------------------------------
// Planillas por mesa («Resumen de actas»)
// ---------------------------------------------------------------------------

type Column = { kind: "party"; lista: string; num: string; name: string } | { kind: "tipo"; tipo: TipoVoto } | { kind: "total" };

interface MesaRecord {
  dept: string;
  cargo: Cargo;
  mesa: string;
  /** Votos por opción, en el orden de la planilla. */
  cells: { col: Column; votos: number }[];
  total: number;
}

function parseMesaColumn(header: string): Column {
  if (/^total$/i.test(header)) return { kind: "total" };
  const party = parsePartyLabel(header);
  if (party) return { kind: "party", lista: party.num, num: party.num, name: party.name };
  const code = header.match(/^(\d+(?:\s+[A-Z])?)$/); // PASO 2019: solo el código de lista («300 A»)
  if (code) return { kind: "party", lista: code[1]!, num: code[1]!.split(" ")[0]!, name: "" };
  const tipo = classifyVoteType(header);
  if (tipo && tipo !== "positivo") return { kind: "tipo", tipo };
  throw new Error(`Columna de mesa desconocida: «${header}»`);
}

/** Lee un libro de planillas por mesa (una hoja por cargo). */
function parseMesaWorkbook(bytes: Uint8Array, context: string, stats: Stats): MesaRecord[] {
  const sheets = readSheets(bytes);
  let dept: string | null = null;
  for (const s of sheets) {
    for (const r of s.rows.slice(0, 8)) dept ??= parseDepartment(r[0] ?? "");
  }
  if (!dept) throw new Error(`${context}: no encuentro el departamento`);
  const out: MesaRecord[] = [];
  for (const sheet of sheets) {
    const cargo = cargoOfSheet(sheet.name);
    if (!cargo) continue;
    const headerAt = sheet.rows.findIndex((r) => r[0] === "MESA");
    if (headerAt < 0) throw new Error(`${context}/${sheet.name}: sin fila de encabezado «MESA»`);
    const headerRow = sheet.rows[headerAt]!;
    let end = headerRow.length;
    while (end > 1 && headerRow[end - 1] === "") end--; // las planillas vienen rellenadas con columnas vacías
    const columns = headerRow.slice(1, end).map((h) => parseMesaColumn(h));
    if (columns.at(-1)?.kind !== "total") throw new Error(`${context}/${sheet.name}: la última columna no es TOTAL`);
    const seen = new Set<string>();
    for (const row of sheet.rows.slice(headerAt + 1)) {
      if (row.every((c) => c === "")) continue;
      if (!/^\d+$/.test(row[0] ?? "")) throw new Error(`${context}/${sheet.name}: fila que no es una mesa: «${row[0]}»`);
      const mesa = String(Number(row[0]));
      // Las mesas de extranjeros (5000 y siguientes) figuran en todas las hojas, pero para los cargos que no votan
      // vienen con un solo 0 y el resto vacío: no son datos.
      if (row.slice(2, columns.length + 1).every((c) => c === "") && row[1] === "0") {
        stats.emptyMesas++;
        continue;
      }
      if (seen.has(mesa)) throw new Error(`${context}/${sheet.name}: mesa ${mesa} repetida`);
      seen.add(mesa);
      const cells: MesaRecord["cells"] = [];
      let total = 0;
      let sum = 0;
      columns.forEach((col, i) => {
        const votos = toInt(row[i + 1], `${context}/${sheet.name} mesa ${mesa}`);
        if (col.kind === "total") total = votos;
        else {
          cells.push({ col, votos });
          sum += votos;
        }
      });
      if (sum !== total) stats.mesaTotalMismatch.push(`${context}/${sheet.name} mesa ${mesa}: suma ${sum} ≠ TOTAL ${total}`);
      out.push({ dept, cargo, mesa, cells, total: sum });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cierres por departamento y por provincia
// ---------------------------------------------------------------------------

interface ClosingParty {
  /** Número de lista («300») y, en PASO, la lista interna («300 A»). */
  num: string;
  lista: string;
  name: string;
  candidate: string;
  votos: number;
}

interface Closing {
  /** Departamento, o null si es el cierre de la provincia. */
  dept: string | null;
  cargo: Cargo;
  mesasHabilitadas: number;
  mesasEscrutadas: number;
  electores: number;
  votantes: number;
  parties: ClosingParty[];
  tipos: Partial<Record<TipoVoto, number>>;
}

const isMesasRow = (r: string[]) => /^Mesas habilitadas/i.test(r[0] ?? "");

/** Lee los bloques de cierre de una hoja: uno por departamento (o uno solo, el de la provincia). */
function parseClosingSheet(rows: Sheet, cargo: Cargo, context: string, province: boolean): Closing[] {
  const out: Closing[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!isMesasRow(rows[i]!)) {
      i++;
      continue;
    }
    let dept: string | null = null;
    if (!province) {
      for (let k = i - 1; k >= Math.max(0, i - 5) && !dept; k--) dept = parseDepartment(rows[k]![0] ?? "");
      if (!dept) throw new Error(`${context}: bloque de cierre sin departamento (fila ${i + 1})`);
    }
    const c: Closing = {
      dept,
      cargo,
      mesasHabilitadas: toInt(rows[i + 1]![0], `${context} mesas habilitadas`),
      mesasEscrutadas: toInt(rows[i + 1]![1], `${context} mesas escrutadas`),
      electores: 0,
      votantes: 0,
      parties: [],
      tipos: {},
    };
    if (!/^Ciudadanos empadronados/i.test(rows[i + 2]![0] ?? "")) throw new Error(`${context}: falta «Ciudadanos empadronados»`);
    c.electores = toInt(rows[i + 3]![0], `${context} electores`);
    c.votantes = toInt(rows[i + 3]![1], `${context} votantes`);
    i += 4;
    // Lo que sigue, hasta el próximo bloque o la distribución por circuitos.
    let pasoMode = false;
    let inParties = false;
    let inTypes = false;
    let lastNum = "";
    let lastName = "";
    for (; i < rows.length; i++) {
      const r = rows[i]!;
      const first = r[0] ?? "";
      if (isMesasRow(r) || /^Distribuci[oó]n por circuitos/i.test(first)) break;
      // Un título de departamento de otro bloque (sin «Mesas habilitadas» todavía) corta este.
      if (!inParties && !inTypes && parseDepartment(first) && /^\d{2}-/.test(first) && r.slice(1).every((x) => x === "")) break;
      if (first === "Agrupación política") {
        inParties = true;
        inTypes = false;
        pasoMode = r[1] === "Lista Interna";
        continue;
      }
      if (/^Resumen de Votos/i.test(first)) {
        inParties = false;
        inTypes = true;
        continue;
      }
      if (inParties) {
        if (r.every((x) => x === "")) continue;
        if (pasoMode) {
          const party = parsePartyLabel(first);
          if (party) {
            lastNum = party.num;
            lastName = party.name;
          } else if (first !== "") throw new Error(`${context}: etiqueta de lista desconocida «${first}»`);
          // Lista interna: «300 A», o «300 A - TRIGO, NORMA» cuando el cargo es intendente (precandidato de la lista).
          const interna = (r[1] ?? "").match(/^(\d+(?:\s+[A-Z])?)(?:\s*-\s*(.+))?$/);
          if (!interna) throw new Error(`${context}: lista interna desconocida «${r[1]}»`);
          const votos = toInt(r[2], `${context} lista ${interna[1]}`);
          c.parties.push({ num: lastNum, lista: interna[1]!, name: lastName, candidate: interna[2] ?? "", votos });
        } else {
          const party = parsePartyLabel(first);
          if (!party) throw new Error(`${context}: etiqueta de lista desconocida «${first}»`);
          c.parties.push({
            num: party.num,
            lista: party.num,
            name: party.name,
            candidate: party.candidate,
            votos: toInt(r[1], `${context} lista ${party.num}`),
          });
        }
      } else if (inTypes) {
        if (first === "") continue;
        const tipo = classifyVoteType(first);
        if (!tipo) throw new Error(`${context}: tipo de voto desconocido «${first}»`);
        c.tipos[tipo] = toInt(r[1], `${context} ${first}`);
      }
    }
    out.push(c);
  }
  return out;
}

function parseClosingWorkbook(bytes: Uint8Array, context: string, province: boolean): Closing[] {
  const out: Closing[] = [];
  for (const sheet of readSheets(bytes)) {
    const cargo = cargoOfSheet(sheet.name);
    if (!cargo) continue;
    out.push(...parseClosingSheet(sheet.rows, cargo, `${context}/${sheet.name}`, province));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Totales por sección
// ---------------------------------------------------------------------------

interface SectionRecord {
  section: number;
  cargo: Cargo;
  /** Lista tal como la nombra la planilla («300 A», o el número). */
  lista: string;
  num: string;
  votos: number;
  tipo: TipoVoto | null;
}

function parseSectionWorkbook(bytes: Uint8Array, context: string): SectionRecord[] {
  const out: SectionRecord[] = [];
  for (const sheet of readSheets(bytes)) {
    const cargo = cargoOfSheet(sheet.name);
    if (!cargo) continue;
    const headerAt = sheet.rows.findIndex((r) => /^C[oó]d\. de secci[oó]n$/i.test(r[0] ?? ""));
    if (headerAt < 0) throw new Error(`${context}/${sheet.name}: sin encabezado de sección`);
    for (const r of sheet.rows.slice(headerAt + 1)) {
      if (r.every((c) => c === "")) continue;
      const section = toInt(r[0], `${context}/${sheet.name} sección`);
      const label = r[3] ?? "";
      const votos = toInt(r[4], `${context}/${sheet.name} sección ${section} ${label}`);
      if (/^\d+$/.test(r[2] ?? "") && r[2] !== "") {
        const num = r[2]!;
        out.push({ section, cargo, lista: label.startsWith(num) ? label : num, num, votos, tipo: null });
      } else {
        const tipo = classifyVoteType(label);
        if (!tipo) throw new Error(`${context}/${sheet.name}: fila de sección desconocida «${label}»`);
        if (tipo !== "positivo") out.push({ section, cargo, lista: "", num: "", votos, tipo });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// PASO 2017 (CSV por mesa, solo concejales)
// ---------------------------------------------------------------------------

function parsePaso2017(bytes: Uint8Array, stats: Stats): MesaRecord[] {
  const text = new TextDecoder("windows-1252").decode(bytes).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l !== "");
  const header = lines[0]!.split(";").map((h) => collapseSpaces(h));
  const expected = [
    "codigo_departamento",
    "id_departamento",
    "codigo_sexo",
    "sexo",
    "mesa",
    "codigo_agrupacion",
    "id_agrupacion_política",
    "codigo_lista",
    "lista_interna",
    "codigo_concepto",
    "id_concepto",
    "votos",
  ];
  if (header.join("|") !== expected.join("|")) throw new Error(`PASO 2017: encabezado inesperado: ${header.join(";")}`);
  const byMesa = new Map<string, MesaRecord>();
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = line.split(";").map((x) => collapseSpaces(x));
    if (f.length !== expected.length) throw new Error(`PASO 2017: fila con ${f.length} columnas`);
    if (fold(f[10]!) !== "concejal") throw new Error(`PASO 2017: concepto inesperado «${f[10]}»`);
    const dept = normalizeMunicipio(f[1]!);
    if (!dept) throw new Error(`PASO 2017: departamento desconocido «${f[1]}»`);
    const mesa = String(toInt(f[4], "PASO 2017 mesa"));
    const votos = toInt(f[11], `PASO 2017 mesa ${mesa}`);
    const rec = byMesa.get(`${dept}|${mesa}`) ?? { dept, cargo: "concejales" as Cargo, mesa, cells: [], total: 0 };
    byMesa.set(`${dept}|${mesa}`, rec);
    const agrupacion = f[6]!;
    const tipo = classifyVoteType(agrupacion);
    const key = `${dept}|${mesa}|${f[5]}|${f[7]}`;
    if (seen.has(key)) throw new Error(`PASO 2017: fila repetida ${key}`);
    seen.add(key);
    if (tipo && Number(f[5]) >= 9990) rec.cells.push({ col: { kind: "tipo", tipo }, votos });
    else if (tipo) throw new Error(`PASO 2017: tipo de voto con código de agrupación ${f[5]}`);
    else rec.cells.push({ col: { kind: "party", lista: f[8]!, num: f[5]!, name: agrupacion }, votos });
    rec.total += votos;
  }
  stats.paso2017Mesas = byMesa.size;
  return [...byMesa.values()];
}

// ---------------------------------------------------------------------------
// Armado de filas
// ---------------------------------------------------------------------------

interface Stats {
  mesaTotalMismatch: string[];
  emptyMesas: number;
  paso2017Mesas?: number;
  unnamed: Set<string>;
}

/** Nombres de agrupación por (elección, ámbito, departamento, número de lista). Primero los de las planillas de mesas. */
class Names {
  private map = new Map<string, string>();
  conflicts = new Set<string>();

  set(eleccion: string, scope: Scope, dept: string | null, num: string, name: string, soft = false) {
    if (!name) return;
    for (const key of [`${eleccion}|${scope}|${dept ?? ""}|${num}`, `${eleccion}|${scope}||${num}`]) {
      const prev = this.map.get(key);
      if (prev === undefined) this.map.set(key, name);
      else if (!soft && prev !== name && key.includes("||")) this.conflicts.add(`${eleccion} ${scope} lista ${num}: «${prev}» / «${name}»`);
    }
  }

  get(eleccion: string, scope: Scope, dept: string | null, num: string): string {
    return this.map.get(`${eleccion}|${scope}|${dept ?? ""}|${num}`) ?? this.map.get(`${eleccion}|${scope}||${num}`) ?? "";
  }
}

interface Loaded {
  election: Election;
  mesas: MesaRecord[];
  closings: Closing[];
  provinceClosings: Closing[];
  sections: SectionRecord[];
}

function zipFiles(bytes: Uint8Array): [string, Uint8Array][] {
  const files = unzipSync(bytes);
  return Object.entries(files)
    .filter(([name]) => !name.endsWith("/") && /\.(xls|xlsx|csv)$/i.test(name))
    .sort(([a], [b]) => a.localeCompare(b));
}

async function load(election: Election, stats: Stats): Promise<Loaded> {
  const bytes = await fetchOrReuse(ID, election.dataset.url, election.dataset.file);
  const loaded: Loaded = { election, mesas: [], closings: [], provinceClosings: [], sections: [] };
  if (election.csv) {
    loaded.mesas = parsePaso2017(bytes, stats);
    return loaded;
  }
  const used = new Set<string>();
  for (const [path, content] of zipFiles(bytes)) {
    const name = path.split("/").pop()!;
    const ctx = `${election.key}:${name}`;
    if (election.mesa?.test(name)) {
      loaded.mesas.push(...parseMesaWorkbook(content, ctx, stats));
      used.add("mesa");
    } else if (election.province?.test(name)) {
      loaded.provinceClosings.push(...parseClosingWorkbook(content, ctx, true));
      used.add("province");
    } else if (election.dept?.test(name)) {
      loaded.closings.push(...parseClosingWorkbook(content, ctx, false));
      used.add("dept");
    } else if (election.section?.test(name)) {
      loaded.sections.push(...parseSectionWorkbook(content, ctx));
      used.add("section");
    } else {
      throw new Error(`${ctx}: archivo que ninguna regla reconoce`);
    }
  }
  for (const [k, re] of [
    ["mesa", election.mesa],
    ["dept", election.dept],
    ["province", election.province],
    ["section", election.section],
  ] as const) {
    if (re && !used.has(k)) throw new Error(`${election.key}: no encontré planillas de tipo ${k}`);
  }
  return loaded;
}

const sectionOf = (dept: string | null): number | "" => (dept ? (SECTION_OF[dept] ?? "") : "");

function buildRows(all: Loaded[], stats: Stats): { results: Row[]; participation: Row[]; names: Names } {
  const names = new Names();
  // 1) Nombres: primero los encabezados de las planillas de mesas, después los cierres.
  for (const l of all) {
    for (const m of l.mesas) {
      for (const { col } of m.cells)
        if (col.kind === "party" && col.name) names.set(l.election.eleccion, SCOPE[m.cargo], m.dept, col.num, col.name);
    }
  }
  for (const l of all) {
    for (const c of l.closings) for (const p of c.parties) names.set(l.election.eleccion, SCOPE[c.cargo], c.dept, p.num, p.name, true); // soft: en 2015 el cierre usa siglas («FIT»)
  }

  const results: Row[] = [];
  const participation: Row[] = [];
  const base = (l: Loaded, cargo: Cargo, nivel: Nivel, dept: string | null, extra: Partial<Record<string, string | number>> = {}) => ({
    eleccion: l.election.eleccion,
    tipo_eleccion: l.election.tipo,
    escrutinio: l.election.escrutinio,
    cargo,
    nivel,
    seccion_electoral: nivel === "provincia" ? "" : (extra.seccion ?? sectionOf(dept)),
    departamento: dept ?? "",
    circuito: "",
    mesa: extra.mesa ?? "",
  });
  const nameFor = (l: Loaded, cargo: Cargo, dept: string | null, num: string, fallback: string): string => {
    const found = names.get(l.election.eleccion, SCOPE[cargo], dept, num);
    if (found) return found;
    if (fallback) return fallback;
    stats.unnamed.add(`${l.election.key} ${cargo} lista ${num}`);
    return "";
  };

  for (const l of all) {
    // Mesas.
    for (const m of l.mesas) {
      const b = base(l, m.cargo, "mesa", m.dept, { mesa: m.mesa });
      for (const { col, votos } of m.cells) {
        if (col.kind === "party") {
          if (votos === 0) continue;
          results.push({
            ...b,
            tipo_voto: "positivo",
            agrupacion: nameFor(l, m.cargo, m.dept, col.num, col.name),
            lista: col.lista,
            candidato: "",
            votos,
          });
        } else if (col.kind === "tipo") {
          results.push({ ...b, tipo_voto: col.tipo, agrupacion: "", lista: "", candidato: "", votos });
        }
      }
      participation.push({
        ...b,
        mesas_habilitadas: 1,
        mesas_escrutadas: m.total > 0 ? 1 : 0,
        electores: "",
        votantes: m.total,
      });
    }
    // Cierres por departamento y por provincia.
    for (const c of [...l.closings, ...l.provinceClosings]) {
      const nivel: Nivel = c.dept ? "departamento" : "provincia";
      if (c.votantes === 0 && c.electores > 0 && c.parties.length === 0 && Object.keys(c.tipos).length <= 1) continue; // 2015: intendente y concejal de la provincia vienen vacíos
      const b = base(l, c.cargo, nivel, c.dept);
      for (const p of c.parties) {
        results.push({
          ...b,
          tipo_voto: "positivo",
          agrupacion: nameFor(l, c.cargo, c.dept, p.num, p.name),
          lista: p.lista,
          candidato: p.candidate,
          votos: p.votos,
        });
      }
      for (const tipo of ["blanco", "nulo", "recurrido", "impugnado", "comando_electoral"] as const) {
        const votos = c.tipos[tipo];
        if (votos !== undefined) results.push({ ...b, tipo_voto: tipo, agrupacion: "", lista: "", candidato: "", votos });
      }
      participation.push({
        ...b,
        mesas_habilitadas: c.mesasHabilitadas,
        mesas_escrutadas: c.mesasEscrutadas,
        electores: c.electores,
        votantes: c.votantes,
      });
    }
    // Secciones.
    for (const s of l.sections) {
      const b = { ...base(l, s.cargo, "seccion", null), seccion_electoral: s.section };
      if (s.tipo) results.push({ ...b, tipo_voto: s.tipo, agrupacion: "", lista: "", candidato: "", votos: s.votos });
      else {
        results.push({
          ...b,
          tipo_voto: "positivo",
          agrupacion: nameFor(l, s.cargo, null, s.num, ""),
          lista: s.lista,
          candidato: "",
          votos: s.votos,
        });
      }
    }
  }

  const cargoRank = (c: unknown) => CARGO_ORDER.indexOf(c as Cargo);
  const nivelRank = (n: unknown) => ["provincia", "seccion", "departamento", "mesa"].indexOf(n as string);
  const cmp = (a: Row, b: Row) =>
    String(a.eleccion).localeCompare(String(b.eleccion)) ||
    String(a.escrutinio).localeCompare(String(b.escrutinio)) ||
    cargoRank(a.cargo) - cargoRank(b.cargo) ||
    nivelRank(a.nivel) - nivelRank(b.nivel) ||
    String(a.departamento).localeCompare(String(b.departamento), "es") ||
    Number(a.seccion_electoral || 0) - Number(b.seccion_electoral || 0) ||
    Number(a.mesa || 0) - Number(b.mesa || 0);
  results.sort(cmp); // el orden es estable: dentro de una mesa queda el de la planilla
  participation.sort(cmp);
  return { results, participation, names };
}

// ---------------------------------------------------------------------------
// Validación: mesas contra los totales que imprime la fuente
// ---------------------------------------------------------------------------

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

function validate(results: Row[], participation: Row[]): Check[] {
  const checks: Check[] = [];
  const sums = new Map<string, Map<string, number>>(); // (grupo, nivel) -> clave de opción -> votos
  const printed = new Map<string, Map<string, number>>();
  const optionKey = (r: Row) => (r.tipo_voto === "positivo" ? `p|${r.lista}` : String(r.tipo_voto));
  const group = (r: Row, nivel: string) =>
    [r.eleccion, r.escrutinio, r.cargo, nivel === "departamento" ? r.departamento : nivel === "seccion" ? r.seccion_electoral : ""].join(
      "|",
    );
  const add = (m: Map<string, Map<string, number>>, g: string, k: string, v: number) => {
    const inner = m.get(g) ?? new Map<string, number>();
    inner.set(k, (inner.get(k) ?? 0) + v);
    m.set(g, inner);
  };
  const levels = new Map<string, Set<string>>();
  for (const r of results) {
    const nivel = String(r.nivel);
    const g = `${nivel}#${group(r, nivel)}`;
    if (nivel === "mesa") {
      add(sums, `departamento#${group(r, "departamento")}`, optionKey(r), Number(r.votos));
      add(sums, `seccion#${group(r, "seccion")}`, optionKey(r), Number(r.votos));
      add(sums, `provincia#${group(r, "provincia")}`, optionKey(r), Number(r.votos));
    } else add(printed, g, optionKey(r), Number(r.votos));
    const set = levels.get(`${r.eleccion}|${r.escrutinio}|${r.cargo}`) ?? new Set<string>();
    set.add(nivel);
    levels.set(`${r.eleccion}|${r.escrutinio}|${r.cargo}`, set);
  }
  const keysOf = (g: string) => g.split("#")[1]!;
  // Las mesas contra cada total impreso. En el cierre de la provincia solo hay tipos de voto, no listas.
  const tally = new Map<string, { ok: number; bad: string[] }>();
  for (const [g, inner] of printed) {
    const nivel = g.split("#")[0]!;
    const mine = sums.get(g);
    const tag = `${keysOf(g).split("|").slice(0, 3).join(" ")} · ${nivel}`;
    const t = tally.get(tag) ?? { ok: 0, bad: [] };
    tally.set(tag, t);
    if (!mine) {
      t.bad.push(`${g}: sin mesas`);
      continue;
    }
    const diffs: string[] = [];
    for (const [k, v] of inner) if ((mine.get(k) ?? 0) !== v) diffs.push(`${k}: mesas ${mine.get(k) ?? 0} ≠ impreso ${v}`);
    if (nivel !== "provincia") for (const [k, v] of mine) if (!inner.has(k) && v !== 0) diffs.push(`${k}: mesas ${v}, no impreso`);
    if (diffs.length === 0) t.ok++;
    else t.bad.push(`${keysOf(g)}: ${diffs.slice(0, 3).join("; ")}`);
  }
  for (const [tag, t] of [...tally].sort(([a], [b]) => a.localeCompare(b))) {
    checks.push({
      label: tag,
      ok: t.bad.length === 0,
      detail: `${t.ok} cierran${t.bad.length ? `, ${t.bad.length} no: ${t.bad.slice(0, 6).join(" | ")}` : ""}`,
    });
  }

  // Participación: votantes por mesa contra el cierre del departamento.
  const mesaVotantes = new Map<string, number>();
  const closingVotantes = new Map<string, number>();
  for (const p of participation) {
    const g = `${p.eleccion}|${p.escrutinio}|${p.cargo}|${p.departamento}`;
    if (p.nivel === "mesa") mesaVotantes.set(g, (mesaVotantes.get(g) ?? 0) + Number(p.votantes));
    else if (p.nivel === "departamento") closingVotantes.set(g, Number(p.votantes));
  }
  const byElection = new Map<string, { ok: number; bad: string[] }>();
  for (const [g, v] of closingVotantes) {
    const tag = g.split("|").slice(0, 3).join(" ");
    const t = byElection.get(tag) ?? { ok: 0, bad: [] };
    byElection.set(tag, t);
    const mine = mesaVotantes.get(g);
    if (mine === v) t.ok++;
    else t.bad.push(`${g.split("|")[3]}: mesas ${mine} ≠ impreso ${v}`);
  }
  for (const [tag, t] of [...byElection].sort(([a], [b]) => a.localeCompare(b))) {
    checks.push({
      label: `votantes ${tag}`,
      ok: t.bad.length === 0,
      detail: `${t.ok} departamentos cierran${t.bad.length ? `, ${t.bad.length} no: ${t.bad.slice(0, 6).join(" | ")}` : ""}`,
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Diccionario
// ---------------------------------------------------------------------------

const GEO_COLUMNS = {
  eleccion: { etiqueta: "Elección", tipo: "fecha", descripcion: "Fecha de la jornada (YYYY-MM-DD); identifica la elección." },
  tipo_eleccion: {
    etiqueta: "Tipo de elección",
    tipo: "texto",
    valores: { paso: "PASO", general: "Generales", municipal: "Generales municipales (departamentos desdoblados)" },
  },
  escrutinio: {
    etiqueta: "Escrutinio",
    tipo: "texto",
    valores: { provisorio: "Provisorio", definitivo: "Definitivo" },
    descripcion: "Una misma elección puede estar en los dos (PASO 2019): son cuentas distintas del mismo acto.",
  },
  cargo: {
    etiqueta: "Cargo",
    tipo: "texto",
    valores: {
      gobernador: "Gobernador",
      senadores: "Senadores provinciales",
      diputados: "Diputados provinciales",
      intendente: "Intendente",
      concejales: "Concejales",
    },
  },
  nivel: {
    etiqueta: "Nivel de la fila",
    tipo: "texto",
    valores: { provincia: "Provincia", seccion: "Sección electoral", departamento: "Departamento", mesa: "Mesa" },
    descripcion:
      "El nivel más fino es la mesa. Las filas de sección, departamento y provincia son los totales que imprime la fuente: sirven para validar y no se suman con las de mesa.",
  },
  seccion_electoral: { etiqueta: "Sección electoral", tipo: "entero", descripcion: "1 a 4. Vacío en las filas de provincia." },
  departamento: {
    etiqueta: "Departamento",
    tipo: "texto",
    descripcion: "Nombre normalizado. Vacío en las filas de provincia y de sección.",
  },
  circuito: {
    etiqueta: "Circuito",
    tipo: "texto",
    descripcion: "Siempre vacío: las planillas de mesas no dicen a qué circuito pertenece cada mesa.",
  },
  mesa: { etiqueta: "Mesa", tipo: "texto", descripcion: "Número de mesa tal como lo da la fuente (único dentro de cada departamento)." },
} as const;

async function writeMeta() {
  const dir = join(PROCESSED_DIR, ID);
  await mkdir(dir, { recursive: true });
  const fuente = "Portal de datos abiertos de Mendoza (datosabiertos.mendoza.gov.ar), planillas de la Junta Electoral.";
  const resultados = {
    titulo: "Resultados electorales provinciales de Mendoza (datos abiertos)",
    descripcion:
      "Totales de sección, departamento y provincia que imprime la fuente (el detalle por mesa, con las mismas columnas, está en `mesas.csv.gz`; este diccionario vale para los dos), de las elecciones generales provinciales de 2015, las PASO de 2017 (solo concejales) y de 2019, las generales municipales del 1 de septiembre de 2019 y las generales del 29 de septiembre de 2019. Cada escrutinio es el que dice el archivo: 2015, PASO 2019 (definitivo) y municipales 2019 son definitivos; PASO 2017, PASO 2019 (provisorio) y generales 2019 son provisorios. En `mesas.csv.gz` no hay filas con 0 votos de una lista (ausente equivale a cero); los votos blancos, nulos, recurridos e impugnados se escriben siempre. El cierre de la provincia solo trae tipos de voto, no listas. La agrupación es la que dice la fuente; donde la planilla de mesas trae solo el código de la lista (PASO 2019) o una sigla, el nombre sale de la misma elección. El candidato figura únicamente donde el cierre departamental lo imprime (gobernador e intendente de 2015 y 2019). Fuera de este archivo quedan las legislativas provinciales de 2017, cuyos CSV traen solo códigos sin leyenda.",
    fuente,
    columnas: {
      ...GEO_COLUMNS,
      tipo_voto: {
        etiqueta: "Tipo de voto",
        tipo: "texto",
        valores: {
          positivo: "Positivo (a una lista)",
          blanco: "En blanco",
          nulo: "Nulo",
          recurrido: "Recurrido",
          impugnado: "De identidad impugnada",
          comando_electoral: "De comando electoral (fuerzas de seguridad; solo PASO 2017)",
        },
      },
      agrupacion: {
        etiqueta: "Agrupación política",
        tipo: "texto",
        descripcion: "Partido, frente o alianza, como lo dice la fuente. Vacío si no es voto positivo.",
      },
      lista: {
        etiqueta: "Lista",
        tipo: "texto",
        descripcion:
          "Número de lista, con la letra de la lista interna en las PASO de 2019 («300 A»). En las PASO de 2017 es el nombre de la lista interna que da el archivo.",
      },
      candidato: {
        etiqueta: "Candidato",
        tipo: "texto",
        descripcion: "Solo si el cierre departamental lo imprime junto a la lista (APELLIDO, Nombre).",
      },
      votos: { etiqueta: "Votos", tipo: "entero", unidad: "votos" },
    },
  };
  const participacion = {
    titulo: "Participación en las elecciones provinciales de Mendoza (datos abiertos)",
    descripcion:
      "Mesas, electores y votantes por cargo en sección, departamento y provincia, de las mismas elecciones que `resultados.csv`; el detalle por mesa está en `participacion_mesas.csv.gz` (mismas columnas). En el nivel mesa los electores no figuran (las planillas por mesa no los traen) y `votantes` es la suma de todos los votos de la mesa para ese cargo, incluidos blancos y nulos; `mesas_escrutadas` es 1 si la mesa tiene votos cargados. En departamento y provincia los números son los que imprime el cierre. Los votantes cambian de un cargo a otro porque no todos votan los mismos cargos (en 2015 y 2019 hay más votos para gobernador que para senador). En los escrutinios provisorios la cuenta pudo estar incompleta al cerrar el archivo.",
    fuente,
    columnas: {
      ...GEO_COLUMNS,
      mesas_habilitadas: { etiqueta: "Mesas habilitadas", tipo: "entero" },
      mesas_escrutadas: { etiqueta: "Mesas escrutadas", tipo: "entero" },
      electores: { etiqueta: "Electores empadronados", tipo: "entero" },
      votantes: { etiqueta: "Votantes", tipo: "entero" },
    },
  };
  await writeFile(join(dir, "resultados.meta.json"), `${JSON.stringify(resultados, null, 2)}\n`);
  await writeFile(join(dir, "participacion.meta.json"), `${JSON.stringify(participacion, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Catálogo CKAN (aviso de datasets nuevos)
// ---------------------------------------------------------------------------

/** Datasets electorales que se conocen y se dejan afuera a propósito (no son resultados o no se pueden leer). */
const IGNORED_DATASETS = new Set([
  "precandidatos-elecciones-paso-provinciales-2019",
  "datosabiertos-mendoza-gov-ar-dataset-cuadro-ubicacion-mesas-legislativas-2017",
  "legislativas-provinciales-2017",
]);

async function checkCatalog() {
  try {
    // Solo se mira: la lista de datasets cambia con cualquier edición del portal, así que no se archiva.
    const parsed = (await (await get(CKAN_SEARCH)).json()) as { result: { results: { name: string }[] } };
    const known = new Set<string>([...Object.values(DATASETS).map((d) => d.dataset), ...IGNORED_DATASETS]);
    const unknown = parsed.result.results.map((p) => p.name).filter((n) => !known.has(n));
    if (unknown.length) console.warn(`AVISO: datasets electorales nuevos en CKAN sin revisar: ${unknown.join(", ")}`);
  } catch (e) {
    console.warn(`AVISO: no pude consultar el catálogo CKAN (${(e as Error).message})`);
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function run(_args: string[]) {
  const stats: Stats = { mesaTotalMismatch: [], emptyMesas: 0, unnamed: new Set() };
  await checkCatalog();
  const all: Loaded[] = [];
  for (const e of ELECTIONS) {
    all.push(await load(e, stats));
    console.log(
      `${e.key}: ${all.at(-1)!.mesas.length} mesas-cargo, ${all.at(-1)!.closings.length} cierres, ${all.at(-1)!.sections.length} filas de sección`,
    );
  }
  const { results, participation, names } = buildRows(all, stats);
  // El nivel mesa va aparte y comprimido: Cloudflare Pages rechaza archivos de más de 25 MiB.
  const notMesa = (r: Row) => r.nivel !== "mesa";
  const isMesa = (r: Row) => r.nivel === "mesa";
  await writeProcessed(ID, "resultados.csv", results.filter(notMesa), RESULT_COLUMNS);
  await writeProcessed(ID, "participacion.csv", participation.filter(notMesa), PARTICIPATION_COLUMNS);
  const gz = (file: string, rows: Row[], cols: string[]) =>
    writeFile(join(PROCESSED_DIR, ID, file), nodeGzip(Buffer.from(toCsv(rows, cols)), { level: 9 }));
  await gz("mesas.csv.gz", results.filter(isMesa), RESULT_COLUMNS);
  await gz("participacion_mesas.csv.gz", participation.filter(isMesa), PARTICIPATION_COLUMNS);
  await writeMeta();
  console.log(`resultados+mesas: ${results.length} filas · participacion+mesas: ${participation.length} filas`);

  const checks = validate(results, participation);
  for (const c of checks) console.log(`${c.ok ? "OK " : "XX "} ${c.label}: ${c.detail}`);
  if (stats.mesaTotalMismatch.length) {
    console.warn(
      `AVISO: ${stats.mesaTotalMismatch.length} mesas donde el TOTAL de la planilla no es la suma de sus columnas (ej.: ${stats.mesaTotalMismatch.slice(0, 3).join(" | ")})`,
    );
  }
  if (stats.emptyMesas) console.log(`Mesas sin datos para un cargo (extranjeros, un solo 0): ${stats.emptyMesas}`);
  if (names.conflicts.size) console.warn(`AVISO: nombres distintos para la misma lista: ${[...names.conflicts].slice(0, 5).join(" | ")}`);
  if (stats.unnamed.size) console.warn(`AVISO: listas sin nombre: ${[...stats.unnamed].slice(0, 10).join(" | ")}`);
}
