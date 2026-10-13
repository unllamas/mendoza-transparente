/**
 * COMPR.AR Mendoza en formato OCDS 1.1 (datosabiertos-compras.mendoza.gov.ar).
 *
 * Tres tramos de release packages (2020 a 10/2023, 10/2023 a 08/2025, 08/2025 a 01/2026).
 * Se archivan crudos (gzip) y se procesan en streaming, de a un archivo, para no
 * cargar los ~220 MB de JSON en memoria. Un mismo ocid puede aparecer en varios releases
 * (de planificación/licitación y de adjudicación/contrato, y en tramos distintos): se
 * consolida quedándose, por ocid, con el último release que trae licitación y con el
 * último que trae adjudicaciones.
 */

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { archive, get, latestRaw, writeProcessed } from "@mt/core";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";

const SOURCE = "compras-ocds";
const BASE = "https://datosabiertos-compras.mendoza.gov.ar/descargar-json";
const TRAMOS = [
  { filename: "2020_20231021_v1_release.json", url: `${BASE}/01/2020_20231021_v1_release.json` },
  { filename: "20250810_release.json", url: `${BASE}/02/20250810_release.json` },
  { filename: "20260104_release.json", url: `${BASE}/03/20260104_release.json` },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Proceso {
  ocid: string;
  buyer: string;
  buyerDate: string;
  tenderDate: string;
  tender?: Record<string, unknown>;
  budget?: number | null;
  awardsDate: string;
  awards?: Record<string, unknown>[];
}

// biome-ignore lint/suspicious/noExplicitAny: OCDS releases are deeply nested, untyped JSON.
type Obj = Record<string, any>;

const procesos = new Map<string, Proceso>();

function ingest(rel: Obj) {
  // El tramo 1 usa "ocds-ppv9mm_<n>" y los siguientes "ocds-ppv9mm-<n>": se unifican.
  const ocid = String(rel.ocid ?? "").replace(/^(ocds-[a-z0-9]+)_/, "$1-");
  if (!ocid) return;
  const date = String(rel.date ?? "");
  let p = procesos.get(ocid);
  if (!p) {
    p = { ocid, buyer: "", buyerDate: "", tenderDate: "", awardsDate: "" };
    procesos.set(ocid, p);
  }
  if (rel.buyer?.name && date >= p.buyerDate) {
    p.buyer = String(rel.buyer.name);
    p.buyerDate = date;
  }
  if (rel.tender && date >= p.tenderDate) {
    const t = rel.tender as Obj;
    // Se guarda sólo lo necesario (sin items, documentos ni descripciones largas).
    p.tender = {
      title: t.title,
      status: t.status,
      procurementMethod: t.procurementMethod,
      submissionMethodDetails: t.submissionMethodDetails,
      mainProcurementCategory: t.mainProcurementCategory,
      numberOfTenderers: t.numberOfTenderers,
      startDate: t.tenderPeriod?.startDate,
      valueAmount: t.value?.amount,
      date,
    };
    p.budget = rel.planning?.budget?.amount?.amount ?? p.budget ?? null;
    p.tenderDate = date;
  } else if (rel.planning?.budget?.amount?.amount != null && p.budget == null) {
    p.budget = rel.planning.budget.amount.amount;
  }
  if (Array.isArray(rel.awards) && rel.awards.length && date >= p.awardsDate) {
    p.awards = (rel.awards as Obj[]).map((a) => ({
      id: a.id,
      status: a.status,
      date: a.date,
      suppliers: a.suppliers,
      value: a.value,
    }));
    p.awardsDate = date;
  }
}

async function streamFile(path: string): Promise<number> {
  let n = 0;
  let source: NodeJS.ReadableStream = createReadStream(path);
  if (path.endsWith(".gz")) source = source.pipe(createGunzip());
  const tokens = source
    .pipe(parser.asStream())
    .pipe(pick.asStream({ filter: "releases" }))
    .pipe(streamArray.asStream());
  for await (const item of tokens as AsyncIterable<{ value: Obj }>) {
    ingest(item.value);
    n++;
  }
  return n;
}

const cuit = (id: unknown) => String(id ?? "").replace(/^AR-CUIT-MZ-/, "");
const day = (s: unknown) => (s ? String(s).slice(0, 10) : "");

/** Tramos conocidos más los que aparezcan en la página de datasets (el Gobierno publica cortes nuevos cada tanto). */
async function descubrirTramos() {
  const tramos = [...TRAMOS];
  try {
    const html = await (await get("https://datosabiertos-compras.mendoza.gov.ar/datasets/")).text();
    for (const m of html.matchAll(/descargar-json\/(\d+)\/([\w.-]+\.json)/g)) {
      const url = `${BASE}/${m[1]}/${m[2]}`;
      if (!tramos.some((t) => t.url === url)) {
        tramos.push({ filename: m[2]!, url });
        console.log(`Tramo nuevo detectado: ${m[2]}`);
      }
    }
  } catch (err) {
    console.warn(`No se pudo leer la página de datasets; se usan los tramos conocidos (${err})`);
  }
  return tramos;
}

export async function run(_args: string[]) {
  const TRAMOS = await descubrirTramos();
  for (const t of TRAMOS) {
    const resp = await get(t.url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const saved = await archive(SOURCE, t.filename, bytes, { url: t.url });
    console.log(`${t.filename}: ${(bytes.length / 1e6).toFixed(1)} MB ${saved ? "archivado" : "sin cambios"}`);
    await sleep(1500);
  }

  for (const t of TRAMOS) {
    const path = await latestRaw(SOURCE, t.filename);
    if (!path) throw new Error(`No hay archivo crudo para ${t.filename}`);
    const n = await streamFile(path);
    console.log(`${t.filename}: ${n} releases (acumulado: ${procesos.size} procesos)`);
  }

  const procesosRows: Record<string, string | number | null>[] = [];
  const adjRows: Record<string, string | number | null>[] = [];
  for (const p of [...procesos.values()].sort((a, b) => a.ocid.localeCompare(b.ocid))) {
    const t = p.tender ?? {};
    procesosRows.push({
      ocid: p.ocid,
      fecha: day(t.startDate) || day(t.date),
      comprador: p.buyer,
      titulo: (t.title as string) ?? "",
      metodo_contratacion: (t.submissionMethodDetails as string) ?? "",
      estado: (t.status as string) ?? "",
      monto_estimado: p.budget ?? (t.valueAmount as number | undefined) ?? null,
      cantidad_oferentes: (t.numberOfTenderers as number | undefined) ?? null,
      metodo_ocds: (t.procurementMethod as string) ?? "",
      categoria: (t.mainProcurementCategory as string) ?? "",
    });
    for (const a of (p.awards ?? []) as Obj[]) {
      const sups = (a.suppliers ?? []) as Obj[];
      for (const s of sups.length ? sups : [{}]) {
        adjRows.push({
          ocid: p.ocid,
          fecha_adjudicacion: day(a.date),
          proveedor_nombre: s.name ?? "",
          proveedor_cuit: cuit(s.id),
          monto: a.value?.amount ?? null,
          moneda: a.value?.currency ?? "",
          estado_adjudicacion: a.status ?? "",
          proveedores_en_adjudicacion: sups.length,
        });
      }
    }
  }

  await writeProcessed(SOURCE, "procesos.csv", procesosRows, [
    "ocid",
    "fecha",
    "comprador",
    "titulo",
    "metodo_contratacion",
    "estado",
    "monto_estimado",
    "cantidad_oferentes",
    "metodo_ocds",
    "categoria",
  ]);
  await writeProcessed(SOURCE, "adjudicaciones.csv", adjRows, [
    "ocid",
    "fecha_adjudicacion",
    "proveedor_nombre",
    "proveedor_cuit",
    "monto",
    "moneda",
    "estado_adjudicacion",
    "proveedores_en_adjudicacion",
  ]);
  console.log(`procesos.csv: ${procesosRows.length} filas; adjudicaciones.csv: ${adjRows.length} filas`);
}
