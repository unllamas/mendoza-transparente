/**
 * Builds the JSON that the elections app reads, from the processed CSVs of the election sources
 * (data/processed/<source>/resultados.csv and participacion.csv, common schema in docs/planes/votacion.md).
 *
 * Writes to public/datos/ (ignored by git):
 *  - indice.json                                          years, their elections, scrutinies and offices
 *  - elecciones/<id>.json                                 province, sections and departments of each office
 *  - elecciones/<id>/<escrutinio>/<cargo>/<depto>.json    circuits and polling tables of one department
 *
 * When two sources cover the same election and scrutiny, the first one in SOURCES wins (the one with the finest
 * detail). Totals the source does not print are summed from finer units and marked `sumado`.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse as parseYaml } from "yaml";
import { slug } from "../src/slug.ts";
import type {
  DataIndex,
  DepartmentDetail,
  Election,
  ElectionSummary,
  OfficeResults,
  PartyRef,
  Scrutiny,
  Turnout,
  Unit,
  VoteType,
} from "../src/types.ts";
import { type AuditOffice, auditElection } from "./audit.ts";

// VOTACION_PROCESSED_DIR points the build at other CSVs (sample data for a preview), without touching data/.
const PROCESSED_DIR = process.env.VOTACION_PROCESSED_DIR ?? join(import.meta.dir, "..", "..", "..", "data", "processed");
const OUT = join(import.meta.dir, "..", "public", "datos");
const COLORS = join(import.meta.dir, "..", "..", "..", "data", "curado", "colores-partidos.yaml");
const PARTIES = join(import.meta.dir, "..", "..", "..", "data", "curado", "partidos.yaml");
const FRONTS = join(import.meta.dir, "..", "..", "..", "data", "curado", "frentes.yaml");
/** The main site, where each curated party has its page and its logo. */
const MAIN_SITE = "https://mendoza-transparente.com";

/** Same rule as the main site (apps/web/scripts/temas/parties.ts): case, accents and punctuation don't matter. */
const partyKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

interface ColorEntry {
  nombres: string[];
  anios?: number[];
  color: string;
  fuente: string;
}

/** Official color of a force by name and election year (data/curado/colores-partidos.yaml); null if none. */
function partyColors(): (name: string, year: number) => string | null {
  const entries = existsSync(COLORS) ? (parseYaml(readFileSync(COLORS, "utf8")) as ColorEntry[]) : [];
  for (const e of entries)
    if (!/^#[0-9a-f]{6}$/i.test(e.color) || !e.fuente?.startsWith("https://"))
      throw new Error(`colores-partidos.yaml: «${e.nombres[0]}» necesita un color #rrggbb y su fuente`);
  return (name, year) => {
    const key = partyKey(name);
    const matches = entries.filter((e) => e.nombres.some((n) => partyKey(n) === key));
    // An entry for that year wins over one for every year.
    const hit = matches.find((e) => e.anios?.includes(year)) ?? matches.find((e) => !e.anios);
    return hit ? hit.color.toLowerCase() : null;
  };
}

interface PartyEntry {
  slug: string;
  nombre: string;
  sigla?: string;
  logo?: string | null;
  color?: string | null;
  alias?: { nombre: string }[];
}

interface FrontEntry {
  nombres: string[];
  partidos: string[];
  fuente: string;
  motivo: string;
}

/**
 * The curated parties behind a force's name: the party itself (data/curado/partidos.yaml, by its name or an alias), or
 * the parties that form a front (data/curado/frentes.yaml). A front is not its parties: it gets their logos and links,
 * never their name. Null when nobody curated it.
 */
function curatedParties(): (name: string) => PartyRef[] | null {
  const entries = existsSync(PARTIES) ? (parseYaml(readFileSync(PARTIES, "utf8")) as PartyEntry[]) : [];
  const bySlug = new Map<string, PartyRef>();
  const byKey = new Map<string, PartyRef[]>();
  for (const e of entries) {
    const ref: PartyRef = {
      slug: e.slug,
      nombre: e.nombre,
      sigla: e.sigla ?? null,
      logo: e.logo ? `${MAIN_SITE}/partidos/${e.logo}` : null,
      color: e.color ?? null,
    };
    bySlug.set(e.slug, ref);
    for (const n of [e.nombre, ...(e.alias ?? []).map((a) => a.nombre)]) byKey.set(partyKey(n), [ref]);
  }
  const fronts = existsSync(FRONTS) ? (parseYaml(readFileSync(FRONTS, "utf8")) as FrontEntry[]) : [];
  for (const f of fronts) {
    const where = `frentes.yaml: «${f.nombres[0]}»`;
    if (f.partidos.length < 2) throw new Error(`${where} necesita al menos dos partidos`);
    if (!f.fuente?.startsWith("https://") || !f.motivo) throw new Error(`${where} necesita su fuente oficial y su motivo`);
    const members = f.partidos.map((s) => {
      const ref = bySlug.get(s);
      if (!ref) throw new Error(`${where}: «${s}» no está en partidos.yaml`);
      return ref;
    });
    for (const n of f.nombres) {
      if (byKey.has(partyKey(n))) throw new Error(`${where}: «${n}» ya es un partido o un frente cargado`);
      byKey.set(partyKey(n), members);
    }
  }
  return (name) => byKey.get(partyKey(name)) ?? null;
}

/** In order of preference for the same election and scrutiny. */
const SOURCES: { id: string; url: string }[] = [
  { id: "escrutinios-definitivos", url: "https://jusmendoza.gob.ar/escrutinios-definitivos-elecciones-generales-de-mendoza/" },
  { id: "elecciones-datos-abiertos", url: "https://datosabiertos.mendoza.gov.ar/dataset/?q=elecciones" },
  { id: "resultados-provisorios", url: "https://resultados.mendoza.gov.ar/" },
];

const LEVELS = ["provincia", "seccion", "departamento", "circuito", "mesa"] as const;
type Level = (typeof LEVELS)[number];

const OFFICE_ORDER = ["gobernador", "senadores", "diputados", "intendente", "concejales", "convencionales"];

const COLUMNS = [
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
  "mesas_habilitadas",
  "mesas_escrutadas",
  "electores",
  "votantes",
] as const;

/** A row of either CSV, as text; columns the file does not have are empty. */
type Row = Record<(typeof COLUMNS)[number], string>;

/** Minimal CSV parser (RFC 4180): quotes, commas and line breaks inside fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads a processed CSV; `.csv.gz` files (polling tables, too big for a plain CSV) are unzipped first. */
function read(source: string, file: string): Row[] {
  const path = join(PROCESSED_DIR, source, file);
  if (!existsSync(path)) return [];
  const bytes = readFileSync(path);
  const text = file.endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  const [header = [], ...rows] = parseCsv(text);
  return rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[header.indexOf(c)] ?? ""])) as Row);
}

const int = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : Number(v));

/** Key of a geographic unit inside one office: level plus the codes that identify it. */
const unitKey = (r: Row) => [r.nivel, r.seccion_electoral ?? "", r.departamento ?? "", r.circuito ?? "", r.mesa ?? ""].join("|");

function unitName(r: Row): string {
  switch (r.nivel as Level) {
    case "provincia":
      return "Mendoza";
    case "seccion":
      return `Sección ${r.seccion_electoral}`;
    case "departamento":
      return r.departamento ?? "";
    case "circuito":
      return `Circuito ${r.circuito}`;
    default:
      return `Mesa ${r.mesa}`;
  }
}

function emptyUnit(r: Row): Unit {
  return {
    nombre: unitName(r),
    seccion: int(r.seccion_electoral),
    participacion: null,
    listas: [],
    otros: {},
    sumado: false,
  };
}

/** Adds `b` into `a` (for totals the source does not print). */
function addUnit(a: Unit, b: Unit) {
  for (const l of b.listas) {
    const same = a.listas.find((x) => x.agrupacion === l.agrupacion && x.lista === l.lista);
    if (same) same.votos += l.votos;
    else a.listas.push({ ...l });
  }
  for (const [k, v] of Object.entries(b.otros) as [VoteType, number][]) a.otros[k] = (a.otros[k] ?? 0) + v;
  if (b.participacion) {
    const p = a.participacion ?? { mesasHabilitadas: 0, mesasEscrutadas: 0, electores: 0, votantes: 0 };
    for (const k of Object.keys(p) as (keyof Turnout)[]) {
      const add = b.participacion[k];
      p[k] = p[k] === null || add === null ? null : (p[k] ?? 0) + add;
    }
    a.participacion = p;
  }
}

function sumUnits(name: string, seccion: number | null, units: Unit[]): Unit | null {
  if (units.length === 0) return null;
  const total: Unit = { nombre: name, seccion, participacion: null, listas: [], otros: {}, sumado: true };
  for (const u of units) addUnit(total, u);
  return total;
}

const sortLists = (u: Unit) => {
  u.listas.sort((a, b) => b.votos - a.votos);
  return u;
};

interface OfficeUnits {
  /** By level, by unit key. */
  byLevel: Map<Level, Map<string, Unit>>;
  /** Department of each circuit and polling table unit (by unit key). */
  departmentOf: Map<string, string>;
}

function officeUnits(): OfficeUnits {
  return { byLevel: new Map(LEVELS.map((l) => [l, new Map()])), departmentOf: new Map() };
}

function unitFor(office: OfficeUnits, r: Row): Unit {
  const level = r.nivel as Level;
  const units = office.byLevel.get(level);
  if (!units) throw new Error(`Nivel desconocido: ${r.nivel}`);
  const key = unitKey(r);
  let u = units.get(key);
  if (!u) {
    u = emptyUnit(r);
    units.set(key, u);
    if (r.departamento) office.departmentOf.set(key, r.departamento);
  }
  return u;
}

/** election id → scrutiny → office → units, plus the source that won each election and scrutiny. */
type Collected = Map<
  string,
  { tipo: string; escrutinios: Map<Scrutiny, { source: (typeof SOURCES)[number]; offices: Map<string, OfficeUnits> }> }
>;

function collect(): Collected {
  const out: Collected = new Map();
  for (const source of SOURCES) {
    const results = [...read(source.id, "resultados.csv"), ...read(source.id, "mesas.csv.gz")];
    const turnout = [...read(source.id, "participacion.csv"), ...read(source.id, "participacion_mesas.csv.gz")];
    if (results.length === 0) continue;

    // Elections and scrutinies this source brings that no earlier source covered.
    const mine = new Set<string>();
    for (const r of [...results, ...turnout]) {
      const election = out.get(r.eleccion) ?? { tipo: r.tipo_eleccion, escrutinios: new Map() };
      out.set(r.eleccion, election);
      const scrutiny = r.escrutinio as Scrutiny;
      const pair = `${r.eleccion}|${scrutiny}`;
      if (!election.escrutinios.has(scrutiny)) {
        election.escrutinios.set(scrutiny, { source, offices: new Map() });
        mine.add(pair);
      }
      if (!mine.has(pair)) continue;
      const offices = election.escrutinios.get(scrutiny)!.offices;
      const office = offices.get(r.cargo) ?? officeUnits();
      offices.set(r.cargo, office);
    }

    for (const r of results) {
      if (!mine.has(`${r.eleccion}|${r.escrutinio}`)) continue;
      const office = out
        .get(r.eleccion)!
        .escrutinios.get(r.escrutinio as Scrutiny)!
        .offices.get(r.cargo)!;
      const u = unitFor(office, r);
      const votes = Number(r.votos);
      if (r.tipo_voto === "positivo") {
        u.listas.push({ agrupacion: r.agrupacion, lista: r.lista, candidato: r.candidato ?? "", votos: votes });
      } else {
        const k = r.tipo_voto as VoteType;
        u.otros[k] = (u.otros[k] ?? 0) + votes;
      }
    }
    for (const r of turnout) {
      if (!mine.has(`${r.eleccion}|${r.escrutinio}`)) continue;
      const office = out
        .get(r.eleccion)!
        .escrutinios.get(r.escrutinio as Scrutiny)!
        .offices.get(r.cargo)!;
      unitFor(office, r).participacion = {
        mesasHabilitadas: int(r.mesas_habilitadas),
        mesasEscrutadas: int(r.mesas_escrutadas),
        electores: int(r.electores),
        votantes: int(r.votantes),
      };
    }
  }
  return out;
}

/** Departments as printed, or summed from their circuits or polling tables. */
function departments(office: OfficeUnits): Unit[] {
  const printed = [...office.byLevel.get("departamento")!.values()];
  const names = new Set(printed.map((u) => u.nombre));
  const finer = new Map<string, Unit[]>();
  for (const level of ["circuito", "mesa"] as const) {
    const units = office.byLevel.get(level)!;
    if (units.size === 0) continue;
    for (const [key, u] of units) {
      const d = office.departmentOf.get(key);
      if (!d || names.has(d)) continue;
      finer.set(d, [...(finer.get(d) ?? []), u]);
    }
    if (finer.size > 0) break;
  }
  const summed = [...finer].map(([d, units]) => sumUnits(d, units[0]?.seccion ?? null, units)!);
  return [...printed, ...summed].map(sortLists).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function officeResults(office: OfficeUnits): { results: OfficeResults; details: Map<string, DepartmentDetail> } {
  const deps = departments(office);
  const secciones = [...office.byLevel.get("seccion")!.values()].map(sortLists).sort((a, b) => (a.seccion ?? 0) - (b.seccion ?? 0));
  const printedProvince = [...office.byLevel.get("provincia")!.values()][0];
  // Some sources print the province's turnout and blank or null votes but not the votes per list: then the lists
  // are our sum of the departments, and the printed figures stay.
  // Without a printed total, the province is the sum of the departments or, if the source only has sections, of them.
  let provincia = printedProvince ? sortLists(printedProvince) : sumUnits("Mendoza", null, deps.length > 0 ? deps : secciones);
  if (printedProvince && printedProvince.listas.length === 0 && deps.length > 0) {
    const summed = sumUnits("Mendoza", null, deps)!;
    provincia = { ...printedProvince, listas: summed.listas, sumado: true };
  }
  if (provincia?.sumado) sortLists(provincia);

  const details = new Map<string, DepartmentDetail>();
  for (const level of ["circuito", "mesa"] as const) {
    for (const [key, u] of office.byLevel.get(level)!) {
      const d = office.departmentOf.get(key);
      if (!d) continue;
      const detail = details.get(d) ?? { circuitos: [], mesas: [] };
      details.set(d, detail);
      (level === "circuito" ? detail.circuitos : detail.mesas).push(sortLists(u));
    }
  }
  const byNumber = (a: Unit, b: Unit) => a.nombre.localeCompare(b.nombre, "es", { numeric: true });
  for (const d of details.values()) {
    d.circuitos.sort(byNumber);
    d.mesas.sort(byNumber);
  }
  return {
    results: { provincia, secciones, departamentos: deps, detalle: [...details.keys()].map(slug).sort() },
    details,
  };
}

/** What the audit needs from one office: printed departments, their polling tables, and the departments shown. */
function auditOffice(office: OfficeUnits): AuditOffice {
  const mesas = new Map<string, Unit[]>();
  for (const [key, u] of office.byLevel.get("mesa")!) {
    const d = office.departmentOf.get(key);
    if (d) mesas.set(d, [...(mesas.get(d) ?? []), u]);
  }
  const printed = new Map([...office.byLevel.get("departamento")!.values()].map((u) => [u.nombre, u]));
  return { printed, mesas, departamentos: departments(office) };
}

const officeRank = (c: string) => (OFFICE_ORDER.indexOf(c) === -1 ? 99 : OFFICE_ORDER.indexOf(c));

function write(path: string, data: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

async function main() {
  const collected = collect();
  const colors = partyColors();
  const parties = curatedParties();
  rmSync(OUT, { recursive: true, force: true });

  const summaries: ElectionSummary[] = [];
  for (const [id, { tipo, escrutinios }] of [...collected].sort(([a], [b]) => a.localeCompare(b))) {
    const election: Election = { id, tipo, escrutinios: {}, auditoria: [], colores: {}, partidos: {} };
    const offices = new Set<string>();
    for (const [scrutiny, { source, offices: byOffice }] of escrutinios) {
      const cargos: Record<string, OfficeResults> = {};
      for (const [cargo, office] of [...byOffice].sort(([a], [b]) => officeRank(a) - officeRank(b))) {
        const { results, details } = officeResults(office);
        cargos[cargo] = results;
        offices.add(cargo);
        for (const [d, detail] of details) write(join(OUT, "elecciones", id, scrutiny, cargo, `${slug(d)}.json`), detail);
      }
      election.escrutinios[scrutiny] = { fuente: source.id, fuenteUrl: source.url, cargos };
    }
    for (const scrutiny of Object.values(election.escrutinios))
      for (const office of Object.values(scrutiny.cargos))
        for (const u of [office.provincia, ...office.secciones, ...office.departamentos])
          for (const l of u?.listas ?? []) {
            const color = colors(l.agrupacion, Number(id.slice(0, 4)));
            if (color) election.colores[l.agrupacion] = color;
            const curated = parties(l.agrupacion);
            if (curated) election.partidos[l.agrupacion] = curated;
          }
    election.auditoria = auditElection(
      new Map([...escrutinios].map(([s, e]) => [s, new Map([...e.offices].map(([c, o]) => [c, auditOffice(o)]))])),
    );
    write(join(OUT, "elecciones", `${id}.json`), election);
    summaries.push({
      id,
      tipo,
      escrutinios: (["provisorio", "definitivo"] as const).filter((s) => escrutinios.has(s)),
      cargos: [...offices].sort((a, b) => officeRank(a) - officeRank(b)),
    });
  }

  const years = new Map<number, ElectionSummary[]>();
  for (const s of summaries) {
    const year = Number(s.id.slice(0, 4));
    years.set(year, [...(years.get(year) ?? []), s]);
  }
  // Departments map (from the "geo" source), the same drawing the main site uses.
  const map = join(PROCESSED_DIR, "geo", "mendoza_departamentos.json");
  if (existsSync(map)) writeFileSync(join(OUT, "mapa.json"), readFileSync(map));

  const index: DataIndex = {
    generado: new Date().toISOString(),
    anios: [...years].sort(([a], [b]) => b - a).map(([anio, elecciones]) => ({ anio, elecciones })),
  };
  write(join(OUT, "indice.json"), index);
  console.log(`Votación: ${summaries.length} elecciones en ${years.size} años → public/datos/`);
}

await main();
