/**
 * Resultados provisorios: escrutinio provisorio de las elecciones de Mendoza, tal como lo publicó el sitio oficial
 * de resultados de la provincia (https://resultados.mendoza.gov.ar/<carpeta>/).
 *
 * Uso: `bun run scrape resultados-provisorios [eleccion...] [--refresh]`
 *   - sin argumentos baja todas las elecciones de ELECTIONS; con fechas (`2023-09-24`) solo esas.
 *   - `--refresh` vuelve a pedir las páginas ya archivadas (por defecto se reutiliza lo archivado).
 *
 * Salida (data/processed/resultados-provisorios/), con el esquema común de votación (`tmp/agentes/votacion-esquema.md`):
 *  - resultados.csv     Una fila por (elección, cargo, unidad geográfica, opción): cada lista y los votos en blanco,
 *                       nulos, recurridos e impugnados.
 *  - participacion.csv  Una fila por (elección, cargo, unidad geográfica): mesas y electores.
 *
 * Cómo está armado el sitio (ver tmp/agentes/resultados-provisorios.md): es una app GeneXus exportada a HTML estático.
 * Cada carpeta es una elección. Las páginas se encuentran SIGUIENDO LOS LINKS desde `index.html` (los parámetros de la URL
 * no se arman a mano: los links de los departamentos viven en el estado de la página, `GXState`). Los números están en
 * campos ocultos con JSON (`...Grid_votos_cargosContainerDataV`) y en `<span>` con ids fijos (`...TXTMESASHABILITADAS`).
 * Un link a una página que no se exportó devuelve la portada de WordPress con código 200: se detecta porque no trae
 * `GXState`, no se archiva y no se vuelve a pedir.
 *
 * Reglas:
 *  - Estricto: si una suma no cierra (listas contra votos positivos, o positivos + no positivos contra votantes), corta.
 *  - Se guarda el nivel más fino que el sitio exporta y los totales que imprime en niveles más altos; no se calcula nada.
 *  - No se descargan los PDF de "Resumen de Actas por Mesa" ni las imágenes (fotos de candidatos): traen nombres de
 *    autoridades de mesa y fiscales, o no hacen falta.
 *  - Pedidos en secuencia y con pausa.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { archive, get, latestRaw, normalizeMunicipio, PROCESSED_DIR, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import { load } from "cheerio";

const ID = "resultados-provisorios";
const HOST = "https://resultados.mendoza.gov.ar";
const PAUSE_MS = 1000;

export type ElectionType = "paso" | "general" | "municipal" | "extraordinaria";

export interface ElectionConfig {
  /** Fecha de la jornada (YYYY-MM-DD): es el id de la elección. */
  date: string;
  /** Carpeta del sitio. */
  folder: string;
  type: ElectionType;
  /** Página desde donde se empieza a seguir links (en 2019 `index.html` es solo una redirección). */
  start: string;
}

export const ELECTIONS: ElectionConfig[] = [
  { date: "2019-06-09", folder: "elec20190609publico", type: "paso", start: "w+hsthome.html" },
  { date: "2019-09-01", folder: "elec20190901publico", type: "municipal", start: "w+hsthome.html" },
  { date: "2019-09-29", folder: "elec20190929publico", type: "general", start: "w+hsthome.html" },
  { date: "2023-04-30", folder: "eleccion230430publico", type: "municipal", start: "index.html" },
  { date: "2023-06-11", folder: "eleccion230611publico", type: "paso", start: "index.html" },
  { date: "2023-09-03", folder: "eleccion230903publico", type: "municipal", start: "index.html" },
  { date: "2023-09-24", folder: "eleccion230924publico", type: "general", start: "index.html" },
  { date: "2025-10-26", folder: "eleccion251026publico", type: "general", start: "index.html" },
  { date: "2026-02-22", folder: "eleccion260222publico", type: "municipal", start: "index.html" },
];

// ---------------------------------------------------------------------------
// Lectura de una página
// ---------------------------------------------------------------------------

export type Level = "provincia" | "seccion" | "departamento";

export interface Unit {
  level: Level;
  /** Sección electoral (1 a 4) si la URL o la página la dan. */
  section: number | null;
  /** Nombre normalizado del departamento. */
  department: string | null;
}

export interface Option {
  type: "positivo" | "blanco" | "nulo" | "recurrido" | "impugnado";
  party: string;
  list: string;
  candidate: string;
  votes: number;
}

export interface ParsedPage {
  cargo: string;
  unit: Unit;
  updated: string;
  stats: {
    tablesEnabled: number;
    tablesCounted: number;
    electors: number;
    voters: number;
    positive: number;
    blank: number;
    nulls: number;
    contested: number;
    challenged: number;
  };
  options: Option[];
}

/** Cargo según el título de la página (el sitio lo escribe en singular o plural según la versión). */
const CARGOS: Record<string, string> = {
  gobernador: "gobernador",
  senadores: "senadores",
  senadorprovincial: "senadores",
  diputados: "diputados",
  diputadoprovincial: "diputados",
  intendente: "intendente",
  concejales: "concejales",
  concejal: "concejales",
  convencionales: "convencionales",
  convencionalmunicipal: "convencionales",
};

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

function cargoOf(title: string): string {
  const cargo = CARGOS[key(title)];
  if (!cargo) throw new Error(`Cargo desconocido en el sitio: «${title}». Sumarlo a CARGOS después de mirarlo.`);
  return cargo;
}

function int(text: string | undefined, what: string): number {
  const n = Number((text ?? "").replace(/[.\s]/g, ""));
  if (!Number.isInteger(n) || (text ?? "").trim() === "") throw new Error(`Número inválido en ${what}: «${text}»`);
  return n;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

type Doc = ReturnType<typeof load>;

/** Filas de todos los grids GeneXus de la página (guardadas como JSON en campos ocultos), con el nombre de cada grid. */
function grids($: Doc): Array<{ name: string; rows: string[][] }> {
  const found: Array<{ name: string; rows: string[][] }> = [];
  $("input[type=hidden]").each((_, el) => {
    const name = $(el).attr("name") ?? "";
    if (!name.endsWith("ContainerDataV")) return;
    found.push({ name, rows: JSON.parse($(el).attr("value") ?? "[]") as string[][] });
  });
  return found;
}

/** Texto de un `<span>` por el final de su id (el prefijo `W0032` cambia entre páginas). */
function span($: Doc, idSuffix: string): string | null {
  const found = $("span")
    .filter((_, el) => ($(el).attr("id") ?? "").endsWith(idSuffix))
    .first();
  return found.length ? clean(found.text()) : null;
}

function requiredSpan($: Doc, idSuffix: string): string {
  const text = span($, idSuffix);
  if (text === null) throw new Error(`Falta el campo ${idSuffix}`);
  return text;
}

const LIST_RE = /^(\d+)\s*-\s*(.+?)(?: \(([^()]*)\))?$/;
const VOTES_RE = /^(\d+) votos\b/;

const NON_POSITIVE: Record<string, Option["type"]> = {
  "votos en blanco": "blanco",
  "votos blancos": "blanco",
  "votos nulos": "nulo",
  "votos recurridos": "recurrido",
  "votos de identidad impugnada": "impugnado",
};

/** ¿Parece un nombre de candidato? (con letras; no un link, una ruta, un html ni un booleano). */
const looksLikeName = (s: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}/.test(s) && !/^(https?:|\/|<)/.test(s) && !/^(true|false)$/i.test(s);

/**
 * Un renglón de lista: número y agrupación, votos y, si el sitio lo imprime, los candidatos. Las columnas cambian entre
 * versiones, así que se leen por forma. La versión de 2025 y 2026 (grid `Grid_votos`) no imprime el número de lista (solo
 * el nombre y el logo): con `bare` se lee esa forma, con la lista vacía.
 */
function readListRow(row: string[], bare: boolean): Option | null {
  const cells = row.map(clean);
  const votesAt = cells.findIndex((c) => VOTES_RE.test(c));
  if (votesAt < 0) return null;
  const votes = Number(cells[votesAt]!.match(VOTES_RE)![1]);
  const listAt = cells.findIndex((c) => LIST_RE.test(c));
  if (listAt < 0) {
    if (!bare) return null;
    const names = cells.filter((c, i) => i !== votesAt && looksLikeName(c));
    if (names.length !== 1) return null;
    return { type: "positivo", party: names[0]!, list: "", candidate: "", votes };
  }
  const [, list, party] = cells[listAt]!.match(LIST_RE)!;
  const between = cells.slice(Math.min(listAt, votesAt) + 1, Math.max(listAt, votesAt)).filter(looksLikeName);
  return { type: "positivo", party: party!.trim(), list: list!, candidate: between.join(", "), votes };
}

/** Listas internas de una alianza en las PASO: están en los datos de un gráfico («Lista 501 A 256214 votos (25.94 %)»). */
function readSubLists($: Doc): Array<{ list: string; sub: string; votes: number }> {
  const raw = $("input[name=GXState]").attr("value");
  if (!raw) return [];
  const state = JSON.parse(raw) as Record<string, unknown>;
  const out: Array<{ list: string; sub: string; votes: number }> = [];
  for (const [k, v] of Object.entries(state)) {
    if (!k.endsWith("vGOOGLECHARTDATA")) continue;
    const series = (v as { Series?: Array<{ Name: string; Values: number[] }> }).Series ?? [];
    for (const s of series) {
      const m = s.Name.match(/^Lista (\d+) (\S+) (\d+) votos \(/);
      if (!m) continue;
      if (Number(m[3]) !== s.Values[0]) throw new Error(`El gráfico de listas internas no cierra: «${s.Name}»`);
      out.push({ list: m[1]!, sub: m[2]!, votes: Number(m[3]) });
    }
  }
  return out;
}

export interface ParsedPage {
  cargo: string;
  unit: Unit;
  /** Alianza o agrupación que la página detalla (PASO); 0 es la vista general. */
  alliance: number;
  updated: string;
  stats: {
    tablesEnabled: number;
    tablesCounted: number;
    electors: number;
    voters: number;
    positive: number;
    blank: number;
    nulls: number;
    contested: number;
    challenged: number;
  };
  options: Option[];
  subLists: Array<{ list: string; sub: string; votes: number }>;
}

export function parsePage(html: string, page: string): ParsedPage {
  const $ = load(html);
  const cargo = cargoOf(clean($("#TXTCONCEPTO").text()));
  const unitName = clean($("#TXTNOMBRESECCION").text());
  const kind = page.match(/^w\+hst(consgen[a-z]+)-/)?.[1];
  const nums = (page.match(/-([\d_]+)\.html$/)?.[1] ?? "").split("_").map(Number);
  // El penúltimo número de la URL es la alianza que se detalla (0 = vista general); el último, la vista (0 = la completa).
  const alliance = nums[nums.length - 2] ?? 0;

  let unit: Unit;
  if (kind === "consgenpro") {
    if (unitName !== "07-Mendoza") throw new Error(`Provincia inesperada: «${unitName}»`);
    unit = { level: "provincia", section: null, department: null };
  } else if (kind === "consgensecc" || kind === "consgenseccb") {
    const section = Number(span($, "SECCOD"));
    if (!(section >= 1 && section <= 4)) throw new Error(`Sección inesperada en ${page}`);
    unit = { level: "seccion", section, department: null };
  } else if (kind === "consgendpto" || kind === "consgendptob") {
    const department = normalizeMunicipio(unitName.replace(/^\d+-/, ""));
    if (!department) throw new Error(`Departamento desconocido: «${unitName}»`);
    // El link es hstconsgendpto-<departamento>_<cargo>_1_<sección>_7_<alianza>_0.
    const section = nums[3] ?? 0;
    unit = { level: "departamento", section: section >= 1 && section <= 4 ? section : null, department };
  } else {
    throw new Error(`Tipo de página no soportado: ${page}`);
  }

  const stats = {
    tablesEnabled: int(requiredSpan($, "TXTMESASHABILITADAS"), "mesas habilitadas"),
    tablesCounted: int(requiredSpan($, "TXTMESASESCRUTADOS"), "mesas escrutadas"),
    electors: int(requiredSpan($, "TXTELECTORESHABILITADOS"), "electores habilitados"),
    voters: int(requiredSpan($, "TXTELECTORESESCRUTADOS"), "electores escrutados"),
    positive: int(requiredSpan($, "TXTVOTOSPOSITIVOS"), "votos positivos"),
    blank: int(requiredSpan($, "TXTVOTOSENBLANCO"), "votos en blanco"),
    nulls: int(requiredSpan($, "TXTVOTOSNULOS"), "votos nulos"),
    contested: int(requiredSpan($, "TXTVOTOSRECURRIDOS"), "votos recurridos"),
    challenged: int(requiredSpan($, "TXTVOTOSIMPUGNADOS"), "votos impugnados"),
  };

  const options: Option[] = [];
  const all = grids($);
  const rowsOf = (g: { name: string; rows: string[][] }) => g.rows.map((r) => readListRow(r, g.name.endsWith("Grid_votosContainerDataV")));
  const listGrids = all.filter((g) => g.rows.length > 0 && rowsOf(g).every(Boolean));
  if (listGrids.length !== 1) throw new Error(`Esperaba un grid de listas y hay ${listGrids.length} en ${page}`);
  options.push(...(rowsOf(listGrids[0]!) as Option[]));

  const nonPositiveGrids = all.filter((g) => g.name.endsWith("Grid_votos_no_cargosContainerDataV"));
  if (nonPositiveGrids.length > 1) throw new Error(`Hay ${nonPositiveGrids.length} grids de votos no positivos en ${page}`);
  if (nonPositiveGrids.length === 1) {
    for (const row of nonPositiveGrids[0]!.rows) {
      const cells = row.map(clean);
      const label = cells.find((c) => /^votos\b/i.test(c) && !VOTES_RE.test(c));
      const votes = cells.find((c) => VOTES_RE.test(c));
      const type = label ? NON_POSITIVE[label.toLowerCase()] : undefined;
      if (!type || !votes) throw new Error(`Renglón de votos no positivos desconocido en ${page}: «${cells.filter(Boolean).join(" | ")}»`);
      options.push({ type, party: "", list: "", candidate: "", votes: Number(votes.match(VOTES_RE)![1]) });
    }
  } else {
    // Versión 2025-2026: no hay grid, los números están en el resumen de la página.
    const printed: Array<[Option["type"], number]> = [
      ["blanco", stats.blank],
      ["nulo", stats.nulls],
      ["recurrido", stats.contested],
      ["impugnado", stats.challenged],
    ];
    for (const [type, votes] of printed) options.push({ type, party: "", list: "", candidate: "", votes });
  }

  const updated = clean(/Actualizaci[oó]n:\s*(?:<b>|&lt;b&gt;)?\s*([0-9/]+\s+[0-9:]+)/.exec(html)?.[1]);
  return { cargo, unit, alliance, updated, stats, options, subLists: alliance === 0 ? [] : readSubLists($) };
}

/** Las sumas que el propio sitio imprime tienen que cerrar; si no, el parser leyó mal. */
export function checkPage(p: ParsedPage, page: string): void {
  const sum = (type: Option["type"]) => p.options.filter((o) => o.type === type).reduce((a, o) => a + o.votes, 0);
  const expect: Array<[string, number, number]> = [
    ["positivos", sum("positivo"), p.stats.positive],
    ["blancos", sum("blanco"), p.stats.blank],
    ["nulos", sum("nulo"), p.stats.nulls],
    ["recurridos", sum("recurrido"), p.stats.contested],
    ["impugnados", sum("impugnado"), p.stats.challenged],
    ["votantes", p.stats.positive + p.stats.blank + p.stats.nulls + p.stats.contested + p.stats.challenged, p.stats.voters],
  ];
  for (const [what, got, want] of expect) {
    if (got !== want) throw new Error(`${page}: ${what} no cierra (${got} contra ${want} impreso)`);
  }
  if (p.stats.tablesCounted > p.stats.tablesEnabled) throw new Error(`${page}: más mesas escrutadas que habilitadas`);
}

// ---------------------------------------------------------------------------
// Descarga: se siguen los links desde la página de inicio
// ---------------------------------------------------------------------------

const FOLLOW_RE = /^w\+hst(?:selsec|seldpto|consgen(?:pro|secc|seccb|dpto|dptob))-[\d_]+\.html$/;
/** Las páginas de resultados terminan en `_0` (vista completa); las que terminan en `_1`, `_2`, `_3` (mesas, circuitos) no se exportaron. */
const DEAD_VIEW_RE = /^w\+hstconsgen[a-z]+-[\d_]+_[1-9]\.html$/;

interface Counters {
  requested: number;
  reused: number;
  archived: number;
}

/** Devuelve la página (archivada o recién bajada) o null si el sitio devuelve la portada de WordPress en su lugar. */
async function fetchPage(folder: string, name: string, refresh: boolean, counters: Counters): Promise<string | null> {
  const filename = `${folder}__${name}`;
  const prev = await latestRaw(ID, filename);
  if (prev && !refresh) {
    counters.reused++;
    return (await readRaw(prev)).toString("utf8");
  }
  const url = `${HOST}/${folder}/${name}`;
  const text = await (await get(url)).text();
  counters.requested++;
  await sleep(PAUSE_MS);
  if (!text.includes("GXState")) return null;
  if (await archive(ID, filename, text, { url })) counters.archived++;
  return text;
}

async function crawl(election: ElectionConfig, refresh: boolean, counters: Counters): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  const seen = new Set<string>();
  const queue = [election.start];
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const html = await fetchPage(election.folder, name, refresh, counters);
    if (html === null) {
      if (name !== election.start) console.warn(`  ${election.folder}/${name}: no existe (el sitio devuelve la portada de WordPress)`);
      continue;
    }
    pages.set(name, html);
    for (const m of html.matchAll(/w\+hst[A-Za-z0-9_+-]*\.html/g)) {
      const link = m[0];
      if (FOLLOW_RE.test(link) && !DEAD_VIEW_RE.test(link) && !seen.has(link)) queue.push(link);
    }
  }
  if (pages.size === 0) throw new Error(`${election.folder}: la página de inicio ${election.start} no existe`);
  return pages;
}

// ---------------------------------------------------------------------------
// Armado de las tablas
// ---------------------------------------------------------------------------

interface UnitResult {
  election: ElectionConfig;
  page: ParsedPage;
  options: Option[];
}

const unitKey = (p: ParsedPage) => [p.cargo, p.unit.level, p.unit.section ?? "", p.unit.department ?? ""].join("|");

/** Une la vista general de una unidad con las vistas por alianza (PASO): las listas internas reemplazan a la fila de su alianza. */
function buildUnits(election: ElectionConfig, pages: Map<string, string>): UnitResult[] {
  const groups = new Map<string, ParsedPage[]>();
  for (const [name, html] of pages) {
    if (!name.startsWith("w+hstconsgen")) continue;
    const parsed = parsePage(html, name);
    if (parsed.alliance === 0) checkPage(parsed, name);
    const key = unitKey(parsed);
    groups.set(key, [...(groups.get(key) ?? []), parsed]);
  }
  const units: UnitResult[] = [];
  for (const [key, group] of groups) {
    const base = group.filter((p) => p.alliance === 0);
    if (base.length !== 1) throw new Error(`${election.folder} ${key}: esperaba una vista general y hay ${base.length}`);
    let options = [...base[0]!.options];
    const byList = new Map<string, Array<{ sub: string; votes: number }>>();
    for (const alliance of group.filter((p) => p.alliance !== 0)) {
      for (const s of alliance.subLists) byList.set(s.list, [...(byList.get(s.list) ?? []), { sub: s.sub, votes: s.votes }]);
    }
    for (const [list, subs] of byList) {
      const row = options.find((o) => o.type === "positivo" && o.list === list);
      const total = subs.reduce((a, s) => a + s.votes, 0);
      if (!row || row.votes !== total) {
        throw new Error(`${election.folder} ${key}: las listas internas de ${list} suman ${total} y la alianza ${row?.votes ?? "no está"}`);
      }
      options = options.flatMap((o) => (o === row ? subs.map((s) => ({ ...o, list: `${list} ${s.sub}`, votes: s.votes })) : [o]));
    }
    units.push({ election, page: base[0]!, options });
  }
  const order = (u: UnitResult) =>
    [
      u.page.cargo,
      { provincia: 0, seccion: 1, departamento: 2 }[u.page.unit.level],
      u.page.unit.section ?? 0,
      u.page.unit.department ?? "",
    ].join("|");
  return units.sort((a, b) => order(a).localeCompare(order(b), "es"));
}

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
const TURNOUT_COLUMNS = [
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

function geo(u: UnitResult): Row {
  return {
    eleccion: u.election.date,
    tipo_eleccion: u.election.type,
    escrutinio: "provisorio",
    cargo: u.page.cargo,
    nivel: u.page.unit.level,
    seccion_electoral: u.page.unit.section,
    departamento: u.page.unit.department,
    circuito: "",
    mesa: "",
  };
}

/** Controles que no cortan pero se imprimen: el sitio no publica todos los niveles, así que no todo se puede cruzar. */
function crossChecks(units: UnitResult[]): void {
  const date = units[0]!.election.date;
  const at = (cargo: string, level: Level) => units.filter((u) => u.page.cargo === cargo && u.page.unit.level === level);
  const sumVoters = (us: UnitResult[]) => us.reduce((a, u) => a + u.page.stats.voters, 0);
  const province = at("gobernador", "provincia");
  const sections = at("senadores", "seccion");
  if (province.length === 1 && sections.length === 4) {
    const sum = (f: (s: ParsedPage["stats"]) => number) => sections.reduce((a, u) => a + f(u.page.stats), 0);
    const p = province[0]!.page.stats;
    const same =
      sum((s) => s.tablesEnabled) === p.tablesEnabled &&
      sum((s) => s.tablesCounted) === p.tablesCounted &&
      sum((s) => s.electors) === p.electors;
    console.log(
      `  ${date}: mesas y electores de las 4 secciones (senadores) ${same ? "suman" : "NO suman"} el total provincial (gobernador); votantes ${sumVoters(sections)} contra ${sumVoters(province)} (cada cargo se vota aparte)`,
    );
  }
  const updates = [...new Set(units.map((u) => u.page.updated))].sort();
  console.log(`  ${date}: última actualización del sitio entre ${updates[0]} y ${updates[updates.length - 1]}`);
  const mayors = at("intendente", "departamento");
  const councils = at("concejales", "departamento");
  const mismatches = mayors.filter((m) => {
    const c = councils.find((x) => x.page.unit.department === m.page.unit.department);
    return c && c.page.stats.voters !== m.page.stats.voters;
  });
  if (mayors.length)
    console.log(
      `  ${date}: intendente y concejales con distinta cantidad de votantes en ${mismatches.length} de ${mayors.length} departamentos`,
    );
}

export async function run(args: string[]) {
  const refresh = args.includes("--refresh");
  const wanted = args.filter((a) => !a.startsWith("--"));
  for (const w of wanted)
    if (!ELECTIONS.some((e) => e.date === w))
      throw new Error(`Elección desconocida: ${w}. Las que hay: ${ELECTIONS.map((e) => e.date).join(", ")}`);
  const selected = ELECTIONS.filter((e) => wanted.length === 0 || wanted.includes(e.date));

  const counters: Counters = { requested: 0, reused: 0, archived: 0 };
  const results: Row[] = [];
  const turnout: Row[] = [];
  for (const election of selected) {
    console.log(`${election.date} (${election.type}, ${election.folder})`);
    const pages = await crawl(election, refresh, counters);
    const units = buildUnits(election, pages);
    crossChecks(units);
    console.log(`  ${pages.size} páginas, ${units.length} unidades`);
    for (const u of units) {
      for (const o of u.options) {
        results.push({
          ...geo(u),
          tipo_voto: o.type,
          agrupacion: o.type === "positivo" ? o.party : "",
          lista: o.list,
          candidato: o.candidate,
          votos: o.votes,
        });
      }
      turnout.push({
        ...geo(u),
        mesas_habilitadas: u.page.stats.tablesEnabled,
        mesas_escrutadas: u.page.stats.tablesCounted,
        electores: u.page.stats.electors,
        votantes: u.page.stats.voters,
      });
    }
  }
  if (selected.length < ELECTIONS.length) {
    console.log("Corrida parcial: no se escriben los CSV (hace falta bajar todas las elecciones para no pisar lo anterior).");
    return;
  }
  await writeProcessed(ID, "resultados.csv", results, RESULT_COLUMNS);
  await writeProcessed(ID, "participacion.csv", turnout, TURNOUT_COLUMNS);
  await writeMeta();
  console.log(
    `${results.length} filas de resultados, ${turnout.length} de participación. Pedidos: ${counters.requested}, reutilizados: ${counters.reused}, archivados: ${counters.archived}`,
  );
}

async function writeMeta() {
  const dir = join(PROCESSED_DIR, ID);
  await mkdir(dir, { recursive: true });
  const geoColumns = {
    eleccion: { etiqueta: "Elección", tipo: "fecha", descripcion: "Fecha de la jornada (YYYY-MM-DD); es el id de la elección." },
    tipo_eleccion: {
      etiqueta: "Tipo de elección",
      tipo: "texto",
      valores: { paso: "PASO", general: "General", municipal: "Municipal (departamentos desdoblados)", extraordinaria: "Extraordinaria" },
    },
    escrutinio: {
      etiqueta: "Escrutinio",
      tipo: "texto",
      descripcion: "Siempre `provisorio`: el que publica el sitio de resultados la noche de la elección y los días siguientes.",
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
        convencionales: "Convencionales municipales",
      },
    },
    nivel: {
      etiqueta: "Nivel",
      tipo: "texto",
      valores: { provincia: "Provincia", seccion: "Sección electoral", departamento: "Departamento" },
      descripcion: "Nivel geográfico de esta fila. El sitio no exporta circuitos ni mesas.",
    },
    seccion_electoral: {
      etiqueta: "Sección electoral",
      tipo: "entero",
      descripcion: "1 a 4. En las filas de departamento la da el link del sitio.",
    },
    departamento: { etiqueta: "Departamento", tipo: "texto" },
    circuito: { etiqueta: "Circuito", tipo: "texto", oculta: true, descripcion: "Siempre vacío: el sitio no exporta circuitos." },
    mesa: { etiqueta: "Mesa", tipo: "texto", oculta: true, descripcion: "Siempre vacío: el sitio no exporta mesas." },
  };
  const description =
    "Escrutinio provisorio de las elecciones de Mendoza tal como lo publicó el sitio oficial de resultados de la provincia (resultados.mendoza.gov.ar). Es una foto del último momento en que el sitio actualizó cada elección (casi siempre con más del 99 % de las mesas), no el resultado final: el definitivo lo proclama la Junta Electoral y puede diferir. Cada elección tiene los niveles que el sitio exportó: provincia (gobernador), sección electoral (senadores y diputados) y departamento (intendente, concejales y convencionales). No se publica nada por circuito ni por mesa porque el sitio no lo exporta. ";
  const resultados = {
    titulo: "Resultados provisorios de las elecciones de Mendoza",
    descripcion: `${description}Cada fila es la cantidad de votos de una lista (o de un tipo de voto no positivo) en una unidad geográfica. En las PASO la lista incluye la sublista (por ejemplo «501 A»); cuando una alianza tiene una sola lista el sitio no la separa y queda el número de la alianza. El sitio de 2025 y 2026 no imprime el número de lista, solo el nombre de la agrupación: ahí \`lista\` queda vacía. El candidato solo está donde el sitio lo imprime (gobernador e intendente de 2023).`,
    columnas: {
      ...geoColumns,
      tipo_voto: {
        etiqueta: "Tipo de voto",
        tipo: "texto",
        valores: { positivo: "Positivo", blanco: "En blanco", nulo: "Nulo", recurrido: "Recurrido", impugnado: "De identidad impugnada" },
      },
      agrupacion: {
        etiqueta: "Agrupación",
        tipo: "texto",
        descripcion: "Nombre tal como lo escribe el sitio. Vacío si no es voto positivo.",
      },
      lista: {
        etiqueta: "Lista",
        tipo: "texto",
        descripcion:
          "Número de lista (con sublista en las PASO) tal como lo escribe el sitio. Vacío si no es voto positivo o el sitio no lo imprime.",
      },
      candidato: {
        etiqueta: "Candidato",
        tipo: "texto",
        descripcion: "Solo gobernador e intendente de 2023; para gobernador, fórmula completa.",
      },
      votos: { etiqueta: "Votos", tipo: "entero", unidad: "votos" },
    },
    fuente: HOST,
  };
  const participacion = {
    titulo: "Participación en las elecciones de Mendoza (escrutinio provisorio)",
    descripcion: `${description}Cada fila es una unidad geográfica de una elección y un cargo, con las mesas y los electores que el sitio imprime.`,
    columnas: {
      ...geoColumns,
      mesas_habilitadas: { etiqueta: "Mesas habilitadas", tipo: "entero" },
      mesas_escrutadas: { etiqueta: "Mesas escrutadas", tipo: "entero" },
      electores: { etiqueta: "Electores habilitados", tipo: "entero", descripcion: "Los del padrón de las mesas habilitadas." },
      votantes: {
        etiqueta: "Votantes",
        tipo: "entero",
        descripcion: "Electores de las mesas escrutadas que votaron (la suma de todos los tipos de voto).",
      },
    },
    fuente: HOST,
  };
  await writeFile(join(dir, "resultados.meta.json"), `${JSON.stringify(resultados, null, 2)}\n`);
  await writeFile(join(dir, "participacion.meta.json"), `${JSON.stringify(participacion, null, 2)}\n`);
}
