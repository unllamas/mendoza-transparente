/**
 * ATM Mendoza: recaudación mensual por impuesto provincial (Datos de interés > Recaudación).
 *
 * Fuente (Administración Tributaria Mendoza, tablas HTML en ISO-8859-1, meses × años, 2000 a hoy):
 *   https://atm.mendoza.gov.ar/portalatm/zoneBottom/datosInteres/recaudacion/recaudacion.jsp  (índice)
 * y una página por impuesto, en la misma carpeta:
 *   recaudacion_impuesto_ingresos.jsp       Ingresos Brutos
 *   recaudacion_impuesto_sellos.jsp         Sellos
 *   recaudacion_impuesto_automotor.jsp      Automotor
 *   recaudacion_impuesto_inmobiliario.jsp   Inmobiliario
 *   recaudacion_impuesto_varios.jsp         Ingresos Varios
 *   recaudacion_impuesto_total_mensual.jsp  Recaudación total mensual
 * (El índice enlaza además "recuadacion_impuesto_total_por_impuesto.jsp", sic, y "recaudacion_por_impuesto_anual.jsp":
 * son los mismos datos agregados por año o en otro orden, no aportan nada y no se descargan.)
 *
 * Salida (data/processed/atm-recaudacion/):
 *   - recaudacion_mensual.csv: una fila por (anio, mes, impuesto). Sin filas para meses vacíos (el mes en curso).
 *     impuesto: ingresos_brutos | sellos | automotor | inmobiliario | varios | total.
 *
 * Unidades: las tablas vienen en PESOS enteros (coma como separador de miles; algún valor trae decimales con
 * punto, p. ej. 7,882,943,560.5). Ingresos Brutos 2025 suma 1.107.582.424.260 pesos, o sea $1.107.582 millones.
 * El CSV queda en pesos nominales, sin ajustar por inflación. Son importes sin regalías ni coparticipación.
 * "total" es el total que publica la ATM (suma de los cinco impuestos, con pequeñas diferencias de redondeo).
 *
 * Revisiones: la ATM puede corregir meses pasados. En cada corrida el CSV se rearma completo desde la última
 * versión archivada de cada página; las versiones anteriores quedan en data/raw/atm-recaudacion/<fecha>/ (solo
 * se archiva una versión nueva si cambió lo que ve una persona en la página).
 * Las páginas se descargan con una pausa entre pedidos y se archivan como .html (el original es ISO-8859-1 y se
 * guarda tal cual llegó; se decodifica al procesar).
 */

import { fetchAndArchive, latestRaw, type Row, readRaw, sleep, writeProcessed } from "@mt/core";
import * as cheerio from "cheerio";

const SOURCE = "atm-recaudacion";
const BASE = "https://atm.mendoza.gov.ar/portalatm/zoneBottom/datosInteres/recaudacion";

const PAGES = [
  { impuesto: "ingresos_brutos", page: "recaudacion_impuesto_ingresos" },
  { impuesto: "sellos", page: "recaudacion_impuesto_sellos" },
  { impuesto: "automotor", page: "recaudacion_impuesto_automotor" },
  { impuesto: "inmobiliario", page: "recaudacion_impuesto_inmobiliario" },
  { impuesto: "varios", page: "recaudacion_impuesto_varios" },
  { impuesto: "total", page: "recaudacion_impuesto_total_mensual" },
] as const;

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "117,078,451,628" o "7,882,943,560.5" a número. Vacío o no numérico: null. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/\s|&nbsp;| /g, "").replaceAll(",", "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Tabla meses × años a filas (anio, mes, monto). Ignora la fila "Totales" y las celdas vacías. */
export function parseMatrix(html: string): { anio: number; mes: number; monto: number }[] {
  const $ = cheerio.load(html);
  let years: (number | null)[] = [];
  const out: { anio: number; mes: number; monto: number }[] = [];
  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td")
      .map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    const label = (cells[0] ?? "").toLowerCase();
    if (label === "meses") {
      years = cells.slice(1).map((c) => (/^\d{4}$/.test(c) ? Number(c) : null));
      return;
    }
    const month = MONTHS.indexOf(label) + 1;
    if (month === 0) return;
    cells.slice(1).forEach((c, i) => {
      const anio = years[i];
      const monto = parseAmount(c);
      if (anio && monto !== null) out.push({ anio, mes: month, monto });
    });
  });
  if (years.length === 0) throw new Error("no encontré el encabezado de años (fila «Meses»)");
  return out;
}

export async function run(_args: string[]): Promise<void> {
  console.log("Descargando páginas de recaudación de la ATM...");
  for (const p of PAGES) {
    const url = `${BASE}/${p.page}.jsp`;
    const saved = await fetchAndArchive(SOURCE, url, `${p.page}.html`);
    console.log(`  ${saved ? "nuevo" : "sin cambios"}: ${p.page}`);
    await sleep(1500);
  }

  const rows: Row[] = [];
  for (const p of PAGES) {
    const path = await latestRaw(SOURCE, `${p.page}.html`);
    if (!path) throw new Error(`no encontré ${p.page} archivado`);
    // El sitio responde en ISO-8859-1: se decodifica a mano (fetch lo leería como UTF-8).
    const html = new TextDecoder("iso-8859-1").decode(await readRaw(path));
    const parsed = parseMatrix(html);
    if (parsed.length < 250) throw new Error(`${p.page}: solo ${parsed.length} meses, la tabla cambió`);
    for (const r of parsed) {
      rows.push({ anio: r.anio, mes: r.mes, impuesto: p.impuesto, monto: r.monto, fuente_url: `${BASE}/${p.page}.jsp` });
    }
  }

  const order = PAGES.map((p) => p.impuesto) as string[];
  rows.sort(
    (a, b) =>
      Number(a.anio) - Number(b.anio) ||
      Number(a.mes) - Number(b.mes) ||
      order.indexOf(String(a.impuesto)) - order.indexOf(String(b.impuesto)),
  );
  const out = await writeProcessed(SOURCE, "recaudacion_mensual.csv", rows, ["anio", "mes", "impuesto", "monto", "fuente_url"]);

  const first = rows[0]!;
  const last = rows.at(-1)!;
  console.log(`${rows.length} filas (${first.anio}-${first.mes} a ${last.anio}-${last.mes}) -> ${out}`);
}
