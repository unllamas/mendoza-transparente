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
 * De algunas normas además se leen sus tablas (ver ACTIVITY_TABLES): hoy, el Anexo A de la tarifaria de Godoy
 * Cruz, con el monto de cada rubro comercial por categoría.
 *
 * Por ahora es un piloto: la lista de normas está escrita a mano en NORMAS.
 *
 *   bun run scrape tributos
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  archive,
  collapseSpaces,
  fetchOrReuse,
  latestRaw,
  PROCESSED_DIR,
  parseArNumber,
  type Row,
  readProcessed,
  readRaw,
  writeProcessed,
} from "@mt/core";
import { getDocumentProxy } from "unpdf";
import { pdfPages } from "../lib/pdf.ts";
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
  "pagina",
];

/** Categories of Godoy Cruz's Anexo A, from the most to the least expensive. */
const GODOY_CRUZ_CATEGORIES = ["1A", "1B", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/**
 * Anexo A of Godoy Cruz's tarifaria: one line per activity with its code, name, kind (COM, IND, SERV, AP),
 * the amount for each of the 12 categories and one or two trailing 0/1 flags that the ordinance does not explain.
 * Amounts are kept as published even when a cheaper category costs more than the previous one (a likely typo
 * in the ordinance): those are logged so they can be checked against the original.
 * Group headers ("7000 FABRICACIÓN PRENDAS VESTIR") carry no amounts.
 */
export function parseGodoyCruzActivities(text: string): Omit<Row, "norma_id" | "jurisdiccion" | "ejercicio">[] {
  const rows: Omit<Row, "norma_id" | "jurisdiccion" | "ejercicio">[] = [];
  let page = 0;
  let group = "";
  const amount = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
  const line = new RegExp(`^(\\d{4,6}) (.+?) (COM|IND|SERV|AP) ((?:${amount} ){12})[01](?: [01])*$`);
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    const p = l.match(/^── página (\d+) ──$/);
    if (p) {
      page = Number(p[1]);
      continue;
    }
    const m = l.match(line);
    if (m) {
      const amounts = m[4]!.trim().split(" ").map(parseArNumber);
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i]! > amounts[i - 1]!)
          console.warn(`  revisar ${m[1]} (pág. ${page}): la categoría ${GODOY_CRUZ_CATEGORIES[i]} cuesta más que la anterior`);
      }
      amounts.forEach((monto, i) =>
        rows.push({
          codigo: m[1]!,
          grupo: group,
          rubro: m[2]!,
          tipo_actividad: m[3]!,
          categoria: GODOY_CRUZ_CATEGORIES[i]!,
          monto,
          pagina: page,
        }),
      );
      continue;
    }
    const g = l.match(/^(\d+000) ([A-ZÁÉÍÓÚÑ][^\d]+)$/);
    if (g) group = collapseSpaces(g[2]!);
  }
  return rows;
}

/** Tables read from each norm's text, keyed by norma_id. */
const ACTIVITY_TABLES: Record<string, (text: string) => Omit<Row, "norma_id" | "jurisdiccion" | "ejercicio">[]> = {
  "297778": parseGodoyCruzActivities,
};

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
    const entry = index.get(n.norma_id);
    if (!entry) throw new Error(`La norma ${n.norma_id} no está en boletin-oficial/normas.csv`);
    const fecha = String(entry.fecha);
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

    const pdf = await fetchOrReuse(SOURCE, detail.url_pdf, `norma-${n.norma_id}.pdf`);
    const annexes = await annexLinks(pdf);
    const pages = [...(await pdfPages(pdf))];
    for (const [i, url] of annexes.entries()) {
      pages.push(...(await pdfPages(await fetchOrReuse(SOURCE, url, `norma-${n.norma_id}-anexo-${i + 1}.pdf`))));
    }

    const text = `${pages.map((p, i) => `── página ${i + 1} ──\n${p.trim()}`).join("\n\n")}\n`;
    await writeFile(join(OUT_DIR, "textos", `${n.norma_id}.txt`), text);
    const parse = ACTIVITY_TABLES[n.norma_id];
    if (parse) {
      const parsed = parse(text);
      // Godoy Cruz 2026 lists 566 activities; far fewer means the PDF layout changed and the regex missed lines.
      if (parsed.length < 500 * 12) throw new Error(`${n.jurisdiccion}: solo ${parsed.length / 12} rubros en el anexo`);
      activities.push(...parsed.map((r) => ({ norma_id: n.norma_id, jurisdiccion: n.jurisdiccion, ejercicio: n.ejercicio, ...r })));
      console.log(`  ${parsed.length / 12} rubros con monto por categoría`);
    }
    rows.push({ ...n, fecha_boletin: fecha, url_norma: detail.url_pdf, url_anexos: annexes.join(" "), paginas: pages.length });
    console.log(`${n.jurisdiccion} ${n.documento} ${n.numero}: ${pages.length} páginas, ${annexes.length} anexos`);
  }

  await writeProcessed(SOURCE, "documentos.csv", rows, COLUMNS);
  await writeProcessed(SOURCE, "rubros_comercio.csv", activities, ACTIVITY_COLUMNS);
}
