/**
 * `bun run crudo`: mira un archivo crudo en forma compacta, sin volver a descargar lo que ya tenemos.
 *
 *   bun run crudo <fuente>                 lista lo archivado de la fuente (última versión de cada archivo)
 *   bun run crudo <fuente>/<archivo>       muestra la última versión archivada de ese archivo
 *   bun run crudo <ruta>                   muestra un archivo local (data/raw/…, también .gz)
 *   bun run crudo <url>                    busca la URL en los manifest de data/raw; si no está, usa el
 *                                          caché compartido (7 días) y recién si no, la descarga
 *
 * Opciones: --max <n> (caracteres, 3000 por defecto), --buscar <regex>, --links [regex], --filas <n>,
 * --paginas <a-b>, --fresco (ignora caché y archivo), --fuente <id> [--archivo <nombre>] (la descarga
 * queda archivada en data/raw/<id>/ con archive(), en vez de ir al caché).
 *
 * Lo usan sobre todo los agentes: devuelve unos pocos miles de caracteres en lugar del HTML o el PDF entero,
 * y evita pedirle dos veces lo mismo a los servidores. Ver docs/procesos/trabajo-con-agentes.md.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { archive, get, type ManifestEntry, RAW_DIR, ROOT, readManifest, readRaw } from "@mt/core";
import { type RenderOptions, render } from "./lib/inspect-render.ts";

const CACHE_DIR = process.env.MT_CRUDO_CACHE ?? join(homedir(), ".cache", "mendoza-transparente", "crudo");
const CACHE_DAYS = 7;

const USAGE = `Uso: bun run crudo <fuente | fuente/archivo | ruta | url> [--max n] [--buscar regex] [--links [regex]]
       [--filas n] [--paginas a-b] [--fresco] [--fuente id] [--archivo nombre]`;

interface Args {
  target: string;
  opts: RenderOptions;
  fresh: boolean;
  source?: string;
  filename?: string;
}

function parseArgs(argv: string[]): Args | null {
  const opts: RenderOptions = { max: 3000, rows: 8 };
  let target = "";
  let fresh = false;
  let source: string | undefined;
  let filename: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i] ?? "";
    if (a === "--max") opts.max = Number(next());
    else if (a === "--buscar") opts.search = new RegExp(next(), "i");
    else if (a === "--links") opts.links = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? new RegExp(next(), "i") : true;
    else if (a === "--filas") opts.rows = Number(next());
    else if (a === "--paginas") {
      const [from, to] = next().split("-").map(Number);
      opts.pages = [from!, to ?? from!];
    } else if (a === "--fresco") fresh = true;
    else if (a === "--fuente") source = next();
    else if (a === "--archivo") filename = next();
    else if (!a.startsWith("--")) target = a;
  }
  return target ? { target, opts, fresh, source, filename } : null;
}

/** Última entrada de cada archivo de la fuente. */
async function latestEntries(source: string): Promise<ManifestEntry[]> {
  const byName = new Map<string, ManifestEntry>();
  for (const e of await readManifest(source)) byName.set(e.filename, e);
  return [...byName.values()].sort((a, b) => a.filename.localeCompare(b.filename));
}

async function listSource(source: string, max: number): Promise<string> {
  const entries = await latestEntries(source);
  const lines = entries.map(
    (e) => `${e.fetched_at.slice(0, 10)}  ${e.bytes.toLocaleString("es-AR").padStart(12)}  ${e.filename}  ← ${e.url}`,
  );
  const text = lines.join("\n");
  const header = `${source}: ${entries.length} archivos (última versión de cada uno). Ver uno: bun run crudo ${source}/<archivo>`;
  return `${header}\n${text.length > max ? `${text.slice(0, max)}\n… (${lines.length} en total; usar --max)` : text}`;
}

const normalizeUrl = (u: string) => u.replace(/\/+$/, "").replace(/^http:/, "https:");

/** Busca la URL en todos los manifest. Devuelve la última versión archivada. */
async function findArchived(url: string): Promise<{ source: string; entry: ManifestEntry } | null> {
  const wanted = normalizeUrl(url);
  let found: { source: string; entry: ManifestEntry } | null = null;
  for (const source of readdirSync(RAW_DIR)) {
    if (!existsSync(join(RAW_DIR, source, "manifest.jsonl"))) continue;
    for (const entry of await readManifest(source)) {
      if (normalizeUrl(entry.url) === wanted && (!found || entry.fetched_at > found.entry.fetched_at)) found = { source, entry };
    }
  }
  return found;
}

interface CacheMeta {
  url: string;
  fetched_at: string;
  content_type: string;
}

async function fromCache(url: string, fresh: boolean): Promise<{ bytes: Uint8Array; meta: CacheMeta; cached: boolean }> {
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const dataPath = join(CACHE_DIR, `${key}.bin`);
  const metaPath = join(CACHE_DIR, `${key}.json`);
  if (!fresh && existsSync(dataPath) && existsSync(metaPath)) {
    const age = (Date.now() - (await stat(dataPath)).mtimeMs) / 86_400_000;
    if (age < CACHE_DAYS) {
      return { bytes: new Uint8Array(await readFile(dataPath)), meta: JSON.parse(await readFile(metaPath, "utf8")), cached: true };
    }
  }
  const resp = await get(url);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const meta: CacheMeta = { url, fetched_at: new Date().toISOString().slice(0, 19), content_type: resp.headers.get("content-type") ?? "" };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(dataPath, bytes);
  await writeFile(metaPath, JSON.stringify(meta));
  return { bytes, meta, cached: false };
}

async function showUrl(args: Args): Promise<string> {
  const { target: url, opts } = args;
  if (!args.fresh) {
    const hit = await findArchived(url);
    if (hit) {
      const bytes = new Uint8Array(await readRaw(join(ROOT, hit.entry.path)));
      const where = `Archivado en ${hit.entry.path} (${hit.entry.fetched_at.slice(0, 10)}, fuente ${hit.source}). No se descargó de nuevo; --fresco para pedirlo otra vez.`;
      return `${where}\n${await render(hit.entry.filename, bytes, opts, { url })}`;
    }
  }
  if (args.source) {
    const resp = await get(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const filename = args.filename ?? decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "index.html");
    const path = await archive(args.source, filename, bytes, { url });
    const where = path
      ? `Descargado y archivado en ${path.replace(`${ROOT}/`, "")}.`
      : `Descargado: igual a la última versión de ${args.source}/${filename}, no se archivó de nuevo.`;
    return `${where}\n${await render(filename, bytes, opts, { url, contentType: resp.headers.get("content-type") ?? "" })}`;
  }
  const { bytes, meta, cached } = await fromCache(url, args.fresh);
  const where = cached
    ? `Del caché compartido (descargado el ${meta.fetched_at.slice(0, 10)}).`
    : "Descargado ahora y guardado en el caché compartido (no en data/raw: para archivarlo, --fuente <id>).";
  return `${where}\n${await render(new URL(url).pathname, bytes, opts, { url, contentType: meta.content_type })}`;
}

async function showArchivedFile(source: string, filename: string, opts: RenderOptions): Promise<string> {
  const entries = await latestEntries(source);
  const entry = entries.find((e) => e.filename === filename) ?? entries.find((e) => e.filename.includes(filename));
  if (!entry) return `No hay «${filename}» en ${source}. Lista: bun run crudo ${source}`;
  const bytes = new Uint8Array(await readRaw(join(ROOT, entry.path)));
  return `${entry.path} (${entry.fetched_at.slice(0, 10)}) ← ${entry.url}\n${await render(entry.filename, bytes, opts, { url: entry.url })}`;
}

export async function main(argv: string[]): Promise<string> {
  const args = parseArgs(argv);
  if (!args) return USAGE;
  const { target, opts } = args;
  if (/^https?:\/\//.test(target)) return showUrl(args);

  const path = resolve(target);
  if (existsSync(path) && !existsSync(join(RAW_DIR, target, "manifest.jsonl"))) {
    return `${target}\n${await render(path, new Uint8Array(await readRaw(path)), opts)}`;
  }
  const [source, ...rest] = target.split("/");
  if (!source || !existsSync(join(RAW_DIR, source, "manifest.jsonl"))) {
    return `No existe la fuente «${source}» ni el archivo ${target}.\nFuentes: ${readdirSync(RAW_DIR).join(", ")}\n\n${USAGE}`;
  }
  return rest.length ? showArchivedFile(source, rest.join("/"), opts) : listSource(source, opts.max);
}

if (import.meta.main) console.log(await main(process.argv.slice(2)));
