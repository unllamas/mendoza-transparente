/**
 * Regalías hidrocarburíferas por provincia (Secretaría de Energía, CKAN datos.energia.gob.ar).
 *
 * El dataset publica 4 ZIP (crudo, gas natural, GLP, gasolina/condensado), cada uno con un
 * XLSX cuya hoja "Tabla regalías" es una tabla dinámica ancha: filas año/mes, columnas
 * provincia (o cuenca, en el caso de GLP). Se pasa a formato largo.
 */

import { archive, get, writeProcessed } from "@mt/core";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

const SOURCE = "energia-regalias";
const CKAN = "http://datos.energia.gob.ar/api/3/action/package_show?id=";
const DATASET = "regalias-de-petroleo-crudo-gas-natural-glp-gasolina-y-condensado";

interface Resource {
  name: string;
  url: string;
  format: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();

function producto(name: string): string | null {
  const n = norm(name);
  if (n.includes("CRUDO")) return "petroleo_crudo";
  if (n.includes("GASOLINA")) return "gasolina_condensado";
  if (n.includes("GLP")) return "glp";
  if (n.includes("GAS")) return "gas_natural";
  return null;
}

type Out = Record<string, string | number>;

function parseWorkbook(buf: Uint8Array, prod: string): Out[] {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.SheetNames.find((s) => /regal/i.test(s) && !/gr[aá]f/i.test(s));
  if (!sheet) throw new Error(`Sin hoja de regalías para ${prod}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet]!, { header: 1, raw: true });
  const h = rows.findIndex((r) => norm(r[0]) === "ANO");
  if (h < 1) throw new Error(`Sin encabezado en ${prod}`);
  const moneda = norm(rows[h - 1]?.[0]).match(/(USD|ARS)/)?.[1] ?? "";
  const header = rows[h]!;
  const cols: { idx: number; name: string }[] = [];
  for (let i = 2; i < header.length; i++) {
    const name = String(header[i] ?? "").trim();
    if (!name || norm(name).startsWith("TOTAL")) continue;
    cols.push({ idx: i, name });
  }
  const out: Out[] = [];
  let anio = 0;
  for (const r of rows.slice(h + 1)) {
    const mes = Number(r[1]);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) break;
    if (r[0] !== null && r[0] !== undefined && r[0] !== "") anio = Number(r[0]);
    for (const c of cols) {
      const v = r[c.idx];
      if (typeof v !== "number") continue;
      out.push({
        anio,
        mes,
        provincia: c.name,
        producto: prod,
        monto: Math.round(v * 100) / 100,
        moneda,
        ambito: /CUENCA/i.test(c.name) ? "cuenca" : "provincia",
      });
    }
  }
  // La planilla trae los meses futuros del año en curso rellenos con ceros: se descartan.
  const last = Math.max(0, ...out.filter((o) => Number(o.monto) !== 0).map((o) => Number(o.anio) * 100 + Number(o.mes)));
  return out.filter((o) => Number(o.anio) * 100 + Number(o.mes) <= last);
}

export async function run(_args: string[]) {
  const apiUrl = CKAN + DATASET;
  const meta = new Uint8Array(await (await get(apiUrl)).arrayBuffer());
  await archive(SOURCE, "package_show.json", meta, { url: apiUrl });
  const pkg = JSON.parse(new TextDecoder().decode(meta)) as { result: { resources: Resource[] } };
  const zips = pkg.result.resources.filter((r) => /zip/i.test(r.format) || /\.zip$/i.test(r.url));
  console.log(`Recursos ZIP: ${zips.length}`);

  const all: Out[] = [];
  for (const res of zips) {
    const prod = producto(res.name);
    if (!prod) {
      console.warn(`Recurso no reconocido: ${res.name}`);
      continue;
    }
    await sleep(1000);
    const filename = res.url.split("/").pop()!;
    const bytes = new Uint8Array(await (await get(res.url)).arrayBuffer());
    const saved = await archive(SOURCE, filename, bytes, { url: res.url });
    const files = unzipSync(bytes);
    const xlsxName = Object.keys(files).find((n) => /\.xlsx?$/i.test(n));
    if (!xlsxName) throw new Error(`ZIP sin XLSX: ${filename}`);
    const rows = parseWorkbook(files[xlsxName]!, prod);
    console.log(`${prod}: ${rows.length} filas (${saved ? "archivado" : "sin cambios"})`);
    all.push(...rows);
  }

  all.sort(
    (a, b) =>
      Number(a.anio) - Number(b.anio) ||
      Number(a.mes) - Number(b.mes) ||
      String(a.producto).localeCompare(String(b.producto)) ||
      String(a.provincia).localeCompare(String(b.provincia)),
  );
  await writeProcessed(SOURCE, "regalias_mensual.csv", all, [
    "anio", "mes", "provincia", "producto", "monto", "moneda", "ambito",
  ]);
  console.log(`regalias_mensual.csv: ${all.length} filas`);
}
