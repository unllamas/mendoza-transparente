import { archive, fetchOrReuse, get, parseArNumber, sleep, writeProcessed } from "@mt/core";
import { pdfText } from "../lib/pdf.ts";

const SOURCE = "deie-ipc";
const BASE = "https://sitios.mendoza.gob.ar/deie/category/economia/precios-e-indices/";
const FEEDS: Record<string, string> = {
  "feed_ipc.xml": `${BASE}ipc/feed/`,
  "feed_precios-e-indices.xml": `${BASE}feed/`,
  "feed_canasta-basica.xml": `${BASE}canasta-basica/feed/`,
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesNum = (s: string) =>
  MESES.indexOf(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, ""),
  ) + 1;

const CAPITULOS = [
  "Alimentos y bebidas",
  "Indumentaria",
  "Vivienda y servicios básicos",
  "Equipamiento y mantenimiento del hogar",
  "Atención médica y gastos para la salud",
  "Transporte y comunicaciones",
  "Esparcimiento",
  "Educación",
  "Otros bienes y servicios",
];

export async function run(_args: string[]) {
  // 1. Feeds: siempre se piden de nuevo (cambian con cada publicación).
  const pdfUrls = new Set<string>();
  for (const [filename, url] of Object.entries(FEEDS)) {
    const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
    const saved = await archive(SOURCE, filename, bytes, { url });
    console.log(`${filename}: ${saved ? "nuevo" : "sin cambios"}`);
    const xml = new TextDecoder().decode(bytes).replaceAll("&amp;", "&");
    for (const m of xml.match(/https?:\/\/[^"'<>\s\\]+\.pdf/gi) ?? []) pdfUrls.add(m);
    await sleep(1000);
  }

  // 2. Sólo IPC de consumidor y canasta (se omiten los IPIC: insumos de la construcción).
  const ipcUrls = [...pdfUrls].filter((u) => {
    const n = u.split("/").pop()!;
    return (/IPC/i.test(n) && !/IPIC/i.test(n)) || /Indice_Precios_Consumidor/i.test(n);
  });
  const canastaUrls = [...pdfUrls].filter((u) => /CBA|CBT|canasta/i.test(u.split("/").pop()!));
  console.log(`PDF de IPC: ${ipcUrls.length}, de canasta: ${canastaUrls.length}`);

  // 3. IPC
  const mensual = new Map<string, Record<string, string | number>>();
  const capitulos = new Map<string, Record<string, string | number>>();
  for (const url of ipcUrls.sort()) {
    const filename = url.split("/").pop()!;
    const text = await pdfText(await fetchOrReuse(SOURCE, url, filename));
    const head = text.match(/registr[oó] en (\p{L}+)\s+(\d{4})/u);
    const row = text.match(/^(\d[\d.]*,\d)\s+(\d[\d.]*,\d)\s+(-?\d+,\d)\s+(-?\d+,\d)\s+(-?\d+,\d)\s*$/m);
    if (!head || !row) {
      console.warn(`No se pudo parsear ${filename}`);
      continue;
    }
    const anio = Number(head[2]);
    const mes = mesNum(head[1]!);
    const key = `${anio}-${String(mes).padStart(2, "0")}`;
    mensual.set(key, {
      anio,
      mes,
      variacion_mensual: parseArNumber(row[3]!),
      variacion_acumulada: parseArNumber(row[4]!),
      variacion_interanual: parseArNumber(row[5]!),
      indice_nivel_general: parseArNumber(row[1]!),
      indice_mes_anterior: parseArNumber(row[2]!),
      fuente_url: url,
    });
    for (const cap of CAPITULOS) {
      const m = text.match(
        new RegExp(`^${cap}\\s+(\\d[\\d.]*,\\d)\\s+(\\d[\\d.]*,\\d)\\s+(-?\\d+,\\d)\\s+(-?\\d+,\\d)\\s+(-?\\d+,\\d)`, "m"),
      );
      if (m)
        capitulos.set(`${key}-${cap}`, {
          anio,
          mes,
          capitulo: cap,
          indice: parseArNumber(m[1]!),
          variacion_mensual: parseArNumber(m[3]!),
          variacion_acumulada: parseArNumber(m[4]!),
          variacion_interanual: parseArNumber(m[5]!),
          fuente_url: url,
        });
    }
  }
  const byDate = (a: Record<string, string | number>, b: Record<string, string | number>) =>
    Number(a.anio) - Number(b.anio) || Number(a.mes) - Number(b.mes);
  const mensualRows = [...mensual.values()].sort(byDate);
  await writeProcessed(SOURCE, "ipc_mensual.csv", mensualRows, [
    "anio",
    "mes",
    "variacion_mensual",
    "variacion_acumulada",
    "variacion_interanual",
    "indice_nivel_general",
    "indice_mes_anterior",
    "fuente_url",
  ]);
  await writeProcessed(SOURCE, "ipc_capitulos.csv", [...capitulos.values()].sort(byDate), [
    "anio",
    "mes",
    "capitulo",
    "indice",
    "variacion_mensual",
    "variacion_acumulada",
    "variacion_interanual",
    "fuente_url",
  ]);
  console.log(`ipc_mensual.csv: ${mensualRows.length} filas; ipc_capitulos.csv: ${capitulos.size} filas`);

  // 4. Canasta: el comunicado trae la serie (Cuadro 1: por adulto equivalente).
  const canasta = new Map<string, Record<string, string | number>>();
  for (const url of canastaUrls.sort()) {
    const filename = url.split("/").pop()!;
    const text = await pdfText(await fetchOrReuse(SOURCE, url, filename));
    const start = text.indexOf("Cuadro 1. Canasta");
    const end = text.indexOf("Cuadro 2.", start);
    if (start < 0) continue;
    let anio = 0;
    for (const line of text.slice(start, end < 0 ? undefined : end).split("\n")) {
      const m = line.trim().match(/^(?:(\d{4})\s+)?(\p{L}+)\s+(\d[\d.]*,\d{2})\s+(\d,\d{2})\s+(\d[\d.]*,\d{2})$/u);
      if (!m || !mesNum(m[2]!)) continue;
      if (m[1]) anio = Number(m[1]);
      const mes = mesNum(m[2]!);
      canasta.set(`${anio}-${mes}`, {
        anio,
        mes,
        cba_adulto_equivalente: parseArNumber(m[3]!),
        inversa_coef_engel: parseArNumber(m[4]!),
        cbt_adulto_equivalente: parseArNumber(m[5]!),
        fuente_url: url,
      });
    }
  }
  const canastaRows = [...canasta.values()].sort(byDate);
  if (canastaRows.length) {
    await writeProcessed(SOURCE, "canasta_mensual.csv", canastaRows, [
      "anio",
      "mes",
      "cba_adulto_equivalente",
      "inversa_coef_engel",
      "cbt_adulto_equivalente",
      "fuente_url",
    ]);
  }
  console.log(`canasta_mensual.csv: ${canastaRows.length} filas`);
}
