/**
 * Misiones oficiales: viajes de funcionarios autorizados por decreto y publicados en el Boletín Oficial de Mendoza.
 *
 * Fuente DERIVADA: no descarga nada. Lee lo que ya bajó el scraper `boletin-oficial`:
 *   - data/processed/boletin-oficial/normas.csv
 *   - data/processed/boletin-oficial/textos/<fecha>/<norma_id>.txt   (texto completo de la norma)
 * y escribe data/processed/misiones-oficiales/misiones.csv (+ .meta.json).
 *
 * Uso: bun run scrape misiones-oficiales [--faltantes]
 *   --faltantes  No escribe nada: lista los `norma_id` de las normas del índice que parecen una misión oficial y
 *                todavía no tienen el texto bajado, para completarlas con
 *                `bun run scrape boletin-oficial --ids=<lista>`.
 *
 * Qué se toma: decretos y resoluciones provinciales cuyo artículo 1 autoriza una "misión oficial" o la "salida
 * del país / del territorio" de una o más personas. Una fila por persona y norma, con destino, fechas, motivo y
 * lo que la norma dice sobre el costo para la Provincia. Las personas se reconocen por el DNI que las acompaña
 * en el decreto (con `peopleInLine()` de `designaciones`); el número NUNCA se guarda.
 *
 * Costo: casi ninguna norma trae un monto. Lo que sí dicen muchas es si la Provincia paga o no (vuelos, estadía,
 * viáticos). Se clasifica en `costo_provincia` y se guarda la frase textual en `detalle_costo`, para que la
 * lectura sea verificable. Que la norma no lo diga no significa que no haya costo.
 *
 * Limitaciones: solo cubre las normas con texto completo bajado; las del backfill liviano se completan con
 * `--faltantes`. El índice del Boletín no siempre dice "misión oficial" en el sumario, así que puede haber viajes
 * autorizados por normas que no aparecen. Los viajes del Gobernador los autoriza la Legislatura y no están acá.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PROCESSED_DIR, type Row, readProcessed, writeProcessed } from "@mt/core";

import { headerDate, peopleInLine, redact, splitArticles } from "./designaciones.ts";

const SOURCE = "misiones-oficiales";
const BOE = "boletin-oficial";
const NORM_TYPES = new Set(["decreto", "resolucion"]);

export const COLUMNS = [
  "fecha_boletin",
  "norma_id",
  "tipo_norma",
  "numero_norma",
  "fecha_norma",
  "organismo_emisor",
  "persona",
  "cargo",
  "destino",
  "pais",
  "desde",
  "hasta",
  "dias",
  "motivo",
  "costo_provincia",
  "detalle_costo",
  "url_pdf",
];

export type Cost = "paga_provincia" | "paga_tercero" | "sin_costo" | "sin_viaticos" | "no_informa";

export interface Mission {
  persona: string;
  cargo: string;
  destino: string;
  pais: string;
  desde: string;
  hasta: string;
  motivo: string;
  costo: Cost;
  detalleCosto: string;
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
const MONTH = `(${Object.keys(MONTHS).join("|")})`;

/** Lo que identifica a una misión oficial en el artículo que la autoriza. */
const MISSION = /misi[oó]n oficial|salida del (?:pa[ií]s|territorio)|salir del territorio/i;
/** Sumarios del índice que anuncian una misión (para `--faltantes`). */
const MISSION_SUMMARY = /MISI[OÓ]N OFICIAL|SALIDA DEL (?:PA[IÍ]S|TERRITORIO)|VIAJE AL EXTERIOR|AUTORIZACI[OÓ]N SALIDA/i;

// ---------------------------------------------------------------- países

/** Nombre en la norma -> país. El orden importa: lo más específico primero. */
const COUNTRIES: [RegExp, string][] = [
  [
    /Estados Unidos|EE\.? ?UU\.?|E\.E\.U\.U\.|\bUSA\b|Texas|Houston|San Diego|Nueva York|Washington|Miami|Las Vegas|Denver/i,
    "Estados Unidos",
  ],
  [/Rep[uú]blica Popular (?:de )?China|\bChina\b|Beijing|Pek[ií]n|Shanghai/i, "China"],
  [/Reino Unido|Inglaterra|Londres/i, "Reino Unido"],
  [/Emiratos [AÁ]rabes|Dub[aá]i|Abu Dhabi/i, "Emiratos Árabes Unidos"],
  [/Arabia Saudita|Riad/i, "Arabia Saudita"],
  [/Corea/i, "Corea del Sur"],
  [/Pa[ií]ses Bajos|Holanda|[AÁ]msterdam/i, "Países Bajos"],
  [/Nueva Zelanda/i, "Nueva Zelanda"],
  [/Sud[aá]frica/i, "Sudáfrica"],
  [/\bChile\b|Santiago de Chile|Valpara[ií]so/i, "Chile"],
  [/Brasil|San Pablo|S[aã]o Paulo|R[ií]o de Janeiro|Curitiba/i, "Brasil"],
  [/Per[uú](?![a-z])|Lima(?![a-z])|Arequipa/i, "Perú"],
  [/Paraguay|Asunci[oó]n/i, "Paraguay"],
  [/Uruguay|Montevideo|Punta del Este/i, "Uruguay"],
  [/Bolivia/i, "Bolivia"],
  [/Colombia|Bogot[aá]|\bCali\b|Medell[ií]n/i, "Colombia"],
  [/Ecuador|Quito|Guayaquil/i, "Ecuador"],
  [/M[eé]xico/i, "México"],
  [/Panam[aá]/i, "Panamá"],
  [/Canad[aá]|Toronto|Vancouver/i, "Canadá"],
  [/Australia|Perth|S[ií]dney|Melbourne/i, "Australia"],
  [/Francia|Par[ií]s(?![a-z])/i, "Francia"],
  [/Espa[ñn]a|Madrid|Barcelona/i, "España"],
  [/Italia|Roma\b|Mil[aá]n/i, "Italia"],
  [/Alemania|Berl[ií]n|M[uú]nich|D[uü]sseldorf|Hamburgo/i, "Alemania"],
  [/Portugal|Lisboa/i, "Portugal"],
  [/Suiza|Ginebra|Z[uú]rich/i, "Suiza"],
  [/B[eé]lgica|Bruselas/i, "Bélgica"],
  [/Austria|Viena/i, "Austria"],
  [/Jap[oó]n|Tokio/i, "Japón"],
  [/\bIndia\b|Nueva Delhi/i, "India"],
  [/Israel/i, "Israel"],
  [/Singapur/i, "Singapur"],
  [/Turqu[ií]a|Estambul/i, "Turquía"],
  [/Rusia|Mosc[uú]/i, "Rusia"],
  [/Finlandia|Helsinki|Laponia/i, "Finlandia"],
  [/Suecia|Estocolmo/i, "Suecia"],
  [/Noruega|Oslo/i, "Noruega"],
  [/Dinamarca|Copenhague/i, "Dinamarca"],
];

/** País o países del destino ("Hamburgo, Bruselas y Lisboa" -> "Alemania, Bélgica, Portugal"). */
export function countryOf(text: string): string {
  const found = COUNTRIES.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (found.length) return found.join(", ");
  if (/Buenos Aires|C\.?A\.?B\.?A\.?|Ciudad Aut[oó]noma|Neuqu[eé]n|C[oó]rdoba|San Juan|Rosario|Salta/i.test(text)) return "Argentina";
  return "";
}

// ---------------------------------------------------------------- destino, fechas y motivo

const DEST_STOP = String.raw`(?=,\s*(?:de |del |al |a la |el |la |los |desde|entre|a partir|en misi|quien|para |con el|con motivo|a fin|a efectos|al vehículo)|\s+(?:de la Sra|del Sr|desde|entre|a partir|en misi|para participar|a fin|con motivo|con el objeto|del d[ií]a|el d[ií]a|los d[ií]as)|\s+(?:a la|al|a los|de la|del|y a la|y al)\s+(?:Sra?\.?|Se[ñn]ora?|se[ñn]ora?|Profesora?|Lic\.?|Dra?\.?|Ing\.?|Abog\.?)(?=\s)|[.;:(]|$)`;

function cleanPlace(s: string): string {
  return squash(s)
    .replace(/^(?:la |el )?(?:Ciudad|ciudad)\s+(?:Aut[oó]noma\s+)?de\s+/, (m) => (/Aut[oó]noma/i.test(m) ? "Ciudad Autónoma de " : ""))
    .replace(/^(?:la |el )/, "")
    .replace(/[\s,–-]+$/, "")
    .slice(0, 120);
}

export function destinationFrom(article: string): string {
  const t = squash(article);
  const patterns = [
    new RegExp(String.raw`con destino a(?:\s+la)?\s+(.{3,120}?)${DEST_STOP}`, "i"),
    new RegExp(
      String.raw`(?:a realizarse|a desarrollarse|a llevarse a cabo|a celebrarse|que se (?:llevar[aá]n?|desarrollar[aá]n?|realizar[aá]n?|celebrar[aá]n?)(?: a cabo)?|se llevar[aá]n? a cabo)\s+en\s+(?:el |la )?(.{3,120}?)${DEST_STOP}`,
      "i",
    ),
    new RegExp(
      String.raw`misi[oó]n oficial(?: al exterior)?,?\s+(?:a|en|al)\s+(?:la\s+)?((?:Ciudad|Rep[uú]blica|Estado|Reino|Provincia)\b.{3,100}?)${DEST_STOP}`,
      "i",
    ),
    new RegExp(String.raw`\ben la (Ciudad de .{3,80}?)${DEST_STOP}`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) {
      const place = cleanPlace(m[1]!);
      if (place.length >= 3) return place;
    }
  }
  return "";
}

function iso(day: string, month: string, year: string): string {
  const m = MONTHS[fold(month).toLowerCase()];
  return m ? `${year}-${m}-${day.padStart(2, "0")}` : "";
}

/** "desde el 26 al 29 de agosto", "entre los días 21 de octubre al 06 de noviembre de 2024", "a partir del día 17 de abril de 2024". */
export function datesFrom(article: string, fallbackYear: string): { desde: string; hasta: string } {
  const t = fold(squash(article)).toLowerCase();
  const fm = fold(MONTH);
  const year = String.raw`(?:\s+(?:de|del)\s+(\d{4}|(?:corriente|presente)\s+ano))?`;
  const weekday = String.raw`(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+)?`;
  const y = (s?: string) => (s && /^\d{4}$/.test(s) ? s : fallbackYear);
  // Rango: "<d1> [de <m1> [de <a1>]] (al|y|hasta el|a) <d2> de <m2> [de <a2>]"
  const range = new RegExp(
    String.raw`(?:desde|entre|del?|el|los)\s+(?:el\s+|los\s+)?(?:dias?\s+)?${weekday}(\d{1,2})(?:\s*[º°])?(?:\s+de\s+${fm}${year})?,?\s+(?:y\s+hasta|hasta|al|y|a)\s+(?:el\s+|los\s+)?(?:dias?\s+)?${weekday}(\d{1,2})(?:\s*[º°])?\s+de\s+${fm}${year}`,
  );
  let m = range.exec(t);
  if (m) {
    const [, d1, m1, a1, d2, m2, a2] = m;
    const y2 = y(a2);
    const desde = iso(d1!, m1 ?? m2!, a1 ? y(a1) : y2);
    let hasta = iso(d2!, m2!, y2);
    if (desde && hasta && hasta < desde) hasta = "";
    return { desde, hasta };
  }
  m = new RegExp(String.raw`(?:a partir del?|el)\s+(?:dia\s+)?(?:[a-z]+\s+)?(\d{1,2})(?:\s*[º°])?\s+de\s+${fm}${year}`).exec(t);
  if (m) {
    const desde = iso(m[1]!, m[2]!, y(m[3]));
    // "a partir del día 27 de febrero …, con regreso el 13 de marzo de 2026".
    const back = new RegExp(
      String.raw`(?:con regreso|regresando)\s+(?:el\s+)?(?:dia\s+)?${weekday}(\d{1,2})(?:\s*[º°])?\s+de\s+${fm}${year}`,
    ).exec(t);
    const hasta = back ? iso(back[1]!, back[2]!, y(back[3])) : "";
    return { desde, hasta: hasta && hasta >= desde ? hasta : "" };
  }
  return { desde: "", hasta: "" };
}

/** Evento o motivo: el primer nombre entre comillas, o lo que sigue a "con motivo de", "con el objeto de"… */
export function reasonFrom(article: string): string {
  const t = squash(article);
  const quoted = /[“"«]([^”"»]{4,200})[”"»]/.exec(t);
  if (quoted) return squash(quoted[1]!);
  const end = String.raw`(?=,\s*(?:a realizarse|que se|en la [Cc]iudad|entre|desde|los d[ií]as|el d[ií]a)|\s+a realizarse|\.\s|;|$)`;
  // De la frase más precisa a la más general; se descarta lo que es un lugar o una fecha.
  const leads = [
    String.raw`con el objeto de (?:asistir|participar)\s+(?:a|al|en|de)`,
    String.raw`con el objeto de`,
    String.raw`con motivo de`,
    String.raw`para participar (?:de|en)`,
    String.raw`participar[aá]n? (?:en misi[oó]n oficial )?(?:de|en)`,
    String.raw`a asistir (?:en misi[oó]n oficial )?(?:a|al)`,
    String.raw`asistir[aá]n? (?:en misi[oó]n oficial )?(?:a|al)`,
    String.raw`a fin de`,
  ];
  for (const lead of leads) {
    const m = new RegExp(String.raw`${lead}\s+(?:la |el )?(.{6,200}?)${end}`, "i").exec(t);
    if (!m) continue;
    const reason = squash(m[1]!).replace(/^(?:misi[oó]n oficial\s+(?:en|de|al?)\s+)/i, "");
    if (/^(?:(?:la )?Ciudad|Rep[uú]blica|exterior|Estado de|desde|entre)\b/i.test(reason)) continue;
    return reason.slice(0, 200);
  }
  return "";
}

// ---------------------------------------------------------------- costo

const NO_COST =
  /no (?:implica(?:r[aá])?|significa(?:r[aá])?|generar[aá]|genera|demandar[aá]|ocasionar[aá]|irrogar[aá]|representar[aá]|tendr[aá]) (?:ning[uú]n |erogaci[oó]n |gasto |compromiso |costo |carga )?(?:gastos?|erogaci[oó]n(?:es)?|compromiso econ[oó]mico|costos?|cargas?)(?![a-z]*\s+en concepto de vi[aá]ticos)[^.]*|sin (?:costo|cargo|erogaci[oó]n) (?:alguno )?para (?:el Estado|la Provincia|el Gobierno)[^.]*/i;
const THIRD_PARTY =
  /(?:se har[aá]n? cargo|ser[aá]n? (?:atendid[oa]s|financiad[oa]s|afrontad[oa]s|cubiert[oa]s|solventad[oa]s|costead[oa]s) por|(?:es|ser[aá]) financiad[oa] por|son afrontados por|a cargo de (?:la organizaci[oó]n|los organizadores))[^.]*/i;
const NO_PER_DIEM =
  /no (?:generar[aá]|implica(?:r[aá])?|demandar[aá]) erogaciones? en concepto de vi[aá]ticos[^.]*|no solicitando liquidaci[oó]n de vi[aá]ticos[^.]*/i;
const PAYS =
  /(?:la Provincia(?: de Mendoza)?|el Estado Provincial|el Gobierno(?: de Mendoza| Provincial)?|el Ministerio[^,.]{0,80}?) (?:se har[aá]|se hace|tomar[aá]) cargo[^.]*|(?:liqu[ií]d(?:ese|ense|ar)|abon(?:ese|ar)|otorg(?:uese|ar))[^.]{0,80}vi[aá]ticos[^.]*|imp[uú]te(?:se|nse)[^.]{0,80}(?:gasto|erogaci)[^.]*|gastos? (?:que demande|de traslado|de pasajes)[^.]{0,120}(?:a cargo de|imputar|con cargo)[^.]*/i;

/** Qué dice la norma sobre lo que paga la Provincia. `detalle` es la frase textual, para poder verificarla. */
export function costFrom(text: string): { costo: Cost; detalle: string } {
  const t = squash(text);
  const pick = (re: RegExp) => {
    const m = re.exec(t);
    if (!m) return "";
    // La frase completa donde está la coincidencia, desde el comienzo de la oración.
    const start = Math.max(t.lastIndexOf(". ", m.index) + 2, t.lastIndexOf("Que ", m.index), 0);
    return redact(t.slice(start, m.index + m[0].length)).slice(0, 300);
  };
  let d = pick(PAYS);
  if (d && !/no (?:se har[aá]|tomar[aá])/i.test(d)) return { costo: "paga_provincia", detalle: d };
  d = pick(NO_COST);
  if (d) return { costo: "sin_costo", detalle: d };
  d = pick(THIRD_PARTY);
  if (d) return { costo: "paga_tercero", detalle: d };
  d = pick(NO_PER_DIEM);
  if (d) return { costo: "sin_viaticos", detalle: d };
  return { costo: "no_informa", detalle: "" };
}

// ---------------------------------------------------------------- personas y cargo

const ROLE =
  /^(?:Ministr|Vicegobernador|Gobernador|Subsecretari|Secretari|Director|Subdirector|Directora|Asesor|President|Vicepresident|Jef|Coordinador|Gerente|Subgerente|Administrador|Fiscal|Intendente|Diputad|Senador|Chofer|Interventor|Tesorer|Contador General|Escriban|Agente|Responsable|Representante|Delegad|Titular|Integrante|Miembro|Funcionari|Profesional|T[eé]cnic|Inspector)/i;

const TRAILING_TITLES =
  /(?:,?\s*(?:Sr|Sra|Srta|Dr|Dra|Lic|Licda|Ing|Ind|Arq|Abog|Abg|Prof|Profa|Cdor|Cdora|Cr|Cra|Mgter|Mgtr|Mgt|Mg|Tec|Tco|Bioq|Med|Esp|C\.?P\.?N|Prof)\.?|\s+(?:se[ñn]or|se[ñn]ora|Se[ñn]or|Se[ñn]ora|Profesora|Profesor|Ingeniero|Ingeniera|Licenciado|Licenciada|Doctor|Doctora|Abogado|Abogada|Contador|Contadora))+\s*,?\s*$/;

function cleanRole(s: string): string {
  const r = squash(s)
    .replace(/^[,;.\s]+|[,;.\s]+$/g, "")
    .replace(/,\s*(?:con funciones|quien|quienes|a asistir|en misi|para |a fin).*$/i, "")
    // Cola que es el comienzo de la persona siguiente: "Subsecretario de Transporte y al", "…, a la Lic".
    .replace(/,?\s+(?:y\s+)?(?:al|a la|a los|del|de la)(?:\s+(?:Sra?|Lic|Dra?|Ing|Abog|Prof|Mgt|Mgter)\.?)?$/i, "")
    .replace(TRAILING_TITLES, "")
    .replace(/[,;.\s]+$/, "");
  if (!ROLE.test(r)) return "";
  return r.charAt(0).toUpperCase() + r.slice(1, 160);
}

/** Cargo: lo que precede al nombre ("de la Sra. Ministra de X, Abog. NOMBRE") o lo que sigue al DNI ("…, Presidenta de Y"). */
export function roleOf(before: string, after: string): string {
  const b = squash(before).replace(TRAILING_TITLES, "");
  if (/\bchofer\b/i.test(b.slice(-40))) return "Chofer";
  // "…, Subsecretario de X y al Sr. NOMBRE": lo de antes es el cargo de la persona anterior; el suyo va después del DNI.
  if (/(?:^|[\s,])(?:y\s+)?(?:al|a la|a los|del|de la|la|el)$/i.test(b)) return roleAfter(after);
  const pieces = b.split(
    /(?:^|,|;|\by\b|\bpor\b)\s*(?:de la|del|de|a la|a los|al|el|la)\s+(?:(?:Sr|Sra|Se[ñn]or|Se[ñn]ora|se[ñn]or|se[ñn]ora)\.?\s+)?/,
  );
  // "Autorícese al señor Subsecretario de X, Ingeniero NOMBRE": el cargo empieza después del tratamiento.
  const honorific = /\b(?:se[ñn]ora?|Sra?\.)\s+/gi;
  const lastHonorific = [...b.matchAll(honorific)].at(-1);
  const fromBefore =
    cleanRole(pieces.at(-1) ?? "") || (lastHonorific ? cleanRole(b.slice(lastHonorific.index! + lastHonorific[0].length)) : "");
  return fromBefore || roleAfter(after);
}

function roleAfter(after: string): string {
  const a =
    squash(after).split(/,\s*(?:a asistir|quien|quienes|en misi|a realizarse|desde|entre|el d[ií]a|para )|\s+a asistir|;|\.\s/i)[0] ?? "";
  return cleanRole(a.split(/,\s*(?=[a-z])/)[0] ?? "");
}

const NAME_TITLES =
  /^(?:(?:PROFESORA|PROFESOR|ABOGADA|ABOGADO|INGENIERA|INGENIERO|LICENCIADA|LICENCIADO|DOCTORA|DOCTOR|SEÑORA|SEÑOR|CONTADORA|CONTADOR)\s+|[A-ZÁÉÍÓÚÑ]{4,},\s+(?=[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]))+/;

/**
 * Limpia lo que `nameBefore()` deja pegado al nombre en estos decretos: un título ("PROFESORA …"), la última
 * palabra del cargo ("PROTOCOLO, PABLO …") o el cargo que sigue al nombre ("CLAUDIA YANZÓN, DIRECTORA DE …").
 */
export function splitName(raw: string, body: string): { name: string; role: string } {
  let name = raw.replace(NAME_TITLES, "");
  let role = "";
  const comma = name.indexOf(", ");
  if (comma > 0 && ROLE.test(name.slice(comma + 2))) {
    name = name.slice(0, comma);
    // El cargo completo está entre el nombre y el DNI.
    const at = body.toUpperCase().indexOf(name);
    if (at >= 0) {
      const rest = body.slice(at + name.length);
      role = cleanRole(rest.slice(0, rest.search(/D\.?\s?N\.?\s?I/i)));
    }
  }
  name = name.trim();
  return { name: name.split(" ").length >= 2 ? name : "", role };
}

// ---------------------------------------------------------------- norma

/** Lee una norma: si su artículo 1 (o el primero que la menciona) autoriza una misión, devuelve una fila por persona. */
export function parseMission(text: string, fallbackYear: string): Mission[] {
  const articles = splitArticles(text);
  // El artículo que autoriza; si no repite "misión oficial" (lo dice el Visto), el primero que autoriza algo.
  const authorizes = (a: { body: string }) => /autor[ií]c|autoriz/i.test(a.body);
  const art = articles.find((a) => MISSION.test(a.body) && authorizes(a)) ?? (MISSION.test(text) ? articles.find(authorizes) : undefined);
  if (!art) return [];
  const body = squash(art.body);
  const people = peopleInLine(body);
  // Sin DNI en el decreto: el nombre en mayúsculas que sigue al título ("Abog. JIMENA HEBE LATORRE").
  if (!people.length) {
    const m = /(?:Abog|Abg|Lic|Dra?|Ing|Sra?|Prof|Cdor|Cdora)\.\s+([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,5})\b/.exec(body);
    if (m) people.push({ name: m[1]!, before: body.slice(0, m.index), after: body.slice(m.index + m[0].length) });
  }
  if (!people.length) return [];
  const destino = destinationFrom(body) || destinationFrom(text);
  const year = headerDate(text).slice(0, 4) || fallbackYear;
  const { desde, hasta } = datesFrom(body, year);
  const motivo = reasonFrom(body) || reasonFrom(text.split(/DECRETA|RESUELVE/)[0] ?? "");
  const { costo, detalle } = costFrom(text);
  const pais = countryOf(destino) || countryOf(body);
  const seen = new Set<string>();
  const out: Mission[] = [];
  for (const p of people) {
    const { name, role } = splitName(p.name, body);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      persona: name,
      cargo: role || roleOf(p.before, p.after),
      destino,
      pais,
      desde,
      hasta,
      motivo: redact(motivo),
      costo,
      detalleCosto: detalle,
    });
  }
  return out;
}

function daysBetween(desde: string, hasta: string): number | "" {
  if (!desde || !hasta) return "";
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
}

// ---------------------------------------------------------------- diccionario

const META = {
  titulo: "Misiones oficiales de funcionarios",
  fuente: "Boletín Oficial de Mendoza (decretos que autorizan misiones oficiales y salidas del país)",
  descripcion:
    "Cada fila es una persona en un decreto o resolución que autoriza una misión oficial o la salida del país, publicado en el Boletín Oficial de Mendoza. Se extrae leyendo el texto de la norma con reglas automáticas, así que puede tener errores: el texto original está en `url_pdf`. Casi ninguna norma trae el monto del viaje; `costo_provincia` resume lo que la norma dice sobre si paga la Provincia, y `detalle_costo` copia esa frase. Que una norma no lo diga no significa que el viaje no tenga costo. No se publican documentos de identidad.",
  columnas: {
    fecha_boletin: { etiqueta: "Publicado", tipo: "fecha", descripcion: "Fecha de la edición del Boletín Oficial." },
    norma_id: { etiqueta: "ID de la norma", tipo: "texto", descripcion: "Identificador de la norma en el Boletín Oficial." },
    tipo_norma: { etiqueta: "Tipo", tipo: "texto", valores: { decreto: "Decreto", resolucion: "Resolución" } },
    numero_norma: { etiqueta: "N.º", tipo: "texto" },
    fecha_norma: {
      etiqueta: "Fecha de la norma",
      tipo: "fecha",
      descripcion: "Fecha en que se firmó la norma; puede ser posterior al viaje.",
    },
    organismo_emisor: { etiqueta: "Organismo", tipo: "texto", descripcion: "Ministerio u organismo que tramitó la norma." },
    persona: { etiqueta: "Persona", tipo: "texto", descripcion: "Nombre tal como figura en la norma." },
    cargo: { etiqueta: "Cargo", tipo: "texto", descripcion: "Cargo según la norma, cuando se puede leer." },
    destino: { etiqueta: "Destino", tipo: "texto", descripcion: "Ciudad o país del viaje según la norma." },
    pais: { etiqueta: "País", tipo: "texto", descripcion: "País del destino, deducido del texto." },
    desde: { etiqueta: "Desde", tipo: "fecha", descripcion: "Primer día autorizado." },
    hasta: { etiqueta: "Hasta", tipo: "fecha", descripcion: "Último día autorizado, si la norma lo dice." },
    dias: { etiqueta: "Días", tipo: "entero", unidad: "días", descripcion: "Días entre desde y hasta, ambos incluidos." },
    motivo: { etiqueta: "Motivo", tipo: "texto", descripcion: "Evento o motivo del viaje según la norma." },
    costo_provincia: {
      etiqueta: "Costo para la Provincia",
      tipo: "texto",
      valores: {
        paga_provincia: "La Provincia paga algo (pasajes, estadía o viáticos)",
        paga_tercero: "Lo paga otro (la organización del evento, otro gobierno, un organismo federal o internacional)",
        sin_costo: "La norma dice que no tiene costo para la Provincia",
        sin_viaticos: "La norma solo dice que no se pagan viáticos",
        no_informa: "La norma no dice nada sobre el costo",
      },
      descripcion: "Lo que la norma dice sobre el costo. Casi nunca trae el monto.",
    },
    detalle_costo: { etiqueta: "Qué dice la norma del costo", tipo: "texto", descripcion: "Frase textual de la norma sobre el costo." },
    url_pdf: { etiqueta: "Texto original", tipo: "url", descripcion: "PDF publicado en el Boletín Oficial." },
  },
  orden: [
    "desde",
    "persona",
    "cargo",
    "destino",
    "pais",
    "motivo",
    "costo_provincia",
    "hasta",
    "dias",
    "detalle_costo",
    "organismo_emisor",
    "tipo_norma",
    "numero_norma",
    "fecha_norma",
    "fecha_boletin",
    "url_pdf",
  ],
};

// ---------------------------------------------------------------- run

export async function run(args: string[]) {
  const norms = await readProcessed(BOE, "normas.csv");
  if (!norms.length) {
    console.log("::warning title=misiones-oficiales::No hay normas.csv del Boletín Oficial; se conserva el CSV anterior.");
    return;
  }
  const textPath = (n: Row) => join(PROCESSED_DIR, BOE, "textos", String(n.fecha), `${n.norma_id}.txt`);

  if (args.includes("--faltantes")) {
    const ids = norms
      .filter((n) => NORM_TYPES.has(String(n.tipo)) && MISSION_SUMMARY.test(String(n.sumario)) && !existsSync(textPath(n)))
      .map((n) => n.norma_id);
    console.log(ids.length ? ids.join(",") : "(ninguna)");
    return;
  }

  const rows: Row[] = [];
  let missions = 0;
  let withoutPeople = 0;
  for (const n of norms) {
    if (!NORM_TYPES.has(String(n.tipo))) continue;
    const path = textPath(n);
    if (!existsSync(path)) continue;
    const text = await readFile(path, "utf8");
    if (!MISSION.test(text)) continue;
    const found = parseMission(text, String(n.fecha).slice(0, 4));
    if (!found.length) {
      if (MISSION_SUMMARY.test(String(n.sumario))) withoutPeople++;
      continue;
    }
    missions++;
    for (const m of found) {
      rows.push({
        fecha_boletin: n.fecha,
        norma_id: n.norma_id,
        tipo_norma: n.tipo,
        numero_norma: n.numero,
        fecha_norma: n.fecha_norma,
        organismo_emisor: n.organismo,
        persona: m.persona,
        cargo: m.cargo,
        destino: m.destino,
        pais: m.pais,
        desde: m.desde,
        hasta: m.hasta,
        dias: daysBetween(m.desde, m.hasta),
        motivo: m.motivo,
        costo_provincia: m.costo,
        detalle_costo: m.detalleCosto,
        url_pdf: n.url_pdf,
      });
    }
  }
  rows.sort(
    (a, b) =>
      String(b.desde || b.fecha_norma).localeCompare(String(a.desde || a.fecha_norma)) ||
      String(a.norma_id).localeCompare(String(b.norma_id)) ||
      String(a.persona).localeCompare(String(b.persona)),
  );
  await writeProcessed(SOURCE, "misiones.csv", rows, COLUMNS);
  await writeFile(join(PROCESSED_DIR, SOURCE, "misiones.meta.json"), `${JSON.stringify(META, null, 2)}\n`);

  const byCost: Record<string, number> = {};
  for (const r of rows) byCost[String(r.costo_provincia)] = (byCost[String(r.costo_provincia)] ?? 0) + 1;
  console.log(
    `misiones-oficiales: ${rows.length} viajeros en ${missions} normas; por costo ${JSON.stringify(byCost)}; ` +
      `${withoutPeople} normas de misión sin persona identificable.`,
  );
}
