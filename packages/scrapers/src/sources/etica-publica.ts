/**
 * Oficina de Ética Pública de Mendoza: funcionarios, declaraciones juradas y sanciones.
 *
 * API pública (JSON, sin login): https://eticapublica.mendoza.gov.ar/api/v1/public
 *   /distributions                      101 reparticiones
 *   /officials?distribution_id=N        listado paginado (page_size máx. 50; exige algún filtro)
 *   /officials/{id}                     cargos con fechas, última declaración, cantidad de declaraciones
 *   /declarations/{id}                  secciones con tablas (inmuebles, muebles registrables, ingresos...)
 *   /sanctions?page_size=50             sumariados o sancionados (unos 736)
 * Límite del servidor: 60 pedidos por minuto (responde 429). Se pide en secuencia con pausa.
 *
 * Uso: bun run scrape etica-publica [--all] [--dist=1,26] [--limit=N] [--pause=MS] [--refresh]
 *   (sin flags)  Listado completo de funcionarios y sanciones. Detalle y declaración solo de las
 *                reparticiones del Ejecutivo, Legislativo, municipios y entes: se excluyen Poder
 *                Judicial, Ministerio Público, Policía, Penitenciaría, gremios, proveedores y
 *                "mandato cumplido" (ex funcionarios), que suman la mayoría de los 7.500 registros.
 *   --all        pide detalle y declaración de todos (unas 5 horas a 60 pedidos por minuto).
 *   --dist=a,b   restringe el detalle a esas reparticiones.
 *   --limit=N    tope de funcionarios con detalle; se priorizan los cargos jerárquicos.
 *   --pause=MS   pausa extra entre pedidos (por defecto 700; el núcleo ya espera 500).
 *   --refresh    vuelve a pedir lo que ya está archivado (por defecto se reutiliza el archivo crudo).
 *
 * DATOS PERSONALES: este repo es público, por eso se redacta ANTES de archivar (get() + archive(),
 * nunca fetchAndArchive()). Lo que se quita o enmascara:
 *   - Sanciones: se elimina `document_number` (DNI). Se conserva nombre, repartición, expediente y motivo.
 *   - Declaraciones, por nombre de columna: se eliminan las columnas de DNI/CUIL/CUIT/documento,
 *     domicilio/dirección/calle, patente/dominio, CBU/cuenta/alias, y nombre, apellido o parentesco
 *     de familiares. (Hoy la API no las expone; es una defensa ante cambios.)
 *   - Texto libre de toda celda: números de 7 o más dígitos (DNI, CUIL, CBU), CUIL/CUIT con guiones,
 *     DNI con puntos, patentes y correos se reemplazan por [DNI/NUM], [CUIL], [PATENTE] o [EMAIL].
 *     Los montos y valuaciones de columnas numéricas (avalúo, valor, porcentaje) NO se tocan.
 *   - Columnas "Titular" y "Observaciones": solo queda la categoría (Propia, Cónyuge/Conviviente,
 *     Hijo/a, Otro familiar); nunca el nombre de un familiar.
 * Se conserva: nombre y apellido del funcionario, cargo, repartición, fechas, y montos o valuaciones
 * de inmuebles y rodados.
 *
 * LIMITACIONES DE LA API: solo se llega a la ÚLTIMA declaración de cada funcionario (el detalle
 * expone `last_declaration` y `declarations_count`, no los ids anteriores). Las secciones de
 * cuentas, títulos, deudas, efectivo, sociedades e ingresos solo dicen "declara" sin montos, de
 * modo que no hay total de deudas, patrimonio neto ni ingresos anuales en pesos.
 * total_bienes = suma de (avalúo fiscal x porcentaje de titularidad) de inmuebles y rodados.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  USER_AGENT,
  RAW_DIR,
  ROOT,
  archive,
  get,
  readRaw,
  writeProcessed,
  type ManifestEntry,
  type Row,
} from "@mt/core";

const SOURCE = "etica-publica";
const BASE = "https://eticapublica.mendoza.gov.ar/api/v1/public";

// Reparticiones que no entran en el detalle por defecto (ver cabecera).
const EXCLUDED_BY_DEFAULT = new Set([1, 36, 35, 29, 21, 82, 84, 79]);
const HIERARCHICAL =
  /ministr|secretari|subsecretari|director|presidente|vicepresidente|gobernador|vicegobernador|intendente|concejal|diputad|senador|fiscal|juez|jueza|vocal|interventor|gerente|administrador|titular|jefe de gabinete|asesor|coordinador|tesorero|contador|auditor|defensor|procurador/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Redacción ----------

const DROP_COLUMN =
  /dni|cuil|cuit|documento|domicilio|direcci|calle|patente|dominio|cbu|cuenta|alias|apellido|parentesco|nombre/i;
const KEEP_NUMERIC_COLUMN = /valor|aval|monto|saldo|importe|porcentaje|superficie|fecha/i;

function scrubText(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[EMAIL]")
    .replace(/\b\d{2}-?\d{8}-?\d\b/g, "[CUIL]")
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}\b/g, "[DNI]")
    .replace(/\b\d{7,}\b/g, "[NUM]")
    .replace(/\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/g, "[PATENTE]")
    .replace(/\b[A-Z]{3}\d{3}\b/g, "[PATENTE]");
}

function relation(s: string): string {
  const t = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/^propi[oa]$/.test(t.trim())) return "Propia";
  if (/conyuge|conviviente|esposa|esposo|pareja/.test(t)) return "Cónyuge/Conviviente";
  if (/\bhij[oa]s?\b|menor/.test(t)) return "Hijo/a";
  return "Otro familiar";
}

type Section = {
  assets_type: number;
  title: string;
  kind: string;
  columns: string[];
  rows: unknown[][];
};

type Declaration = {
  declaration_id: number;
  published_at: string;
  official_id: number;
  first_name: string;
  last_name: string;
  sections: Section[];
};

function redactSection(sec: Section): Section {
  const keep = sec.columns.map((c) => !DROP_COLUMN.test(c));
  const columns = sec.columns.filter((_, i) => keep[i]);
  const rows = sec.rows.map((row) =>
    row
      .filter((_, i) => keep[i] ?? true)
      .map((cell, j) => {
        if (cell === null || cell === undefined || typeof cell !== "string") return cell;
        const col = columns[j] ?? "";
        if (/^titular$|^observaciones$/i.test(col)) {
          // "Observaciones" también lleva texto libre (p. ej. "Propio"): solo se deja la categoría si es parentesco.
          return /^titular$/i.test(col) || /propi|conyuge|cónyuge|conviv|hij/i.test(cell) ? relation(cell) : scrubText(cell);
        }
        if (KEEP_NUMERIC_COLUMN.test(col) && /^[\d.,/-]+$/.test(cell.trim())) return cell;
        return scrubText(cell);
      }),
  );
  return { ...sec, columns, rows };
}

function redactDeclaration(d: Declaration): Declaration {
  return {
    declaration_id: d.declaration_id,
    published_at: d.published_at,
    official_id: d.official_id,
    first_name: d.first_name,
    last_name: d.last_name,
    sections: (d.sections ?? []).map(redactSection),
  };
}

// ---------- Cliente ----------

let pauseMs = 700;

/** GET JSON con pausa y espera larga si el servidor aplica el límite de 60 por minuto. */
async function api<T>(path: string): Promise<{ data: T; url: string }> {
  const url = `${BASE}/${path}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await get(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      const data = (await resp.json()) as T & { error?: string };
      if (data && typeof data === "object" && "error" in data && /rate limit/i.test(String(data.error))) {
        throw new Error("rate limit");
      }
      await sleep(pauseMs);
      return { data, url };
    } catch (err) {
      // Solo se espera y reintenta ante el límite de pedidos; otros errores ya se reintentaron en get().
      if (attempt >= 5 || !/429|rate limit/i.test((err as Error).message)) throw err;
      console.warn(`  límite de pedidos en ${path}, espero 30 s`);
      await sleep(30_000);
    }
  }
}

// Índice del archivo crudo ya guardado (último por nombre), para retomar sin volver a pedir.
const rawIndex = new Map<string, string>();
async function loadIndex() {
  const manifest = join(RAW_DIR, SOURCE, "manifest.jsonl");
  if (!existsSync(manifest)) return;
  for (const line of (await readFile(manifest, "utf8")).split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line) as ManifestEntry;
    rawIndex.set(e.filename, join(ROOT, e.path));
  }
}
async function cached<T>(filename: string): Promise<T | null> {
  const p = rawIndex.get(filename);
  if (!p || !existsSync(p)) return null;
  return JSON.parse((await readRaw(p)).toString("utf8")) as T;
}

// ---------- Tipos de respuesta ----------

type ListItem = { id: number; first_name: string; last_name: string; distribution: string; actual_job: string };
type OfficialList = { items: ListItem[]; total: number; page: number; page_size: number };
type Position = { distribution: string; description: string; start_date: string | null; end_date: string | null };
type OfficialDetail = {
  id: number;
  positions: Position[];
  last_declaration: { id: number; published_at: string } | null;
  declarations_count: number;
  certificates_count: number;
};
type Sanction = {
  id: number;
  first_name: string;
  last_name: string;
  document_number?: string;
  distribution: string;
  file_number: string;
  title: string;
  expiration_date: string | null;
};

// ---------- Normalización de declaraciones ----------

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "otro";

/** Agrupa el tipo de bien (texto libre) en pocas categorías para tener columnas estables. */
function tipoBien(raw: string): string {
  const t = slug(raw);
  for (const k of ["casa", "departamento", "lote", "terreno", "local", "finca", "campo", "cochera", "camioneta", "camion", "moto", "auto", "tractor"]) {
    if (t.includes(k)) return k;
  }
  return "otro";
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number) => Math.round(n * 100) / 100;

function summarize(d: Declaration, count: number | undefined): Row {
  const row: Row = {
    official_id: d.official_id,
    declaration_id: d.declaration_id,
    fecha_publicacion: d.published_at.slice(0, 10),
    periodo: d.published_at.slice(0, 4),
    declaraciones_publicadas: count,
  };
  let total = 0;
  let propios = 0;
  let nIngDep = 0;
  let nIngInd = 0;
  let nOtros = 0;
  for (const s of d.sections) {
    const idx = (name: RegExp) => s.columns.findIndex((c) => name.test(c));
    if (s.assets_type === 1 || s.assets_type === 3) {
      const prefix = s.assets_type === 1 ? "inmuebles" : "rodados";
      const iVal = idx(/aval/i);
      const iPct = idx(/porcentaje/i);
      const iTipo = idx(/tipo de bien/i);
      const iTit = idx(/titular$/i);
      let n = 0;
      let sum = 0;
      for (const r of s.rows) {
        const v = round((num(r[iVal]) * (iPct >= 0 ? num(r[iPct]) : 100)) / 100);
        const tipo = tipoBien(String(r[iTipo] ?? ""));
        n++;
        sum += v;
        total += v;
        if (iTit >= 0 && r[iTit] === "Propia") propios += v;
        row[`n_${prefix}_${tipo}`] = num(row[`n_${prefix}_${tipo}`]) + 1;
        row[`valor_${prefix}_${tipo}`] = round(num(row[`valor_${prefix}_${tipo}`]) + v);
      }
      row[`n_${prefix}`] = n;
      row[`valor_${prefix}`] = round(sum);
    } else if (s.assets_type === 11) nIngDep += s.rows.length;
    else if (s.assets_type === 12) nIngInd += s.rows.length;
    else if (s.kind === "declares") nOtros += s.rows.length;
  }
  row.total_bienes = round(total);
  row.total_bienes_propios = round(propios);
  row.n_fuentes_ingreso_dependencia = nIngDep;
  row.n_fuentes_ingreso_independiente = nIngInd;
  return row;
}

/**
 * Página de 50 funcionarios. Algunos registros hacen fallar al servidor (HTTP 500): en ese caso se
 * pide el mismo rango en páginas de 10 y luego de 1, y se saltea solo el registro roto.
 */
async function fetchOfficialPage(dist: number, page: number): Promise<OfficialList> {
  const q = (size: number, p: number) => `officials?distribution_id=${dist}&page=${p}&page_size=${size}`;
  try {
    return (await api<OfficialList>(q(50, page))).data;
  } catch (err) {
    console.warn(`  repartición ${dist} página ${page}: ${(err as Error).message}; se pide en trozos`);
  }
  const items: ListItem[] = [];
  let total = 0;
  const first = (page - 1) * 50;
  const fetchChunk = async (start: number, size: number): Promise<void> => {
    try {
      const r = (await api<OfficialList>(q(size, start / size + 1))).data;
      total = r.total;
      items.push(...r.items);
    } catch (err) {
      if (size === 1) {
        console.warn(`  registro ${start + 1} de la repartición ${dist} omitido (HTTP 500 del servidor)`);
        skipped++;
        return;
      }
      for (let k = 0; k < size; k += size === 10 ? 1 : 10) await fetchChunk(start + k, size === 10 ? 1 : 10);
    }
  };
  for (let k = 0; k < 50; k += 10) await fetchChunk(first + k, 10);
  return { items, total, page, page_size: 50 };
}

let skipped = 0;

// ---------- Programa ----------

export async function run(args: string[]) {
  const t0 = Date.now();
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  const all = args.includes("--all");
  const refresh = args.includes("--refresh");
  const only = flag("dist")?.split(",").map(Number);
  const limit = flag("limit") ? Number(flag("limit")) : Infinity;
  if (flag("pause")) pauseMs = Number(flag("pause"));
  await loadIndex();

  const useCache = async <T>(file: string): Promise<T | null> => (refresh ? null : cached<T>(file));

  // 1. Reparticiones
  const dists = (await api<{ distribution_id: number; description: string }[]>("distributions")).data;
  console.log(`${dists.length} reparticiones`);

  // 2. Listados de funcionarios (todos, solo datos públicos de cargo)
  const officials = new Map<number, ListItem>();
  for (const dist of dists) {
    let page = 1;
    for (;;) {
      const file = `officials-dist${dist.distribution_id}-p${page}.json`;
      let data = await useCache<OfficialList>(file);
      if (!data) {
        data = await fetchOfficialPage(dist.distribution_id, page);
        await archive(SOURCE, file, JSON.stringify(data), { url: `${BASE}/officials?distribution_id=${dist.distribution_id}&page=${page}&page_size=50` });
      }
      for (const it of data.items) officials.set(it.id, it);
      if (page * 50 >= data.total || data.items.length === 0) break;
      page++;
    }
  }
  console.log(`${officials.size} funcionarios en los listados`);

  // 3. Detalle y última declaración, según alcance y prioridad
  const inScope = [...officials.values()].filter((o) => {
    const d = dists.find((x) => x.description === o.distribution)?.distribution_id;
    if (only) return d !== undefined && only.includes(d);
    return all || (d !== undefined && !EXCLUDED_BY_DEFAULT.has(d));
  });
  inScope.sort(
    (a, b) =>
      Number(HIERARCHICAL.test(b.actual_job)) - Number(HIERARCHICAL.test(a.actual_job)) || a.id - b.id,
  );
  const targets = inScope.slice(0, limit);
  console.log(`Detalle para ${targets.length} de ${officials.size} funcionarios`);

  const details = new Map<number, OfficialDetail>();
  const declarations = new Map<number, Declaration>();
  let i = 0;
  for (const o of targets) {
    i++;
    if (i % 100 === 0) console.log(`  ${i}/${targets.length} (${Math.round((Date.now() - t0) / 60000)} min)`);
    try {
      const dFile = `official-${o.id}.json`;
      let det = await useCache<OfficialDetail>(dFile);
      if (!det) {
        const r = await api<OfficialDetail>(`officials/${o.id}`);
        det = r.data;
        await archive(SOURCE, dFile, JSON.stringify(det), { url: r.url });
      }
      details.set(o.id, det);
      const last = det.last_declaration;
      if (!last) continue;
      const xFile = `declaration-${last.id}.json`;
      let decl = await useCache<Declaration>(xFile);
      if (!decl) {
        const r = await api<Declaration>(`declarations/${last.id}`);
        decl = redactDeclaration(r.data); // redactar ANTES de archivar
        await archive(SOURCE, xFile, JSON.stringify(decl), { url: r.url });
      }
      declarations.set(o.id, decl);
    } catch (err) {
      console.warn(`  funcionario ${o.id}: ${(err as Error).message}`);
    }
  }

  // 4. Sanciones
  const sanctions: Sanction[] = [];
  for (let page = 1; ; page++) {
    const file = `sanctions-p${page}.json`;
    let data = await useCache<{ items: Sanction[]; total: number }>(file);
    if (!data) {
      const r = await api<{ items: Sanction[]; total: number }>(`sanctions?page=${page}&page_size=50`);
      data = { ...r.data, items: r.data.items.map(({ document_number: _dni, ...rest }) => rest) };
      await archive(SOURCE, file, JSON.stringify(data), { url: r.url });
    }
    sanctions.push(...data.items);
    if (page * 50 >= data.total || data.items.length === 0) break;
  }

  // 5. CSV
  const funcionarios: Row[] = [...officials.values()]
    .sort((a, b) => a.id - b.id)
    .map((o) => {
      const det = details.get(o.id);
      const cur =
        det?.positions.find((p) => p.end_date === null && p.distribution === o.distribution) ??
        det?.positions.find((p) => p.end_date === null) ??
        det?.positions[0];
      return {
        official_id: o.id,
        nombre: `${o.first_name} ${o.last_name}`.trim(),
        cargo: o.actual_job.trim(),
        reparticion: o.distribution,
        fecha_inicio_cargo: cur?.start_date ?? "",
        fecha_fin_cargo: cur?.end_date ?? "",
        cargos_registrados: det?.positions.length,
        declaraciones_publicadas: det?.declarations_count,
        ultima_declaracion_id: det?.last_declaration?.id,
        fecha_ultima_declaracion: det?.last_declaration?.published_at.slice(0, 10),
      };
    });
  await writeProcessed(SOURCE, "funcionarios.csv", funcionarios);

  const declRows = [...declarations.values()]
    .sort((a, b) => a.official_id - b.official_id)
    .map((d) => summarize(d, details.get(d.official_id)?.declarations_count));
  const base = [
    "official_id",
    "declaration_id",
    "fecha_publicacion",
    "periodo",
    "declaraciones_publicadas",
    "total_bienes",
    "total_bienes_propios",
    "n_inmuebles",
    "valor_inmuebles",
    "n_rodados",
    "valor_rodados",
    "n_fuentes_ingreso_dependencia",
    "n_fuentes_ingreso_independiente",
  ];
  const extra = [...new Set(declRows.flatMap((r) => Object.keys(r)))].filter((c) => !base.includes(c)).sort();
  await writeProcessed(SOURCE, "declaraciones.csv", declRows, [...base, ...extra]);

  await writeProcessed(
    SOURCE,
    "sanciones.csv",
    sanctions
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        sancion_id: s.id,
        nombre: `${s.first_name} ${s.last_name}`.trim(),
        reparticion: s.distribution,
        expediente: s.file_number,
        motivo: scrubText(s.title ?? ""),
        fecha_vencimiento: s.expiration_date ?? "",
      })),
  );

  const multi = [...details.values()].filter((d) => d.declarations_count >= 2).length;
  console.log(
    `Listo en ${Math.round((Date.now() - t0) / 1000)} s: ${funcionarios.length} funcionarios, ` +
      `${declRows.length} declaraciones, ${sanctions.length} sanciones. ` +
      `Registros omitidos por error del servidor: ${skipped}. Con 2 o más declaraciones publicadas: ${multi} de ${details.size} con detalle.`,
  );
}
