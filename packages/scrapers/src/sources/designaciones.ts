/**
 * Designaciones, renuncias, ceses y otros actos de personal publicados en el Boletín Oficial de Mendoza.
 *
 * Fuente DERIVADA: no descarga nada. Lee lo que ya bajó el scraper `boletin-oficial`:
 *   - data/processed/boletin-oficial/normas.csv
 *   - data/processed/boletin-oficial/textos/<fecha>/<norma_id>.txt   (texto completo de la norma)
 * y escribe data/processed/designaciones/designaciones.csv (+ .meta.json).
 *
 * Uso: bun run scrape designaciones
 *
 * Qué se extrae (artículos de decretos y resoluciones, provinciales y municipales, que tienen texto bajado):
 *   - designa:   "Desígnese ..." / "DESIGNASE ..." (efectiva, interina, por concurso, planta permanente...).
 *   - renuncia:  "Téngase por aceptada la renuncia ..." (jubilación, retiro, razones particulares).
 *   - cese:      "Aplicar la sanción de CESANTÍA/EXONERACIÓN ..." y "Dase por terminadas/cesantes ...".
 *   - otro:      "Asígnense las funciones ..." (subrogancia), "Encárguese la cartera ..." (ministro interino) y
 *                "Establézcase la continuidad de la designación ..." (columna `modalidad`).
 * Una fila por persona y acto. Los artículos de los que no se puede sacar una persona con confianza se descartan
 * (por ejemplo, designar un jurado, un nombre de calle o "un estudiante titular"); se cuentan en el log.
 *
 * Datos personales: se guardan solo nombre, cargo y repartición (actos públicos). DNI, CUIL/CUIT, clase (año de
 * nacimiento), matrícula y domicilios NUNCA se guardan: la persona se extrae SIN el número que la acompaña y el
 * cargo/repartición pasan por `redact()`, que borra cualquier número de documento que haya quedado.
 *
 * Limitaciones: la mayoría de las normas del índice (sobre todo el histórico) solo tienen el sumario, que es el
 * número de expediente: no hay texto para leer. Solo se cubren las fechas que el scraper diario bajó completas.
 * Los textos son anteriores al PDF: el orden Apellido/Nombre es el del decreto, no se normaliza.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PROCESSED_DIR, type Row, readProcessed, writeProcessed } from "@mt/core";

const SOURCE = "designaciones";
const BOE = "boletin-oficial";
const NORM_TYPES = new Set(["decreto", "resolucion", "decretos municipales", "resoluciones municipales"]);

export const COLUMNS = [
  "fecha_boletin",
  "norma_id",
  "tipo_norma",
  "numero_norma",
  "organismo_emisor",
  "accion",
  "modalidad",
  "persona",
  "cargo",
  "reparticion",
  "desde",
  "articulo",
  "url_pdf",
];

export type Action = "designa" | "renuncia" | "cese" | "otro";

export interface NormInfo {
  fecha: string;
  normaId: string;
  tipo: string;
  numero: string;
  organismo: string;
  urlPdf: string;
}

export interface Act {
  accion: Action;
  modalidad: string;
  persona: string;
  cargo: string;
  reparticion: string;
  desde: string;
  articulo: string;
}

export interface ParseResult {
  acts: Act[];
  /** Artículos que parecen un acto de personal pero de los que no se pudo sacar una persona. */
  discarded: number;
}

// ---------------------------------------------------------------- texto

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const MONTHS: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/** Borra números de documento y otros datos personales de un texto libre. */
export function redact(s: string): string {
  return squash(
    s
      .replace(/\b(?:D\.?\s?N\.?\s?I\.?|C\.?\s?U\.?\s?I\.?\s?[LT]\.?|C\.?\s?U\.?\s?I\.?)\s*(?:N\s*[º°o]?\.?)?\s*:?\s*[\d.\-\s/]{6,}/gi, "")
      .replace(/\bLegajo\s*\/?\s*(?:CUI[LT])?\s*N?[º°]?\s*[\d-]+/gi, "")
      .replace(/\bmatr[ií]cula\s*N?[º°]?\s*\d+/gi, "")
      .replace(/\bclase\s+(?:19|20)\d{2}\b/gi, "")
      .replace(/\b\d{2}\.\d{3}\.\d{3}\b/g, "")
      .replace(/\b\d{2}-\d{7,8}-\d\b/g, "")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ",")
      .replace(/^[\s,;\-–—]+|[\s,;\-–—]+$/g, ""),
  );
}

/** Pasa "CLASE 012 – Cód. 15-8-07-19 – Analista" etc. a algo legible, sin códigos presupuestarios. */
function cleanCargo(raw: string): string {
  const original = redact(raw);
  let s = original
    .replace(/\b(?:Car[aá]cter|Jurisdicci[oó]n|Unidad Organizativa|R[eé]gimen Salarial|Agrupamiento|Tramo|Subtramo)\s*:?\s*\d[\d-]*/gi, "")
    .replace(/\bU\.?\s?O\.?\s*:?\s*\d+\b/g, "")
    .replace(/\bU\.?\s?G\.?\s?G\.?\s*[A-Z]?\d+\b/g, "")
    .replace(/\bC[oó]digo(?:\s+Escalafonario)?\s*:?\s*[\d-]+/gi, "")
    .replace(/\bC[oó]d\.?\s*[\d-]+/gi, "")
    .replace(/\bC\.?Ju\.?O\.?\s*[\d-]+/gi, "")
    .replace(/\b(?:Clase|Categor[ií]a)\s*\d+\b/gi, "");
  s = s
    .replace(/[–—]/g, " – ")
    .replace(/\s+-\s+/g, " – ")
    .replace(/(?:\s*–\s*){2,}/g, " – ")
    .replace(/^[\s,;\-–—]+|[\s,;\-–—.]+$/g, "")
    .replace(/\s+–\s+(?=(?:de|del|en)\s)/gi, " ");
  s = squash(s.replace(/,\s*,/g, ","));
  if (!/[A-Za-zÁ-ú]{4}/.test(s)) {
    const k = /\b(?:Clase|Categor[ií]a)\s*\d+/i.exec(original);
    return k ? k[0] : "";
  }
  // Si la primera palabra quedó en mayúsculas ("AUXILIAR – de las Policías..."), se baja.
  const first = s.split(" ")[0] ?? "";
  if (first.length > 2 && first === first.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(first)) {
    s = first.charAt(0) + first.slice(1).toLowerCase() + s.slice(first.length);
  }
  return s;
}

function toIsoDate(day: string, month: string, year: string): string {
  const m = MONTHS[fold(month).toLowerCase()];
  if (!m) return "";
  return `${year}-${m}-${day.padStart(2, "0")}`;
}

/** Fecha del decreto ("MENDOZA, 24 DE JULIO DE 2026"), en ISO. */
export function headerDate(text: string): string {
  const m = /^\s*MENDOZA,?\s*(\d{1,2})\s+DE\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+DE\s+(\d{4})/im.exec(text);
  return m ? toIsoDate(m[1]!, m[2]!, m[3]!) : "";
}

/** "a partir del 22 de junio de 2026", "a partir del 01/09/2026", "desde el 01 de septiembre". */
export function findStartDate(text: string, fallbackYear: string, allowDesde = true): string {
  const t = squash(text);
  const lead = allowDesde ? "(?:a partir|desde)" : "a partir";
  const wordy = new RegExp(
    `${lead}\\s+(?:de\\s+las\\s+\\d{1,2}(?:[:.]\\d{2})?\\s*(?:hs?\\.?|horas)\\s+)?(?:(?:del?|el)\\s+)?(?:d[ií]a\\s+)?(\\d{1,2})\\s*(?:º|°)?\\s+de\\s+([A-Za-zÁÉÍÓÚáéíóú]+)(?:\\s+de\\s+(\\d{4}))?`,
    "i",
  );
  let m = wordy.exec(t);
  if (m) {
    const iso = toIsoDate(m[1]!, m[2]!, m[3] ?? fallbackYear);
    if (iso) return iso;
  }
  m = /a partir (?:del?|el)\s+(?:d[ií]a\s+)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return "";
}

// ---------------------------------------------------------------- artículos

interface Article {
  number: string;
  body: string;
}

const ARTICLE_START =
  /^[ \t]*(?:Art[ií]culo|ART[IÍ]CULO|ARTICULO|Art\.?|ART\.?)[ \t]*(\d+)[ \t]*(?:º|°|o|do|ro|to|er)?[ \t]*\)?[ \t]*[.\-–—:)][ \t.\-–—:)]*/gim;

export function splitArticles(text: string): Article[] {
  const marks: { index: number; end: number; number: string }[] = [];
  for (const m of text.matchAll(ARTICLE_START)) marks.push({ index: m.index!, end: m.index! + m[0].length, number: m[1]! });
  return marks.map((mk, i) => ({
    number: mk.number,
    body: text.slice(mk.end, i + 1 < marks.length ? marks[i + 1]!.index : text.length).trim(),
  }));
}

// ---------------------------------------------------------------- clasificación

interface Kind {
  accion: Action;
  modalidad: string;
}

/** Decide qué acto de personal es un artículo, mirando cómo empieza. null si no es uno. */
export function classifyArticle(body: string): Kind | null {
  const head = fold(body.slice(0, 260)).toLowerCase();
  if (/^(designese|designase|designar|designense|designanse)\b/.test(head)) {
    if (/^\w+\s+(el nombre|al personal de la oficina)/.test(head)) return null;
    let modalidad = "";
    if (/interin/.test(head)) modalidad = "interina";
    else if (/por concurso/.test(head)) modalidad = "concurso";
    else if (/planta permanente|efectiv/.test(head)) modalidad = "efectiva";
    else if (/ad honorem/.test(head)) modalidad = "ad_honorem";
    else if (/planta temporari|transitori/.test(head)) modalidad = "transitoria";
    return { accion: "designa", modalidad };
  }
  if (/^(tengase por aceptada|acepta[sn]?e|aceptar|aceptase)\b.{0,80}renuncia/.test(head)) {
    let modalidad = "";
    const rest = fold(body.slice(0, 700)).toLowerCase();
    if (/jubilaci|retiro/.test(rest)) modalidad = "jubilacion";
    else if (/razones particulares/.test(rest)) modalidad = "razones_particulares";
    return { accion: "renuncia", modalidad };
  }
  if (/^(aplicar|apliquese|aplicase|aplicar)\b.{0,100}sancion de (cesantia|exoneracion)/.test(head)) {
    return { accion: "cese", modalidad: /exoneracion/.test(head) ? "exoneracion" : "cesantia" };
  }
  if (/^(dase|dese|dar) por (terminad|cesad|concluid)/.test(head)) return { accion: "cese", modalidad: "" };
  if (/^(declarase|declarese) cesante/.test(head)) return { accion: "cese", modalidad: "cesantia" };
  if (/^(asignense|asignese|asignar)\b.{0,40}funciones/.test(head)) return { accion: "otro", modalidad: "subrogancia" };
  if (/^(encarguese|encargase)\b.{0,60}(cartera|despacho)/.test(head)) return { accion: "otro", modalidad: "encargo_cartera" };
  if (/^(dejese|dejase) sin efecto\b.{0,260}tengase por aceptada.{0,40}renuncia/.test(fold(body.slice(0, 500)).toLowerCase())) {
    return { accion: "renuncia", modalidad: "" };
  }
  if (/^(afectese|afectase)\b.{0,80}funciones/.test(head)) return { accion: "otro", modalidad: "afectacion" };
  if (/^(dejese|dejase) sin efecto\b.{0,100}(asignacion de funciones|designacion|suplemento por subrogancia)/.test(head)) {
    return { accion: "otro", modalidad: "fin_de_funciones" };
  }
  if (/^convoquese a prestar servicio/.test(head)) return { accion: "otro", modalidad: "convocatoria_retirado" };
  if (/^(establezcase|prorroguese|ratifiquese|ratificase)\b.{0,40}(continuidad|designacion)/.test(head)) {
    return { accion: "otro", modalidad: "continuidad" };
  }
  return null;
}

// ---------------------------------------------------------------- personas

const TITLE_WORDS = new Set([
  "dr",
  "dra",
  "lic",
  "licda",
  "sr",
  "sra",
  "srta",
  "dn",
  "dna",
  "dña",
  "prof",
  "profa",
  "ing",
  "arq",
  "abg",
  "mgtr",
  "mag",
  "cdor",
  "cdora",
  "cpn",
  "cp",
  "pp",
  "esp",
  "mg",
  "tca",
  "tec",
  "bioq",
  "farm",
  "med",
  "dr(a)",
  "senor",
  "senora",
  "agente",
  "agentes",
  "doctor",
  "doctora",
  "licenciado",
  "licenciada",
  "profesional",
  "y",
  "ministro",
  "ministra",
  "contador",
  "contadora",
  "escribano",
  "escribana",
  "personal",
  "martillero",
  "martillera",
  "publico",
  "publica",
  "bioing",
  "cr",
  "cra",
]);

const PARTICLES = new Set(["de", "del", "la", "las", "los", "da", "di", "van", "von", "y"]);

const ID_ANCHOR =
  /,?\s*(?:clase\s+\d{4}\s*,?\s*)?(?:Legajo\s*\/\s*)?(?:D\.?\s?N\.?\s?I\.?|C\.?\s?U\.?\s?I\.?\s?[LT]\.?|C\.?\s?U\.?\s?I\.?)\s*(?:N\s*[º°o]?\.?)?\s*:?\s*\d/gi;

function isTitle(token: string): boolean {
  const bare = token.replace(/[,;:]+$/g, "");
  // "DE", "MED" en mayúsculas y sin punto son apellidos; "BIOING." o "C.P.N." con punto son títulos.
  if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(bare)) return false;
  const k = fold(bare).toLowerCase().replace(/\./g, "");
  return TITLE_WORDS.has(k);
}

/** Toma el nombre que termina justo antes de `prefix` (la parte del texto previa a un DNI/CUIL). */
export function nameBefore(prefix: string): string {
  const tokens = squash(prefix.replace(/[,;]\s*$/, ""))
    .split(" ")
    .map((t) => t.replace(/^[-–•*]+/, ""))
    .filter(Boolean);
  const isCaps = (t: string) => /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'’.-]*,?$/.test(t);
  const last = (tokens.at(-1) ?? "").replace(/[,;:]+$/g, "");
  // Nombre en mayúsculas ("CALLAEY, MARIO ALBERTO"): se corta en la primera palabra en minúsculas (el cargo que lo precede).
  // Nombre en mixto ("Rauss, Nicolás Yves"): se acepta cualquier palabra capitalizada.
  const capsMode = isCaps(last);
  const out: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && out.length < 8; i--) {
    const tk = tokens[i]!;
    const bare = tk.replace(/[,;:]+$/g, "");
    if (isTitle(bare)) break;
    const capital = /^[A-ZÁÉÍÓÚÑÜ][\wÁÉÍÓÚÑÜáéíóúñü'’\-.]*$/.test(bare);
    const particle = PARTICLES.has(fold(bare).toLowerCase());
    if (!capital && !particle) break;
    if (capsMode && capital && !isCaps(tk)) break;
    if (particle && out.length === 0) break;
    out.unshift(tk);
    if (i > 0 && /[;:]$/.test(tokens[i - 1]!)) break;
  }
  // Un nombre no empieza con partícula suelta.
  while (out.length && PARTICLES.has(fold(out[0]!).toLowerCase().replace(/[,]+$/g, "")) && out.length > 2) out.shift();
  const name = out
    .join(" ")
    .replace(/[,;:]+$/g, "")
    .replace(/\s+,/g, ",");
  return validName(name) ? name.toUpperCase() : "";
}

function validName(name: string): boolean {
  if (!name || /\d/.test(name)) return false;
  const words = name.split(/[\s,]+/).filter(Boolean);
  return words.length >= 2 && name.length >= 5 && name.length <= 80;
}

/** Personas que aparecen con un DNI/CUIL en una línea: [{name, after}] con el texto que sigue a cada una. */
export function peopleInLine(line: string): { name: string; after: string; before: string }[] {
  const anchors = [...line.matchAll(ID_ANCHOR)];
  const res: { name: string; after: string; before: string }[] = [];
  let last = 0;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    const prefix = line.slice(last, a.index);
    const name = nameBefore(prefix);
    const numberStart = a.index! + a[0].length - 1; // el ancla termina en el primer dígito
    const nextStart = i + 1 < anchors.length ? anchors[i + 1]!.index! : line.length;
    const afterRaw = line.slice(numberStart, nextStart);
    const afterNumber = afterRaw.replace(/^[\d.\-\s/]+/, "");
    last = numberStart + (afterRaw.length - afterNumber.length);
    const after = afterNumber.replace(/^[,;.\s]+/, "");
    if (name) {
      // `before` es lo que precede al nombre (donde suele estar el cargo: "como interventor al Sr.").
      const at = prefix.toUpperCase().lastIndexOf((name.split(" ")[0] ?? "").replace(/,$/, ""));
      res.push({ name, after, before: at > 0 ? prefix.slice(0, at) : "" });
    } else if (res.length) {
      // Segundo identificador de la misma persona (DNI y después CUIL): su texto es continuación.
      res.at(-1)!.after += ` ${after}`;
    }
  }
  return res;
}

// ---------------------------------------------------------------- cargo y repartición

/** Dónde termina la descripción de un cargo dentro de una oración. */
const CARGO_CUT = new RegExp(
  [
    ";",
    "\\.\\s+(?=[A-ZÁÉÍÓÚ][a-záéíóú]{2})",
    "\\.$",
    ",?\\s+(?:por haber|con motivo|conforme|en cumplimiento|quien\\b|quienes\\b|e incorp[oó]rese|y autor[ií]cese|y aut[oó]rizase|dependiente|a partir)",
    ",\\s*(?:de la JURISDICCI|Unidad Organizativa|U\\.?\\s?O\\.?|Car[aá]cter|Jurisdicci|JURISDICCI|la afectaci|el cual|la cual|con funciones|en la dependencia)",
    ",?\\s*en representaci[oó]n",
    ",\\s*(?:del?|de la)\\s*[-–—]?\\s*(?:Direcci|Ministerio|Secretar|Subsecretar|Hospital)",
    ",?\\s+que\\s+(?:establece|determina)",
    ",\\s*en el marco",
    ",?\\s+de la Unidad Organizativa",
    "\\s+y la subrogancia",
    ",\\s*en (?:la|el)\\s+(?:Orquesta|Direcci|dependencia)",
  ].join("|"),
  "i",
);

function trimTitleTail(s: string): string {
  return s
    .replace(/,?\s+(?:al|a la|a los|a las|del|de la)\s*(?:se[ñn]or[a]?|Sr\.?|Sra\.?|Dr\.?|Dra\.?|Lic\.?|Licenciad[oa])?\s*$/i, "")
    .trim();
}

/** Cargo que sigue al nombre (o al verbo): "en el cargo de X", "al cargo X", "como X", "las funciones de X". */
export function cargoFrom(text: string, opts: { quoted?: boolean; lastCargo?: boolean } = {}): string {
  const t = squash(text);
  let rest = "";
  if (opts.lastCargo) {
    const all = [...t.matchAll(/\ben el cargo\s+(?:de\s+)?/gi)];
    const last = all.at(-1);
    if (last) rest = t.slice(last.index! + last[0].length);
  }
  if (opts.lastCargo && !rest) return "";
  if (!rest) {
    const m =
      /(?:en el cargo|al cargo|en el puesto)\s+(?:de\s+|efectivo\s+|que se consigna\s*)?(.+)/i.exec(t) ??
      /\bcargo\s+(?!que se)(.+)/i.exec(t) ??
      /(?:en car[aá]cter de|como)\s+(.+)/i.exec(t);
    if (m) rest = m[1]!;
  }
  if (rest) {
    // Los códigos presupuestarios llevan puntos ("Cód. 01-2-00-04") que cortarían la oración: se sacan antes.
    rest = rest.replace(/\bC[oó]d(?:igo|\.)?(?:\s+Escalafonario)?\s*:?\s*[\d-]+/gi, "");
    const idx = rest.search(CARGO_CUT);
    if (idx > 0) rest = rest.slice(0, idx);
    const cleaned = cleanCargo(trimTitleTail(rest));
    if (cleaned) return cleaned.slice(0, 160);
  }
  if (opts.quoted) {
    const q = /[“"]([^”"]{3,80})[”"]/.exec(t);
    if (q) return cleanCargo(q[1]!).slice(0, 160);
  }
  return "";
}

/** Cargo de una asignación de funciones: "las funciones inherentes al cargo X", "las funciones de X". */
function functionsCargo(text: string): string {
  const t = squash(text);
  const m =
    /\bfunciones\s+(?:inherentes\s+al\s+cargo\s+(?:de\s+)?|del\s+cargo\s+(?:de\s+)?|de(?:l)?\s+cargo\s+(?:de\s+)?|de\s+(?:la\s+)?|del\s+)(.+)/i.exec(
      t,
    );
  if (!m) return "";
  let rest = m[1]!.replace(/\bC[oó]d(?:igo|\.)?(?:\s+Escalafonario)?\s*:?\s*[\d-]+/gi, "");
  const idx = rest.search(new RegExp(`${CARGO_CUT.source}|,\\s*de\\s+Clase|,\\s*(?:a|al)\\s`, "i"));
  if (idx > 0) rest = rest.slice(0, idx);
  return cleanCargo(rest).slice(0, 160);
}

/** Repartición en una frase: "U.O. 06 - Dirección X", "UNIDAD ORGANIZATIVA 02- Dirección Y", "del Ministerio Z". */
export function reparticionFrom(text: string): string {
  const t = squash(text);
  const uo =
    /\b(?:U\.?\s?O\.?|UNIDAD ORGANIZATIVA)\s*:?\s*\d+\s*[-–—]\s*([^,;.]+?)(?:,|;|\s+dependiente|\s+del Ministerio|\s+de la Subsecretar[ií]a|$)/i.exec(
      t,
    );
  if (uo) {
    const name = cleanCargo(uo[1]!);
    if (!/^Ministerio$/i.test(name)) return name;
    const j = /JURISDICCI[OÓ]N\s*\d+\s*[-–—]\s*([^,;]+)/i.exec(t);
    if (j) return cleanCargo(j[1]!);
  }
  const dep =
    /\b(?:del|de la|en la|en el)\s+((?:Ministerio|Direcci[oó]n|Secretar[ií]a|Subsecretar[ií]a|Hospital|Orquesta|Registro|Instituto|Fiscal[ií]a|Poder|Polic[ií]a)[^,;.]*)/i.exec(
      t,
    );
  if (dep) return cleanCargo(dep[1]!);
  const j = /Jurisdicci[oó]n\s*\d+\s*[-–—]\s*((?:Ministerio|Secretar[ií]a|Poder|Fiscal[ií]a)[^,;.]*)/i.exec(t);
  if (j) return cleanCargo(j[1]!);
  return "";
}

// ---------------------------------------------------------------- extracción

const TABLE_HEADER = /APELLIDOS?\s+Y\s+NOMBRES?/i;
const TABLE_SKIP = /^(CLASE|D\.?N\.?I\.?|N[º°]|APELLIDOS?\b.*|NOMBRES?|DOCUMENTO)$/i;

function tablePeople(lines: string[]): string[] {
  const start = lines.findIndex((l) => TABLE_HEADER.test(l));
  if (start < 0) return [];
  const names: string[] = [];
  for (const raw of lines.slice(start + 1)) {
    const l = raw.trim();
    if (!l || /^[\d.\s]+$/.test(l) || TABLE_SKIP.test(l)) continue;
    if (/^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'’.\- ,]+$/.test(l) && l.length >= 5 && l.length <= 80 && /[ ,]/.test(l)) {
      names.push(l.replace(/[,\s]+$/, ""));
    }
  }
  return names;
}

const CATEGORY_LINE = /^(CATEGOR[IÍ]A|CLASE|Clase)\b/;
const SKIP_CONTEXT = /^(JURISDICCI[OÓ]N|CAR[AÁ]CTER)\b/i;
const UO_ONLY = /^UNIDAD ORGANIZATIVA\s*\d+\s*$/i;

/** Extrae las filas (una por persona) de un artículo ya clasificado. */
export function extractFromArticle(kind: Kind, body: string, fallbackYear: string, normDate: string): Act[] {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const acts: Act[] = [];
  const start = (txt: string) => {
    const d = findStartDate(txt, fallbackYear, kind.accion !== "cese");
    if (d) return d;
    if (normDate && kind.accion !== "cese" && /a partir de la (?:fecha|emisi[oó]n)/i.test(txt)) return normDate;
    return "";
  };
  const articleDate = start(squash(body));
  const push = (persona: string, cargo: string, reparticion: string) => {
    if (!persona) return;
    acts.push({ accion: kind.accion, modalidad: kind.modalidad, persona, cargo, reparticion, desde: articleDate, articulo: "" });
  };

  // Encargo de cartera o de despacho: "Encárguese interinamente la Cartera del Ministerio de X ... al Señor Ministro de Y, NOMBRE."
  if (kind.modalidad === "encargo_cartera") {
    const t = squash(body);
    const org = /(?:Cartera|despacho)\s+del\s+(Ministerio de .+?),?\s+(?:a partir|mientras)/i.exec(t);
    const who =
      /\bal\s+(?:se[ñn]or\s+|Sr\.?\s+)?(Ministro\b.*?)[,\s]+(?:(?:Lic|LIC|Abg|ABG|Dr|Dra|Ing|Cdor|C\.P\.N|Mgtr|Prof)\.?\s+)*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ'’ ]+[A-ZÁÉÍÓÚÑ])\.?\s*$/s.exec(
        t,
      );
    if (org && who) {
      push(
        who[2]!.trim(),
        `${who[1]!.trim()} (a cargo interino de ${org[1]!.replace(/^Ministerio de /, "la cartera de ")})`,
        org[1]!.trim(),
      );
    }
    return acts;
  }

  // Martillero designado para un remate (sin DNI en el texto).
  const auctioneer = /^Des[ií]gn[eé]se\s+a\s+(?:la|el)\s+Martiller[oa]\s+P[uú]blic[oa]\s+(.+?),\s*matr[ií]cula/i.exec(squash(first));
  if (auctioneer && validName(auctioneer[1]!.trim())) {
    push(auctioneer[1]!.trim().toUpperCase(), "Martillero/a público/a (remate)", "");
    return acts;
  }

  // 1) Tabla "APELLIDOS Y NOMBRES".
  if (TABLE_HEADER.test(body)) {
    const cargo = cargoFrom(first);
    for (const n of tablePeople(lines)) push(n.toUpperCase(), cargo, reparticionFrom(first));
    return acts;
  }

  // 2) Personas en la propia línea del verbo (formato en una oración).
  const inline = peopleInLine(first);
  if (inline.length) {
    const sharedCargo = cargoFrom(inline[0]!.before);
    for (const p of inline) {
      let cargo: string;
      let rep = reparticionFrom(p.after);
      if (kind.modalidad === "subrogancia") {
        // "...a la agente X, CUIL, cargo Clase 003 (el actual), ..., en el cargo Clase 011 - Jefe de Departamento": el
        // que importa es el último; si no está, el de "las funciones inherentes al cargo ...".
        const target = functionsCargo(first) || cargoFrom(p.after, { lastCargo: true });
        cargo = target ? `Funciones de ${target}` : "";
        rep = reparticionFrom(first) || rep;
      } else if (kind.modalidad === "fin_de_funciones" || kind.modalidad === "afectacion") {
        cargo = functionsCargo(first) || cargoFrom(p.before) || cargoFrom(p.after);
        rep = reparticionFrom(p.after);
      } else {
        cargo = cargoFrom(p.after, { quoted: true }) || sharedCargo;
        if (!cargo && kind.modalidad === "convocatoria_retirado") {
          const r = /servicio efectivo\s+(?:al|a la)\s+(.+?)\s+[-–—]/i.exec(squash(first));
          if (r) cargo = cleanCargo(r[1]!);
        }
        if (!cargo && kind.accion === "renuncia") {
          const cl = /^(Clase\s+\d+[^;.]*)/i.exec(p.after);
          if (cl) cargo = cleanCargo(cl[1]!.split(/,\s*C[oó]digo/i)[0]!);
        }
        if (kind.accion === "cese") cargo = cargoFrom(p.after);
        if (!rep && inline.length === 1) rep = reparticionFrom(p.after);
      }
      push(p.name, cargo, rep);
    }
    return acts;
  }

  // 3) Bloque: el verbo dice "a la persona que a continuación se menciona" y los datos vienen en líneas siguientes.
  let cargoCtx = "";
  let repCtx = "";
  let specialty = "";
  const verbCargo = kind.modalidad === "subrogancia" ? functionsCargo(first) : "";
  const verbGeneric = kind.accion === "designa" ? cargoFrom(first) : "";
  for (const l of lines.slice(1)) {
    const people = peopleInLine(l);
    if (people.length) {
      for (const p of people) {
        let cargo = cargoCtx;
        if (specialty) cargo = cargo ? `${cargo} (${specialty})` : specialty;
        if (verbCargo) cargo = `Funciones de ${verbCargo}`;
        if (!cargo) cargo = verbGeneric;
        push(p.name, cargo, repCtx);
      }
      continue;
    }
    if (SKIP_CONTEXT.test(l)) {
      cargoCtx = "";
      repCtx = "";
      specialty = "";
    } else if (/^ESPECIALIDAD\b/i.test(l)) specialty = squash(l.replace(/^ESPECIALIDAD\s*/i, "")).toLowerCase();
    else if (CATEGORY_LINE.test(l)) cargoCtx = cleanCargo(l);
    else if (UO_ONLY.test(l)) continue;
    else if (/^[A-ZÁÉÍÓÚÑ“”"'’().\-–— \d]+$/.test(l) && l.length > 5) {
      repCtx = redact(l.replace(/\s*[-–—]\s*UNIDAD ORGANIZATIVA\s*\d+/i, "")).replace(/[“”"]/g, "");
    }
  }
  return acts;
}

// ---------------------------------------------------------------- por norma

export function parseNorm(text: string, info: Pick<NormInfo, "fecha">): ParseResult {
  const articles = splitArticles(text);
  const nDate = headerDate(text);
  const year = (nDate || info.fecha).slice(0, 4);
  const acts: Act[] = [];
  let discarded = 0;
  // Fecha de vigencia general de la norma ("Lo dispuesto en el presente decreto rige a partir del ...").
  let normStart = "";
  for (const a of articles) {
    if (/\brige\s+a\s+partir\s+del/i.test(a.body.slice(0, 200))) {
      normStart = findStartDate(a.body, year);
      if (normStart) break;
    }
  }
  for (const art of articles) {
    const kind = classifyArticle(art.body);
    if (!kind) continue;
    const found = extractFromArticle(kind, art.body, year, nDate);
    if (!found.length) {
      discarded++;
      continue;
    }
    for (const f of found) {
      const row = { ...f, articulo: art.number };
      if (!row.desde && kind.accion !== "cese" && normStart) row.desde = normStart;
      row.persona = row.persona.slice(0, 100);
      row.cargo = redact(row.cargo);
      row.reparticion = redact(row.reparticion);
      acts.push(row);
    }
  }
  // Una misma persona en un mismo artículo con el mismo acto: una sola fila.
  const seen = new Set<string>();
  return {
    acts: acts.filter((a) => {
      const k = `${a.articulo}|${a.accion}|${a.persona}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    discarded,
  };
}

// ---------------------------------------------------------------- corrida

const META = {
  titulo: "Designaciones, renuncias y otros actos de personal",
  descripcion:
    "Cada fila es una persona en un acto de personal (designación, renuncia aceptada, cese u otro) publicado en un decreto o resolución del Boletín Oficial de Mendoza. Se extrae leyendo el texto de la norma con reglas automáticas: puede tener errores y solo cubre las normas con texto completo bajado (no todas las del Boletín). Se publican nombre y cargo; nunca DNI, CUIL, domicilio ni fecha de nacimiento.",
  columnas: {
    fecha_boletin: { etiqueta: "Publicada", tipo: "fecha", descripcion: "Fecha de la edición del Boletín Oficial en que salió la norma." },
    norma_id: { oculta: true },
    tipo_norma: {
      etiqueta: "Tipo",
      tipo: "texto",
      valores: {
        decreto: "Decreto",
        resolucion: "Resolución",
        "decretos municipales": "Decreto municipal",
        "resoluciones municipales": "Resolución municipal",
      },
    },
    numero_norma: { etiqueta: "N.º", tipo: "texto" },
    organismo_emisor: { etiqueta: "Organismo", tipo: "texto", descripcion: "Organismo que dictó la norma." },
    accion: {
      etiqueta: "Acto",
      tipo: "texto",
      valores: { designa: "Designación", renuncia: "Renuncia aceptada", cese: "Cese o sanción", otro: "Otro (subrogancia, encargo)" },
      descripcion: "Qué dispone la norma sobre esta persona.",
    },
    modalidad: {
      etiqueta: "Modalidad",
      tipo: "texto",
      valores: {
        interina: "Interina",
        concurso: "Por concurso",
        efectiva: "Efectiva o de planta",
        ad_honorem: "Ad honorem",
        transitoria: "Transitoria",
        jubilacion: "Por jubilación o retiro",
        razones_particulares: "Por razones particulares",
        cesantia: "Cesantía",
        exoneracion: "Exoneración",
        subrogancia: "Subrogancia (funciones de un cargo superior)",
        encargo_cartera: "Encargo interino de una cartera",
        continuidad: "Continuidad de una designación",
        fin_de_funciones: "Se deja sin efecto una asignación de funciones",
        afectacion: "Afectación a cumplir funciones",
        convocatoria_retirado: "Convocatoria de personal retirado",
      },
    },
    persona: { etiqueta: "Persona", tipo: "texto", descripcion: "Nombre tal como figura en la norma. No se publican documento ni CUIL." },
    cargo: { etiqueta: "Cargo", tipo: "texto", descripcion: "Cargo o función según la norma, sin códigos presupuestarios." },
    reparticion: { etiqueta: "Repartición", tipo: "texto", descripcion: "Dependencia donde se desempeña, cuando el texto la dice." },
    desde: { etiqueta: "Desde", tipo: "fecha", descripcion: "Fecha desde la que rige el acto, si la norma la indica." },
    articulo: { etiqueta: "Artículo", tipo: "texto", descripcion: "Artículo de la norma donde está el acto." },
    url_pdf: { etiqueta: "Texto original", tipo: "url", descripcion: "PDF publicado en el Boletín Oficial." },
  },
  orden: [
    "fecha_boletin",
    "accion",
    "persona",
    "cargo",
    "reparticion",
    "organismo_emisor",
    "desde",
    "modalidad",
    "tipo_norma",
    "numero_norma",
    "articulo",
    "url_pdf",
  ],
};

export async function run(_args: string[]) {
  const norms = await readProcessed(BOE, "normas.csv");
  if (!norms.length) {
    console.log("::warning title=designaciones::No hay normas.csv del Boletín Oficial; se conserva el CSV anterior.");
    return;
  }
  const rows: Row[] = [];
  let withText = 0;
  let discarded = 0;
  const dates = new Set<string>();
  for (const n of norms) {
    const tipo = String(n.tipo);
    if (!NORM_TYPES.has(tipo)) continue;
    const path = join(PROCESSED_DIR, BOE, "textos", String(n.fecha), `${n.norma_id}.txt`);
    if (!existsSync(path)) continue;
    withText++;
    dates.add(String(n.fecha));
    const text = await readFile(path, "utf8");
    const res = parseNorm(text, { fecha: String(n.fecha) });
    discarded += res.discarded;
    for (const a of res.acts) {
      rows.push({
        fecha_boletin: n.fecha,
        norma_id: n.norma_id,
        tipo_norma: tipo,
        numero_norma: n.numero,
        organismo_emisor: n.organismo,
        accion: a.accion,
        modalidad: a.modalidad,
        persona: a.persona,
        cargo: a.cargo,
        reparticion: a.reparticion,
        desde: a.desde,
        articulo: a.articulo,
        url_pdf: n.url_pdf,
      });
    }
  }
  rows.sort(
    (a, b) =>
      String(b.fecha_boletin).localeCompare(String(a.fecha_boletin)) ||
      String(a.norma_id).localeCompare(String(b.norma_id)) ||
      Number(a.articulo) - Number(b.articulo),
  );
  await writeProcessed(SOURCE, "designaciones.csv", rows, COLUMNS);
  await writeFile(join(PROCESSED_DIR, SOURCE, "designaciones.meta.json"), `${JSON.stringify(META, null, 2)}\n`);

  const byAction: Record<string, number> = {};
  for (const r of rows) byAction[String(r.accion)] = (byAction[String(r.accion)] ?? 0) + 1;
  const sorted = [...dates].sort();
  console.log(
    `designaciones: ${rows.length} filas de ${withText} normas con texto (${sorted[0] ?? "-"} a ${sorted.at(-1) ?? "-"}, ${sorted.length} días); ` +
      `por acto ${JSON.stringify(byAction)}; ${discarded} artículos descartados sin persona identificable.`,
  );
}
