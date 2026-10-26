/**
 * Prepara los datos del sitio antes de compilar. Lee sources.yaml,
 * data/raw/<id>/manifest.jsonl, data/raw/<id>/archive-org.jsonl y data/processed/<id>/*.csv, y escribe en public/data:
 *   index.json                    catálogo de fuentes y datasets (para /fuentes y /datos)
 *   fuentes.json                  solo las fuentes y dos totales: lo que necesitan el footer, la portada y cada «Fuentes»
 *   <id>/<archivo>.csv            el CSV completo, para descargar
 *   <id>/<archivo>.preview.json   las primeras filas, para mostrar en la web
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { NO_PUBLICADO_CATEGORIES } from "../src/no-publicado-categories.ts";
import type { DataIndex, DatasetMeta, Diccionario, NoPublicado, Preview, SourceCatalog, SourceMeta } from "../src/types.ts";
import { construirPaginas } from "./paginas.ts";
import { buildPosters, buildRequestTargets } from "./temas/civic-tools.ts";
import { buildCompras } from "./temas/compras.ts";
import { buildCoparticipacion } from "./temas/coparticipacion.ts";
import { buildDeuda } from "./temas/deuda.ts";
import { buildEmpleo } from "./temas/empleo.ts";
import { buildLeyes, buildMunicipios, buildOrganismosYProveedores } from "./temas/entidades.ts";
import { buildFuncionarios, type Correccion } from "./temas/funcionarios.ts";
import { type AgencyTable, buildGobierno } from "./temas/gobierno.ts";
import { buildGuide, writeSearchIndex } from "./temas/guide.ts";
import { buildHistory } from "./temas/history.ts";
import { buildHome } from "./temas/home.ts";
import { deflactor } from "./temas/inflacion.ts";
import type { ResumenLey } from "./temas/leyes.ts";
import { budgetSummary, buildMunicipalBudgets } from "./temas/municipal-budget.ts";
import { assignParties, buildParties, buildPartyRegistry, type OfficialColor, type PartyEntry, partyMentions } from "./temas/parties.ts";
import { buildPoblacion } from "./temas/poblacion.ts";
import { buildRecaudacion } from "./temas/recaudacion.ts";
import { buildSenales } from "./temas/senales.ts";
import type { TransparencySurvey } from "./temas/transparency.ts";
import { buildUniversidades } from "./temas/universidades.ts";

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

/** Page with every archive.org item of a source, once at least one file was uploaded (see `bun run archivar`). */
function archiveOrgUrl(id: string): string | null {
  const path = join(RAW_DIR, id, "archive-org.jsonl");
  if (!existsSync(path)) return null;
  const uploaded = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { kind: string; archive_url: string | null })
    .some((r) => r.kind === "item" && r.archive_url);
  return uploaded ? `https://archive.org/search?query=${encodeURIComponent(`identifier:mendoza-transparente-${id}-*`)}` : null;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const catalog = parseYaml(readFileSync(join(ROOT, "sources.yaml"), "utf8")) as Omit<SourceMeta, "raw" | "archiveOrg">[];
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
    archiveOrg: archiveOrgUrl(id),
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
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sin-dato";

const DETALLE: Record<string, DatasetMeta["detalle"]> = {
  "compras-ocds/adjudicaciones.csv": "proveedor",
  "compras-ocds/procesos.csv": "proceso",
};

const datasets: DatasetMeta[] = [];
for (const id of listDirs(PROCESSED_DIR)) {
  const dir = join(PROCESSED_DIR, id);
  const outDir = join(OUT, id);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .sort()) {
    const path = join(dir, file);
    const [columns = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
    const dictPath = join(dir, file.replace(/\.csv$/, ".meta.json"));
    const dict = existsSync(dictPath) ? (JSON.parse(readFileSync(dictPath, "utf8")) as Diccionario) : null;
    mkdirSync(outDir, { recursive: true });
    cpSync(path, join(outDir, file));

    const key = sortKey(columns, dict);
    // Orden estable: a igual fecha se respeta el orden original.
    const sorted = key
      ? rows
          .map((r, i) => [r, i] as const)
          .sort((a, b) => key(b[0]).localeCompare(key(a[0])) || a[1] - b[1])
          .map(([r]) => r)
      : rows;

    const base = file.replace(/\.csv$/, "");
    let groups: DatasetMeta["groups"] = null;
    const groupIdx = dict?.agruparPor ? columns.indexOf(dict.agruparPor) : -1;
    if (groupIdx >= 0) {
      const byGroup = new Map<string, string[][]>();
      for (const r of sorted) byGroup.set(r[groupIdx] ?? "", [...(byGroup.get(r[groupIdx] ?? "") ?? []), r]);
      mkdirSync(join(outDir, base), { recursive: true });
      groups = [...byGroup.keys()]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((value) => {
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
const POBLACION_MENDOZA = Number((proyeccionesMza.find((r) => r.anio === anioActual) ?? proyeccionesMza.at(-1))?.poblacion ?? 2_043_540);

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

const recaudacion = readTable("atm-recaudacion", "recaudacion_mensual.csv");
const recaudacionTema =
  recaudacion && ipcNacional
    ? buildRecaudacion(recaudacion, ipcNacional, poblacionProv, readTable("dnap-ron", "ron_mensual.csv") ?? [])
    : undefined;
if (recaudacionTema) writeFileSync(join(OUT, "temas", "recaudacion.json"), JSON.stringify(recaudacionTema));

const uniTransfers = readTable("universidades-presupuesto", "transferencias_anuales.csv");
const uniStudents = readTable("universidades-estadisticas", "estudiantes.csv");
const universidadesTema =
  uniTransfers && uniStudents && ipcNacional
    ? buildUniversidades(
        uniTransfers,
        uniStudents,
        readTable("universidades-estadisticas", "personal.csv") ?? [],
        readTable("universidades-estadisticas", "disciplinas.csv") ?? [],
        readTable("universidades-estadisticas", "rendimiento.csv") ?? [],
        ipcNacional,
      )
    : undefined;
if (universidadesTema) writeFileSync(join(OUT, "temas", "universidades.json"), JSON.stringify(universidadesTema));

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
// Who held each position (ex officials and past elections); it also adds the past of each current official.
// Parties first: one name however each source writes it (data/curado/partidos.yaml), then one page each.
if (funcionariosTema) {
  const electos = readTable("junta-electoral", "electos.csv") ?? [];
  const parties = buildPartyRegistry(
    leerCurado<PartyEntry>("partidos.yaml"),
    partyMentions(funcionariosTema.personas, electos),
    leerCurado<OfficialColor>("colores-partidos.yaml"),
  );
  assignParties(funcionariosTema.personas, parties);
  const history = buildHistory(
    readTable("etica-publica", "cargos.csv") ?? [],
    electos,
    funcionariosTema,
    new Date().toISOString().slice(0, 10),
    parties,
  );
  writeFileSync(join(OUT, "temas", "history.json"), JSON.stringify(history));
  const { summaries, details } = buildParties(parties, funcionariosTema, history);
  writeFileSync(join(OUT, "temas", "partidos.json"), JSON.stringify(summaries));
  mkdirSync(join(OUT, "temas", "partidos"), { recursive: true });
  for (const d of details) writeFileSync(join(OUT, "temas", "partidos", `${d.slug}.json`), JSON.stringify(d));
}
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
let noPublicadoItems: NoPublicado[] = [];
if (existsSync(noPublicado)) {
  const items = parseYaml(readFileSync(noPublicado, "utf8")) as NoPublicado[];
  noPublicadoItems = items;
  const invalid = items.filter((i) => !(i.categoria in NO_PUBLICADO_CATEGORIES));
  if (invalid.length) throw new Error(`no-publicado.yaml: categoría faltante o desconocida en ${invalid.map((i) => i.id).join(", ")}`);
  // A national law needs its own place to file the request: the provincial form would send people to the wrong office.
  const badFiling = items.filter(
    (i) =>
      (i.ley !== undefined && i.ley !== "9070" && i.ley !== "27275") ||
      (i.formulario !== undefined && !/^(https:\/\/|mailto:)/.test(i.formulario)),
  );
  if (badFiling.length) throw new Error(`no-publicado.yaml: ley o formulario inválido en ${badFiling.map((i) => i.id).join(", ")}`);
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
  const municipios = buildMunicipios(
    copaTema,
    poblacionTema,
    funcionariosTema,
    readTable("municipios-personal", "personal.csv") ?? [],
    leerCurado<TransparencySurvey>("transparencia-municipal.yaml"),
    readTable("etica-publica", "funcionarios.csv") ?? [],
    readTable("boletin-oficial", "normas.csv") ?? [],
  );
  // Budget pages (/municipios/<slug>/presupuesto/<year>) for the municipalities whose annexes are already read.
  const budgets = buildMunicipalBudgets(
    readTable("municipios-lrf", "ejecucion_gastos.csv") ?? [],
    readTable("municipios-lrf", "ejecucion_recursos.csv") ?? [],
    readTable("municipios-lrf", "deuda.csv") ?? [],
    new Map(municipios.map((m) => [m.nombre, m.poblacion.serie])),
    deflactor(ipcNacional ?? []),
  );
  for (const b of budgets) {
    mkdirSync(join(OUT, "temas", "municipios", b.slug), { recursive: true });
    writeFileSync(join(OUT, "temas", "municipios", b.slug, "presupuesto.json"), JSON.stringify(b));
    const m = municipios.find((x) => x.slug === b.slug);
    if (m) m.budget = budgetSummary(b);
  }
  writeFileSync(join(OUT, "temas", "municipios.json"), JSON.stringify(municipios));
  // The request letter (/pedir) and the posters (/cartel).
  writeFileSync(join(OUT, "temas", "pedir.json"), JSON.stringify(buildRequestTargets(municipios, noPublicadoItems)));
  writeFileSync(join(OUT, "temas", "carteles.json"), JSON.stringify(buildPosters(municipios, budgets)));
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
      readTable("fotos", "fotos.csv") ?? [],
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
      buildLeyes(
        normasBoletin,
        join(PROCESSED_DIR, "boletin-oficial", "textos"),
        join(OUT, "temas"),
        leerCurado<ResumenLey>("leyes.yaml"),
        funcionariosTema?.personas ?? [],
      ),
    ),
  );
}

const index: DataIndex = { generatedAt: new Date().toISOString(), sources, datasets };
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
// El índice completo pesa más de 100 KB por la lista de datasets; casi todas las páginas solo necesitan las fuentes.
const sourceCatalog: SourceCatalog = {
  generatedAt: index.generatedAt,
  sources,
  records: datasets.reduce((sum, d) => sum + d.rowCount, 0),
  sourcesWithData: sources.filter((s) => datasets.some((d) => d.source === s.id)).length,
};
writeFileSync(join(OUT, "fuentes.json"), JSON.stringify(sourceCatalog));

// Título, descripción e imagen de cada página, para actualizar los metadatos al navegar sin recargar
// (el HTML de cada ruta ya los trae; ver scripts/seo.ts).
writeFileSync(
  join(OUT, "temas", "guia.json"),
  JSON.stringify(
    buildGuide(
      OUT,
      (readTable("designaciones", "designaciones.csv") ?? []).filter((r) => !/martiller/i.test(r.cargo ?? "")),
    ),
  ),
);
const paginas = await construirPaginas(OUT);
writeSearchIndex(paginas, OUT);
writeFileSync(
  join(OUT, "meta.json"),
  JSON.stringify(Object.fromEntries(paginas.map((p) => [p.path, { t: p.title, d: p.description, o: p.og.slug }]))),
);
const viejo = `${DESTINO}.old-${process.pid}`;
if (existsSync(DESTINO)) renameSync(DESTINO, viejo);
renameSync(OUT, DESTINO);
rmSync(viejo, { recursive: true, force: true });
console.log(`Datos listos: ${sources.length} fuentes, ${datasets.length} datasets, ${paginas.length} páginas.`);
