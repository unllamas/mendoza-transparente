/**
 * Junta Electoral: cargos electos en Mendoza según las actas de proclamación.
 *
 * Uso: `bun run scrape junta-electoral`
 *
 * Salida (data/processed/junta-electoral/):
 *  - electos.csv  Una fila por persona proclamada (gobernador, vicegobernador, senadores y diputados provinciales,
 *                 intendentes y concejales), con el partido, frente o alianza que dice el acta.
 *
 * Fuente: actas de proclamación de la H. Junta Electoral de la Provincia, publicadas por el Poder Judicial
 * (https://jusmendoza.gob.ar/actas-de-proclamacion/). Son PDF escaneados con capa de texto (OCR), así que el parser
 * es estricto: si algo no encaja (un partido que no conoce, un nombre raro, un conteo de bancas distinto del legal)
 * corta con un error en vez de publicar datos dudosos.
 *
 * Reglas:
 *  - El partido es el que dice el acta, nunca se infiere. Si el acta no lo dice (vicegobernadora de 2015) queda vacío.
 *  - El mandato (desde / hasta) queda vacío: las actas no lo dicen.
 *  - Los documentos de identidad que aparezcan en un acta no se copian.
 *  - Cada corrección de OCR está en OCR_FIXES, con el motivo, y marca la fila afectada en la columna `nota`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fetchOrReuse, normalizeMunicipio, PROCESSED_DIR, type Row, writeProcessed } from "@mt/core";
import { pdfPages } from "../lib/pdf.ts";

const ID = "junta-electoral";
const BASE = "https://jusmendoza.gob.ar/wp-content/uploads/2024/12/Acta-de-Proclamacion-de-Candidatos-";
const LISTADO_URL = "https://jusmendoza.gob.ar/actas-de-proclamacion/";

// ---------------------------------------------------------------------------
// Actas
// ---------------------------------------------------------------------------

type NameOrder = "nombre_apellido" | "apellido_coma_nombre" | "apellido_nombre";

export interface ActaConfig {
  key: string;
  /** Nombre del archivo en data/raw/junta-electoral/. */
  file: string;
  url: string;
  /** Fecha del acta (YYYY-MM-DD) y un texto que la confirma dentro del documento. */
  actaDate: string;
  actaCheck: RegExp;
  /** Fecha principal de la elección (la de la jornada que el acta nombra; ver `dates`). */
  electionDate: string;
  /** Todas las jornadas que nombra el acta. */
  dates: string[];
  nameOrder: NameOrder;
  /** Desde dónde empieza la nómina. */
  startRe: RegExp;
}

const START_NOMINA = /(?:resultaron\s+electos|lectura\s+del\s+acta)\s*:/;

// The extraordinary election of Santa Rosa (12/02/2017, acta 12-02-2017.pdf) is left out on purpose: its record prints
// the national ID number of the person elected, and we do not archive personal ID numbers (docs/procesos/metodologia.md).
export const ACTAS: ActaConfig[] = [
  {
    key: "2015",
    file: "acta-2015.pdf",
    url: `${BASE}2015.pdf`,
    actaDate: "2015-10-14",
    actaCheck: /catorce\s+d[ií]as\s+del\s+mes\s+de\s+Octubre/i,
    electionDate: "2015-06-21",
    dates: ["2015-05-03", "2015-06-21"],
    nameOrder: "nombre_apellido",
    startRe: START_NOMINA,
  },
  {
    key: "2015-godoy-cruz",
    file: "acta-Godoy-Cruz-2015.pdf",
    url: `${BASE}Godoy-Cruz-2015.pdf`,
    actaDate: "2015-12-04",
    actaCheck: /cuatro\s+d[ií]as\s+del\s+mes\s+de\s+diciembre/i,
    electionDate: "2015-11-29",
    dates: ["2015-11-29"],
    nameOrder: "nombre_apellido",
    startRe: START_NOMINA,
  },
  {
    key: "2017",
    file: "acta-22-10-2017-y-25-02-2018.pdf",
    url: `${BASE}22-10-2017-y-25-02-2018.pdf`,
    actaDate: "2018-03-19",
    actaCheck: /diecinueve\s+d[ií]as\s+del\s+mes\s+de\s+Marzo/i,
    electionDate: "2017-10-22",
    dates: ["2017-10-22", "2018-02-25"],
    nameOrder: "apellido_coma_nombre",
    startRe: START_NOMINA,
  },
  {
    key: "2019",
    file: "acta-2019.pdf",
    url: `${BASE}2019.pdf`,
    actaDate: "2019-10-24",
    actaCheck: /veinticuatro\s+d[ií]as\s+del\s+mes\s+de\s+octubre/i,
    electionDate: "2019-09-29",
    dates: ["2019-09-01", "2019-09-29"],
    nameOrder: "nombre_apellido",
    startRe: START_NOMINA,
  },
  {
    key: "2021",
    file: "acta-14-11-2021.pdf",
    url: `${BASE}14-11-2021.pdf`,
    actaDate: "2022-03-22",
    actaCheck: /veintid[oó]s\s+d[ií]as\s+del\s+mes\s+de\s+marzo/i,
    electionDate: "2021-11-14",
    dates: ["2021-11-14"],
    nameOrder: "nombre_apellido",
    startRe: START_NOMINA,
  },
  {
    key: "2023",
    file: "acta-03-09-2023-y-24-09-2023.pdf",
    url: `${BASE}03-09-2023-y-24-09-2023.pdf`,
    actaDate: "2023-11-06",
    actaCheck: /SEIS\s+d[ií]as\s+del\s+mes\s+de\s+NOVIEMBRE/i,
    electionDate: "2023-09-24",
    dates: ["2023-09-03", "2023-09-24"],
    nameOrder: "apellido_nombre",
    startRe: START_NOMINA,
  },
];

// ---------------------------------------------------------------------------
// Correcciones de OCR (cada una con su motivo)
// ---------------------------------------------------------------------------

interface OcrFix {
  acta: string;
  from: string | RegExp;
  to: string;
  /** Texto (ya corregido) que, si está en el nombre de una persona, marca su fila con una nota. */
  mark?: string;
  why: string;
}

export const OCR_FIXES: OcrFix[] = [
  // Palabras partidas por el salto de renglón con un guion que el OCR leyó como otro signo.
  { acta: "2015", from: /DE\? PARTAMENTO/g, to: "DEPARTAMENTO", why: "«DE-PARTAMENTO» partido en dos renglones" },
  { acta: "2015", from: /CAMBIA N[HI]ENDOZA/g, to: "CAMBIA MENDOZA", why: "OCR leyó «NHENDOZA» / «NIENDOZA»" },
  {
    acta: "2015",
    from: "RIGI—II",
    to: "RIGHI",
    mark: "Righi",
    why: "OCR leyó «H» como «I—I»; el nombre figura bien en otras partes del mismo acta (Lavalle)",
  },
  { acta: "2015", from: "MACI—IIN", to: "MACHIN", mark: "Machin", why: "OCR leyó «H» como «I—I»; el acta de 2019 trae «MACHIN»" },
  { acta: "2017", from: "DRAGON],", to: "DRAGONI,", mark: "Dragoni", why: "OCR leyó «I» como «]»" },
  { acta: "2017", from: "Dl CESARE", to: "DI CESARE", mark: "Di Cesare", why: "OCR leyó «I» como «l»" },
  { acta: "2017", from: "Betsabe'", to: "Betsabé", mark: "Betsabé", why: "tilde leída como apóstrofe" },
  // Nombres cortados en el borde de la página escaneada: la letra que falta se deduce del resto del renglón.
  {
    acta: "2019",
    from: "icardo Raúl VERGARA",
    to: "Ricardo Raúl VERGARA",
    mark: "Ricardo Raúl",
    why: "primera letra cortada por el borde del escaneo",
  },
  {
    acta: "2019",
    from: "ndrea Beatriz MATTACOTA",
    to: "Andrea Beatriz MATTACOTA",
    mark: "Andrea Beatriz",
    why: "primera letra cortada por el borde del escaneo",
  },
  {
    acta: "2019",
    from: "Ezequie APATA",
    to: "Ezequiel ZAPATA",
    mark: "Zapata",
    why: "letras cortadas por el borde del escaneo (final de «Ezequiel», inicio de «Zapata»)",
  },
  { acta: "2019", from: "RIS]", to: "RISI", mark: "Risi", why: "OCR leyó «I» como «]»" },
  { acta: "2019", from: "C REA", to: "CREA", mark: "Crea", why: "espacio de más por el borde del escaneo" },
  { acta: "2019", from: "p0r1a", to: "por la", why: "OCR leyó «or l» como «0r1»" },
  { acta: "2019", from: /DEPARTAMENTODE/g, to: "DEPARTAMENTO DE", why: "espacio omitido por el OCR" },
  { acta: "2023", from: "AN DRAOS", to: "ANDRAOS", mark: "Andraos", why: "espacio de más por el OCR" },
  { acta: "2023", from: "ALLA5lN0", to: "ALLASINO", mark: "Allasino", why: "OCR leyó «S», «I» y «O» como «5», «l» y «0»" },
  { acta: "2023", from: "LLULLJORGE", to: "LLULL JORGE", mark: "Llull", why: "espacio omitido por el OCR" },
  { acta: "2023", from: "LORENAyGONZALEZ", to: "LORENA y GONZALEZ", why: "espacios omitidos por el OCR" },
];

// ---------------------------------------------------------------------------
// Partidos, frentes y alianzas (se reconocen por lista: si aparece uno nuevo, el parser avisa)
// ---------------------------------------------------------------------------

const PREFIX = "(?:Alianza|Frente|Partido)\\s+";
const PARTY_PATTERNS: string[] = [
  `(?:Alianza\\s+)?Frente\\s+para\\s+la\\s+Victoria(?:\\s+2)?`,
  `(?:Alianza\\s+)?Frente\\s+de\\s+Izquierda\\s+y\\s+de\\s+los\\s+Trabajadores`,
  `Frente\\s+de\\s+Todos`,
  `${PREFIX}Elegí\\s+Mendoza\\s+Frente\\s+Pol[ií]tico\\s+y\\s+Social`,
  `Cambia\\s+Mendoza\\s*-\\s*Nuevos\\s+Rumbos`,
  `(?:${PREFIX})?Eleg[ií]\\s+Gesti[oó]n\\s+(?:Lavalle|La\\s+Paz|Tunuy[aá]n)`,
  `(?:${PREFIX})?Eleg[ií]\\s+San\\s+Rafael\\s+Avanza`,
  `(?:${PREFIX})?Eleg[ií]\\s+Maip[uú]\\s+Crece`,
  `(?:${PREFIX})?Eleg[ií]\\s+Santa\\s+Rosa`,
  `(?:${PREFIX})?Eleg[ií]\\s+Mendoza`,
  `(?:${PREFIX})?Eleg[ií]`,
  `(?:${PREFIX})?Cambia\\s+Mendoza`,
  `(?:(?:la|La)\\s+)?Uni[oó]n\\s+Mendocina`,
  `(?:${PREFIX})?Nuevo\\s+Tupungato`,
  `(?:${PREFIX})?Nuevos\\s+Rumbos`,
  `${PREFIX}Encuentro\\s+por\\s+San\\s+Carlos`,
  `${PREFIX}Juntos\\s+por\\s+San\\s+Carlos`,
  `${PREFIX}Santa\\s+Rosa\\s+Cambia`,
  `${PREFIX}Uni[oó]n\\s+C[ií]vica\\s+Radical`,
  `${PREFIX}U\\.C\\.R\\.\\s*[—-]\\s*P\\.S\\.`,
  `${PREFIX}Libertario,?\\s+Dem[oó]cratas?\\s+y\\s+Jubilados`,
  `${PREFIX}Somos\\s+Mendoza`,
  `${PREFIX}Intransigente`,
  `${PREFIX}Dem[oó]crata`,
  `${PREFIX}Federal`,
  `${PREFIX}Sembrar`,
  `${PREFIX}Verde`,
];
const PARTY_RE = new RegExp(`(?<![\\p{L}_])(?:${PARTY_PATTERNS.join("|")})(?![\\p{L}])`, "giu");

/** Pasa los espacios y comas de los nombres de partido a «_» y «~» (mismo largo), para que no se los confunda con otra cosa. */
function maskParties(text: string): string {
  return text.replace(PARTY_RE, (m) => m.replace(/,/g, "~").replace(/\s/g, "_"));
}

const SMALL = new Set(["de", "del", "la", "las", "los", "y", "para", "por", "e"]);

/** Capitaliza las palabras que están enteras en mayúsculas; deja como están las demás. */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (w !== w.toUpperCase() || !/\p{L}/u.test(w) || w.includes(".")) return w;
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.replace(/(^|['’-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}

export function prettyParty(masked: string): string {
  const text = masked.replace(/~_/g, ", ").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const t = titleCase(text);
  return t[0]!.toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Texto del acta: limpieza por página
// ---------------------------------------------------------------------------

const HEADER_LINES = new Set([
  "hjuntaelectoral",
  "juntaelectoral",
  "hjuntaelectoraldela",
  "juntaelectoraldela",
  "hjuntaelectoraldelaprovincia",
  "juntaelectoraldelaprovincia",
  "provinciademendoza",
  "delaprovincia",
  "delaprovinciamendoza",
  "delaprovinciademendoza",
  "juntaelectoraldelaprovinciademendoza",
  "hjuntaelectoraldelaprovinciademendoza",
  "hjuntaelectoraldelaprovinciamendoza",
  "dela",
]);
const lettersKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

function applyFixes(text: string, acta: string, used: Set<OcrFix>): string {
  let out = text;
  for (const fix of OCR_FIXES) {
    if (fix.acta !== acta) continue;
    const before = out;
    out = typeof fix.from === "string" ? out.replaceAll(fix.from, fix.to) : out.replace(fix.from, fix.to);
    if (out !== before || (typeof fix.from === "string" && fix.from === fix.to && before.includes(fix.from))) used.add(fix);
  }
  return out;
}

/** Limpia una página: quita el encabezado repetido y la basura de la firma, une palabras partidas y deja un solo renglón. */
export function cleanPage(raw: string, index: number): string {
  let lines = raw.split("\n").map((l) => l.trim());
  // El encabezado de la Junta se repite arriba de cada página; lo que lo precede es basura de sello o firma.
  if (index > 0) {
    const first = lines
      .slice(0, 12)
      .findIndex((l) => HEADER_LINES.has(lettersKey(l)) && lettersKey(l) !== "dela" && lettersKey(l) !== "delaprovincia");
    if (first >= 0) {
      let i = first;
      while (i < lines.length && (HEADER_LINES.has(lettersKey(lines[i]!)) || lettersKey(lines[i]!) === "mendoza")) i++;
      lines = lines.slice(i);
    }
  }
  lines = lines
    .map((l) => l.replace(/^[^\p{L}\d]+/u, ""))
    .filter((l) => /\p{L}/u.test(l))
    .filter((l) => !/^[lI|]$/.test(l));
  let text = lines.join("\n");
  text = text.replace(/(\p{L})[-—–]['’`´]?\s*\n\s*(\p{L})/gu, "$1$2");
  text = text.replace(/\b\d{1,2}\)\s*/g, "");
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Parser de la nómina
// ---------------------------------------------------------------------------

export type Cargo = "gobernador" | "vicegobernador" | "senador_provincial" | "diputado_provincial" | "intendente" | "concejal";

export interface Elected {
  cargo: Cargo;
  cargoTexto: string;
  jurisdiccion: string;
  seccion: string;
  nombre: string;
  partido: string;
  orden: number;
  pagina: number;
  nota: string;
}

const MUNI_SRC = [
  "CIUDAD\\s+DE\\s+MENDOZA",
  "CAPITAL",
  "GUAYMALL[EÉ]N",
  "LAS\\s+HERAS",
  "LAVALLE",
  "MAIP[UÚ]",
  "SAN\\s+MART[IÍ]N",
  "JUN[IÍ]N",
  "RIVADAVIA",
  "SANTA\\s+ROSA",
  "LA\\s+PAZ",
  "GODOY\\s+CRUZ",
  "LUJ[AÁ]N\\s+DE\\s+CUYO",
  "TUPUNGATO",
  "SAN\\s+CARLOS",
  "TUNUY[AÁ]N",
  "SAN\\s+RAFAEL",
  "GENERAL\\s+ALVEAR",
  "MALARG[UÚÜ]E",
].join("|");
const LOC_WORDS = "(?:POR\\s+)?(?:EL\\s+)?(?:DEL?\\s+)?(?:LA\\s+)?(?:DEPARTAMENTO\\s*(?:DE\\s+)?)?(?:DE\\s+)?(?:LA\\s+)?";
const BARE_MARKER_RE = new RegExp(`(?<![\\p{L}_])(${LOC_WORDS})(${MUNI_SRC})\\s*:`, "gu");
const AFTER_CARGO_RE = new RegExp(`\\s*:?\\s*(${LOC_WORDS})(${MUNI_SRC})\\s*[:,;]`, "uy");
const CARGO_RE =
  /(VICE-?GOBERNADORA?)\s*:|(GOBERNADOR(?:\s+DE\s+LA\s+PROVINCIA\s+DE\s+MENDOZA)?(?:\s+y\s+VICEGOBERNADORA)?)\s*:|(SENADORES|DIPUTADOS)\s+POR\s+LA\s+(PRIMERA|SEGUNDA|TERCERA|CUARTA)\s+SECCI[OÓ]N(?:\s+ELECTORAL)?\s*[,:]?|(INTENDENTES?|CONCEJALES)\b/gu;
const PARTY_INTRO_RE = /(?<![\p{L}_])por\s+(?:(?:el|la|los|las)\s+)?([^\s,:;]*_[^\s,:;]*)/giu;

const SECTIONS: Record<string, string> = { PRIMERA: "Primera", SEGUNDA: "Segunda", TERCERA: "Tercera", CUARTA: "Cuarta" };

interface Token {
  type: "cargo" | "marker" | "party";
  start: number;
  end: number;
  cargo?: Cargo;
  both?: boolean;
  text?: string;
  section?: string;
  muni?: string;
  party?: string;
}

function lex(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(CARGO_RE)) {
    const start = m.index!;
    let end = start + m[0].length;
    const raw = m[0].replace(/\s*[,:]\s*$/, "").replace(/\s+/g, " ");
    if (m[1]) tokens.push({ type: "cargo", start, end, cargo: "vicegobernador", text: raw });
    else if (m[2]) tokens.push({ type: "cargo", start, end, cargo: "gobernador", both: /VICEGOBERNADORA/.test(m[2]), text: raw });
    else if (m[3]) {
      tokens.push({
        type: "cargo",
        start,
        end,
        cargo: m[3] === "SENADORES" ? "senador_provincial" : "diputado_provincial",
        text: raw,
        section: SECTIONS[m[4]!]!,
      });
    } else {
      const cargo: Cargo = m[5]!.startsWith("INTENDENTE") ? "intendente" : "concejal";
      AFTER_CARGO_RE.lastIndex = end;
      const loc = AFTER_CARGO_RE.exec(text);
      let cargoText = raw;
      let muni: string | undefined;
      if (loc) {
        end = AFTER_CARGO_RE.lastIndex;
        muni = loc[2];
        cargoText = `${raw} ${loc[1]}${loc[2]}`.replace(/\s+/g, " ").trim();
      }
      tokens.push({ type: "cargo", start, end, cargo, text: cargoText, muni });
    }
  }
  for (const m of text.matchAll(BARE_MARKER_RE)) {
    tokens.push({ type: "marker", start: m.index!, end: m.index! + m[0].length, text: m[0].replace(/\s*:$/, ""), muni: m[2] });
  }
  for (const m of text.matchAll(PARTY_INTRO_RE)) {
    tokens.push({ type: "party", start: m.index!, end: m.index! + m[0].length, party: m[1] });
  }
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Token[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.start < last) continue;
    out.push(t);
    last = t.end;
  }
  return out;
}

const stripLead = (s: string) => s.replace(/^[\s,:;.-]*(?:(?:los|el|la)\s+ciudadan[oa]s?\s*:?\s*)?/i, "");
const stripTail = (s: string) => s.replace(/(?:\s+y)?[\s;,.-]*$/i, "");

/** Parte el texto de una lista de personas en nombres «Nombre Apellido» (o como venga en el acta para `apellido_nombre`). */
export function splitNames(gap: string, order: NameOrder): { raw: string; display: string }[] {
  const text = stripTail(stripLead(gap)).replace(/\s*,?\s*D\.N\.[Il1]\.?\s*N[º°o]?\s*[\d.]+/gi, "");
  if (!text) return [];
  const out: { raw: string; display: string }[] = [];
  if (order === "apellido_coma_nombre") {
    for (const piece of text.split(/\s*;\s*|\s+y\s+/)) {
      const p = piece
        .replace(/^y\s+/, "")
        .replace(/(?<=\p{L}{2})\.$/u, "")
        .trim();
      if (!p) continue;
      const parts = p.split(/\s*,\s*/).filter(Boolean);
      if (parts.length === 1) {
        const words = p.split(/\s+/);
        const i = words.findIndex((w) => w !== w.toUpperCase());
        if (i < 1) throw new Error(`No se puede separar apellido y nombre en «${p}»`);
        out.push({ raw: p, display: `${words.slice(i).join(" ")} ${titleCase(words.slice(0, i).join(" "))}` });
      } else if (parts.length % 2 === 0) {
        for (let i = 0; i < parts.length; i += 2) {
          out.push({ raw: `${parts[i]}, ${parts[i + 1]}`, display: `${parts[i + 1]} ${titleCase(parts[i]!)}` });
        }
      } else throw new Error(`Cantidad impar de partes en «${p}»`);
    }
  } else {
    for (const piece of text.split(/\s*[;,]\s*|\s+y\s+/)) {
      const p = piece
        .replace(/^y\s+/, "")
        .replace(/(?<=\p{L}{2})\.$/u, "")
        .trim();
      if (!p) continue;
      out.push({ raw: p, display: order === "apellido_nombre" ? titleCase(p) : titleCase(p) });
    }
  }
  for (const n of out) {
    if (!/^\p{L}[\p{L}'’. -]*$/u.test(n.display) || n.display.split(/\s+/).length < 2) {
      throw new Error(`Nombre con formato dudoso: «${n.display}»`);
    }
  }
  return out;
}

export interface ParsedActa {
  elected: Elected[];
  /** Un acta de una sola jurisdicción puede traer partidos que no conocemos: se listan. */
  warnings: string[];
}

/** Página (1 = primera) en la que cae un desplazamiento del texto unido. */
function pageOf(starts: number[], offset: number): number {
  let page = 1;
  for (let i = 0; i < starts.length; i++) if (starts[i]! <= offset) page = i + 1;
  return page;
}

export function parseActa(
  cleanPages: string[],
  cfg: Pick<ActaConfig, "nameOrder" | "startRe" | "key">,
  fixesUsed?: Set<OcrFix>,
): ParsedActa {
  const starts: number[] = [];
  let joined = "";
  for (const p of cleanPages) {
    starts.push(joined.length);
    joined += `${p} `;
  }
  const masked = maskParties(joined);
  const from = cfg.startRe.exec(masked);
  if (!from) throw new Error(`${cfg.key}: no encuentro el inicio de la nómina`);
  const bodyStart = from.index + from[0].length;
  const firman = /\bFirman\b/.exec(masked.slice(bodyStart));
  const bodyEnd = firman ? bodyStart + firman.index : masked.length;
  const body = masked.slice(0, bodyEnd);
  const tokens = lex(body).filter((t) => t.start >= bodyStart);
  if (!tokens.length) throw new Error(`${cfg.key}: la nómina no tiene encabezados reconocibles`);

  const elected: Elected[] = [];
  const marks = (OCR_FIXES ?? []).filter((f) => f.acta === cfg.key && f.mark && (!fixesUsed || fixesUsed.has(f)));
  let cargo: Token | undefined;
  let muni: string | undefined;
  let party = "";
  const counters = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    if (t.type === "cargo") {
      cargo = t;
      muni = t.muni;
      party = "";
    } else if (t.type === "marker") {
      muni = t.muni;
      if (cargo)
        cargo = { ...cargo, text: `${cargo.cargo === "intendente" ? "INTENDENTES" : "CONCEJALES"} ${t.text}`.replace(/\s+/g, " ") };
      party = "";
    } else {
      party = t.party!;
    }
    const gapStart = t.end;
    const gapEnd = next ? next.start : body.length;
    const gap = body.slice(gapStart, gapEnd);
    const clean = stripTail(stripLead(gap));
    if (!clean) {
      if (t.type === "party") throw new Error(`${cfg.key}: el partido «${prettyParty(party)}» no trae nombres`);
      continue;
    }
    if (!cargo) continue; // texto previo al primer encabezado
    if (t.type !== "party" && !(cargo.cargo === "gobernador" || cargo.cargo === "vicegobernador")) {
      throw new Error(`${cfg.key}: texto sin partido tras «${cargo.text}»: «${clean.slice(0, 60)}»`);
    }
    const names = splitNames(gap, cfg.nameOrder);
    const isMunicipal = cargo.cargo === "intendente" || cargo.cargo === "concejal";
    if (isMunicipal && !muni) throw new Error(`${cfg.key}: falta el municipio de «${clean.slice(0, 60)}»`);
    const jurisdiccion = isMunicipal
      ? (normalizeMunicipio(muni!.replace(/\s+/g, " ")) ??
        (() => {
          throw new Error(`${cfg.key}: municipio no reconocido: ${muni}`);
        })())
      : cargo.section
        ? cargo.section
        : "Provincia de Mendoza";
    const page = pageOf(starts, gapStart + (gap.length - gap.trimStart().length));
    const groupKey = `${cargo.cargo}|${jurisdiccion}|${party}`;
    for (const [k, n] of names.entries()) {
      let who: Cargo = cargo.cargo!;
      if (cargo.both) who = k === 0 ? "gobernador" : "vicegobernador";
      if (cargo.both && k > 1) throw new Error(`${cfg.key}: más de dos nombres para gobernador y vicegobernador`);
      const order = (counters.get(groupKey) ?? 0) + 1;
      counters.set(groupKey, order);
      elected.push({
        cargo: who,
        cargoTexto: cargo.text!.replace(/\s+y\s+VICEGOBERNADORA$/, cargo.both ? " y VICEGOBERNADORA" : ""),
        jurisdiccion,
        seccion: cargo.section ?? "",
        nombre: n.display,
        partido: party ? prettyParty(party) : "",
        orden: order,
        pagina: page,
        nota: marks.some((f) => n.display.toLowerCase().includes(f.mark!.toLowerCase()))
          ? "Nombre corregido por error de OCR del escaneo"
          : "",
      });
    }
  }
  const warnings: string[] = [];
  return { elected, warnings };
}

// ---------------------------------------------------------------------------
// Verificaciones contra lo que fija la ley
// ---------------------------------------------------------------------------

/** Cada elección renueva la mitad de la Legislatura: 19 de 38 senadores y 24 de 48 diputados (por sección: 6-5-4-4 y 8-6-5-5). */
const SENATE_BY_SECTION = { Primera: 6, Segunda: 5, Tercera: 4, Cuarta: 4 } as const;
const DEPUTIES_BY_SECTION = { Primera: 8, Segunda: 6, Tercera: 5, Cuarta: 5 } as const;

export function countBy(rows: readonly Elected[], pick: (r: Elected) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
  return m;
}

function check(cond: boolean, msg: string, problems: string[]) {
  if (!cond) problems.push(msg);
}

export function verifyElection(
  label: string,
  rows: readonly Elected[],
  opts: { legislature: boolean; intendentes: number | null },
): string[] {
  const problems: string[] = [];
  if (opts.legislature) {
    const sen = countBy(
      rows.filter((r) => r.cargo === "senador_provincial"),
      (r) => r.seccion,
    );
    const dip = countBy(
      rows.filter((r) => r.cargo === "diputado_provincial"),
      (r) => r.seccion,
    );
    for (const [s, n] of Object.entries(SENATE_BY_SECTION))
      check(sen.get(s) === n, `${label}: senadores sección ${s}: ${sen.get(s) ?? 0}, esperados ${n}`, problems);
    for (const [s, n] of Object.entries(DEPUTIES_BY_SECTION))
      check(dip.get(s) === n, `${label}: diputados sección ${s}: ${dip.get(s) ?? 0}, esperados ${n}`, problems);
  }
  if (opts.intendentes !== null) {
    const int = rows.filter((r) => r.cargo === "intendente");
    check(int.length === opts.intendentes, `${label}: intendentes ${int.length}, esperados ${opts.intendentes}`, problems);
    check(new Set(int.map((r) => r.jurisdiccion)).size === int.length, `${label}: un municipio con dos intendentes`, problems);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------

const COLUMNS = [
  "eleccion_fecha",
  "eleccion_fechas_acta",
  "acta_fecha",
  "cargo",
  "cargo_texto",
  "jurisdiccion",
  "seccion_electoral",
  "nombre",
  "nombre_orden",
  "partido",
  "mandato_desde",
  "mandato_hasta",
  "titular_suplente",
  "orden",
  "fuente_url",
  "pagina",
  "nota",
];

async function loadActa(cfg: ActaConfig, fixesUsed: Set<OcrFix>): Promise<Elected[]> {
  const bytes = await fetchOrReuse(ID, cfg.url, cfg.file);
  const raw = await pdfPages(new Uint8Array(bytes));
  const whole = raw.join("\n").replace(/\s+/g, " ");
  if (!cfg.actaCheck.test(whole)) throw new Error(`${cfg.key}: la fecha del acta no coincide con ${cfg.actaDate}`);
  const pages = raw.map((p, i) => applyFixes(cleanPage(p, i), cfg.key, fixesUsed));
  return parseActa(pages, cfg, fixesUsed).elected;
}

export async function run(_args: string[]) {
  const fixesUsed = new Set<OcrFix>();
  const rows: Row[] = [];
  const byKey = new Map<string, Elected[]>();
  for (const cfg of ACTAS) {
    const elected = await loadActa(cfg, fixesUsed);
    byKey.set(cfg.key, elected);
    console.log(`${cfg.key}: ${elected.length} electos`);
    for (const e of elected) {
      rows.push({
        eleccion_fecha: cfg.electionDate,
        eleccion_fechas_acta: cfg.dates.join(";"),
        acta_fecha: cfg.actaDate,
        cargo: e.cargo,
        cargo_texto: e.cargoTexto,
        jurisdiccion: e.jurisdiccion,
        seccion_electoral: e.seccion,
        nombre: e.nombre,
        nombre_orden: cfg.nameOrder === "apellido_nombre" ? "apellido_nombre" : "nombre_apellido",
        partido: e.partido,
        mandato_desde: "",
        mandato_hasta: "",
        titular_suplente: "titular",
        orden: e.orden,
        fuente_url: cfg.url,
        pagina: e.pagina,
        nota: e.nota,
      });
    }
  }

  // Verificación contra las bancas que fija la ley y entre elecciones del mismo ciclo.
  const problems: string[] = [];
  const get = (k: string) => byKey.get(k) ?? [];
  const cycleA = [
    ["2015", [...get("2015"), ...get("2015-godoy-cruz")]],
    ["2019", get("2019")],
    ["2023", get("2023")],
  ] as const;
  for (const [label, list] of cycleA) problems.push(...verifyElection(label, list, { legislature: true, intendentes: 18 }));
  problems.push(...verifyElection("2017", get("2017"), { legislature: true, intendentes: null }));
  problems.push(...verifyElection("2021", get("2021"), { legislature: true, intendentes: null }));
  const conc = (list: readonly Elected[]) =>
    countBy(
      list.filter((r) => r.cargo === "concejal"),
      (r) => r.jurisdiccion,
    );
  const sameSeats = (a: string, la: readonly Elected[], b: string, lb: readonly Elected[]) => {
    const ca = conc(la);
    const cb = conc(lb);
    check(ca.size === 18 && cb.size === 18, `concejales ${a}/${b}: faltan municipios`, problems);
    for (const [m, n] of ca) check(cb.get(m) === n, `concejales de ${m}: ${a}=${n}, ${b}=${cb.get(m) ?? 0}`, problems);
  };
  sameSeats("2015", cycleA[0][1], "2019", cycleA[1][1]);
  sameSeats("2019", cycleA[1][1], "2023", cycleA[2][1]);
  sameSeats("2017", get("2017"), "2021", get("2021"));
  for (const [label, list] of [...cycleA, ["2017", get("2017")], ["2021", get("2021")]] as const) {
    const fz = list.filter((r) => r.cargo === "gobernador" || r.cargo === "vicegobernador");
    if (label === "2017" || label === "2021") check(fz.length === 0, `${label}: no debería traer gobernador`, problems);
    else check(fz.length === 2, `${label}: gobernador y vicegobernador esperados, hay ${fz.length}`, problems);
  }
  const unused = OCR_FIXES.filter((f) => !fixesUsed.has(f));
  if (unused.length)
    problems.push(`Correcciones de OCR que ya no aplican (revisar si cambió el PDF): ${unused.map((f) => String(f.from)).join(" | ")}`);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`junta-electoral: ${problems.length} verificación(es) fallaron; no se escribe nada.`);
  }

  await writeProcessed(ID, "electos.csv", rows, COLUMNS);
  console.log(`electos.csv: ${rows.length} filas`);
  await writeMeta();
}

async function writeMeta() {
  const dir = join(PROCESSED_DIR, ID);
  await mkdir(dir, { recursive: true });
  const meta = {
    titulo: "Cargos electos en Mendoza según la Junta Electoral",
    descripcion:
      "Cada fila es una persona proclamada por la H. Junta Electoral de la Provincia en las elecciones de 2015, 2017, 2019, 2021 y 2023: gobernador y vicegobernador, senadores y diputados provinciales, intendentes y concejales, con la alianza, frente o partido que dice el acta. Sirve para saber quién fue electo y por quién, no quién ejerció el cargo: no incluye licencias, renuncias, reemplazos por suplentes ni juramentos. Los actos de 2015 son dos actas (la general y la de Godoy Cruz, que votó el 29 de noviembre) La elección extraordinaria de Santa Rosa del 12 de febrero de 2017 no está: su acta trae el DNI de la persona electa y no archivamos documentos con DNI. El partido figura tal como lo escribe el acta, con las mayúsculas normalizadas; si el acta no lo dice (el vicegobernador de 2015) queda vacío, y vacío no significa sin partido. El mandato queda vacío porque las actas no lo informan. Cuando un acta nombra dos jornadas sin decir cuál corresponde a cada cargo, `eleccion_fecha` es la jornada principal (la última en 2015, 2019 y 2023; la primera en 2017) y están todas en `eleccion_fechas_acta`. Los actos son escaneos con texto por OCR: las correcciones de letras mal leídas están marcadas en `nota`. Los nombres de 2023 vienen en el orden del acta (apellido primero) y sin tildes, porque están en mayúsculas.",
    columnas: {
      eleccion_fecha: {
        etiqueta: "Fecha de la elección",
        tipo: "fecha",
        descripcion: "Jornada principal; ver `eleccion_fechas_acta` si el acta nombra dos.",
      },
      eleccion_fechas_acta: { etiqueta: "Jornadas que nombra el acta", tipo: "texto", oculta: true },
      acta_fecha: { etiqueta: "Fecha del acta", tipo: "fecha", descripcion: "Día en que la Junta proclamó a los electos." },
      cargo: {
        etiqueta: "Cargo",
        tipo: "texto",
        valores: {
          gobernador: "Gobernador",
          vicegobernador: "Vicegobernador",
          senador_provincial: "Senador provincial",
          diputado_provincial: "Diputado provincial",
          intendente: "Intendente",
          concejal: "Concejal",
        },
      },
      cargo_texto: { etiqueta: "Cargo según el acta", tipo: "texto", oculta: true },
      jurisdiccion: {
        etiqueta: "Jurisdicción",
        tipo: "texto",
        descripcion: "Provincia, sección electoral (Primera a Cuarta) o municipio.",
      },
      seccion_electoral: {
        etiqueta: "Sección electoral",
        tipo: "texto",
        descripcion: "Solo senadores y diputados. Las actas no asignan sección a los municipios.",
      },
      nombre: { etiqueta: "Nombre", tipo: "texto", descripcion: "Como figura en el acta, sin documento. Ver `nombre_orden`." },
      nombre_orden: {
        etiqueta: "Orden del nombre",
        tipo: "texto",
        oculta: true,
        valores: { nombre_apellido: "Nombre y apellido", apellido_nombre: "Apellido y nombre" },
      },
      partido: {
        etiqueta: "Partido, frente o alianza",
        tipo: "texto",
        descripcion: "Por el que fue proclamado, tal como lo escribe el acta. Vacío no significa sin partido.",
      },
      mandato_desde: { etiqueta: "Mandato desde", tipo: "fecha", oculta: true, descripcion: "Vacío: las actas no lo informan." },
      mandato_hasta: { etiqueta: "Mandato hasta", tipo: "fecha", oculta: true, descripcion: "Vacío: las actas no lo informan." },
      titular_suplente: { etiqueta: "Titular o suplente", tipo: "texto", oculta: true, descripcion: "Las actas solo proclaman titulares." },
      orden: {
        etiqueta: "Orden en la lista",
        tipo: "texto",
        descripcion:
          "Lugar en que el acta nombra a la persona dentro de la lista de su partido para ese cargo y jurisdicción (1 es la primera).",
      },
      fuente_url: { etiqueta: "Acta", tipo: "url" },
      pagina: { etiqueta: "Página del acta", tipo: "texto", oculta: true },
      nota: { etiqueta: "Nota", tipo: "texto", descripcion: "Avisa si el nombre se corrigió por un error de lectura del escaneo." },
    },
    fuente: LISTADO_URL,
  };
  await writeFile(join(dir, "electos.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
}
