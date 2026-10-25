/**
 * Escrutinios definitivos de la H. Junta Electoral de Mendoza.
 *
 * Uso: `bun run scrape escrutinios-definitivos`
 *
 * Salida (data/processed/escrutinios-definitivos/), con el esquema común de votación (tmp/agentes/votacion-esquema.md):
 *  - resultados.csv     Una fila por (elección, cargo, unidad geográfica, opción): cada lista, los votos en blanco y los nulos.
 *  - participacion.csv  Una fila por (elección, cargo, unidad geográfica): mesas, electores y votantes.
 *
 * Fuente: PDF del escrutinio definitivo que publica el Poder Judicial
 * (https://jusmendoza.gob.ar/escrutinios-definitivos-elecciones-generales-de-mendoza/, la página de los municipios que
 * desdoblaron en 2023 y la noticia con los recuentos municipales de febrero de 2026). Son resúmenes con capa de texto
 * (algunos escaneados con OCR), así que el parser es estricto: si una suma de listas no da los votos positivos, si
 * positivos + nulos + blancos no da los votantes, si un porcentaje impreso difiere del calculado o si los
 * departamentos no suman lo que imprime la provincia, corta con un error y no escribe nada.
 *
 * Reglas:
 *  - Cada corrección de OCR está en OCR_FIXES, con el motivo, y se imprime cuando se aplica.
 *  - Los porcentajes no se guardan: solo sirven para validar. Si el OCR dejó un porcentaje ilegible, se omite esa
 *    comprobación (se cuenta en el resumen); las sumas de votos nunca se omiten.
 *  - Los niveles son los que imprime cada PDF: provincia, sección y departamento. No se calculan totales que el PDF no trae.
 *  - Intendente y concejales incluyen extranjeros en el padrón, y eso figura en su propia fila de participación.
 *  - Lo que no se lee (el escrutinio definitivo de 2025 y la PASO provincial de gobernador, cuyo texto salió ilegible) se avisa
 *    en el resumen y no se publica.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { archive, collapseSpaces, fetchOrReuse, get, normalizeMunicipio, PROCESSED_DIR, type Row, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
import { pdfPages } from "../lib/pdf.ts";

const ID = "escrutinios-definitivos";
const SITE = "https://jusmendoza.gob.ar";

// ---------------------------------------------------------------------------
// Dónde buscar
// ---------------------------------------------------------------------------

interface Listing {
  url: string;
  file: string;
  /** Solo para PDF sin fecha en el nombre (los recuentos de 2026): la jornada de la que hablan. */
  election?: string;
  /** Solo se toman los PDF cuya URL cumple esto. */
  only?: RegExp;
}

const LISTINGS: Listing[] = [
  { url: `${SITE}/escrutinios-definitivos-elecciones-generales-de-mendoza/`, file: "listado-generales-y-paso-2023.html" },
  {
    url: `${SITE}/escrutinios-definitivos-%c2%b7-elecciones-municipales-%c2%b7-provincia-de-mendoza/`,
    file: "listado-municipales-2023.html",
  },
  {
    url: `${SITE}/concluyo-el-recuento-definitivo-de-los-votos-de-la-eleccion-en-los-6-municipios/`,
    file: "noticia-municipales-2026.html",
    election: "2026-02-22",
    only: /\/2026\/02\//,
  },
];
/** Página de la Junta: se mira para avisar si aparece un escrutinio que todavía no se lee. */
const JUNTA_URL = `${SITE}/junta-electoral-de-mendoza/`;

type ElectionType = "paso" | "general" | "municipal";
/** Tipo de cada jornada. Una fecha que no esté acá corta el parser: hay que mirarla y clasificarla a mano. */
const ELECTIONS: Record<string, ElectionType> = {
  "2023-04-30": "municipal", // PASO municipales de los 7 municipios que desdoblaron
  "2023-06-11": "paso",
  "2023-09-03": "municipal", // generales municipales de esos 7 municipios
  "2023-09-24": "general",
  "2026-02-22": "municipal", // concejales (y convencionales en San Rafael) de 6 municipios
};

/** PDF que se conocen y todavía no se leen, con el motivo. No se archivan. */
const UNREAD: { match: RegExp; why: string }[] = [
  {
    match: /Escrutinio-definitivo-2025/i,
    why: "52 páginas, de las cuales unas 20 son imágenes sin texto y las demás traen números con errores de OCR; hace falta un OCR propio",
  },
];
/** PDF que se archivan pero cuyo texto es ilegible. */
const UNREADABLE: { file: string; why: string }[] = [
  {
    file: "Escrutinio-Definitivo-11-06-2023-Gobernador.pdf",
    why: "la capa de texto del PDF está rotada y sale como letras sueltas; el gobernador de la PASO sí se lee en cada departamento",
  },
];

/** Páginas donde el OCR perdió una cifra y no hay forma de saberla: se publica el resto de la página y se avisa. */
const UNREADABLE_COUNTS: { file: RegExp; page: number; fields: ("nulos" | "blancos")[]; why: string }[] = [
  {
    file: /11-06-2023-Guaymallen/,
    page: 3,
    fields: ["nulos", "blancos"],
    why: "el PDF solo deja ver los porcentajes (7,09 % y 12,71 %), y con dos incógnitas no alcanza para reconstruir los votos; positivos y listas sí se leen y cierran",
  },
];

/** Departamento → código que imprime el PDF antes del nombre («01-Capital»). */
const DEPT_CODES: Record<string, string> = {
  Capital: "01",
  "Godoy Cruz": "02",
  Guaymallén: "03",
  "Las Heras": "04",
  Lavalle: "05",
  Maipú: "06",
  "Luján de Cuyo": "07",
  Tupungato: "08",
  "San Martín": "09",
  Junín: "10",
  Rivadavia: "11",
  Tunuyán: "12",
  "San Carlos": "13",
  "Santa Rosa": "14",
  "La Paz": "15",
  "San Rafael": "16",
  Malargüe: "17",
  "General Alvear": "18",
};

/** Siglas de la tabla por sección (solo imprime estas). Se verifican contra el número de lista. */
const ACRONYMS: Record<string, string> = { LUM: "504", CM: "501", FIT: "503", EM: "502", PV: "181" };

/** Agrupaciones de la PASO provincial: el PDF las parte entre columnas y el OCR las rompe, así que se fijan y se verifica el encabezado. */
const PASO_PROVINCIAL_NAMES: Record<string, string> = {
  "181": "PARTIDO VERDE",
  "501": "CAMBIA MENDOZA",
  "502": "ELEGÍ MENDOZA",
  "503": "FRENTE DE IZQUIERDA Y TRABAJADORES - UNIDAD",
  "504": "LA UNION MENDOCINA",
};

// ---------------------------------------------------------------------------
// Correcciones de OCR (todas con motivo, todas se imprimen al aplicarse)
// ---------------------------------------------------------------------------

interface OcrFix {
  file: RegExp;
  from: string | RegExp;
  to: string;
  why: string;
}

const OCR_FIXES: OcrFix[] = [
  {
    file: /03-09-2023-Municipales-La-Paz/,
    from: /\n29 100[ \t]*\n/,
    to: "\n29 29 100\n",
    why: "el OCR perdió la cifra de mesas habilitadas; la otra página del mismo PDF dice «29 29 100»",
  },
  {
    file: /03-09-2023-Municipales-La-Paz/,
    from: /\n7911 83,87[ \t]*\n/,
    to: "\n9432 7911 83,87\n",
    why: "el OCR perdió la cifra de electores del intendente; el padrón es el mismo que en los concejales de la página siguiente (9432), y 7911 / 9432 es 83,87 %",
  },
  {
    file: /03-09-2023-Municipales-San-Carlos/,
    from: "VOTOS NULOS 1 661",
    to: "VOTOS NULOS 661",
    why: "el «1» suelto es una mancha del escaneo: con 661 nulos, positivos + nulos + blancos da los votantes",
  },
  {
    file: /24-09-2023-Junin/,
    from: "POSITIVOS ,/ 1 20596",
    to: "POSITIVOS 20596",
    why: "«,/ 1» son manchas del escaneo: con 20596 la suma de las listas da los positivos y positivos + nulos + blancos da los votantes",
  },
  { file: /24-09-2023-Lujan-de-Cuyo/, from: "coNCEJALE$", to: "CONCEJALES", why: "OCR leyó «S» como «$» y «C», «O» en minúscula" },
  {
    file: /24-09-2023-Malargue/,
    from: /\(CAMIOLO,\s+1674 9144 10121\s+S\|Ivma\)/,
    to: "(CAMIOLO, Silvia) 1674 9,44 10,21",
    why: "columnas cruzadas: los números quedaron en medio del nombre del candidato; «S|Ivma» es «Silvia» y «9144 10121» son 9,44 y 10,21 (1674 / 17738 y 1674 / 16403)",
  },
  {
    file: /03-09-2023-Municipales-Lavalle/,
    from: /FRENTE LIBERTARIO DEMÓCRATA Y 2622 11 13 11 66\s+JUBILADOS \(TORRECILLA, BETINA ESTHER\)/,
    to: "FRENTE LIBERTARIO DEMÓCRATA Y JUBILADOS (TORRECILLA, BETINA ESTHER) 2622 11,13 11,66",
    why: "columnas cruzadas: los números quedaron en medio del nombre; «11 13 11 66» son 11,13 y 11,66 (2622 / 23551 y 2622 / 22485)",
  },
  { file: /24-09-2023-Guaymallen/, from: "ILARDO Lucasl 17385", to: "ILARDO Lucas) 17385", why: "OCR leyó «)» como «l»" },
  {
    file: /11-06-2023-General-Alvear/,
    from: "'ij;ºer501 A'AB ' Perez' Jºrge",
    to: "Lista 501 A-AB - Perez, Jorge",
    why: "fila ilegible: la interna A-AB de 501 figura así en la página de concejales del mismo PDF, y con ella la suma de las listas da los positivos",
  },
  {
    file: /11-06-2023-Godoy-Cruz/,
    from: /US\S\s+504 A_B 4497/,
    to: "Lista 504 A-B 4497",
    why: "etiqueta ilegible: la interna 504 A-B existe en el escrutinio del mismo departamento, y con ella la suma de las listas da los positivos",
  },
  {
    file: /11-06-2023-Las-Heras/,
    from: "Lima 502 º 5010 4=4 5'76",
    to: "Lista 502 C 5010 4,40 5,76",
    why: "fila ilegible: por descarte (A, B, C-F, D, E) es la interna C; 5010 / 113931 es 4,40 % y 5010 / 87041 es 5,76 %, y con ella cierran el subtotal de 502 (19532) y los positivos",
  },
  {
    file: /11-06-2023-Maipu/,
    from: "Lista 503 A 3750 3167 4.05",
    to: "Lista 503 A 3760 3,67 4,05",
    why: "dígito mal leído: el subtotal impreso de 503 es 5423 y la interna B tiene 1663, así que A tiene 3760 (3,67 % de 102458 y 4,05 % de 92914)",
  },
  {
    file: /11-06-2023-Malargue/,
    from: /L\S\s+502 C 3682/,
    to: "Lista 502 C 3682",
    why: "etiqueta ilegible: es la interna C de 502, como en la página de intendente",
  },
  {
    file: /11-06-2023-Malargue/,
    from: "US$ 504 A 1097",
    to: "Lista 504 A 1097",
    why: "etiqueta ilegible: es la interna A de 504, como en la página de intendente",
  },
  {
    file: /11-06-2023-Rivadavia/,
    from: "Lista 502 GE - Garrido",
    to: "Lista 502 C-E - Garrido",
    why: "OCR leyó «C-E» como «GE»: la página de concejales del mismo PDF trae la interna 502 C-E",
  },
  {
    file: /11-06-2023-Rivadavia/,
    from: "Lista 504 o - Lauria",
    to: "Lista 504 C - Lauria",
    why: "OCR leyó «C» como «o»: la página de concejales del mismo PDF trae la interna 504 C",
  },
  {
    file: /11-06-2023-Tupungato/,
    from: "BOS¡8, Antonina",
    to: "Bosio, Antonina",
    why: "apellido mal leído («BOS¡8»); es la lectura más probable y no cambia ningún número",
  },
  {
    file: /11-06-2023-Tupungato/,
    from: /\n85 100[ \t]*\n/,
    to: "\n85 85 100\n",
    why: "el OCR perdió la cifra de mesas habilitadas; la página anterior del mismo PDF dice «85 85 100»",
  },
  {
    file: /11-06-2023-Tupungato/,
    from: "VOTOS NULOS 4,72",
    to: "VOTOS NULOS 927 4,72",
    why: "el OCR perdió la cifra de nulos: votantes (19623) menos positivos (14603) y blancos (4093) da 927, que es 4,72 % de los votantes",
  },
  { file: /11-06-2023-General-Alvear/, from: "Claud|o", to: "Claudio", why: "OCR leyó «i» como «|»" },
  { file: /11-06-2023-General-Alvear/, from: "Jav¡er", to: "Javier", why: "OCR leyó «i» como «¡»" },
  {
    file: /11-06-2023-Godoy-Cruz/,
    from: "Guaqumchay, M|caela",
    to: "Guaquinchay, Micaela",
    why: "OCR leyó «in» como «um» y «i» como «|»; Guaquinchay es la lectura más probable del apellido",
  },
  { file: /11-06-2023-Malargue/, from: "M|ras, Gustavo", to: "Miras, Gustavo", why: "OCR leyó «i» como «|»" },
  { file: /./, from: "DE MARCH! Omar", to: "DE MARCHI Omar", why: "OCR leyó «I» como «!»; el resto de los PDF trae DE MARCHI" },
  { file: /./, from: "PARIS! Omar", to: "PARISI Omar", why: "OCR leyó «I» como «!»; el resto de los PDF trae PARISI" },
  { file: /./, from: "FUGAZZO'ITO", to: "FUGAZZOTTO", why: "OCR leyó «TT» como «'IT»" },
  { file: /./, from: "NoeIia", to: "Noelia", why: "OCR leyó «l» como «I»" },
  {
    file: /11-06-2023-Capital/,
    from: "Uceda. Gerardº",
    to: "Uceda, Gerardo",
    why: "OCR leyó «,» como «.» y «o» como «º»; la general trae UCEDA, Gerardo",
  },
  { file: /11-06-2023-Godoy-Cruz/, from: "Roman. Juan Ignacio", to: "Roman, Juan Ignacio", why: "OCR leyó «,» como «.»" },
  { file: /11-06-2023-Junin/, from: "PaoIa", to: "Paola", why: "OCR leyó «l» como «I»" },
  { file: /11-06-2023-Las-Heras/, from: "Videla. Edgardº", to: "Videla, Edgardo", why: "OCR leyó «,» como «.» y «o» como «º»" },
  { file: /11-06-2023-Rivadavia/, from: "Grageda, Elrzabeth", to: "Grageda, Elizabeth", why: "OCR leyó «i» como «r»" },
  {
    file: /11-06-2023/,
    from: "Dí Marco, Carlos",
    to: "Di Marco, Carlos",
    why: "tilde de más puesta por el OCR; en el mismo PDF figura «De Marco»/«Di Marco» sin tilde",
  },
  { file: /./, from: "IZQU!ERDA", to: "IZQUIERDA", why: "OCR leyó «I» como «!»" },
  { file: /./, from: "FUGAZZOTI'O", to: "FUGAZZOTTO", why: "OCR leyó «TT» como «TI'»" },
];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Cargo = "gobernador" | "senadores" | "diputados" | "intendente" | "concejales" | "convencionales";
type Level = "provincia" | "seccion" | "departamento";
type Mode = "list" | "paso-labeled" | "paso-free";

interface Doc {
  url: string;
  file: string;
  election: string;
  type: ElectionType;
  /** Departamento del PDF (norma oficial), o undefined si el PDF es provincial. */
  dept?: string;
  mode: Mode;
}

interface Option {
  tipo_voto: "positivo" | "blanco" | "nulo";
  agrupacion: string;
  lista: string;
  candidato: string;
  votos: number;
}

interface Unit {
  level: Level;
  section?: number;
  dept?: string;
}

interface Parsed {
  doc: Doc;
  page: number;
  cargo: Cargo;
  unit: Unit;
  habilitadas: number | null;
  escrutadas: number | null;
  electores: number | null;
  votantes: number | null;
  positivos: number;
  nulos: number | null;
  blancos: number | null;
  options: Option[];
}

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);
const stats = { pctChecked: 0, pctUnreadable: 0, rows: 0 };
/** En la PASO de junio el OCR cambia dígitos de los porcentajes: ahí un porcentaje distinto se avisa pero no corta (los votos se validan con sumas exactas). */
let softPct = false;
const softWarnings: string[] = [];
const pctProblem = (msg: string) => (softPct ? softWarnings.push(msg) : fail(msg));
const appliedFixes = new Set<OcrFix>();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const keyOf = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const int = (s: string) => Number.parseInt(s, 10);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Porcentaje impreso («46,19»), o null si el OCR lo dejó ilegible (otro formato). */
function pctOf(token: string | undefined): number | null {
  if (!token) return null;
  const m = /^(\d{1,3})[.,](\d{1,2})$/.exec(token);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

function checkPct(where: string, what: string, votes: number, base: number | null, token: string | undefined) {
  if (base === null || base === 0) return;
  const printed = pctOf(token);
  if (printed === null) {
    stats.pctUnreadable++;
    return;
  }
  stats.pctChecked++;
  const expected = round2((votes / base) * 100);
  if (Math.abs(printed - expected) > 0.0101) pctProblem(`${where}: ${what}: porcentaje impreso ${printed}, calculado ${expected}`);
}

/**
 * Los dos porcentajes de una fila (sobre el total de votos y sobre los positivos). Según la tabla vienen en un orden o en el
 * otro, así que se acepta cualquiera de los dos mientras cada uno legible coincida con uno de los valores calculados y no
 * coincidan los dos con el mismo.
 */
function checkPctPair(where: string, what: string, votes: number, total: number | null, positives: number, a?: string, b?: string) {
  if (total === null || total === 0 || positives === 0) return;
  const expected = [round2((votes / total) * 100), round2((votes / positives) * 100)];
  const printed = [pctOf(a), pctOf(b)];
  const ok = (x: number | null, i: number) => x === null || Math.abs(x - expected[i]!) <= 0.0101;
  for (const x of printed) {
    if (x === null) stats.pctUnreadable++;
    else stats.pctChecked++;
  }
  const direct = ok(printed[0]!, 0) && ok(printed[1]!, 1);
  const swapped = ok(printed[0]!, 1) && ok(printed[1]!, 0);
  if (!direct && !swapped)
    pctProblem(`${where}: ${what}: porcentajes impresos ${a ?? "?"} / ${b ?? "?"}, calculados ${expected[0]} / ${expected[1]}`);
}

/**
 * PASO provincial: el texto mezcla las columnas de la fila con las del subtotal, así que no se sabe qué token es cada porcentaje.
 * Se pide que al menos uno de los legibles coincida con alguno de los dos calculados.
 */
function checkPctAny(where: string, what: string, votes: number, total: number | null, positives: number, tokens: string[]) {
  if (total === null || total === 0 || positives === 0) return;
  const expected = [round2((votes / total) * 100), round2((votes / positives) * 100)];
  const readable = tokens.map(pctOf).filter((x): x is number => x !== null);
  stats.pctChecked += readable.length;
  if (readable.length >= 2 && !readable.some((x) => expected.some((e) => Math.abs(x - e) <= 0.0101)))
    pctProblem(`${where}: ${what}: porcentajes impresos ${tokens.join(" / ")}, calculados ${expected[0]} / ${expected[1]}`);
}

function applyFixes(text: string, file: string): string {
  let out = text;
  for (const fix of OCR_FIXES) {
    if (!fix.file.test(file)) continue;
    const before = out;
    out = typeof fix.from === "string" ? out.replaceAll(fix.from, fix.to) : out.replace(fix.from, fix.to);
    if (out !== before) {
      if (!appliedFixes.has(fix)) console.log(`  OCR: ${file}: ${fix.why}`);
      appliedFixes.add(fix);
    }
  }
  return out;
}

/** Limpia el nombre de una agrupación: espacios, guiones largos y la «·» del OCR. */
function tidyName(s: string): string {
  return collapseSpaces(s.replace(/\s*[—–]\s*/g, " - ").replace(/\s+-\s*$/, "")).replace(/\s*-\s*$/, "");
}

// ---------------------------------------------------------------------------
// Descubrimiento y descarga
// ---------------------------------------------------------------------------

async function pdfLinks(page: Listing): Promise<string[]> {
  const resp = await get(page.url);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  await archive(ID, page.file, bytes, { url: page.url });
  const $ = cheerio.load(new TextDecoder().decode(bytes));
  const out = new Set<string>();
  $("a").each((_, a) => {
    const href = $(a).attr("href");
    if (!href || !/\.pdf$/i.test(href)) return;
    const url = new URL(href, page.url).toString();
    if (page.only ? page.only.test(url) : /Escrutinio-Definitivo-/i.test(url)) out.add(url);
  });
  return [...out];
}

function classify(url: string, listing: Listing): Doc | null {
  const file = decodeURIComponent(url.split("/").pop()!);
  const named = /^Escrutinio-Definitivo-(\d{2})-(\d{2})-(\d{4})-(.+)\.pdf$/i.exec(file);
  let election: string;
  let rest: string;
  if (named) {
    election = `${named[3]}-${named[2]}-${named[1]}`;
    rest = named[4]!;
  } else if (listing.election) {
    election = listing.election;
    rest = file.replace(/\.pdf$/i, "");
  } else {
    fail(`PDF con un nombre que no se reconoce: ${file}`);
    return null;
  }
  const type = ELECTIONS[election];
  if (!type) {
    fail(`Jornada ${election} sin clasificar (${file}): agregarla a ELECTIONS después de mirarla`);
    return null;
  }
  const municipal = /^Municipales-(.+)$/i.exec(rest);
  const deptName = municipal ? municipal[1]! : rest;
  const dept = normalizeMunicipio(deptName.replaceAll("-", " "));
  if (dept) return { url, file, election, type, dept, mode: modeOf(election, type) };
  if (/^(Gobernador-·-Senador-·-Diputados|Por-Seccion-Electoral)$/i.test(rest)) return { url, file, election, type, mode: "list" };
  if (/^Senadores-y-Diputados$/i.test(rest)) return { url, file, election, type, mode: "paso-free" };
  if (/^Gobernador$/i.test(rest)) return { url, file, election, type, mode: "paso-free" };
  fail(`PDF que no se sabe a qué corresponde: ${file}`);
  return null;
}

const modeOf = (election: string, type: ElectionType): Mode =>
  type === "paso" ? "paso-free" : election === "2023-04-30" ? "paso-labeled" : "list";

// ---------------------------------------------------------------------------
// Parser de una página
// ---------------------------------------------------------------------------

const CARGO_RE =
  /^(GOBERNADOR|SENADOR(?:ES)?(?: PROVINCIAL)?|DIPUTADOS?(?: PROVINCIAL)?|INTENDENTE|CONCEJAL(?:ES)?|CONVENCIONAL(?:ES)?(?: MUNICIPAL(?:ES)?)?)\s*$/i;

function cargoOf(text: string): Cargo {
  const t = text.toUpperCase();
  if (t.startsWith("GOBERNADOR")) return "gobernador";
  if (t.startsWith("SENADOR")) return "senadores";
  if (t.startsWith("DIPUTADO")) return "diputados";
  if (t.startsWith("INTENDENTE")) return "intendente";
  if (t.startsWith("CONCEJAL")) return "concejales";
  return "convencionales";
}

const ORDINALS: Record<string, number> = { primera: 1, segunda: 2, tercera: 3, cuarta: 4 };

function pageLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => collapseSpaces(l))
    .filter(Boolean);
}

interface Header {
  cargo: Cargo | null;
  code: string | null;
  codeName: string | null;
  section: number | null;
}

function parseHeader(lines: string[]): Header {
  const head = lines.slice(0, 14);
  const cargoLine = head.find((l) => CARGO_RE.test(l));
  let code: string | null = null;
  let codeName: string | null = null;
  let section: number | null = null;
  for (const l of head) {
    const u = /^(\d{2})\s*[-—–]\s*(\D+?)(?:\s+Mesas\b.*)?$/.exec(l);
    if (u && !code) {
      code = u[1]!;
      codeName = u[2]!.trim();
    }
    const s = /^(Primera|Segunda|Tercera|Cuarta) Secci[oó]n$/i.exec(l);
    if (s) section = ORDINALS[s[1]!.toLowerCase()]!;
  }
  return { cargo: cargoLine ? cargoOf(cargoLine) : null, code, codeName, section };
}

const NUMS3 = /^(\d{1,7})\s+(\d{1,7})\s+(\S{1,10}?)(?:\s+\S+)*$/;

/** Mesas y electores, y el índice de la línea desde donde empieza la tabla. */
function parseCounts(lines: string[], where: string) {
  const idx: number[] = [];
  for (let i = 0; i < lines.length && idx.length < 2; i++) if (NUMS3.test(lines[i]!)) idx.push(i);
  if (idx.length < 2) {
    fail(`${where}: no se encontraron las mesas y los electores`);
    return null;
  }
  const a = NUMS3.exec(lines[idx[0]!]!)!;
  const b = NUMS3.exec(lines[idx[1]!]!)!;
  const counts = {
    habilitadas: int(a[1]!),
    escrutadas: int(a[2]!),
    electores: int(b[1]!),
    votantes: int(b[2]!),
    pctElectores: b[3]!.replace(/%$/, ""),
    start: idx[1]! + 1,
  };
  if (counts.escrutadas > counts.habilitadas)
    fail(`${where}: más mesas escrutadas (${counts.escrutadas}) que habilitadas (${counts.habilitadas})`);
  if (counts.votantes > counts.electores) fail(`${where}: más votantes (${counts.votantes}) que electores (${counts.electores})`);
  checkPct(where, "votantes / electores", counts.votantes, counts.electores, counts.pctElectores);
  return counts;
}

/** Entero que sigue a una etiqueta del resumen (o que la precede, si el OCR los invirtió) y su porcentaje. */
function grab(summary: string, label: RegExp, where: string): { votes: number; pct?: string } | null {
  const m = label.exec(summary);
  if (!m) {
    fail(`${where}: falta «${label.source}» en el resumen`);
    return null;
  }
  const after = /^[^\d]{0,20}(\d{1,7})(?:\s+(\d{1,3}[.,]\d+))?/.exec(summary.slice(m.index + m[0].length, m.index + m[0].length + 60));
  if (after) return { votes: int(after[1]!), pct: after[2] };
  const lineStart = summary.lastIndexOf("\n", m.index) + 1;
  const before = /(\d{1,7})[\s,]+(\d{1,3}[.,]\d+)\s*(?:VOTOS(?:\s+EN)?)?\s*$/.exec(summary.slice(lineStart, m.index));
  if (before) return { votes: int(before[1]!), pct: before[2] };
  fail(`${where}: no se leyó el número de «${label.source}»`);
  return null;
}

function parseSummary(lines: string[], from: number, where: string, skip: ReadonlySet<string>) {
  const summary = lines.slice(from).join("\n");
  const pos = grab(summary, /p\S{2,6}vos/i, where);
  const nul = skip.has("nulos") ? { votes: null, pct: undefined } : grab(summary, /NULOS/, where);
  const bla = skip.has("blancos") ? { votes: null, pct: undefined } : grab(summary, /BLANCOS?/, where);
  if (!pos || !nul || !bla) return null;
  return { pos, nul, bla };
}

/** Texto de una página de lista: cuerpo de la tabla y resumen. */
function splitPage(lines: string[], where: string, skip: ReadonlySet<string>) {
  const counts = parseCounts(lines, where);
  if (!counts) return null;
  const summaryAt = lines.findIndex((l, i) => i >= counts.start && /Resumen de Votos/i.test(l));
  if (summaryAt < 0) {
    fail(`${where}: falta «Resumen de Votos»`);
    return null;
  }
  const summary = parseSummary(lines, summaryAt, where, skip);
  if (!summary) return null;
  // A veces la última fila de listas queda en la misma línea que «Resumen de Votos».
  const before = lines[summaryAt]!.slice(0, lines[summaryAt]!.search(/Resumen de Votos/i)).trim();
  const body = lines.slice(counts.start, summaryAt);
  if (before) body.push(before);
  return { counts, body, summary };
}

interface RawRow {
  lista: string;
  agrupacion: string;
  candidato: string;
  votos: number;
  pct1?: string;
  pct2?: string;
  /** PASO provincial: los primeros tokens que siguen a los votos, sin saber a qué columna corresponde cada uno. */
  pcts?: string[];
}

/** Principio de una fila: «Lista 501 -», con el OCR que a veces escribe «L|sta», «Llist_a» o «LISÍ8». */
const ROW_START = /(?<![\p{L}\d])L\S{2,6}\s+\d{2,3}\s*[-—–]/u;
const ROW_START_G = new RegExp(`(?=${ROW_START.source})`, "gu");

/**
 * La fila del Frente de Izquierda a veces sale con las columnas cruzadas: el OCR pone los números antes de «UNIDAD», que es
 * el final del nombre. Se acomoda a «... TRABAJADORES - UNIDAD 972 3154 4|72»; los porcentajes ilegibles se omiten al validar
 * y los votos se comprueban con la suma de la tabla.
 */
function repairCrossedColumns(text: string, where: string): string {
  // El apellido y el nombre del candidato se parten con los números en el medio: «(UBIETA, FERNANDO 4512 57,03 58,38 ALCIDES)».
  text = text.replace(
    /\(([^()\d]*[\p{L},])\s+(\d{1,7}\s+[\d.,]+\s+[\d.,]+)\s+([\p{L}][^()\d]*)\)/gu,
    (_m, a: string, nums: string, b: string) => {
      console.log(`  OCR: ${where}: columnas cruzadas en el nombre de un candidato («${a.trim()} ${b.trim()}»)`);
      return `(${a} ${b}) ${nums}`;
    },
  );
  const re = /(TRABAJADORES\s*[-—–]?)\s+(\d{1,7}\s+\S+\s+[^A-Za-z\s]\S*?)\s*UNIDAD\b/g;
  return text.replace(re, (_m, name: string, numbers: string) => {
    console.log(`  OCR: ${where}: columnas cruzadas en la fila del Frente de Izquierda («${numbers}» antes de «UNIDAD»)`);
    return `${name} UNIDAD ${numbers}`;
  });
}

/** Filas `Lista 501 - CAMBIA MENDOZA (CORNEJO Alfredo, CASADO Hebe) 31266 46,19 48,87`. */
function parseListRows(body: string[], where: string): RawRow[] {
  const text = repairCrossedColumns(body.join(" "), where);
  const first = text.search(ROW_START);
  if (first < 0) {
    fail(`${where}: no hay filas de listas`);
    return [];
  }
  const rows: RawRow[] = [];
  for (const chunk of text.slice(first).split(ROW_START_G)) {
    const m = /^L\S{2,6}\s+(\d{2,3})\s*[-—–]\s*([^\d]+?)\s+(\d{1,7})\b(?:\s+(\S+))?(?:\s+(\S+))?/u.exec(chunk.trim());
    if (!m) {
      fail(`${where}: fila que no se entiende: «${chunk.trim().slice(0, 90)}»`);
      continue;
    }
    const nameAndCandidate = m[2]!;
    if (/\([^)]*$/.test(nameAndCandidate) || /(?:^|\s)(?:Y|DE|DEL|LA|-)$/.test(nameAndCandidate.trim()))
      fail(`${where}: nombre cortado o con el paréntesis abierto: «${nameAndCandidate.trim()}» (¿columnas cruzadas?)`);
    const cand = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(nameAndCandidate);
    rows.push({
      lista: m[1]!,
      agrupacion: tidyName(cand ? cand[1]! : nameAndCandidate),
      candidato: cand ? collapseSpaces(cand[2]!) : "",
      votos: int(m[3]!),
      pct1: m[4],
      pct2: m[5],
    });
  }
  return rows;
}

/** Encabezados `501 - CAMBIA MENDOZA` de la PASO municipal; el nombre puede seguir en la línea de abajo. */
function headerNames(body: string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (let i = 0; i < body.length; i++) {
    const m = /^(\d{3})\s*[-—–]\s*(.*)$/.exec(body[i]!);
    if (!m) continue;
    // El nombre llega hasta la etiqueta «Lista», un número o un signo suelto; si llegó a la punta de la línea sigue abajo.
    const words: string[] = [];
    const tokens = m[2]!.split(/\s+/);
    let ended = false;
    for (const [k, w] of tokens.entries()) {
      if (/\d/.test(w) || /^[_,.¡'’/]+$/.test(w) || (/^L\S{2,5}$/.test(w) && /^\d{3}$/.test(tokens[k + 1] ?? ""))) {
        ended = true;
        break;
      }
      words.push(w);
    }
    let name = words.join(" ");
    if (!ended) {
      for (let j = i + 1; j < body.length && !/^L\S{2,5}\s+\d/.test(body[j]!) && !/^\d/.test(body[j]!); j++) {
        // La continuación puede traer la fila siguiente en la misma línea: se corta en la etiqueta «Lista 503».
        const cut = body[j]!.search(/(?:^|\s)L\S{2,5}\s+\d{3}\b/);
        name += ` ${cut >= 0 ? body[j]!.slice(0, cut) : body[j]}`;
        if (cut >= 0) break;
      }
    }
    names.set(m[1]!, tidyName(name));
  }
  return names;
}

/** La interna sale a veces en minúscula o con «_» en vez de «-» (`502 c`, `504 A_B`): se pasa a la forma de las demás y se avisa. */
function tidyInterna(raw: string, where: string): string {
  const out = raw.toUpperCase().replace(/[_—–]/, "-");
  if (!/^[A-HO](?:-[A-H]{1,2})?$/.test(out)) fail(`${where}: interna que no existe: «${raw}»`);
  if (out !== raw) console.log(`  OCR: ${where}: interna «${raw}» leída como «${out}» (el OCR cambió una mayúscula o un guion)`);
  return out;
}

/**
 * PASO municipal: `Lista 501 C - PINTI CLOP, Mauri 15105 15,70 17,84 27419 28,50 32,38`; la interna y el candidato pueden faltar.
 * Lleva la etiqueta «Lista» porque el candidato está en la fila. En la PASO de junio, donde el OCR es peor, los números
 * 181 y 501 a 504 son los de la provincia (la elección es concurrente) y se toman de PASO_PROVINCIAL_NAMES.
 */
function parsePasoLabeledRows(body: string[], where: string, doc: Doc): RawRow[] {
  const names = headerNames(body);
  if (doc.election === "2023-06-11") checkPasoHeaders(names, where);
  const text = body.join(" ");
  const re =
    /(?<![\p{L}\d])L\S{2,5}\s+(\d{3})(?:\s+([A-Za-z](?:[-_—–][A-Za-z]{1,2})?)(?![A-Za-z]))?(?:\s*[-—–_]\s*([^\d]+?))?\s+(\d{1,7})\b(?:\s+(\S+))?(?:\s+(\S+))?/gu;
  const rows: RawRow[] = [];
  for (const m of text.matchAll(re)) {
    const agrupacion = (doc.election === "2023-06-11" ? PASO_PROVINCIAL_NAMES[m[1]!] : undefined) ?? names.get(m[1]!);
    if (!agrupacion) {
      fail(`${where}: lista ${m[1]} sin encabezado de agrupación`);
      continue;
    }
    rows.push({
      lista: m[2] ? `${m[1]} ${tidyInterna(m[2], where)}` : m[1]!,
      agrupacion,
      candidato: m[3] ? collapseSpaces(m[3]) : "",
      votos: int(m[4]!),
      pct1: m[5],
      pct2: m[6],
      // En la PASO de junio el OCR mezcla estos porcentajes con los del subtotal.
      ...(doc.election === "2023-06-11" ? { pcts: [m[5], m[6]].filter((x): x is string => !!x) } : {}),
    });
  }
  if (!rows.length) fail(`${where}: no hay filas de listas`);
  return rows;
}

/** Si el encabezado de una agrupación provincial se leyó, tiene que decir lo mismo que PASO_PROVINCIAL_NAMES. */
function checkPasoHeaders(names: Map<string, string>, where: string) {
  for (const [num, header] of names) {
    const known = PASO_PROVINCIAL_NAMES[num];
    if (!known || header.length < 4) continue;
    const a = keyOf(known).slice(0, 6);
    const b = keyOf(header).slice(0, 6);
    // El OCR rompe a veces estos encabezados («ñ?ñóí55m5 DE 'ZQU'ERDA»): solo se rechaza el que se lee bien y dice otra cosa.
    const differing = [...a].filter((c, i) => c !== b[i]).length;
    if (/^[A-ZÁÉÍÓÚ ]+$/.test(header) && header.length > 8 && differing > 2)
      fail(`${where}: la lista ${num} dice «${header}» y se esperaba «${known}»`);
  }
}

/** PASO provincial (11-06-2023): el texto sale con columnas mezcladas, así que se buscan `501 A 22292` sin depender de la etiqueta «Lista». */
function parsePasoFreeRows(body: string[], where: string, doc: Doc): RawRow[] {
  checkPasoHeaders(headerNames(body), where);
  const text = body.join(" ");
  const rows: RawRow[] = [];
  for (const m of text.matchAll(/(?<![\d,.])([1-9]\d{2})\s+([A-Z])\s+(\d{1,7})(?=\s|$)/g)) {
    const agrupacion = PASO_PROVINCIAL_NAMES[m[1]!];
    if (!agrupacion) {
      fail(`${where}: lista ${m[1]} desconocida`);
      continue;
    }
    // Los dos porcentajes que siguen, si el OCR los dejó legibles.
    const tail = text
      .slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 24)
      .trim()
      .split(/\s+/);
    rows.push({ lista: `${m[1]} ${m[2]!.toUpperCase()}`, agrupacion, candidato: "", votos: int(m[3]!), pcts: tail.slice(0, 4) });
  }
  if (!rows.length) fail(`${where}: no hay filas de listas`);
  void doc;
  return rows;
}

/** Un nombre de persona con letras que el OCR suele confundir: símbolos, «º», un punto que no es de una inicial, una «I» mayúscula entre minúsculas. */
function suspiciousPerson(name: string): boolean {
  if (!name) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ .,'-]+$/.test(name)) return true;
  const plain = name.replace(/\b(?:Ing|Dr|Dra|Lic|Prof)\./gi, "").replace(/\b[A-Z]\.(?=\s|$)/g, "");
  if (plain.includes(".")) return true;
  if (/[a-zà-ÿ]I[a-zà-ÿ]/.test(name)) return true;
  return false;
}

const MUNICIPAL_CARGOS = new Set<Cargo>(["intendente", "concejales", "convencionales"]);

/** Cómo se leen las filas de una página. En la PASO de junio, gobernador, senadores y diputados son de la provincia; intendente y concejales, de cada municipio. */
function rowModeOf(doc: Doc, cargo: Cargo): Mode {
  if (doc.mode === "list") return "list";
  if (doc.election === "2023-06-11" && !MUNICIPAL_CARGOS.has(cargo)) return "paso-free";
  return "paso-labeled";
}

function parseListPage(doc: Doc, pageNo: number, raw: string, expected: { dept?: string; province: boolean }): Parsed | null {
  const where = `${doc.file} p.${pageNo}`;
  softPct = doc.election === "2023-06-11";
  const lines = pageLines(applyFixes(raw, doc.file));
  const header = parseHeader(lines);
  if (!header.cargo) {
    fail(`${where}: no se encontró el cargo`);
    return null;
  }
  let unit: Unit;
  if (header.section !== null) unit = { level: "seccion", section: header.section };
  else if (expected.province) {
    if (header.code !== "07" || !/^mend/i.test(keyOf(header.codeName ?? "")))
      fail(`${where}: se esperaba «07-Mendoza» (provincia) y dice «${header.code}-${header.codeName}»`);
    unit = { level: "provincia" };
  } else {
    const code = DEPT_CODES[expected.dept!];
    if (header.code && header.code !== code)
      fail(`${where}: el PDF de ${expected.dept} dice «${header.code}-${header.codeName}» y se esperaba el código ${code}`);
    unit = { level: "departamento", dept: expected.dept };
  }
  const absent = UNREADABLE_COUNTS.find((u) => u.file.test(doc.file) && u.page === pageNo);
  if (absent) console.log(`  No se lee: ${where}: ${absent.fields.join(" y ")} (${absent.why})`);
  const split = splitPage(lines, where, new Set(absent?.fields ?? []));
  if (!split) return null;
  const { counts, body, summary } = split;
  const mode = rowModeOf(doc, header.cargo);
  const rawRows =
    mode === "paso-labeled"
      ? parsePasoLabeledRows(body, where, doc)
      : mode === "paso-free"
        ? parsePasoFreeRows(body, where, doc)
        : parseListRows(body, where);

  const positivos = summary.pos.votes;
  const nulos = summary.nul.votes;
  const blancos = summary.bla.votes;
  const sum = rawRows.reduce((s, r) => s + r.votos, 0);
  if (sum !== positivos) fail(`${where}: la suma de las listas (${sum}) no es POSITIVOS (${positivos})`);
  if (nulos !== null && blancos !== null && positivos + nulos + blancos !== counts.votantes)
    fail(`${where}: positivos + nulos + blancos (${positivos + nulos + blancos}) no es votantes (${counts.votantes})`);
  for (const r of rawRows) {
    if (r.pcts) checkPctAny(where, `lista ${r.lista}`, r.votos, counts.votantes, positivos, r.pcts);
    else checkPctPair(where, `lista ${r.lista}`, r.votos, counts.votantes, positivos, r.pct1, r.pct2);
    if (!/^[\p{L}\d .,+&'()-]+$/u.test(r.agrupacion)) fail(`${where}: caracteres raros en la agrupación «${r.agrupacion}»`);
    if (suspiciousPerson(r.candidato)) fail(`${where}: caracteres raros en el candidato «${r.candidato}»`);
  }
  checkPct(where, "positivos / votantes", positivos, counts.votantes, summary.pos.pct);
  if (nulos !== null) checkPct(where, "nulos / votantes", nulos, counts.votantes, summary.nul.pct);
  if (blancos !== null) checkPct(where, "blancos / votantes", blancos, counts.votantes, summary.bla.pct);
  if (new Set(rawRows.map((r) => r.lista)).size !== rawRows.length) fail(`${where}: una lista aparece dos veces`);

  const options: Option[] = rawRows.map((r) => ({
    tipo_voto: "positivo",
    agrupacion: r.agrupacion,
    lista: r.lista,
    candidato: r.candidato,
    votos: r.votos,
  }));
  if (blancos !== null) options.push({ tipo_voto: "blanco", agrupacion: "", lista: "", candidato: "", votos: blancos });
  if (nulos !== null) options.push({ tipo_voto: "nulo", agrupacion: "", lista: "", candidato: "", votos: nulos });
  return {
    doc,
    page: pageNo,
    cargo: header.cargo,
    unit,
    habilitadas: counts.habilitadas,
    escrutadas: counts.escrutadas,
    electores: counts.electores,
    votantes: counts.votantes,
    positivos,
    nulos,
    blancos,
    options,
  };
}

/** Páginas de la tabla por sección del PDF provincial de la general: `501 CM 133133 38,85 36,23`, un bloque por sección. */
function parseSectionPage(doc: Doc, pageNo: number, raw: string, state: { cargo: Cargo | null; next: number }): Parsed[] {
  const where = `${doc.file} p.${pageNo}`;
  const text = pageLines(applyFixes(raw, doc.file)).join("\n");
  const head = parseHeader(pageLines(raw));
  if (head.cargo) {
    state.cargo = head.cargo;
    state.next = 1;
  }
  if (!state.cargo) {
    fail(`${where}: tabla por sección sin cargo`);
    return [];
  }
  const out: Parsed[] = [];
  let prevEnd = 0;
  for (const end of text.matchAll(/BLANCO\D{0,6}(\d{1,7})/g)) {
    const block = text.slice(prevEnd, (end.index ?? 0) + end[0].length);
    const tail = text.slice(end.index ?? 0, (end.index ?? 0) + 60);
    prevEnd = (end.index ?? 0) + end[0].length;
    const section = state.next++;
    const bw = `${where} sección ${section}`;
    const label = /\b([1-4])\s*(?:ra|da|ta)\b/i.exec(block);
    if (label && int(label[1]!) !== section) fail(`${bw}: el bloque dice sección ${label[1]} y por el orden es la ${section}`);
    const pos = /\bP\S{2,6}VOS\b\D{0,8}(\d{1,7})(?:\s+(\d{1,3}[.,]\d+))?/.exec(block);
    const nul = /NULOS\D{0,8}(\d{1,7})(?:\s+(\d{1,3}[.,]\d+))?/.exec(block);
    if (!pos || !nul) {
      fail(`${bw}: no se leyeron los positivos o los nulos`);
      continue;
    }
    const blaPct = /(\d{1,3}[.,]\d+)/.exec(tail.slice(end[0].length));
    const positivos = int(pos[1]!);
    const nulos = int(nul[1]!);
    const blancos = int(end[1]!);
    const total = positivos + nulos + blancos;
    const rows: RawRow[] = [];
    for (const m of block.matchAll(/(\d{3})\s+([A-Z]{2,4})\s+(\d{1,7})\s+(\d{1,3}[.,]\d{1,2})\s+(\d{1,3}[.,]\d{1,2})/g)) {
      if (ACRONYMS[m[2]!] !== m[1]) fail(`${bw}: la sigla ${m[2]} no corresponde a la lista ${m[1]}`);
      rows.push({ lista: m[1]!, agrupacion: "", candidato: "", votos: int(m[3]!), pct1: m[4], pct2: m[5] });
    }
    const sum = rows.reduce((s, r) => s + r.votos, 0);
    if (rows.length !== Object.keys(ACRONYMS).length) fail(`${bw}: ${rows.length} listas, se esperaban ${Object.keys(ACRONYMS).length}`);
    if (sum !== positivos) fail(`${bw}: la suma de las listas (${sum}) no es POSITIVOS (${positivos})`);
    for (const r of rows) checkPctPair(bw, `lista ${r.lista}`, r.votos, total, positivos, r.pct1, r.pct2);
    checkPct(bw, "positivos / total", positivos, total, pos[2]);
    checkPct(bw, "nulos / total", nulos, total, nul[2]);
    checkPct(bw, "blancos / total", blancos, total, blaPct?.[1]);
    const options: Option[] = rows.map((r) => ({ tipo_voto: "positivo", agrupacion: "", lista: r.lista, candidato: "", votos: r.votos }));
    options.push({ tipo_voto: "blanco", agrupacion: "", lista: "", candidato: "", votos: blancos });
    options.push({ tipo_voto: "nulo", agrupacion: "", lista: "", candidato: "", votos: nulos });
    out.push({
      doc,
      page: pageNo,
      cargo: state.cargo,
      unit: { level: "seccion", section },
      habilitadas: null,
      escrutadas: null,
      electores: null,
      votantes: null,
      positivos,
      nulos,
      blancos,
      options,
    });
  }
  if (!out.length) fail(`${where}: no se encontró ningún bloque de sección`);
  return out;
}

function parseDoc(doc: Doc, pages: string[]): Parsed[] {
  const out: Parsed[] = [];
  const state = { cargo: null as Cargo | null, next: 1 };
  pages.forEach((raw, i) => {
    const pageNo = i + 1;
    softPct = false;
    const isSectionTable =
      !/Resumen de Votos/i.test(raw) && new RegExp(`\\b\\d{3}\\s+(?:${Object.keys(ACRONYMS).join("|")})\\s+\\d`).test(raw);
    if (isSectionTable) {
      out.push(...parseSectionPage(doc, pageNo, raw, state));
      return;
    }
    const parsed = parseListPage(doc, pageNo, raw, { dept: doc.dept, province: !doc.dept && doc.mode === "list" });
    if (parsed) out.push(parsed);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Nombres de agrupación: una sola forma por lista
// ---------------------------------------------------------------------------

const PROVINCIAL_CARGOS = new Set<Cargo>(["gobernador", "senadores", "diputados"]);

/**
 * El OCR escribe la misma agrupación de varias formas (con y sin tilde, con guion corto o largo). Para cada lista de cada
 * elección (en la provincia, o en el municipio si es un cargo municipal) se deja la forma que más veces aparece, y a igual
 * cantidad la que tiene más tildes. Si dos formas difieren en algo más que tildes, mayúsculas o signos, corta.
 */
function canonicalizeNames(parsed: Parsed[]) {
  const scopeOf = (p: Parsed) => (PROVINCIAL_CARGOS.has(p.cargo) ? "provincial" : (p.unit.dept ?? "provincial"));
  const forms = new Map<string, Map<string, number>>();
  for (const p of parsed)
    for (const o of p.options) {
      if (o.tipo_voto !== "positivo" || !o.agrupacion) continue;
      const k = `${p.doc.election}|${scopeOf(p)}|${o.lista.split(" ")[0]}`;
      const m = forms.get(k) ?? new Map<string, number>();
      m.set(o.agrupacion, (m.get(o.agrupacion) ?? 0) + 1);
      forms.set(k, m);
    }
  // Los candidatos a gobernador son los mismos en los 18 departamentos: una letra mal leída en uno se nota.
  const govCandidates = new Map<string, Map<string, number>>();
  for (const p of parsed)
    if (p.cargo === "gobernador")
      for (const o of p.options) {
        if (!o.candidato) continue;
        const k = `${p.doc.election}|${o.lista}`;
        const m = govCandidates.get(k) ?? new Map<string, number>();
        m.set(o.candidato, (m.get(o.candidato) ?? 0) + 1);
        govCandidates.set(k, m);
      }
  for (const [k, m] of govCandidates)
    if (m.size > 1)
      fail(
        `Candidatos distintos para el mismo gobernador (${k.replace("|", ", lista ")}): ${[...m].map(([v, n]) => `«${v}» x${n}`).join(" | ")}`,
      );
  const canon = new Map<string, string>();
  for (const [k, m] of forms) {
    const variants = [...m.entries()].sort((a, b) => b[1] - a[1] || accents(b[0]) - accents(a[0]) || a[0].localeCompare(b[0]));
    const keys = new Set(variants.map(([v]) => keyOf(v)));
    // «ELEGÍ» a secas (PASO) y «FRENTE ELEGÍ MAIPU CRECE» (general) son nombres distintos: se comparan solo dentro de una misma forma.
    if (keys.size > 1) {
      const [election, scope, lista] = k.split("|");
      fail(`Nombres distintos para la lista ${lista} (${election}, ${scope}): ${variants.map(([v, n]) => `«${v}» x${n}`).join(" | ")}`);
    }
    canon.set(k, variants[0]![0]);
  }
  for (const p of parsed)
    for (const o of p.options) {
      if (o.tipo_voto !== "positivo" || !o.agrupacion) continue;
      const k = `${p.doc.election}|${scopeOf(p)}|${o.lista.split(" ")[0]}`;
      const best = canon.get(k)!;
      if (keyOf(best) === keyOf(o.agrupacion)) o.agrupacion = best;
    }
  return scopeOf;
}

const accents = (s: string) => (s.match(/[ÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length;

/** Las filas por sección solo traen siglas: el nombre es el de la misma lista en el escrutinio de la misma elección. */
function fillSectionNames(parsed: Parsed[]) {
  const byKey = new Map<string, string>();
  for (const p of parsed)
    if (PROVINCIAL_CARGOS.has(p.cargo) && p.unit.level !== "seccion")
      for (const o of p.options)
        if (o.tipo_voto === "positivo" && o.agrupacion) byKey.set(`${p.doc.election}|${o.lista.split(" ")[0]}`, o.agrupacion);
  for (const p of parsed)
    for (const o of p.options) {
      if (o.tipo_voto !== "positivo" || o.agrupacion) continue;
      const name = byKey.get(`${p.doc.election}|${o.lista.split(" ")[0]}`);
      if (name) o.agrupacion = name;
      else fail(`${p.doc.file} p.${p.page}: sin nombre para la lista ${o.lista}`);
    }
}

// ---------------------------------------------------------------------------
// Cruces entre niveles
// ---------------------------------------------------------------------------

const crossLog: string[] = [];

function crossChecks(parsed: Parsed[]) {
  const groups = new Map<string, Parsed[]>();
  for (const p of parsed) {
    const k = `${p.doc.election}|${p.cargo}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const totals = (list: Parsed[]) => {
    const t = new Map<string, number>();
    for (const p of list) {
      for (const o of p.options) {
        const k = o.tipo_voto === "positivo" ? `lista ${o.lista}` : o.tipo_voto;
        t.set(k, (t.get(k) ?? 0) + o.votos);
      }
      // Una página sin nulos o blancos legibles no puede entrar en esa suma.
      if (p.nulos === null) t.set("nulo?", 1);
      if (p.blancos === null) t.set("blanco?", 1);
    }
    return t;
  };
  const compare = (what: string, a: Map<string, number>, b: Map<string, number>) => {
    const skipped = new Set([...a.keys(), ...b.keys()].filter((k) => k.endsWith("?")).map((k) => k.slice(0, -1)));
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      if (k.endsWith("?") || skipped.has(k)) continue;
      if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) fail(`${what}: ${k}: ${a.get(k) ?? 0} vs ${b.get(k) ?? 0}`);
    }
    for (const k of skipped) console.log(`  (${what}: se omite «${k}» porque una página no lo trae legible)`);
  };
  for (const [k, list] of groups) {
    const depts = list.filter((p) => p.unit.level === "departamento");
    const sections = list.filter((p) => p.unit.level === "seccion");
    const province = list.filter((p) => p.unit.level === "provincia");
    if (depts.length !== 18) continue; // solo los cargos provinciales tienen los 18 departamentos
    crossLog.push(`${k}: 18 departamentos${sections.length ? " + 4 secciones" : ""}${province.length ? " + provincia" : ""}`);
    if (province.length === 1) {
      compare(`${k}: suma de departamentos vs provincia`, totals(depts), totals(province));
      const sumOf = (f: (p: Parsed) => number | null) => depts.reduce((s, p) => s + (f(p) ?? 0), 0);
      const pv = province[0]!;
      for (const [what, got, want] of [
        ["mesas habilitadas", sumOf((p) => p.habilitadas), pv.habilitadas],
        ["mesas escrutadas", sumOf((p) => p.escrutadas), pv.escrutadas],
        ["electores", sumOf((p) => p.electores), pv.electores],
        ["votantes", sumOf((p) => p.votantes), pv.votantes],
      ] as const)
        if (got !== want) fail(`${k}: ${what}: departamentos ${got}, provincia ${want}`);
    }
    if (sections.length) {
      if (sections.length !== 4) fail(`${k}: ${sections.length} secciones, se esperaban 4`);
      compare(`${k}: suma de departamentos vs suma de secciones`, totals(depts), totals(sections));
      if (province.length === 1) compare(`${k}: suma de secciones vs provincia`, totals(sections), totals(province));
    }
  }
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

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

const CARGO_ORDER: Cargo[] = ["gobernador", "senadores", "diputados", "intendente", "concejales", "convencionales"];
const LEVEL_ORDER: Level[] = ["provincia", "seccion", "departamento"];

function sortParsed(parsed: Parsed[]): Parsed[] {
  return [...parsed].sort(
    (a, b) =>
      a.doc.election.localeCompare(b.doc.election) ||
      CARGO_ORDER.indexOf(a.cargo) - CARGO_ORDER.indexOf(b.cargo) ||
      LEVEL_ORDER.indexOf(a.unit.level) - LEVEL_ORDER.indexOf(b.unit.level) ||
      (a.unit.section ?? 0) - (b.unit.section ?? 0) ||
      (a.unit.dept ?? "").localeCompare(b.unit.dept ?? "", "es"),
  );
}

function baseRow(p: Parsed): Row {
  return {
    eleccion: p.doc.election,
    tipo_eleccion: p.doc.type,
    escrutinio: "definitivo",
    cargo: p.cargo,
    nivel: p.unit.level,
    seccion_electoral: p.unit.section ?? "",
    departamento: p.unit.dept ?? "",
    circuito: "",
    mesa: "",
  };
}

async function readPdf(doc: Doc): Promise<{ pages: string[]; sha: string }> {
  const bytes = await fetchOrReuse(ID, doc.url, doc.file);
  const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  return { pages: await pdfPages(new Uint8Array(bytes)), sha };
}

export async function run(_args: string[]) {
  // 1. Buscar los PDF
  const docs = new Map<string, Doc>();
  const unread: string[] = [];
  for (const listing of LISTINGS) {
    for (const url of await pdfLinks(listing)) {
      if (UNREAD.some((u) => u.match.test(url))) continue; // se avisa más abajo, con lo que dice la página de la Junta
      const doc = classify(url, listing);
      if (doc) docs.set(doc.file, doc);
    }
    await sleep(1000);
  }
  const juntaPage = await pdfLinks({ url: JUNTA_URL, file: "junta-electoral.html", only: /scrutinio/i });
  for (const url of juntaPage) {
    const file = decodeURIComponent(url.split("/").pop()!);
    const known = UNREAD.find((u) => u.match.test(file));
    if (known) unread.push(`${file}: ${known.why}`);
    else if (!docs.has(file)) unread.push(`${file}: aparece en la página de la Junta y todavía no se clasificó`);
  }
  if (!docs.size) throw new Error(`${ID}: no se encontró ningún PDF`);

  // 2. Leer
  const ordered = [...docs.values()].sort((a, b) => a.election.localeCompare(b.election) || a.file.localeCompare(b.file));
  const parsed: Parsed[] = [];
  const seenSha = new Map<string, string>();
  for (const doc of ordered) {
    const unreadable = UNREADABLE.find((u) => u.file === doc.file);
    const { pages, sha } = await readPdf(doc);
    if (unreadable) {
      unread.push(`${doc.file}: ${unreadable.why}`);
      continue;
    }
    const twin = seenSha.get(sha);
    if (twin) {
      console.log(`  ${doc.file} es idéntico a ${twin}: se lee una sola vez`);
      continue;
    }
    seenSha.set(sha, doc.file);
    const before = problems.length;
    const result = parseDoc(doc, pages);
    parsed.push(...result);
    console.log(`${doc.file}: ${result.length} unidades${problems.length > before ? ` (con ${problems.length - before} problemas)` : ""}`);
  }

  // 3. Verificar
  canonicalizeNames(parsed);
  fillSectionNames(parsed);
  crossChecks(parsed);
  for (const fix of OCR_FIXES)
    if (!appliedFixes.has(fix)) console.log(`  Corrección de OCR que ya no aplica (revisar si cambió el PDF): ${String(fix.from)}`);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    throw new Error(`${ID}: ${problems.length} verificación(es) fallaron; no se escribe nada.`);
  }

  // 4. Escribir
  const sorted = sortParsed(parsed);
  const results: Row[] = [];
  const participation: Row[] = [];
  for (const p of sorted) {
    const base = baseRow(p);
    for (const o of p.options)
      results.push({ ...base, tipo_voto: o.tipo_voto, agrupacion: o.agrupacion, lista: o.lista, candidato: o.candidato, votos: o.votos });
    if (p.habilitadas !== null)
      participation.push({
        ...base,
        mesas_habilitadas: p.habilitadas,
        mesas_escrutadas: p.escrutadas,
        electores: p.electores,
        votantes: p.votantes,
      });
  }
  stats.rows = results.length;
  await writeProcessed(ID, "resultados.csv", results, RESULT_COLUMNS);
  await writeProcessed(ID, "participacion.csv", participation, PARTICIPATION_COLUMNS);
  await writeMeta();

  const elections = [...new Set(sorted.map((p) => p.doc.election))];
  console.log(`resultados.csv: ${results.length} filas; participacion.csv: ${participation.length} filas`);
  console.log(`Elecciones: ${elections.join(", ")}`);
  for (const c of crossLog) console.log(`  Cruce verificado: ${c}`);
  console.log(
    `Porcentajes comprobados: ${stats.pctChecked}; ilegibles por el OCR (omitidos): ${stats.pctUnreadable}; distintos en la PASO de junio por dígitos mal leídos (avisados): ${softWarnings.length}`,
  );
  for (const w of softWarnings) console.log(`  aviso: ${w}`);
  for (const u of unread) console.log(`  No se lee: ${u}`);
}

async function writeMeta() {
  const dir = join(PROCESSED_DIR, ID);
  await mkdir(dir, { recursive: true });
  const common = {
    eleccion: { etiqueta: "Elección", tipo: "fecha", descripcion: "Fecha de la jornada (es el id de la elección)." },
    tipo_eleccion: {
      etiqueta: "Tipo de elección",
      tipo: "texto",
      valores: { paso: "PASO", general: "General", municipal: "Municipal (municipios que desdoblaron)" },
    },
    escrutinio: { etiqueta: "Escrutinio", tipo: "texto", valores: { definitivo: "Definitivo" } },
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
      descripcion: "Unidad geográfica de la fila, la que imprime el PDF.",
      valores: { provincia: "Provincia", seccion: "Sección electoral", departamento: "Departamento" },
    },
    seccion_electoral: {
      etiqueta: "Sección electoral",
      tipo: "texto",
      descripcion: "1 a 4. Solo en las filas de nivel sección; el PDF por departamento no la imprime.",
    },
    departamento: { etiqueta: "Departamento", tipo: "texto", descripcion: "Nombre oficial del municipio." },
    circuito: {
      etiqueta: "Circuito",
      tipo: "texto",
      oculta: true,
      descripcion: "Siempre vacío: el escrutinio definitivo no llega a ese nivel.",
    },
    mesa: { etiqueta: "Mesa", tipo: "texto", oculta: true, descripcion: "Siempre vacío: el escrutinio definitivo no llega a ese nivel." },
  };
  const meta = {
    resultados: {
      titulo: "Escrutinios definitivos de Mendoza: votos por cargo, unidad y lista",
      descripcion:
        "Resultados del escrutinio definitivo de la H. Junta Electoral de la Provincia: PASO y general de 2023 (gobernador, senadores, diputados, intendentes y concejales), las PASO y generales municipales de 2023 de los siete municipios que desdoblaron, y los concejales (y convencionales en San Rafael) del 22 de febrero de 2026 en seis municipios. Una fila por lista, más los votos en blanco y nulos. En la PASO la lista incluye la interna (por ejemplo `501 A`). El nombre de la agrupación es el que imprime el PDF, con una sola forma por lista cuando el OCR la escribió de varias maneras (con o sin tilde). En las filas por sección el PDF solo imprime siglas: el nombre es el de la misma lista en el escrutinio de esa elección. El candidato figura solo cuando la fila lo imprime. Intendente y concejales incluyen extranjeros en el padrón. No está la PASO provincial de gobernador como total de la provincia (el PDF salió ilegible) ni el escrutinio de 2025 (PDF escaneado sin texto en gran parte): ver el relevamiento.",
      columnas: {
        ...common,
        tipo_voto: {
          etiqueta: "Tipo de voto",
          tipo: "texto",
          valores: { positivo: "Voto a una lista", blanco: "En blanco", nulo: "Nulo" },
        },
        agrupacion: { etiqueta: "Agrupación", tipo: "texto", descripcion: "Vacía si no es voto a una lista." },
        lista: { etiqueta: "Lista", tipo: "texto", descripcion: "Número de la lista; en la PASO, con la interna (`501 A`)." },
        candidato: { etiqueta: "Candidato", tipo: "texto", descripcion: "Solo si la fila del PDF lo imprime (gobernador e intendente)." },
        votos: { etiqueta: "Votos", tipo: "entero", unidad: "votos" },
      },
      fuente: LISTINGS[0]!.url,
    },
    participacion: {
      titulo: "Escrutinios definitivos de Mendoza: mesas, electores y votantes",
      descripcion:
        "Mesas habilitadas y escrutadas, electores empadronados y votantes de cada cargo y unidad geográfica del escrutinio definitivo. Para intendente y concejales el padrón incluye extranjeros. La tabla por sección de la general de 2023 no imprime mesas ni electores, así que esas secciones no tienen fila.",
      columnas: {
        ...common,
        mesas_habilitadas: { etiqueta: "Mesas habilitadas", tipo: "entero", unidad: "mesas" },
        mesas_escrutadas: { etiqueta: "Mesas escrutadas", tipo: "entero", unidad: "mesas" },
        electores: { etiqueta: "Electores empadronados", tipo: "entero", unidad: "personas" },
        votantes: { etiqueta: "Votantes", tipo: "entero", unidad: "personas" },
      },
      fuente: LISTINGS[0]!.url,
    },
  };
  await writeFile(join(dir, "resultados.meta.json"), `${JSON.stringify(meta.resultados, null, 2)}\n`);
  await writeFile(join(dir, "participacion.meta.json"), `${JSON.stringify(meta.participacion, null, 2)}\n`);
}
