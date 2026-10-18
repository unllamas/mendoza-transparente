import { fetchOrReuse, normalizeMunicipio, writeProcessed } from "@mt/core";
import * as XLSX from "xlsx";
import { pdfPages } from "../lib/pdf.ts";

const SOURCE = "poblacion";
const CENSO = "https://censo.gob.ar/wp-content/uploads";
const U = {
  censoProv: `${CENSO}/2023/11/c2022_tp_est_c1.xlsx`,
  censoDeptos: `${CENSO}/2023/11/c2022_mendoza_est_c1_13.xlsx`,
  proyProv2022: `${CENSO}/2025/10/proyecciones_jurisdicciones_2022_2040_base.csv`,
  proyDeptos2022: `${CENSO}/2026/02/base_estimaciones_pob_deptos_2022_2035.csv`,
  proyProv2010: "https://www.indec.gob.ar/ftp/cuadros/publicaciones/proyecciones_prov_2010_2040.pdf",
  proyDeptos2010: "https://www.indec.gob.ar/ftp/cuadros/poblacion/proyeccion_departamentos_10_25.pdf",
};

const PROVINCIAS: Record<number, string> = {
  2: "Ciudad Autónoma de Buenos Aires",
  6: "Buenos Aires",
  10: "Catamarca",
  14: "Córdoba",
  18: "Corrientes",
  22: "Chaco",
  26: "Chubut",
  30: "Entre Ríos",
  34: "Formosa",
  38: "Jujuy",
  42: "La Pampa",
  46: "La Rioja",
  50: "Mendoza",
  54: "Misiones",
  58: "Neuquén",
  62: "Río Negro",
  66: "Salta",
  70: "San Juan",
  74: "San Luis",
  78: "Santa Cruz",
  82: "Santa Fe",
  86: "Santiago del Estero",
  90: "Tucumán",
  94: "Tierra del Fuego",
};
const provKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const PROV_BY_KEY = new Map(Object.values(PROVINCIAS).map((n) => [provKey(n), n]));
function provFromPdfTitle(title: string): string | null {
  const k = provKey(title.replace(/\.?\s*Años.*$/, "").replace(/^Provincia del? /i, ""));
  if (k.includes("tierradelfuego")) return "Tierra del Fuego";
  if (k.includes("ciudadautonoma")) return "Ciudad Autónoma de Buenos Aires";
  return PROV_BY_KEY.get(k) ?? null;
}

const arNum = (s: string) => Number(s.replaceAll(".", ""));

function fetchCached(url: string): Promise<Buffer> {
  // censo.gob.ar sirve la cadena de certificados incompleta (UNABLE_TO_VERIFY_LEAF_SIGNATURE):
  // se relaja la verificación TLS sólo para ese host (datos públicos, verificados por sha256 y cifras).
  const init = (new URL(url).hostname === "censo.gob.ar" ? { tls: { rejectUnauthorized: false } } : {}) as RequestInit;
  return fetchOrReuse(SOURCE, url, url.split("/").pop()!, init);
}

function sheetRows(buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf);
  const name = wb.SheetNames.find((n) => /^Cuadro/.test(n.trim()))!;
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1 });
}

/** Lee un CSV con ';' (con o sin BOM) y devuelve filas como arreglos de strings. */
function parseCsv(buf: Buffer): string[][] {
  return buf
    .toString("utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split(";").map((c) => c.trim()));
}

type Row = { anio: number; nombre: string; poblacion: number; tipo: string; fuente_url: string };

export async function run(_args: string[]) {
  const bufs: Buffer[] = [];
  for (const u of Object.values(U)) bufs.push(await fetchCached(u));
  const [censoProv, censoDeptos, proyProv22, proyDeptos22, proyProv10, proyDeptos10] = bufs as [
    Buffer,
    Buffer,
    Buffer,
    Buffer,
    Buffer,
    Buffer,
  ];

  const deptos: Row[] = [];
  const provs: Row[] = [];

  // ---- Censos 2010 y 2022 ----
  for (const r of sheetRows(censoDeptos!)) {
    const name = String(r[1] ?? "");
    const m = normalizeMunicipio(name);
    if (!m) continue;
    for (const [i, anio] of [
      [2, 2010],
      [3, 2022],
    ] as const)
      deptos.push({ anio, nombre: m, poblacion: Number(r[i]), tipo: "censo", fuente_url: U.censoDeptos });
  }
  const censoTotalMza = { 2010: 0, 2022: 0 };
  for (const r of sheetRows(censoDeptos!)) {
    if (String(r[1]).trim() === "Total") {
      censoTotalMza[2010] = Number(r[2]);
      censoTotalMza[2022] = Number(r[3]);
    }
  }
  for (const r of sheetRows(censoProv!)) {
    const code = Number(r[0]);
    const prov = PROVINCIAS[code];
    if (!prov || String(r[1]).startsWith("2") || !(typeof r[2] === "number")) continue;
    for (const [i, anio] of [
      [2, 2010],
      [3, 2022],
    ] as const)
      provs.push({ anio, nombre: prov, poblacion: Number(r[i]), tipo: "censo", fuente_url: U.censoProv });
  }

  // ---- Proyecciones base 2022 (2022-2035 deptos, 2022-2040 provincias) ----
  const dAgg = new Map<string, number>();
  for (const c of parseCsv(proyDeptos22!)) {
    if (c[0] !== "50") continue;
    const m = normalizeMunicipio(c[3]!);
    if (!m) throw new Error(`Departamento no reconocido: ${c[3]}`);
    const k = `${c[7]}|${m}`;
    dAgg.set(k, (dAgg.get(k) ?? 0) + Number(c[6]));
  }
  for (const [k, v] of dAgg) {
    const [anio, nombre] = k.split("|");
    deptos.push({ anio: Number(anio), nombre: nombre!, poblacion: v, tipo: "proyeccion", fuente_url: U.proyDeptos2022 });
  }
  const pAgg = new Map<string, number>();
  for (const c of parseCsv(proyProv22!)) {
    const prov = PROVINCIAS[Number(c[0])];
    if (!prov) throw new Error(`Jurisdicción desconocida: ${c[0]}`);
    const k = `${c[4]}|${prov}`;
    pAgg.set(k, (pAgg.get(k) ?? 0) + Number(c[3]));
  }
  for (const [k, v] of pAgg) {
    const [anio, nombre] = k.split("|");
    provs.push({ anio: Number(anio), nombre: nombre!, poblacion: v, tipo: "proyeccion", fuente_url: U.proyProv2022 });
  }

  // ---- Proyecciones base 2010, sólo 2010-2021 (2022+ las cubre la serie nueva) ----
  const provPages = await pdfPages(proyProv10!);
  const mzaOld = new Map<number, number>();
  for (const page of provPages) {
    const m = page.match(/Cuadro 1\.\d+\. Población estimada al 1º de julio por sexo, según año calendario\.\s*([\s\S]*?Años 2010-2040)/);
    if (!m || /Total del país/.test(m[1]!)) continue;
    const prov = provFromPdfTitle(m[1]!.replace(/\s+/g, " "));
    if (!prov) throw new Error(`Título no reconocido: ${m[1]}`);
    let n = 0;
    for (const row of page.matchAll(/(?:^|\s)(20[1-4]\d) (\d{1,3}(?:\.\d{3})+) /g)) {
      const anio = Number(row[1]);
      if (anio > 2021) continue;
      provs.push({ anio, nombre: prov, poblacion: arNum(row[2]!), tipo: "proyeccion", fuente_url: U.proyProv2010 });
      if (prov === "Mendoza") mzaOld.set(anio, arNum(row[2]!));
      n++;
    }
    if (n !== 12) throw new Error(`${prov}: esperaba 12 años 2010-2021, leí ${n}`);
  }

  const dPages = await pdfPages(proyDeptos10!);
  const dPage = dPages.find((p) => /Cuadro 1\.13 Población estimada/.test(p) && /Provincia de Mendoza\. Años 2010-2025/.test(p));
  if (!dPage) throw new Error("No encontré el cuadro 1.13 (Mendoza) del PDF de departamentos");
  const rowsOld = dPage
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(\d{1,3}(\.\d{3})+ ){7}\d{1,3}(\.\d{3})+$/.test(l))
    .map((l) => l.split(" ").map(arNum));
  if (rowsOld.length !== 38) throw new Error(`Esperaba 38 filas (19 x 2 bloques), leí ${rowsOld.length}`);
  const names = ["Total", ...DEPTOS_ORDEN];
  const oldDeptTotals = new Map<number, number>();
  names.forEach((nm, i) => {
    const vals = [...rowsOld[i]!, ...rowsOld[i + 19]!]; // 2010-2017 y 2018-2025
    vals.forEach((v, j) => {
      const anio = 2010 + j;
      if (anio > 2021) return;
      if (nm === "Total") return void oldDeptTotals.set(anio, v);
      deptos.push({ anio, nombre: normalizeMunicipio(nm)!, poblacion: v, tipo: "proyeccion", fuente_url: U.proyDeptos2010 });
    });
  });

  // ---- Verificaciones ----
  const problems: string[] = [];
  const sumBy = (rows: Row[], tipo: string) => {
    const m = new Map<number, number>();
    for (const r of rows) if (r.tipo === tipo) m.set(r.anio, (m.get(r.anio) ?? 0) + r.poblacion);
    return m;
  };
  const dCenso = sumBy(deptos, "censo");
  if (dCenso.get(2010) !== censoTotalMza[2010] || dCenso.get(2022) !== censoTotalMza[2022])
    problems.push(`censo deptos != total: ${[...dCenso]} vs ${JSON.stringify(censoTotalMza)}`);
  const pMza = new Map(provs.filter((r) => r.nombre === "Mendoza" && r.tipo === "proyeccion").map((r) => [r.anio, r.poblacion]));
  const dProy = sumBy(deptos, "proyeccion");
  for (const [anio, sum] of dProy) {
    const tot = pMza.get(anio);
    if (tot !== undefined && Math.abs(tot - sum) > 25) problems.push(`proy ${anio}: deptos ${sum} vs provincia ${tot}`);
    if (anio <= 2021 && Math.abs((oldDeptTotals.get(anio) ?? 0) - sum) > 25)
      problems.push(`proy ${anio}: deptos ${sum} vs total PDF deptos ${oldDeptTotals.get(anio)}`);
  }
  const mzaCenso = provs.find((r) => r.nombre === "Mendoza" && r.anio === 2022 && r.tipo === "censo");
  if (mzaCenso?.poblacion !== censoTotalMza[2022]) problems.push("censo Mendoza provincias != departamentos 2022");

  const order = (a: Row, b: Row) => a.nombre.localeCompare(b.nombre, "es") || a.anio - b.anio || a.tipo.localeCompare(b.tipo);
  const cols = ["anio", "municipio", "poblacion", "tipo", "fuente_url"];
  const dOut = deptos
    .sort(order)
    .map((r) => ({ anio: r.anio, municipio: r.nombre, poblacion: r.poblacion, tipo: r.tipo, fuente_url: r.fuente_url }));
  const pOut = provs
    .sort(order)
    .map((r) => ({ anio: r.anio, provincia: r.nombre, poblacion: r.poblacion, tipo: r.tipo, fuente_url: r.fuente_url }));
  await writeProcessed(SOURCE, "poblacion_departamentos.csv", dOut, cols);
  await writeProcessed(SOURCE, "poblacion_provincias.csv", pOut, ["anio", "provincia", "poblacion", "tipo", "fuente_url"]);

  console.log(`poblacion_departamentos.csv: ${dOut.length} filas (${new Set(dOut.map((r) => r.municipio)).size} municipios)`);
  console.log(`poblacion_provincias.csv: ${pOut.length} filas (${new Set(pOut.map((r) => r.provincia)).size} provincias)`);
  console.log(`Mendoza 2022: censo ${censoTotalMza[2022]}, proyección ${pMza.get(2022)}, suma deptos ${dProy.get(2022)}`);
  console.log(problems.length ? `PROBLEMAS:\n${problems.join("\n")}` : "Verificación OK: suma de departamentos = total provincial");
}

const DEPTOS_ORDEN = [
  "Capital",
  "General Alvear",
  "Godoy Cruz",
  "Guaymallén",
  "Junín",
  "La Paz",
  "Las Heras",
  "Lavalle",
  "Luján de Cuyo",
  "Maipú",
  "Malargüe",
  "Rivadavia",
  "San Carlos",
  "San Martín",
  "San Rafael",
  "Santa Rosa",
  "Tunuyán",
  "Tupungato",
];
