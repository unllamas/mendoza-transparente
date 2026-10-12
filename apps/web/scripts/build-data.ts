/**
 * Prepara los datos del sitio antes de compilar. Lee sources.yaml,
 * data/raw/<id>/manifest.jsonl y data/processed/<id>/*.csv, y escribe en public/data:
 *   index.json                    catálogo de fuentes y datasets
 *   <id>/<archivo>.csv            el CSV completo, para descargar
 *   <id>/<archivo>.preview.json   las primeras filas, para mostrar en la web
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { NO_PUBLICADO_CATEGORIES } from "../src/no-publicado-categories.ts";
import type { DataIndex, DatasetMeta, Diccionario, NoPublicado, Preview, SourceMeta } from "../src/types.ts";
import { buildDeuda } from "./temas/deuda.ts";
import { buildCompras } from "./temas/compras.ts";
import { buildCoparticipacion } from "./temas/coparticipacion.ts";
import { buildEmpleo } from "./temas/empleo.ts";
import { buildFuncionarios, type Correccion } from "./temas/funcionarios.ts";
import { buildLeyes, buildMunicipios, buildOrganismosYProveedores } from "./temas/entidades.ts";
import { buildGobierno, type AgencyTable } from "./temas/gobierno.ts";
import { buildHome } from "./temas/home.ts";
import { deflactor } from "./temas/inflacion.ts";
import { buildPoblacion } from "./temas/poblacion.ts";
import { buildSenales } from "./temas/senales.ts";
import { construirPaginas } from "./paginas.ts";
import type { ResumenLey } from "./temas/leyes.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const RAW_DIR = join(ROOT, "data", "raw");
const PROCESSED_DIR = join(ROOT, "data", "processed");
/** Se escribe en una carpeta temporal y al final reemplaza a public/data de un solo paso, para que el
 * servidor de desarrollo nunca sirva la carpeta a medio generar. */
const DESTINO = join(import.meta.dir, "..", "public", "data");
const OUT = `${DESTINO}.tmp-${process.pid}`;
const PREVIEW_ROWS = 500;

interface ManifestEntry {
  filename: string;
  url: string;
  fetched_at: string;
  bytes: number;
}

/** Parser CSV mínimo (RFC 4180): comillas, comas y saltos de línea dentro de campos. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readManifest(id: string): ManifestEntry[] {
  const path = join(RAW_DIR, id, "manifest.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManifestEntry);
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalog = parseYaml(readFileSync(join(ROOT, "sources.yaml"), "utf8")) as Omit<SourceMeta, "raw">[];
// Fuentes con datos pero todavía sin entrada en sources.yaml (p. ej. dnap-aif).
const ids = new Set([...catalog.map((s) => s.id), ...listDirs(RAW_DIR), ...listDirs(PROCESSED_DIR)]);

const sources: SourceMeta[] = [...ids].sort().map((id) => {
  const entry = catalog.find((s) => s.id === id);
  const manifest = readManifest(id);
  const last = manifest.at(-1);
  return {
    id,
    nombre: entry?.nombre ?? id,
    descripcion: entry?.descripcion ?? "",
    organismo: entry?.organismo ?? "",
    url: entry?.url ?? last?.url ?? "",
    formato: entry?.formato ?? "",
    frecuencia: entry?.frecuencia ?? "",
    dificultad: entry?.dificultad ?? "",
    estado: entry?.estado ?? "pendiente",
    raw: {
      files: new Set(manifest.map((m) => m.filename)).size,
      bytes: manifest.reduce((sum, m) => sum + m.bytes, 0),
      lastFetch: last?.fetched_at ?? null,
    },
  };
});

/**
 * Clave para ordenar de lo más reciente a lo más viejo: la primera columna de tipo fecha,
 * o año + mes/trimestre. Devuelve null si la tabla no tiene dimensión temporal.
 */
function sortKey(columns: string[], dict: Diccionario | null): ((row: string[]) => string) | null {
  const defs = dict?.columnas ?? {};
  const candidatas = [...(dict?.orden ?? []), ...columns];
  const fecha = candidatas.find((c) => columns.includes(c) && (defs[c]?.tipo === "fecha" || /^fecha/.test(c)));
  if (fecha) {
    const i = columns.indexOf(fecha);
    return (row) => row[i] ?? "";
  }
  const anio = columns.indexOf("anio");
  if (anio < 0) return null;
  const sub = ["mes", "trimestre"].map((c) => columns.indexOf(c)).find((i) => i >= 0) ?? -1;
  return (row) => `${(row[anio] ?? "").padStart(4, "0")}-${sub >= 0 ? (row[sub] ?? "").padStart(2, "0") : "00"}`;
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-dato";

const DETALLE: Record<string, DatasetMeta["detalle"]> = {
  "compras-ocds/adjudicaciones.csv": "proveedor",
  "compras-ocds/procesos.csv": "proceso",
};

const datasets: DatasetMeta[] = [];
for (const id of listDirs(PROCESSED_DIR)) {
  const dir = join(PROCESSED_DIR, id);
  const outDir = join(OUT, id);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
    const path = join(dir, file);
    const [columns = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
    const dictPath = join(dir, file.replace(/\.csv$/, ".meta.json"));
    const dict = existsSync(dictPath) ? (JSON.parse(readFileSync(dictPath, "utf8")) as Diccionario) : null;
    mkdirSync(outDir, { recursive: true });
    cpSync(path, join(outDir, file));

    const key = sortKey(columns, dict);
    // Orden estable: a igual fecha se respeta el orden original.
    const sorted = key ? rows.map((r, i) => [r, i] as const).sort((a, b) => key(b[0]).localeCompare(key(a[0])) || a[1] - b[1]).map(([r]) => r) : rows;

    const base = file.replace(/\.csv$/, "");
    let groups: DatasetMeta["groups"] = null;
    const groupIdx = dict?.agruparPor ? columns.indexOf(dict.agruparPor) : -1;
    if (groupIdx >= 0) {
      const byGroup = new Map<string, string[][]>();
      for (const r of sorted) byGroup.set(r[groupIdx] ?? "", [...(byGroup.get(r[groupIdx] ?? "") ?? []), r]);
      mkdirSync(join(outDir, base), { recursive: true });
      groups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b, "es")).map((value) => {
        const groupRows = byGroup.get(value)!;
        const preview: Preview = { columns, rows: groupRows.slice(0, PREVIEW_ROWS) };
        writeFileSync(join(outDir, base, `${slug(value)}.json`), JSON.stringify(preview));
        return { value, slug: slug(value), rowCount: groupRows.length };
      });
    } else {
      const preview: Preview = { columns, rows: sorted.slice(0, PREVIEW_ROWS) };
      writeFileSync(join(outDir, `${base}.preview.json`), JSON.stringify(preview));
    }

    datasets.push({
      source: id,
      file,
      columns,
      rowCount: rows.length,
      bytes: statSync(path).size,
      dict,
      groups,
      detalle: DETALLE[`${id}/${file}`] ?? null,
    });
  }
}

// Temas: agregados listos para las páginas temáticas.
function readTable(id: string, file: string): Record<string, string>[] | null {
  const path = join(PROCESSED_DIR, id, file);
  if (!existsSync(path)) return null;
  const [header = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]!])));
}

// Población de Mendoza: proyección oficial de INDEC (base Censo 2022) para el año en curso.
const poblacionProv = readTable("poblacion", "poblacion_provincias.csv") ?? [];
const proyeccionesMza = poblacionProv.filter((r) => r.provincia === "Mendoza" && r.tipo === "proyeccion");
const anioActual = String(new Date().getFullYear());
const POBLACION_MENDOZA = Number(
  (proyeccionesMza.find((r) => r.anio === anioActual) ?? proyeccionesMza.at(-1))?.poblacion ?? 2_043_540,
);

mkdirSync(join(OUT, "temas"), { recursive: true });
const trimestral = readTable("hacienda-deuda-stock", "deuda_total_trimestral.csv");
const stock = readTable("hacienda-deuda-stock", "deuda_stock.csv");
const deudaTema = trimestral && stock ? buildDeuda(trimestral, stock, POBLACION_MENDOZA) : undefined;
if (deudaTema) writeFileSync(join(OUT, "temas", "deuda.json"), JSON.stringify(deudaTema));

const ocupacion = readTable("dnap-ocupacion", "ocupacion_salarios.csv");
const empleoTema = ocupacion ? buildEmpleo(ocupacion) : undefined;
if (empleoTema) writeFileSync(join(OUT, "temas", "empleo.json"), JSON.stringify(empleoTema));

const procesos = readTable("compras-ocds", "procesos.csv");
const adjudicaciones = readTable("compras-ocds", "adjudicaciones.csv");
if (procesos && adjudicaciones) {
  writeFileSync(
    join(OUT, "temas", "senales.json"),
    JSON.stringify(buildSenales(procesos, adjudicaciones, readTable("proveedores", "proveedores.csv") ?? [])),
  );
  buildCompras(
    procesos,
    adjudicaciones,
    join(OUT, "temas", "compras"),
    readTable("proveedores", "proveedores.csv") ?? [],
    readTable("indices", "ipc_nacional_mensual.csv") ?? [],
  );
}

const copaAnual = readTable("hacienda-participacion-municipal", "coparticipacion_anual.csv");
const ipcNacional = readTable("indices", "ipc_nacional_mensual.csv");
const pobDeptos = readTable("poblacion", "poblacion_departamentos.csv");
const copaTema = copaAnual && ipcNacional && pobDeptos ? buildCoparticipacion(copaAnual, ipcNacional, pobDeptos) : undefined;
if (copaTema) writeFileSync(join(OUT, "temas", "coparticipacion.json"), JSON.stringify(copaTema));
const poblacionTema = pobDeptos && poblacionProv.length ? buildPoblacion(pobDeptos, poblacionProv) : undefined;
if (poblacionTema) writeFileSync(join(OUT, "temas", "poblacion.json"), JSON.stringify(poblacionTema));

const legisladores = readTable("legislatura", "legisladores.csv");
const autoridades = readTable("autoridades", "autoridades.csv");
const funcionariosTema =
  legisladores && autoridades
    ? buildFuncionarios(
        legisladores,
        autoridades,
        readTable("autoridades", "remuneraciones.csv") ?? [],
        readTable("etica-publica", "funcionarios.csv") ?? [],
        readTable("etica-publica", "declaraciones.csv") ?? [],
        existsSync(join(ROOT, "data", "curado", "correcciones.yaml"))
          ? (parseYaml(readFileSync(join(ROOT, "data", "curado", "correcciones.yaml"), "utf8")) as Correccion[])
          : [],
        readTable("fotos", "fotos.csv") ?? [],
      )
    : undefined;
const usdRates = (readTable("indices", "tipo_cambio_mensual.csv") ?? []).filter((r) => Number(r.tipo_cambio_oficial_promedio) > 0);
const lastUsd = usdRates.at(-1);
if (funcionariosTema && lastUsd)
  funcionariosTema.usd = { rate: Number(lastUsd.tipo_cambio_oficial_promedio), month: `${lastUsd.anio}-${lastUsd.mes!.padStart(2, "0")}` };
if (funcionariosTema) writeFileSync(join(OUT, "temas", "funcionarios.json"), JSON.stringify(funcionariosTema));

// Fotos oficiales de funcionarios (miniaturas).
const fotosDir = join(PROCESSED_DIR, "fotos");
if (existsSync(fotosDir)) {
  mkdirSync(join(OUT, "fotos"), { recursive: true });
  for (const f of readdirSync(fotosDir).filter((f) => f.endsWith(".jpg"))) cpSync(join(fotosDir, f), join(OUT, "fotos", f));
}

// Contenido editorial: lo que el Estado no publica.
const noPublicado = join(ROOT, "data", "curado", "no-publicado.yaml");
if (existsSync(noPublicado)) {
  const items = parseYaml(readFileSync(noPublicado, "utf8")) as NoPublicado[];
  const invalid = items.filter((i) => !(i.categoria in NO_PUBLICADO_CATEGORIES));
  if (invalid.length) throw new Error(`no-publicado.yaml: categoría faltante o desconocida en ${invalid.map((i) => i.id).join(", ")}`);
  writeFileSync(join(OUT, "temas", "no-publicado.json"), JSON.stringify(items));
}

// Mapa de departamentos (lo genera el scraper "geo").
const mapa = join(PROCESSED_DIR, "geo", "mendoza_departamentos.json");
if (existsSync(mapa)) cpSync(mapa, join(OUT, "temas", "mapa.json"));

writeFileSync(
  join(OUT, "temas", "home.json"),
  JSON.stringify(
    buildHome({
      deuda: deudaTema,
      coparticipacion: copaTema,
      empleo: empleoTema,
      poblacion: poblacionTema,
      procesos: procesos ?? undefined,
      adjudicaciones: adjudicaciones ?? undefined,
      normas: readTable("boletin-oficial", "normas.csv") ?? undefined,
      ipc: ipcNacional ?? undefined,
      dolar: readTable("indices", "tipo_cambio_mensual.csv") ?? undefined,
    }),
  ),
);

// Entidades con página propia
if (copaTema && poblacionTema && funcionariosTema) {
  writeFileSync(join(OUT, "temas", "municipios.json"), JSON.stringify(buildMunicipios(copaTema, poblacionTema, funcionariosTema)));
}
if (procesos && adjudicaciones) {
  const { organismos, proveedores } = buildOrganismosYProveedores(
    procesos,
    adjudicaciones,
    readTable("proveedores", "proveedores.csv") ?? [],
    deflactor(ipcNacional ?? []),
    join(OUT, "temas", "compras"),
  );
  writeFileSync(join(OUT, "temas", "organismos.json"), JSON.stringify(organismos));
  writeFileSync(join(OUT, "temas", "proveedores.json"), JSON.stringify(proveedores));

  // Gobierno por dentro: one page per agency (docs/planes/el-estado-por-dentro.md).
  const agencyTable = join(ROOT, "data", "curado", "jurisdicciones.yaml");
  if (funcionariosTema && existsSync(agencyTable)) {
    const agencies = buildGobierno(
      parseYaml(readFileSync(agencyTable, "utf8")) as AgencyTable,
      readTable("lrf-personal", "personal.csv") ?? [],
      readTable("etica-publica", "funcionarios.csv") ?? [],
      funcionariosTema,
      procesos,
      adjudicaciones,
      organismos,
      proveedores,
      readTable("designaciones", "designaciones.csv") ?? [],
      readTable("presupuesto-planta", "cargos.csv") ?? [],
      readTable("presupuesto-planta", "cargos_vacantes.csv") ?? [],
      deflactor(ipcNacional ?? []),
      join(OUT, "temas"),
    );
    writeFileSync(join(OUT, "temas", "gobierno.json"), JSON.stringify(agencies));
    // buildGobierno links each Executive official to their agency: rewrite the officials file with it.
    writeFileSync(join(OUT, "temas", "funcionarios.json"), JSON.stringify(funcionariosTema));
  }
}
/** Lee un YAML de data/curado/ (lista vacía si no existe). */
function leerCurado<T>(archivo: string): T[] {
  const p = join(ROOT, "data", "curado", archivo);
  return existsSync(p) ? ((parseYaml(readFileSync(p, "utf8")) as T[] | null) ?? []) : [];
}
const normasBoletin = readTable("boletin-oficial", "normas.csv");
if (normasBoletin) {
  writeFileSync(
    join(OUT, "temas", "leyes.json"),
    JSON.stringify(
      buildLeyes(normasBoletin, join(PROCESSED_DIR, "boletin-oficial", "textos"), join(OUT, "temas"), leerCurado<ResumenLey>("leyes.yaml")),
    ),
  );
}

const index: DataIndex = { generatedAt: new Date().toISOString(), sources, datasets };
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));

// Título, descripción e imagen de cada página, para actualizar los metadatos al navegar sin recargar
// (el HTML de cada ruta ya los trae; ver scripts/seo.ts).
const paginas = await construirPaginas(OUT);
writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify(Object.fromEntries(paginas.map((p) => [p.path, { t: p.title, d: p.description, o: p.og.slug }]))),
);
const viejo = `${DESTINO}.old-${process.pid}`;
if (existsSync(DESTINO)) renameSync(DESTINO, viejo);
renameSync(OUT, DESTINO);
rmSync(viejo, { recursive: true, force: true });
console.log(`Datos listos: ${sources.length} fuentes, ${datasets.length} datasets, ${paginas.length} páginas.`);
