/**
 * Índices para deflactar y dolarizar: IPC (INDEC, empalmado hacia atrás) y tipo de cambio (BCRA).
 *
 * Salidas en data/processed/indices/:
 *  - ipc_nacional_mensual.csv  (anio, mes, indice base dic-2016=100, variacion_mensual, region, fuente)
 *  - tipo_cambio_mensual.csv   (promedio mensual de A3500 mayorista y minorista BCRA)
 *
 * Empalme del IPC (de más nuevo a más viejo; todo reescalado a dic-2016=100):
 *  1. 2016-12 en adelante: INDEC IPC cobertura nacional, regiones Nacional y Cuyo (serie_ipc_divisiones.csv).
 *  2. 2016-04..2016-11: INDEC IPC GBA (sh_ipc_01_18.xls, hoja "IPC GBA", dic-16=100). Es la única
 *     medición oficial de 2016; sólo cubre Gran Buenos Aires.
 *  3. 2015-11..2016-03: INDEC no publicó IPC. Puente con la variación mensual de la serie
 *     "Inflación mensual" del BCRA (API estadísticas v4, variable 27), encadenada hacia atrás desde abr-2016.
 *  4. 2014-01..2015-10: INDEC IPCNu (sh_ipcnu.xls, base oct13-sep14=100), reescalado con el puente.
 *  5. Antes de 2014: variación mensual de la serie del BCRA (variable 27) encadenada hacia atrás.
 *     OJO: 2007-2015 esa serie replica el IPC oficial de INDEC, subestimado (intervención del INDEC).
 */

import { existsSync } from "node:fs";
import { fetchAndArchive, latestRaw, readRaw, writeProcessed } from "@mt/core";
import * as XLSX from "xlsx";

const SOURCE = "indices";
const INDEC = "https://www.indec.gob.ar/ftp/cuadros/economia";
const BCRA = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const START_YEAR = 1997;

type Rec = { anio: number; mes: number; indice: number; fuente: string };

const key = (y: number, m: number) => y * 12 + (m - 1);
const ym = (k: number): [number, number] => [Math.floor(k / 12), (k % 12) + 1];
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

async function fetchRaw(url: string, filename: string): Promise<Buffer> {
  await fetchAndArchive(SOURCE, url, filename); // null = sin cambios; igual leemos el último archivado
  const path = await latestRaw(SOURCE, filename);
  if (!path || !existsSync(path)) throw new Error(`No se pudo obtener ${url}`);
  return readRaw(path);
}

async function bcraSeries(id: number, from: string, to: string, filename: string): Promise<{ fecha: string; valor: number }[]> {
  const buf = await fetchRaw(`${BCRA}/${id}?desde=${from}&hasta=${to}&limit=3000`, filename);
  const j = JSON.parse(buf.toString("utf8")) as { results: { detalle: { fecha: string; valor: number }[] }[] };
  return j.results[0]?.detalle ?? [];
}

// ---------- IPC ----------

async function ipc(): Promise<Record<string, string | number>[]> {
  // 1. INDEC cobertura nacional (CSV latin1) + XLS equivalente archivado como respaldo.
  await fetchRaw(`${INDEC}/sh_ipc_aperturas.xls`, "sh_ipc_aperturas.xls");
  const csv = new TextDecoder("latin1").decode(await fetchRaw(`${INDEC}/serie_ipc_divisiones.csv`, "serie_ipc_divisiones.csv"));
  const nacMap = new Map<number, number>();
  const cuyoMap = new Map<number, number>();
  const reg: Record<string, Map<number, number>> = { nacional: nacMap, cuyo: cuyoMap };
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const c = line.split(";");
    if (c[0] !== "0" || c.length < 8) continue;
    const target = reg[(c[7] ?? "").trim().toLowerCase()];
    if (!target) continue;
    const p = c[3] ?? "";
    target.set(key(Number(p.slice(0, 4)), Number(p.slice(4, 6))), Number((c[4] ?? "").replace(",", ".")));
  }

  // 2. INDEC IPC GBA abr-2016..dic-2017 (dic-16=100)
  const wbGba = XLSX.read(await fetchRaw(`${INDEC}/sh_ipc_01_18.xls`, "sh_ipc_01_18.xls"));
  const gba = XLSX.utils.sheet_to_json<string[]>(wbGba.Sheets["IPC GBA"]!, { header: 1, raw: false });
  const head = gba.find((r) => r[0] === "Descripción")!;
  const nivel = gba.find((r) => r[0] === "Nivel general")!;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const gbaIdx = new Map<number, number>();
  head.forEach((h, i) => {
    const m = /^([A-Za-z]{3})-(\d\d)$/.exec(h ?? "");
    if (m) gbaIdx.set(key(2000 + Number(m[2] ?? 0), MON.indexOf(m[1] ?? "") + 1), Number(nivel[i]));
  });

  // 3-5. IPCNu y variación mensual del BCRA
  const wbNu = XLSX.read(await fetchRaw(`${INDEC}/sh_ipcnu.xls`, "sh_ipcnu.xls"));
  const nuRows = XLSX.utils.sheet_to_json<string[]>(wbNu.Sheets["Serie Histórica"]!, { header: 1, raw: false });
  const nu = new Map<number, number>();
  for (const r of nuRows) {
    const y = Math.floor(Number(r[0]));
    const m = Number(r[1]);
    if (y >= 2013 && m >= 1 && m <= 12 && r[2]) nu.set(key(y, m), Number(r[2]));
  }
  const bcraVar = new Map<number, number>();
  for (const d of await bcraSeries(27, "1996-01-01", "2026-12-31", "bcra_var27_inflacion_mensual.json")) {
    bcraVar.set(key(Number(d.fecha.slice(0, 4)), Number(d.fecha.slice(5, 7))), d.valor);
  }

  const nac = nacMap;
  const out = new Map<number, Rec>();
  const put = (k: number, indice: number, fuente: string) => {
    const [anio, mes] = ym(k);
    out.set(k, { anio, mes, indice, fuente });
  };

  const k201612 = key(2016, 12);
  for (const [k, v] of [...nac].sort((a, b) => a[0] - b[0])) put(k, v, "INDEC IPC nacional (base dic-2016)");
  for (let k = key(2016, 4); k < k201612; k++) {
    const v = gbaIdx.get(k);
    if (v) put(k, v, "INDEC IPC GBA abr-dic 2016 (proxy nacional)");
  }

  // Puente 2015-11..2016-03: cadena hacia atrás desde abr-2016 con var. mensual BCRA.
  const chainBack = (fromK: number, toK: number, src: string) => {
    for (let k = fromK - 1; k >= toK; k--) {
      const v = bcraVar.get(k + 1);
      if (v === undefined) throw new Error(`Falta variación BCRA ${ym(k + 1)}`);
      put(k, out.get(k + 1)!.indice / (1 + v / 100), src);
    }
  };
  const SRC_BRIDGE = "Puente: var. mensual BCRA (v4 var.27) encadenada desde INDEC GBA abr-2016";
  chainBack(key(2016, 4), key(2015, 11), SRC_BRIDGE);

  // IPCNu 2014-01..2015-10 reescalado para que 2015-10 coincida con el puente.
  const k1510 = key(2015, 10);
  // out(2015-11) ya existe; derivamos 2015-10 por el puente y escalamos IPCNu a ese nivel.
  const idx1510 = out.get(key(2015, 11))!.indice / (1 + bcraVar.get(key(2015, 11))! / 100);
  const scale = idx1510 / nu.get(k1510)!;
  for (let k = key(2014, 1); k <= k1510; k++) {
    const v = nu.get(k);
    if (v) put(k, v * scale, "INDEC IPCNu 2014-oct 2015 (reescalado a dic-2016=100)");
  }
  // Pre-2014: cadena hacia atrás con var. mensual BCRA.
  chainBack(
    key(2014, 1),
    key(START_YEAR, 1) - 1 + 1,
    "BCRA var. mensual (v4 var.27) encadenada hacia atrás; 2007-2015 = IPC INDEC oficial subestimado",
  );
  // Un mes más (dic-1996) para poder calcular la variación de ene-1997.
  chainBack(key(START_YEAR, 1) + 0, key(START_YEAR, 1) - 1, "BCRA var. mensual (v4 var.27) encadenada hacia atrás");

  // 2014-01 tiene IPCNu; el mes previo (dic-2013) lo da la cadena, así que no se pisa nada.
  const rows: Record<string, string | number>[] = [];
  const sorted = [...out.entries()].sort((a, b) => a[0] - b[0]);
  for (const [k, r] of sorted) {
    if (k < key(START_YEAR, 1)) continue;
    const prev = out.get(k - 1);
    rows.push({
      anio: r.anio,
      mes: r.mes,
      indice: r4(r.indice),
      variacion_mensual: prev ? r4((r.indice / prev.indice - 1) * 100) : "",
      region: "nacional",
      fuente: r.fuente,
    });
  }
  // Cuyo desde dic-2016 (única disponible).
  const cuyo = [...cuyoMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [k, v] of cuyo) {
    const [anio, mes] = ym(k);
    const prev = cuyoMap.get(k - 1);
    rows.push({
      anio,
      mes,
      indice: v,
      variacion_mensual: prev ? r4((v / prev - 1) * 100) : "",
      region: "cuyo",
      fuente: "INDEC IPC región Cuyo (base dic-2016)",
    });
  }
  return rows;
}

// ---------- Tipo de cambio ----------

async function tipoCambio(): Promise<Record<string, string | number>[]> {
  const thisYear = new Date().getFullYear();
  const monthly = (id: number, from: number, tag: string) =>
    (async () => {
      const acc = new Map<number, number[]>();
      for (let y = from; y <= thisYear; y++) {
        const d = await bcraSeries(id, `${y}-01-01`, `${y}-12-31`, `bcra_var${id}_${tag}_${y}.json`);
        for (const x of d) {
          const k = key(Number(x.fecha.slice(0, 4)), Number(x.fecha.slice(5, 7)));
          (acc.get(k) ?? acc.set(k, []).get(k)!).push(x.valor);
        }
      }
      return acc;
    })();
  const may = await monthly(5, 2002, "mayorista_a3500");
  const min = await monthly(4, 2010, "minorista");
  const avg = (a?: number[]) => (a?.length ? r4(a.reduce((s, v) => s + v, 0) / a.length) : "");
  return [...may.keys()]
    .sort((a, b) => a - b)
    .map((k) => {
      const [anio, mes] = ym(k);
      return {
        anio,
        mes,
        tipo_cambio_oficial_promedio: avg(may.get(k)),
        tipo_cambio_minorista: avg(min.get(k)),
        dias_habiles_mayorista: may.get(k)!.length,
        fuente: "BCRA API estadisticas v4.0: var.5 mayorista de referencia (Com. A3500), var.4 minorista (promedio vendedor)",
      };
    });
}

const README = `# Índices para valores reales y dólares

Archivos (generados por \`bun run scrape indices\`):

- \`ipc_nacional_mensual.csv\`: anio, mes, indice (base dic-2016=100), variacion_mensual (%), region (nacional, cuyo), fuente.
- \`tipo_cambio_mensual.csv\`: promedio mensual del tipo de cambio mayorista de referencia (Com. A3500 del BCRA), minorista (promedio vendedor BCRA, desde 2010-06) y cantidad de días hábiles usados.

## Cómo deflactar

    monto_real = monto_nominal * indice[mes_referencia] / indice[mes_del_monto]

Para "pesos de hoy", mes_referencia es el último mes disponible del archivo. Para montos anuales, usar el índice promedio del año
(o el de diciembre si el monto es de cierre). Para dólares: \`monto_usd = monto_ars / tipo_cambio_oficial_promedio\` del mismo mes.
Para pesos reales en dólares constantes, primero convertir al dólar del mes y luego no deflactar por IPC argentino.

## Empalmes del IPC (columna \`fuente\`)

| Tramo | Fuente |
|---|---|
| 2016-12 en adelante | INDEC IPC cobertura nacional, regiones Nacional y Cuyo (incluye Mendoza). Base dic-2016=100. |
| 2016-04 a 2016-11 | INDEC IPC GBA (única medición oficial de 2016, sólo Gran Buenos Aires), usada como proxy nacional. |
| 2015-11 a 2016-03 | INDEC no publicó IPC. Puente con la variación mensual de "Inflación mensual" del BCRA (API v4, variable 27), encadenada hacia atrás desde abr-2016. Es el tramo menos preciso. |
| 2014-01 a 2015-10 | INDEC IPCNu (nacional urbano, base oct13-sep14=100), reescalado para empalmar con el tramo siguiente. |
| 1997-01 a 2013-12 | Variación mensual de la serie del BCRA (variable 27) encadenada hacia atrás. |

Advertencias:

- Entre 2007 y 2015 la serie del BCRA y el IPCNu replican el IPC oficial de INDEC, que está ampliamente cuestionado por subestimar la inflación (intervención del INDEC). Para ese período los pesos reales quedan sobreestimados en términos de nivel. No se pudo incorporar el IPC-CABA (DGEyC) ni índices provinciales alternativos porque el sitio de estadística de la Ciudad y datos.gob.ar no respondieron desde el entorno de scraping.
- Cuyo sólo existe desde dic-2016. Antes de esa fecha usar region = nacional.
- Los empalmes son cadenas de variaciones mensuales: los niveles absolutos antes de 2016 son una aproximación, las razones entre meses cercanos son más confiables.

## Crudos

Archivados en data/raw/indices/ (INDEC: serie_ipc_divisiones.csv, sh_ipc_aperturas.xls, sh_ipc_01_18.xls, sh_ipcnu.xls; BCRA: JSON por año de las variables 4, 5 y 27).
`;

export async function run(_args: string[]) {
  const ipcRows = await ipc();
  const p1 = await writeProcessed(SOURCE, "ipc_nacional_mensual.csv", ipcRows, [
    "anio",
    "mes",
    "indice",
    "variacion_mensual",
    "region",
    "fuente",
  ]);
  const tcRows = await tipoCambio();
  const p2 = await writeProcessed(SOURCE, "tipo_cambio_mensual.csv", tcRows, [
    "anio",
    "mes",
    "tipo_cambio_oficial_promedio",
    "tipo_cambio_minorista",
    "dias_habiles_mayorista",
    "fuente",
  ]);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(p1.replace("ipc_nacional_mensual.csv", "README.md"), README);
  console.log(`${p1}: ${ipcRows.length} filas\n${p2}: ${tcRows.length} filas`);

  // Verificaciones
  const nac = new Map(ipcRows.filter((r) => r.region === "nacional").map((r) => [`${r.anio}-${r.mes}`, Number(r.indice)]));
  const acc = (y: number) => ((nac.get(`${y}-12`)! / nac.get(`${y - 1}-12`)! - 1) * 100).toFixed(1);
  console.log(`Inflación dic/dic 2023: ${acc(2023)}% (INDEC 211,4), 2024: ${acc(2024)}% (INDEC 117,8)`);
  console.log("A3500 dic-2023:", tcRows.find((r) => r.anio === 2023 && r.mes === 12)?.tipo_cambio_oficial_promedio);
}
