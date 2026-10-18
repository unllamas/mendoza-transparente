/**
 * Ley de Presupuesto de Mendoza: planta de cargos (planillas 8.x) de 2020 a 2027.
 *
 * Fuente: sitio de Hacienda y Finanzas, sección "Ley de Presupuesto". Cada año tiene una página
 * (`/AAAA/MM/presupuesto-AAAA/` para la ley sancionada, `/AAAA/MM/proyecto-presupuesto-AAAA/` para el
 * proyecto) con las planillas en PDF. Las páginas se listan desde `wp-sitemap-posts-post-1.xml`. Por año se
 * toma la ley sancionada si existe; si no, el proyecto (2027 es proyecto: `es_proyecto=1`).
 *
 * Planillas (todas se archivan en data/raw/presupuesto-planta/):
 *   8.1  Planta sintética por jurisdicción (cargos y horas cátedra, permanentes y temporarios, y la partida
 *        de personal en algunos años).
 *   8.2  Cargos por carácter, jurisdicción y unidad organizativa (permanentes, temporarios, total).
 *   8.3  Cargos por carácter, jurisdicción, unidad y código escalafonario (cargo, régimen, agrupamiento, clase).
 *   8.4  Horas cátedra por carácter (o solo jurisdicción desde 2026), jurisdicción y unidad.
 *   8.5  Horas cátedra analíticas por código escalafonario (se archiva, no se procesa: la 8.4 ya trae el total por unidad).
 *   8.6  Anexo de cargos no ocupados por reserva y vacantes en trámite (desde 2022; mismo formato que la 8.3).
 *   8.7  Anexo de cargos nuevos / autorización para crear cargos (desde 2022; se archiva, no se procesa).
 *
 * Salidas (data/processed/presupuesto-planta/):
 *   - cargos.csv: una fila por (año, carácter, jurisdicción, unidad, tipo de cargo) con cargos y horas cátedra.
 *   - cargos_escalafon.csv: planilla 8.3, una fila por cargo/clase en cada unidad.
 *   - cargos_vacantes.csv: planilla 8.6, igual que la anterior pero para cargos no ocupados.
 *   - jurisdicciones.csv: planilla 8.1, totales por jurisdicción (y partida de personal cuando se publica).
 *
 * Cómo se lee el PDF: unpdf entrega, por cada fragmento de texto, su posición. Se agrupan en filas por la
 * coordenada vertical y se asignan las columnas numéricas (permanentes, temporarios, total) por su borde
 * derecho respecto del encabezado de la página, porque las celdas en cero van en blanco en 2026 y 2027 y el
 * texto plano no dice a qué columna pertenece un número. Hay dos diseños: 2020 a 2025 (columnas "TOTAL
 * PERMANENT. TEMPORAR.", códigos a la izquierda, un cero explícito) y 2026 en adelante ("PERM. TEMP. TOTAL
 * GRAL.", celdas vacías, miles con punto).
 *
 * Decisiones:
 *   - Los códigos de carácter son los de la ley: 1 Administración Central, 2 Organismos Descentralizados,
 *     3 Cuentas Especiales (sin planta) y 5 Otras Entidades. La planta (art. 7 de la ley) es de carácter 1+2+5.
 *   - Son cargos OCUPADOS al mes de corte (agosto del año anterior), no todos los cargos autorizados. Los cargos
 *     retenidos y las vacantes en trámite van aparte, en la 8.6, y también se procesan (cargos_vacantes.csv).
 *   - En 2026 y 2027 la planilla 8.4 (horas cátedra) no trae carácter ni código de jurisdicción: se completan
 *     con el nombre de la jurisdicción y el código de unidad contra la planilla 8.2 del mismo año.
 *   - Los nombres de jurisdicción y de unidad son los impresos (cambian de un año al otro, por ejemplo
 *     "Ministerio de Gobierno, Trabajo y Justicia" pasa a "Ministerio de Gobierno, Infraestructura y Desarr.
 *     Terr."): el código es lo que se mantiene.
 *   - Se verifican las sumas contra los totales que imprime cada planilla; las diferencias se avisan con
 *     `::warning::` (la propia planilla tiene alguna inconsistencia, ver la nota en el diccionario).
 *   - No hay datos personales: la planilla es por cargo, no por persona.
 */

import { fetchAndArchive, get, latestRaw, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";
import { getDocumentProxy } from "unpdf";

const SOURCE = "presupuesto-planta";
const BASE = "https://sitios.mendoza.gob.ar/haciendayfinanzas";
const FIRST_YEAR = 2020;
const warn = (title: string, msg: string) => console.log(`::warning title=presupuesto-planta ${title}::${msg}`);

/* ------------------------------------------------------------------ descarga */

interface Budget {
  year: number;
  isDraft: boolean;
  url: string;
}

interface Sheet {
  year: number;
  isDraft: boolean;
  sheet: string; // "8.2"
  filename: string;
  url: string;
}

/** Lista las páginas de presupuesto desde el sitemap. Por año prefiere la ley sancionada; si no hay, el proyecto. */
async function listBudgets(): Promise<Budget[]> {
  const xml = await (await get(`${BASE}/wp-sitemap-posts-post-1.xml`)).text();
  const byYear = new Map<number, Budget>();
  for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const law = url!.match(/\/(\d{4})\/\d{2}\/presupuesto-(\d{4})\/$/);
    const draft = url!.match(/\/(\d{4})\/\d{2}\/proyecto-(?:de-)?presupuesto-(\d{4})\/$/);
    const m = law ?? draft;
    if (!m) continue;
    const year = Number(m[2]);
    const isDraft = !law;
    const prev = byYear.get(year);
    if (!prev || (prev.isDraft && !isDraft)) byYear.set(year, { year, isDraft, url: url! });
  }
  return [...byYear.values()].filter((b) => b.year >= FIRST_YEAR).sort((a, b) => a.year - b.year);
}

async function listSheets(b: Budget): Promise<Sheet[]> {
  const pageName = `pagina-${b.isDraft ? "proyecto" : "ley"}-${b.year}.html`;
  await fetchAndArchive(SOURCE, b.url, pageName);
  const path = await latestRaw(SOURCE, pageName);
  const $ = cheerio.load((await readRaw(path!)).toString("utf8"));
  const out = new Map<string, Sheet>();
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const m = text.match(/^(8\.\d+)\b/);
    if (!m || !/\.pdf$/i.test(href)) return;
    out.set(m[1]!, {
      year: b.year,
      isDraft: b.isDraft,
      sheet: m[1]!,
      filename: `presupuesto-${b.year}${b.isDraft ? "-proyecto" : ""}_${m[1]!.replace(".", "-")}.pdf`,
      url: href,
    });
  });
  return [...out.values()].sort((a, b) => a.sheet.localeCompare(b.sheet));
}

/* ------------------------------------------------------------------ lectura de PDF */

/** Fragmento de texto con su posición: x izquierda, r derecha. */
interface Tok {
  x: number;
  r: number;
  s: string;
}
type PdfRow = Tok[];
type PdfPage = PdfRow[];

/** Texto de cada página como filas de fragmentos (de arriba hacia abajo, de izquierda a derecha). */
async function readPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const pdf = await getDocumentProxy(bytes);
  const pages: PdfPage[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items = (content.items as { str: string; width: number; transform: number[] }[])
      .filter((i) => i.str.trim())
      .map((i) => ({ x: i.transform[4]!, r: i.transform[4]! + i.width, y: i.transform[5]!, s: i.str.replace(/\s+/g, " ").trim() }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; toks: Tok[] }[] = [];
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && last.y - it.y <= 3) last.toks.push({ x: it.x, r: it.r, s: it.s });
      else rows.push({ y: it.y, toks: [{ x: it.x, r: it.r, s: it.s }] });
    }
    pages.push(rows.map((r) => r.toks.sort((a, b) => a.x - b.x)).filter((r) => !/p[aá]gina/i.test(r.map((t) => t.s).join(" "))));
  }
  return pages;
}

const NUM = /^\d{1,3}(?:[.,]\d{3})+$|^\d+$/;
const toInt = (s: string) => Number(s.replace(/[.,]/g, ""));
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Posiciones de las columnas numéricas, leídas del encabezado de cada página. */
interface Cols {
  totalLeft: number;
  permLeft: number;
  tempLeft: number;
  uoLeft: number;
  oldLayout: boolean; // 2020 a 2025: códigos primero, "U.OR."
  legacy: boolean; // 8.6 de 2023: código de 5 dígitos (carácter+jurisdicción+unidad) y 11 del escalafón
}

function findCols(page: PdfPage, prev?: Cols): Cols | undefined {
  let totalLeft = NaN;
  let permLeft = NaN;
  let tempLeft = NaN;
  let uoLeft = NaN;
  let oldLayout = false;
  let legacy = false;
  // El encabezado llega hasta la fila de "CAR" (más la siguiente: en 8.4 "TOTAL PERMANEN. TEMPORAR." va debajo).
  const carRow = page.slice(0, 14).findIndex((r) => r.some((t) => /^CAR\.?$/.test(t.s)));
  for (const row of page.slice(0, carRow >= 0 ? carRow + 2 : 14)) {
    for (const t of row) {
      if (/^(TOTAL( GRAL\.?)?|TOTAL CARGOS)$/.test(t.s)) totalLeft = t.x;
      else if (/^CARGOS PERM\.$/.test(t.s)) permLeft = t.x;
      else if (/^CARGOS TEMP\.$/.test(t.s)) tempLeft = t.x;
      else if (/^PERM\w*\.?-?\s*TEMP/i.test(t.s)) {
        // "PERMANEN. TEMPORAR." en un solo fragmento: el corte está donde empieza "TEMP".
        permLeft = t.x;
        tempLeft = t.x + ((t.r - t.x) * t.s.search(/TEMP/i)) / t.s.length;
      } else if (/^PERM(?:A|AN|ANE|ANEN|ANENT)?[.-]$/i.test(t.s)) permLeft = t.x;
      else if (/^TEMP(?:O|OR|ORA|ORAR)?[.-]$/i.test(t.s)) tempLeft = t.x;
      else if (/^U\.OR\.$/i.test(t.s)) {
        uoLeft = t.x;
        oldLayout = true;
      } else if (/^U\.O\.$/i.test(t.s)) uoLeft = t.x;
      else if (/^C\.JU\.UO$/.test(t.s)) legacy = true;
    }
  }
  if ([totalLeft, permLeft, tempLeft].some(Number.isNaN)) return prev;
  return { totalLeft, permLeft, tempLeft, uoLeft: Number.isNaN(uoLeft) ? (prev?.uoLeft ?? 0) : uoLeft, oldLayout, legacy };
}

interface Split {
  left: Tok[];
  perm: number | null;
  temp: number | null;
  total: number | null;
}

/** Separa una fila en fragmentos de la izquierda y los números de las columnas permanentes, temporarios y total. */
function splitRow(row: PdfRow, c: Cols): Split | null {
  const bound = Math.min(c.totalLeft, c.permLeft, c.tempLeft);
  const nums = row.filter((t) => t.r >= bound && NUM.test(t.s));
  if (!nums.length) return null;
  const left = row.filter((t) => !nums.includes(t));
  // Cada número va a la columna cuyo encabezado lo contiene (por el borde derecho).
  const totalFirst = c.totalLeft < c.permLeft;
  const zone = (r: number): "perm" | "temp" | "total" =>
    totalFirst
      ? r < c.permLeft
        ? "total"
        : r < c.tempLeft
          ? "perm"
          : "temp"
      : r < c.tempLeft
        ? "perm"
        : r < c.totalLeft
          ? "temp"
          : "total";
  const by: Partial<Record<"perm" | "temp" | "total", number>> = {};
  for (const t of nums) by[zone(t.r)] = toInt(t.s);
  const perm = by.perm ?? null;
  const temp = by.temp ?? null;
  return { left, perm, temp, total: by.total ?? (perm ?? 0) + (temp ?? 0) };
}

/* ------------------------------------------------------------------ planilla 8.2 y 8.4 */

interface UnitRow {
  car: number;
  jur: number;
  uo: number;
  jurName: string;
  uoName: string;
  perm: number;
  temp: number;
  total: number;
}

interface TotalRow {
  kind: "jur" | "car" | "all";
  car?: number;
  jur?: number;
  name: string;
  perm: number;
  temp: number;
  total: number;
}

interface Parsed {
  units: UnitRow[];
  totals: TotalRow[];
}

/** Nombre de unidad sin saltos raros. */
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Parser común de 8.2 (cargos) y 8.4 (horas cátedra). `withJurCode`: la planilla trae el código de jurisdicción
 * (8.2 en todos los años; 8.4 hasta 2025). En 8.4 de 2026 en adelante hay solo el nombre de la jurisdicción.
 */
function parseUnits(pages: PdfPage[], kind: "cargos" | "horas"): Parsed {
  const units: UnitRow[] = [];
  const totals: TotalRow[] = [];
  let cols: Cols | undefined;
  let car = 0;
  let jur = 0;
  let jurName = "";
  for (const page of pages) {
    cols = findCols(page, cols);
    if (!cols) continue;
    for (const row of page) {
      const sp = splitRow(row, cols);
      if (!sp) continue;
      const perm = sp.perm ?? 0;
      const temp = sp.temp ?? 0;
      const total = sp.total!;

      if (sp.perm === null && sp.temp === null && total !== 0) {
        warn("celda", `${kind}: fila sin desglose ${row.map((t) => t.s).join(" ")}`);
      }
      const text = sp.left.map((t) => t.s).join(" ");
      if (cols.oldLayout) {
        let m: RegExpMatchArray | null;
        if ((m = text.match(/^TOTAL JURISDICCI[OÓ]N (\d) (\d+) (.+)$/i))) {
          totals.push({ kind: "jur", car: +m[1]!, jur: +m[2]!, name: tidy(m[3]!), perm, temp, total });
        } else if ((m = text.match(/^TOTAL JURISDICCI[OÓ]N (\d+) (.+)$/i))) {
          totals.push({ kind: "jur", jur: +m[1]!, name: tidy(m[2]!), perm, temp, total });
        } else if ((m = text.match(/^TOTAL JURISDICCI[OÓ]N (.+?) ?(\d+)$/i))) {
          // 8.4 de 2020 a 2025: "TOTAL JURISDICCIÓN <nombre><código>" (sin carácter)
          totals.push({ kind: "jur", jur: +m[2]!, name: tidy(m[1]!), perm, temp, total });
        } else if ((m = text.match(/^TOTAL CAR[AÁ]CTER (\d)$/i))) {
          totals.push({ kind: "car", car: +m[1]!, name: "", perm, temp, total });
        } else if (/^TOTAL/i.test(text)) {
          totals.push({ kind: "all", name: tidy(text), perm, temp, total });
        } else if ((m = text.match(/^(\d) (\d+) (\d+) (.+)$/))) {
          units.push({ car: +m[1]!, jur: +m[2]!, uo: +m[3]!, jurName: "", uoName: tidy(m[4]!), perm, temp, total });
        } else if ((m = text.match(/^(.+?) ?(\d) (\d+) (\d+)$/))) {
          // 8.4 (2020 a 2025): el nombre de unidad puede ir antes o después de los códigos
          units.push({ car: +m[2]!, jur: +m[3]!, uo: +m[4]!, jurName: "", uoName: tidy(m[1]!), perm, temp, total });
        } else warn("fila", `${kind}: no se entiende "${text}"`);
        continue;
      }
      // Diseño 2026+: bloque de jurisdicción a la izquierda, bloque de unidad a la derecha de U.O.
      const jurBlock = sp.left
        .filter((t) => t.x < cols!.uoLeft - 10)
        .map((t) => t.s)
        .join(" ");
      const uoBlock = sp.left
        .filter((t) => t.x >= cols!.uoLeft - 10)
        .map((t) => t.s)
        .join(" ");
      let m: RegExpMatchArray | null;
      if ((m = jurBlock.match(/^TOTAL CAR[AÁ]CTER (\d)/i))) {
        totals.push({ kind: "car", car: +m[1]!, name: "", perm, temp, total });
        continue;
      }
      if (/^TOTAL (GENERAL|PROVINCIA)/i.test(jurBlock)) {
        totals.push({ kind: "all", name: tidy(jurBlock), perm, temp, total });
        continue;
      }
      if (/^Total\b/i.test(jurBlock) || (!uoBlock && jurBlock && !/^\d/.test(jurBlock))) {
        // "Total <jurisdicción>"; en carácter 5 hay jurisdicciones que repiten el nombre sin la palabra "Total".
        totals.push({
          kind: "jur",
          car: car || undefined,
          jur: jur || undefined,
          name: tidy(jurBlock.replace(/^Total\s+/i, "")),
          perm,
          temp,
          total,
        });
        continue;
      }
      if (jurBlock) {
        if (kind === "cargos") {
          if ((m = jurBlock.match(/^(?:(\d+) )?(\d+) (.+)$/))) {
            if (m[1]) car = +m[1];
            jur = +m[2]!;
            jurName = tidy(m[3]!);
          } else warn("fila", `${kind}: jurisdicción ilegible "${jurBlock}"`);
        } else {
          jurName = tidy(jurBlock);
          jur = 0;
        }
      }
      if (!(m = uoBlock.match(/^(\d+) (.+)$/))) {
        warn("fila", `${kind}: unidad ilegible "${uoBlock}" (${jurBlock})`);
        continue;
      }
      units.push({ car, jur, uo: +m[1]!, jurName, uoName: tidy(m[2]!), perm, temp, total });
    }
  }
  return { units, totals };
}

/* ------------------------------------------------------------------ planilla 8.3 */

interface ScaleRow {
  car: number;
  jur: number;
  uo: number;
  position: string;
  scale: string;
  class: string;
  perm: number;
  temp: number;
  total: number;
}

/**
 * Planilla 8.3: una fila por cargo/clase en cada unidad. Los códigos de carácter, jurisdicción y unidad van en
 * cada fila (2020 a 2025) o solo en la primera de cada bloque (2026 en adelante).
 */
function parseScale(pages: PdfPage[], label: string): { rows: ScaleRow[]; printed: number | null } {
  let pageNo = 0;
  let printed: number | null = null;
  const rows: ScaleRow[] = [];
  let cols: Cols | undefined;
  let codeHeader = 550;
  let car = 0;
  let jur = 0;
  let uo = 0;
  for (const page of pages) {
    pageNo++;
    cols = findCols(page, cols);
    if (!cols) continue;
    // Columna de códigos (régimen salarial, agrupamiento/tramo/subtramo y clase): empieza en el encabezado.
    for (const t of page.slice(0, 14).flat()) if (/^REG\.? ?SAL\.?$|^REGIMEN\+?$|^COD\.$/i.test(t.s)) codeHeader = t.x;
    const codeZone = codeHeader - 20;
    const parsed = page.map((row) => ({ row, sp: splitRow(row, cols!) }));
    // Inicio de la columna del nombre del cargo: la posición más frecuente del último fragmento de nombre.
    const lastNameX = new Map<number, number>();
    for (const { sp } of parsed) {
      if (!sp) continue;
      const names = sp.left.filter((t) => t.x < codeZone && !/^\d{1,3}$/.test(t.s));
      const last = names[names.length - 1];
      if (last) lastNameX.set(Math.round(last.x), (lastNameX.get(Math.round(last.x)) ?? 0) + 1);
    }
    const positionX = [...lastNameX.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 384;
    if (cols.legacy) {
      let lastCode = "";
      // 8.6 de 2023: [carácter] [jurisdicción] [CJUO nombre] código(11) clase nombre-del-cargo | permanentes temporarios total
      for (const { row, sp } of parsed) {
        if (!sp) continue;
        const text = sp.left.map((t) => t.s).join(" ");
        if (/^TOTAL GENERAL/i.test(text)) {
          printed = sp.total;
          continue;
        }
        if (/^Total\b/i.test(text)) continue;
        const cjuo = sp.left.find((t) => /^\d{5}$/.test(t.s) && t.x < 110);
        if (cjuo) {
          car = +cjuo.s[0]!;
          jur = +cjuo.s.slice(1, 3);
          uo = +cjuo.s.slice(3);
        }
        // Si el código se repite respecto de la fila anterior, el PDF lo deja en blanco.
        const code = sp.left.find((t) => /^\d{11}$/.test(t.s))?.s ?? lastCode;
        if (!code) continue;
        lastCode = code;
        const cls = sp.left.find((t) => /^\d{4}$/.test(t.s) && t.x > 300 && t.x < 345);
        const position = sp.left
          .filter((t) => t.x >= 345)
          .map((t) => t.s)
          .join(" ");
        rows.push({
          car,
          jur,
          uo,
          position: tidy(position),
          scale: code,
          class: cls?.s ?? "",
          perm: sp.perm ?? 0,
          temp: sp.temp ?? 0,
          total: sp.total!,
        });
        void row;
      }
      continue;
    }
    for (const { row, sp } of parsed) {
      if (!sp) {
        // 2025: los títulos de jurisdicción ("1 01 Poder Legislativo") y de unidad ("01 Cámara de Senadores") van en filas sin números.
        const t = row.map((x) => x.s).join(" ");
        let h: RegExpMatchArray | null;
        if (cols.oldLayout && row[0] && row[0].x < 100 && (h = t.match(/^(\d) (\d{2}) \D/))) {
          car = +h[1]!;
          jur = +h[2]!;
        } else if (cols.oldLayout && row[0] && row[0].x >= 105 && row[0].x < 125 && (h = t.match(/^(\d{1,3}) \D/))) uo = +h[1]!;
        else if (!cols.oldLayout) {
          // 2026 en adelante: "1 1 Poder Legislativo | 1 Cámara de Senadores" en la primera fila de cada unidad.
          const jb = row
            .filter((x) => x.x < cols!.uoLeft - 10)
            .map((x) => x.s)
            .join(" ");
          const ub = row
            .filter((x) => x.x >= cols!.uoLeft - 10)
            .map((x) => x.s)
            .join(" ");
          if ((h = jb.match(/^(?:(\d+) )?(\d+) \D/))) {
            if (h[1]) car = +h[1];
            jur = +h[2]!;
          }
          if ((h = ub.match(/^(\d+) \D/))) uo = +h[1]!;
        }
        continue;
      }
      const s = sp;
      const text = s.left.map((t) => t.s).join(" ");
      if (/^TOTAL\b/i.test(text)) {
        if (/^TOTAL GENERAL/i.test(text)) printed = s.total;
        continue;
      }
      const ident = s.left.filter((t) => t.x < positionX - 3);
      const position = s.left
        .filter((t) => t.x >= positionX - 3 && t.x < codeZone)
        .map((t) => t.s)
        .join(" ");
      const codes = s.left.filter((t) => t.x >= codeZone).map((t) => t.s);
      let m: RegExpMatchArray | null;
      if (cols.oldLayout) {
        // Los códigos van en la primera fila de cada unidad (2025) o en todas (2020 a 2024).
        if (
          (m = ident
            .map((t) => t.s)
            .join(" ")
            .match(/^(\d) (\d+) (\d+)\b/))
        ) {
          car = +m[1]!;
          jur = +m[2]!;
          uo = +m[3]!;
        }
      } else {
        const jurBlock = ident
          .filter((t) => t.x < cols!.uoLeft - 10)
          .map((t) => t.s)
          .join(" ");
        const uoBlock = ident
          .filter((t) => t.x >= cols!.uoLeft - 10)
          .map((t) => t.s)
          .join(" ");
        if (jurBlock && (m = jurBlock.match(/^(?:(\d+) )?(\d+)\b/))) {
          if (m[1]) car = +m[1];
          jur = +m[2]!;
        }
        if (uoBlock && (m = uoBlock.match(/^(\d+)\b/))) uo = +m[1]!;
      }
      if (!codes.length && (!text || /^U\. ORGANIZATIVA/i.test(text))) continue; // subtotal de unidad o título repetido
      if (!codes.length) {
        // Cargo sin código escalafonario (por ejemplo "LIBRES"): se conserva con los códigos vacíos.
        warn("fila 8.3", `${label} pág ${pageNo}: cargo sin códigos escalafonarios "${text}" (${s.perm}/${s.temp}/${s.total})`);
      }
      rows.push({
        car,
        jur,
        uo,
        position: tidy(position),
        scale: codes.slice(0, -1).join(" "),
        class: codes[codes.length - 1] ?? "",
        perm: s.perm ?? 0,
        temp: s.temp ?? 0,
        total: s.total!,
      });
    }
  }
  return { rows, printed };
}

/* ------------------------------------------------------------------ planilla 8.1 */

interface SummaryRow {
  car: number;
  name: string;
  cargosPerm: number;
  cargosTemp: number;
  horasPerm: number;
  horasTemp: number;
  cost: number | null;
}

interface Summary {
  rows: SummaryRow[];
  totals: { car: number | null; cargosPerm: number; cargosTemp: number; horasPerm: number; horasTemp: number }[];
}

/**
 * Planilla 8.1: cuatro columnas de cantidades (cargos permanentes y temporarios, horas permanentes y temporarias) y,
 * en algunos años, la partida de personal. El carácter se conoce al llegar a la fila "TOTAL CARÁCTER n" que cierra
 * cada grupo (en 2023 a 2025 también va en cada fila).
 */
function parseSummary(pages: PdfPage[]): Summary {
  const rows: SummaryRow[] = [];
  const totals: Summary["totals"] = [];
  let pending: SummaryRow[] = [];
  for (const page of pages) {
    // Encabezados de las cuatro columnas: los fragmentos PERMAN*/TEMPOR* de la fila de encabezado.
    const heads = page
      .slice(0, 14)
      .flat()
      .filter((t) => /^(PERM|TEMP|MENSUALES|ANUALES)/i.test(t.s))
      .sort((a, b) => a.x - b.x);
    if (heads.length < 4) continue;
    const rights = heads.slice(0, 4).map((t) => t.r);
    for (const row of page) {
      const nums = row.filter((t) => t.x > rights[0]! - 90 && /^[\d.,]+$/.test(t.s));
      if (!nums.length) continue;
      const left = row.filter((t) => !nums.includes(t) && !/^\d$/.test(t.s) && t.x < rights[0]! - 90);
      const name = tidy(left.map((t) => t.s).join(" "));
      if (!name) continue;
      const q: (number | null)[] = [null, null, null, null];
      let cost: number | null = null;
      for (const n of nums) {
        if (/\.\d{2}$/.test(n.s) || n.r > rights[3]! + 40) {
          // En 2025 la columna de costo está cortada por el borde de la página del PDF: no se toma.
          if (n.x > 780) continue;
          cost = Number(n.s.replace(/,/g, "").replace(/\.(?=\d{3}\b)/g, ""));
          continue;
        }
        let best = 0;
        for (let i = 1; i < 4; i++) if (Math.abs(n.r - rights[i]!) < Math.abs(n.r - rights[best]!)) best = i;
        q[best] = toInt(n.s);
      }
      const vals = q.map((v) => v ?? 0) as [number, number, number, number];
      const carMatch = name.match(/^TOTAL CAR[AÁ]CTER (\d)/i);
      if (carMatch) {
        const c = +carMatch[1]!;
        for (const p of pending) p.car = c;
        rows.push(...pending);
        pending = [];
        totals.push({ car: c, cargosPerm: vals[0], cargosTemp: vals[1], horasPerm: vals[2], horasTemp: vals[3] });
      } else if (/^TOTAL/i.test(name)) {
        totals.push({ car: null, cargosPerm: vals[0], cargosTemp: vals[1], horasPerm: vals[2], horasTemp: vals[3] });
      } else {
        pending.push({ car: 0, name, cargosPerm: vals[0], cargosTemp: vals[1], horasPerm: vals[2], horasTemp: vals[3], cost });
      }
    }
  }
  rows.push(...pending);
  return { rows, totals };
}

/* ------------------------------------------------------------------ corrida */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export async function run(_args: string[]) {
  const sheets: Sheet[] = [];
  for (const b of await listBudgets()) {
    await sleep(1000);
    const found = await listSheets(b);
    console.log(`${b.year}${b.isDraft ? " (proyecto)" : ""}: ${found.map((s) => s.sheet).join(", ")}`);
    sheets.push(...found);
  }
  for (const s of sheets) {
    await sleep(1000);
    await fetchAndArchive(SOURCE, s.url, s.filename);
  }

  const years = [...new Set(sheets.map((s) => s.year))];
  const cargosRows: Row[] = [];
  const scaleRows: Row[] = [];
  const vacancyRows: Row[] = [];
  const summaryRows: Row[] = [];
  const yearTotals: Record<number, Record<string, number>> = {};

  for (const year of years) {
    const mine = sheets.filter((s) => s.year === year);
    const isDraft = mine[0]!.isDraft;
    const read = async (sheet: string) => {
      const s = mine.find((x) => x.sheet === sheet);
      if (!s) return undefined;
      const path = await latestRaw(SOURCE, s.filename);
      return readPages(new Uint8Array(await readRaw(path!)));
    };
    const p82 = await read("8.2");
    const p84 = await read("8.4");
    const p83 = await read("8.3");
    const p81 = await read("8.1");
    if (!p82) {
      warn("planilla", `${year}: falta la 8.2`);
      continue;
    }

    /* 8.2: cargos por unidad */
    const cargos = parseUnits(p82, "cargos");
    const jurNames = new Map<number, string>();
    for (const u of cargos.units) if (u.jurName) jurNames.set(u.jur, u.jurName);
    for (const t of cargos.totals) if (t.kind === "jur" && t.jur && t.name && !jurNames.has(t.jur)) jurNames.set(t.jur, t.name);
    const jurByName = new Map<string, number>();
    for (const [code, name] of jurNames) jurByName.set(plain(name), code);

    // Validación: la suma de las unidades de cada (carácter, jurisdicción) contra su "Total".
    const sumKey = (car: number, jur: number) => `${car}-${jur}`;
    const unitSums = new Map<string, number>();
    for (const u of cargos.units) unitSums.set(sumKey(u.car, u.jur), (unitSums.get(sumKey(u.car, u.jur)) ?? 0) + u.total);
    let mismatches = 0;
    for (const t of cargos.totals.filter((x) => x.kind === "jur" && x.car && x.jur)) {
      const got = unitSums.get(sumKey(t.car!, t.jur!)) ?? 0;
      if (got !== t.total) {
        mismatches++;
        warn("suma 8.2", `${year} car ${t.car} jur ${t.jur} (${t.name}): unidades suman ${got}, la planilla dice ${t.total}`);
      }
      if (t.perm + t.temp !== t.total) warn("total 8.2", `${year} ${t.name}: ${t.perm}+${t.temp}≠${t.total} (el PDF mismo no cierra)`);
    }
    for (const u of cargos.units) {
      if (u.perm + u.temp !== u.total)
        warn("fila 8.2", `${year} car ${u.car} jur ${u.jur} uo ${u.uo} (${u.uoName}): ${u.perm}+${u.temp}≠${u.total} en el PDF`);
    }

    /* 8.4: horas cátedra por unidad */
    const hours = p84 ? parseUnits(p84, "horas") : { units: [], totals: [] };
    const unitIndex = new Map<string, UnitRow[]>();
    for (const u of cargos.units) {
      const k = `${u.jur}-${u.uo}`;
      unitIndex.set(k, [...(unitIndex.get(k) ?? []), u]);
    }
    const hourUnits: UnitRow[] = [];
    for (const h of hours.units) {
      if (!h.jur) {
        // 2026 en adelante: la jurisdicción viene por nombre y el carácter no viene.
        const code = jurByName.get(plain(h.jurName));
        if (!code) {
          warn("horas", `${year}: jurisdicción "${h.jurName}" de 8.4 sin código en 8.2`);
          continue;
        }
        h.jur = code;
        const cand = unitIndex.get(`${h.jur}-${h.uo}`) ?? [];
        const cars = [...new Set(cand.map((c) => c.car))];
        if (cars.length === 1) h.car = cars[0]!;
        else {
          // Unidad con horas pero sin cargos o repetida en dos caracteres: se resuelve por el nombre.
          const byName = cand.filter((c) => plain(c.uoName) === plain(h.uoName));
          if (byName.length >= 1) h.car = byName[0]!.car;
          else if (cars.length > 1) {
            warn(
              "horas",
              `${year}: jur ${h.jur} uo ${h.uo} (${h.uoName}) está en más de un carácter (${cars.join(",")}); se asigna ${cars[0]}`,
            );
            h.car = cars[0]!;
          } else {
            h.car = h.jur === 14 ? 2 : 1;
            warn("horas", `${year}: jur ${h.jur} uo ${h.uo} (${h.uoName}) sin cargos en 8.2; se asigna carácter ${h.car}`);
          }
        }
      }
      hourUnits.push(h);
    }
    const hourKey = (u: { car: number; jur: number; uo: number }) => `${u.car}-${u.jur}-${u.uo}`;
    const hoursByUnit = new Map<string, UnitRow>();
    for (const h of hourUnits) hoursByUnit.set(hourKey(h), h);
    for (const h of hourUnits)
      if (h.perm + h.temp !== h.total) warn("fila 8.4", `${year} ${hourKey(h)} ${h.uoName}: ${h.perm}+${h.temp}≠${h.total} en el PDF`);
    const carTotals = hours.totals.filter((t) => t.kind === "car");
    const hoursPrinted =
      hours.totals.find((t) => t.kind === "all")?.total ?? (carTotals.length ? sum(carTotals.map((t) => t.total)) : undefined);

    /* Cargos + horas en un solo cuadro */
    const allKeys = new Map<string, { car: number; jur: number; uo: number; name: string; jurName: string }>();
    for (const u of cargos.units)
      allKeys.set(hourKey(u), { car: u.car, jur: u.jur, uo: u.uo, name: u.uoName, jurName: jurNames.get(u.jur) ?? u.jurName });
    for (const h of hourUnits)
      if (!allKeys.has(hourKey(h)))
        allKeys.set(hourKey(h), { car: h.car, jur: h.jur, uo: h.uo, name: h.uoName, jurName: jurNames.get(h.jur) ?? h.jurName });
    const cargoByUnit = new Map<string, UnitRow>();
    for (const u of cargos.units) cargoByUnit.set(hourKey(u), u);
    const keys = [...allKeys.values()].sort((a, b) => a.car - b.car || a.jur - b.jur || a.uo - b.uo);
    for (const k of keys) {
      const c = cargoByUnit.get(hourKey(k));
      const h = hoursByUnit.get(hourKey(k));
      for (const type of ["permanente", "temporario"] as const) {
        const cargosN = c ? (type === "permanente" ? c.perm : c.temp) : 0;
        const hoursN = h ? (type === "permanente" ? h.perm : h.temp) : 0;
        if (!cargosN && !hoursN) continue;
        cargosRows.push({
          anio: year,
          es_proyecto: isDraft ? 1 : 0,
          codigo_caracter: k.car,
          codigo_jurisdiccion: k.jur,
          jurisdiccion: k.jurName,
          codigo_unidad: k.uo,
          unidad: k.name,
          tipo_cargo: type,
          cargos: cargosN,
          horas_catedra: hoursN,
        });
      }
    }

    /* 8.3: por escalafón */
    let scaleCheck = "sin 8.3";
    if (p83) {
      const scaleParsed = parseScale(p83, String(year)).rows;
      // Validación contra 8.2 por unidad.
      const bySum = new Map<string, [number, number, number]>();
      for (const r of scaleParsed) {
        const k = `${r.car}-${r.jur}-${r.uo}`;
        const cur = bySum.get(k) ?? [0, 0, 0];
        bySum.set(k, [cur[0] + r.perm, cur[1] + r.temp, cur[2] + r.total]);
      }
      let bad = 0;
      for (const u of cargos.units) {
        const got = bySum.get(`${u.car}-${u.jur}-${u.uo}`) ?? [0, 0, 0];
        if (got[0] !== u.perm || got[1] !== u.temp || got[2] !== u.total) {
          bad++;
          if (bad <= 5)
            warn(
              "suma 8.3",
              `${year} car ${u.car} jur ${u.jur} uo ${u.uo} (${u.uoName}): 8.3 suma ${got.join("/")}, 8.2 dice ${u.perm}/${u.temp}/${u.total}`,
            );
        }
      }
      scaleCheck = `${scaleParsed.length} filas, ${bad} unidades que no cierran con 8.2`;
      for (const r of scaleParsed) {
        const unit = allKeys.get(`${r.car}-${r.jur}-${r.uo}`);
        scaleRows.push({
          anio: year,
          es_proyecto: isDraft ? 1 : 0,
          codigo_caracter: r.car,
          codigo_jurisdiccion: r.jur,
          codigo_unidad: r.uo,
          unidad: unit?.name ?? "",
          cargo: r.position,
          codigo_escalafon: r.scale,
          clase: r.class,
          cargos_permanentes: r.perm,
          cargos_temporarios: r.temp,
          cargos: r.total,
        });
      }
    }

    /* 8.6: cargos no ocupados (retenidos y vacantes en trámite), solo desde 2022 */
    const p86 = await read("8.6");
    if (p86) {
      const vac = parseScale(p86, `${year} 8.6`);
      const got = sum(vac.rows.map((r) => r.total));
      if (vac.printed !== null && vac.printed !== got) warn("suma 8.6", `${year}: las filas suman ${got}, la planilla dice ${vac.printed}`);
      for (const r of vac.rows) {
        vacancyRows.push({
          anio: year,
          es_proyecto: isDraft ? 1 : 0,
          codigo_caracter: r.car,
          codigo_jurisdiccion: r.jur,
          codigo_unidad: r.uo,
          unidad: allKeys.get(`${r.car}-${r.jur}-${r.uo}`)?.name ?? "",
          cargo: r.position,
          codigo_escalafon: r.scale,
          clase: r.class,
          cargos_permanentes: r.perm,
          cargos_temporarios: r.temp,
          cargos: r.total,
        });
      }
      scaleCheck += `; 8.6 ${vac.rows.length} filas, suman ${got} (imprime ${vac.printed ?? "?"})`;
    }

    /* 8.1: totales por jurisdicción */
    let summaryCheck = "sin 8.1";
    if (p81) {
      const summary = parseSummary(p81);
      for (const r of summary.rows) {
        summaryRows.push({
          anio: year,
          es_proyecto: isDraft ? 1 : 0,
          codigo_caracter: r.car,
          jurisdiccion: r.name,
          cargos_permanentes: r.cargosPerm,
          cargos_temporarios: r.cargosTemp,
          horas_catedra_permanentes: r.horasPerm,
          horas_catedra_temporarias: r.horasTemp,
          costo_partida_personal: r.cost,
        });
      }
      const all = summary.totals.find((t) => t.car === null);
      const mine82 = sum(cargos.units.map((u) => u.perm + u.temp));
      const sum81 = sum(summary.rows.map((r) => r.cargosPerm + r.cargosTemp));
      summaryCheck = `8.1 total ${all ? all.cargosPerm + all.cargosTemp : "?"}, suma de filas 8.1 ${sum81}, 8.2 ${mine82}`;
    }

    const permTotal = sum(cargos.units.map((u) => u.perm));
    const tempTotal = sum(cargos.units.map((u) => u.temp));
    yearTotals[year] = {
      permanentes: permTotal,
      temporarios: tempTotal,
      total: permTotal + tempTotal,
      horas: sum(hourUnits.map((u) => u.total)),
    };
    console.log(
      `${year}: ${cargos.units.length} unidades, cargos ${permTotal}+${tempTotal}=${permTotal + tempTotal}, horas ${yearTotals[year]!.horas}` +
        ` (8.4 imprime ${hoursPrinted ?? "?"}); sumas por jurisdicción que no cierran: ${mismatches}; 8.3: ${scaleCheck}; ${summaryCheck}`,
    );
  }

  await writeProcessed(SOURCE, "cargos.csv", cargosRows, [
    "anio",
    "es_proyecto",
    "codigo_caracter",
    "codigo_jurisdiccion",
    "jurisdiccion",
    "codigo_unidad",
    "unidad",
    "tipo_cargo",
    "cargos",
    "horas_catedra",
  ]);
  await writeProcessed(SOURCE, "cargos_escalafon.csv", scaleRows, [
    "anio",
    "es_proyecto",
    "codigo_caracter",
    "codigo_jurisdiccion",
    "codigo_unidad",
    "unidad",
    "cargo",
    "codigo_escalafon",
    "clase",
    "cargos_permanentes",
    "cargos_temporarios",
    "cargos",
  ]);
  await writeProcessed(SOURCE, "cargos_vacantes.csv", vacancyRows, [
    "anio",
    "es_proyecto",
    "codigo_caracter",
    "codigo_jurisdiccion",
    "codigo_unidad",
    "unidad",
    "cargo",
    "codigo_escalafon",
    "clase",
    "cargos_permanentes",
    "cargos_temporarios",
    "cargos",
  ]);
  await writeProcessed(SOURCE, "jurisdicciones.csv", summaryRows, [
    "anio",
    "es_proyecto",
    "codigo_caracter",
    "jurisdiccion",
    "cargos_permanentes",
    "cargos_temporarios",
    "horas_catedra_permanentes",
    "horas_catedra_temporarias",
    "costo_partida_personal",
  ]);
  console.log(
    `cargos.csv: ${cargosRows.length} filas; cargos_escalafon.csv: ${scaleRows.length}; cargos_vacantes.csv: ${vacancyRows.length}; jurisdicciones.csv: ${summaryRows.length}`,
  );
}
