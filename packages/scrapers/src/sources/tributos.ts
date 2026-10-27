/**
 * Tributos: las normas que fijan cuánto cobra cada nivel del Estado en Mendoza.
 *
 * - Provincia: la Ley Impositiva de cada año (alícuotas de Ingresos Brutos, Sellos, Inmobiliario, Automotor
 *   y tasas retributivas).
 * - Municipios: la ordenanza tarifaria de cada año y el código tributario municipal.
 *
 * Todas salen en el Boletín Oficial, casi siempre como anexo en PDF: el detalle de la norma trae un PDF de una
 * página que enlaza el anexo con el texto completo. Este scraper baja el detalle, ese PDF y sus anexos, los
 * archiva y deja el texto de cada página en data/processed/tributos/textos/<norma_id>.txt, para leerlo y
 * extraer las tablas (ver docs/planes/guia-de-tramites.md).
 *
 * De las tarifarias que tienen lector (src/tributos/readers/, uno por municipio) además se lee la tabla de la tasa
 * de comercio: el monto de cada rubro por categoría.
 *
 * Por ahora es un piloto: la lista de normas está escrita a mano en NORMAS.
 *
 *   bun run scrape tributos
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { archive, fetchOrReuse, latestRaw, PROCESSED_DIR, type Row, readProcessed, readRaw, writeProcessed } from "@mt/core";
import { getDocumentProxy } from "unpdf";
import { pdfPages, pdfRows } from "../lib/pdf.ts";
import { READERS } from "../tributos/readers/index.ts";
import { parseDetail, post } from "./boletin-oficial.ts";

const SOURCE = "tributos";
const OUT_DIR = join(PROCESSED_DIR, SOURCE);

type Level = "provincial" | "municipal";
type DocumentKind = "ley_impositiva" | "ordenanza_tarifaria" | "codigo_tributario";

interface Norm {
  norma_id: string;
  nivel: Level;
  jurisdiccion: string;
  documento: DocumentKind;
  numero: string;
  /** Año en que rige; vacío si no es anual (un código tributario). */
  ejercicio: number | "";
  /** Solo si la norma no sale en el Boletín: el PDF del sitio oficial del municipio. Entonces `norma_id` es un id propio. */
  url?: string;
}

const NORMAS: Norm[] = [
  { norma_id: "299597", nivel: "provincial", jurisdiccion: "Provincia", documento: "ley_impositiva", numero: "9680", ejercicio: 2026 },
  {
    norma_id: "297778",
    nivel: "municipal",
    jurisdiccion: "Godoy Cruz",
    documento: "ordenanza_tarifaria",
    numero: "7497",
    ejercicio: 2026,
  },
  { norma_id: "264898", nivel: "municipal", jurisdiccion: "Godoy Cruz", documento: "codigo_tributario", numero: "7443", ejercicio: "" },
  // Tanda 1 (docs/planes/guia-de-tramites.md#plan-por-municipio): solo el texto, sin lector del anexo todavía.
  { norma_id: "301387", nivel: "municipal", jurisdiccion: "Capital", documento: "ordenanza_tarifaria", numero: "4222", ejercicio: 2026 },
  { norma_id: "298597", nivel: "municipal", jurisdiccion: "Las Heras", documento: "ordenanza_tarifaria", numero: "54/25", ejercicio: 2026 },
  {
    norma_id: "300050",
    nivel: "municipal",
    jurisdiccion: "Luján de Cuyo",
    documento: "ordenanza_tarifaria",
    numero: "15095",
    ejercicio: 2026,
  },
  {
    norma_id: "266275",
    nivel: "municipal",
    jurisdiccion: "Guaymallén",
    documento: "ordenanza_tarifaria",
    numero: "10138",
    ejercicio: 2025,
  },
  {
    norma_id: "301163",
    nivel: "municipal",
    jurisdiccion: "Guaymallén",
    documento: "ordenanza_tarifaria",
    numero: "10298",
    ejercicio: 2026,
  },
  { norma_id: "263430", nivel: "municipal", jurisdiccion: "Maipú", documento: "ordenanza_tarifaria", numero: "7638", ejercicio: 2025 },
  // Its summary only says "EXPEDIENTE …": found by the survey, not by searching "TARIFARIA".
  { norma_id: "299346", nivel: "municipal", jurisdiccion: "Maipú", documento: "ordenanza_tarifaria", numero: "7831", ejercicio: 2026 },
  // Tanda 2: San Martín. Ord. 3229 amends the base tarifaria 3189/2024 and replaces its Anexo I (scanned).
  // Two errata (302612, 308284) only fix a cited ordinance number, so they are not downloaded.
  { norma_id: "302476", nivel: "municipal", jurisdiccion: "San Martín", documento: "ordenanza_tarifaria", numero: "3229", ejercicio: 2026 },
  { norma_id: "266356", nivel: "municipal", jurisdiccion: "San Martín", documento: "ordenanza_tarifaria", numero: "3189", ejercicio: 2025 },
  // Tanda 2.
  {
    norma_id: "302492",
    nivel: "municipal",
    jurisdiccion: "Tunuyán",
    documento: "ordenanza_tarifaria",
    numero: "decreto 7",
    ejercicio: 2026,
  },
  { norma_id: "302494", nivel: "municipal", jurisdiccion: "Tunuyán", documento: "ordenanza_tarifaria", numero: "3351", ejercicio: 2026 },
  // Tanda 2: norma publicada solo en el sitio municipal (no está en el Boletín), con id propio.
  {
    norma_id: "general-alvear-2026",
    nivel: "municipal",
    jurisdiccion: "General Alvear",
    documento: "ordenanza_tarifaria",
    numero: "del 2.º semestre",
    ejercicio: 2026,
    url: "https://alvearmendoza.gob.ar/wp-content/uploads/2026/08/IIIV-ORDENANZA-TARIFARIA-2026-2do.sem_.pdf",
  },
  { norma_id: "300518", nivel: "municipal", jurisdiccion: "Rivadavia", documento: "ordenanza_tarifaria", numero: "5303", ejercicio: 2026 },
  // Tanda 2: Lavalle. The 2026 text is a draft ("proyecto") sent by decree 4/2026; the sanctioned 2025 one is Ord. 1252.
  { norma_id: "303207", nivel: "municipal", jurisdiccion: "Lavalle", documento: "ordenanza_tarifaria", numero: "1284", ejercicio: 2026 },
  {
    norma_id: "303208",
    nivel: "municipal",
    jurisdiccion: "Lavalle",
    documento: "ordenanza_tarifaria",
    numero: "decreto 4/2026",
    ejercicio: 2026,
  },
  { norma_id: "267077", nivel: "municipal", jurisdiccion: "Lavalle", documento: "ordenanza_tarifaria", numero: "1252", ejercicio: 2025 },
  // Tanda 2. Its summary only says "EXPEDIENTE …"; the text is the Ordenanza Tarifaria 2026 (Ord. 1020/2025).
  { norma_id: "302510", nivel: "municipal", jurisdiccion: "Junín", documento: "ordenanza_tarifaria", numero: "1020/2025", ejercicio: 2026 },
];

const COLUMNS = [
  "norma_id",
  "nivel",
  "jurisdiccion",
  "documento",
  "numero",
  "ejercicio",
  "fecha_boletin",
  "url_norma",
  "url_anexos",
  "paginas",
];

const ACTIVITY_COLUMNS = [
  "norma_id",
  "jurisdiccion",
  "ejercicio",
  "codigo",
  "grupo",
  "rubro",
  "tipo_actividad",
  "categoria",
  "monto",
  "unidad",
  "pagina",
];

/** Links a anexos dentro de un PDF del Boletín (están como anotaciones, no en el texto). */
async function annexLinks(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const links = new Set<string>();
  for (let i = 1; i <= pdf.numPages; i++) {
    for (const a of await (await pdf.getPage(i)).getAnnotations()) {
      if (typeof a.url === "string" && /\/verpdf\/[^/]+\/anexo/.test(a.url)) links.add(a.url);
    }
  }
  return [...links];
}

export async function run(_args: string[]) {
  const index = new Map((await readProcessed("boletin-oficial", "normas.csv")).map((r) => [String(r.norma_id), r]));
  const rows: Row[] = [];
  const activities: Row[] = [];
  await mkdir(join(OUT_DIR, "textos"), { recursive: true });

  for (const n of NORMAS) {
    let fecha = "";
    let urlNorm = n.url ?? "";
    let annexes: string[] = [];
    let pdf: Buffer;
    if (n.url) {
      // Municipal site: one PDF with everything, no Boletín detail or annexes.
      pdf = await fetchOrReuse(SOURCE, n.url, `norma-${n.norma_id}.pdf`);
    } else {
      const entry = index.get(n.norma_id);
      if (!entry) throw new Error(`La norma ${n.norma_id} no está en boletin-oficial/normas.csv`);
      fecha = String(entry.fecha);
      const params = {
        tipo_busqueda: "norma",
        norma_edicto_id: n.norma_id,
        fecha_desde: String(entry.fecha_norma || fecha),
        fecha_hasta: fecha,
        tipo_boletin: "2",
      };
      const detailUrl = `https://portalgateway.mendoza.gov.ar/api/boe/detail (${new URLSearchParams(params).toString()})`;
      // The detail is a POST, so fetchOrReuse does not apply: reuse the archived copy or ask once.
      const archived = await latestRaw(SOURCE, `detalle-${n.norma_id}.html`);
      let html = archived ? (await readRaw(archived)).toString() : "";
      if (!html) {
        html = await post("detail", params);
        await archive(SOURCE, `detalle-${n.norma_id}.html`, html, { url: detailUrl });
      }
      const detail = parseDetail(html);
      if (!detail.url_pdf) throw new Error(`La norma ${n.norma_id} no tiene PDF en el Boletín`);
      urlNorm = detail.url_pdf;
      pdf = await fetchOrReuse(SOURCE, detail.url_pdf, `norma-${n.norma_id}.pdf`);
      annexes = await annexLinks(pdf);
    }
    const reader = READERS.find((r) => r.normaId === n.norma_id);
    const toPages = reader?.layout === "rows" ? pdfRows : pdfPages;
    const pages = [...(await toPages(pdf))];
    for (const [i, url] of annexes.entries()) {
      pages.push(...(await toPages(await fetchOrReuse(SOURCE, url, `norma-${n.norma_id}-anexo-${i + 1}.pdf`))));
    }

    const text = `${pages.map((p, i) => `── página ${i + 1} ──\n${p.trim()}`).join("\n\n")}\n`;
    await writeFile(join(OUT_DIR, "textos", `${n.norma_id}.txt`), text);
    if (reader) {
      const parsed = reader.read(text);
      // Far fewer activities than expected means the PDF layout changed and the reader missed lines.
      const count = new Set(parsed.map((r) => `${r.codigo}|${r.rubro}`)).size;
      if (count < reader.minActivities) throw new Error(`${n.jurisdiccion}: solo ${count} rubros en el anexo`);
      activities.push(...parsed.map((r) => ({ norma_id: n.norma_id, jurisdiccion: n.jurisdiccion, ejercicio: n.ejercicio, ...r })));
      console.log(`  ${count} rubros con monto por categoría`);
    }
    rows.push({ ...n, fecha_boletin: fecha, url_norma: urlNorm, url_anexos: annexes.join(" "), paginas: pages.length });
    console.log(`${n.jurisdiccion} ${n.documento} ${n.numero}: ${pages.length} páginas, ${annexes.length} anexos`);
  }

  await writeProcessed(SOURCE, "documentos.csv", rows, COLUMNS);
  await writeProcessed(SOURCE, "rubros_comercio.csv", activities, ACTIVITY_COLUMNS);
}
