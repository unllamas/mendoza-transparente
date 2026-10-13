/**
 * Descarga y archivado de archivos crudos.
 *
 * Cada descarga queda en data/raw/<fuente>/<YYYY-MM-DD>/<archivo>[.gz] y se
 * registra en data/raw/<fuente>/manifest.jsonl con url, fecha, sha256 y tamaño.
 * Si el contenido es idéntico a la última descarga, no se guarda de nuevo.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { RAW_DIR, ROOT } from "./paths.ts";

// Los sitios del gobierno devuelven 403 sin un User-Agent de navegador.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126 Safari/537.36 mendoza-transparente/0.1";

/**
 * Sitios del Gobierno que rechazan conexiones desde servidores en la nube: el Boletín Oficial no responde
 * a la red de GitHub (Azure) y el Senado de Mendoza solo responde a IPs de Argentina. Si está definido
 * PROXY_AR (http://usuario:clave@host:puerto, con salida en Argentina), los pedidos a estos sitios pasan
 * por ahí; el resto va directo.
 */
export const HOSTS_CON_PROXY = [
  "portalgateway.mendoza.gov.ar",
  "boe.mendoza.gov.ar",
  "www.senadomendoza.gob.ar",
  "senadomendoza.gob.ar",
  "www.senadomza.gov.ar",
];

const proxyPara = (url: string) =>
  process.env.PROXY_AR && HOSTS_CON_PROXY.includes(new URL(url).hostname) ? process.env.PROXY_AR : undefined;

// Por encima de este tamaño el archivo se guarda comprimido con gzip.
const GZIP_THRESHOLD = 1_000_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ManifestEntry {
  filename: string;
  path: string;
  url: string;
  fetched_at: string;
  sha256: string;
  bytes: number;
  gzip: boolean;
}

/** Pedido HTTP con reintentos y una pausa corta para no saturar los servidores. */
export async function get(url: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);

  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(120_000), proxy: proxyPara(url) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} en ${url}`);
      await sleep(500);
      return resp;
    } catch (err) {
      if (attempt >= retries - 1) throw err;
      await sleep(2 ** attempt * 2000);
    }
  }
}

async function lastEntry(manifest: string, filename: string): Promise<ManifestEntry | undefined> {
  if (!existsSync(manifest)) return undefined;
  let last: ManifestEntry | undefined;
  for (const line of (await readFile(manifest, "utf8")).split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line) as ManifestEntry;
    if (entry.filename === filename) last = entry;
  }
  return last;
}

/**
 * Para decidir si una página HTML cambió se compara solo lo que ve una persona: el texto visible, los
 * links (un PDF nuevo suele aparecer como un link nuevo) y las imágenes. Se ignoran scripts, estilos, metadatos y
 * comentarios, donde viven los tokens de seguridad, nonces, identificadores de rastreo, horas de caché
 * y el código antibots que cambian en cada visita. El archivo se guarda completo, tal cual llegó.
 */
const VOLATILES_EN_LINKS = [
  /([?&](?:_wpnonce|nonce|token|_ts|ver|v)=)[^&"']*/gi, // tokens y versiones en la URL
  /(AgendaWeb\/)\d{1,2},\d{1,2},\d{4}/g, // Senado de la Nación: link a la agenda del día
];

const esHtml = (filename: string) => /\.html?$/i.test(filename);

/** Huella del contenido para comparar versiones: en HTML, texto visible, links e imágenes. */
export function huella(filename: string, bytes: Uint8Array): string {
  if (!esHtml(filename)) return createHash("sha256").update(bytes).digest("hex");
  const sinCodigo = new TextDecoder()
    .decode(bytes)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  let links = [...sinCodigo.matchAll(/<(?:a\b[^>]*?\bhref|img\b[^>]*?\bsrc)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).join("\n");
  for (const re of VOLATILES_EN_LINKS) links = links.replace(re, "$1");
  const texto = sinCodigo
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(`${texto}\n${links}`).digest("hex");
}

/** ¿El contenido nuevo es igual al de la última versión archivada (ignorando lo volátil)? */
async function sinCambios(manifest: string, filename: string, bytes: Uint8Array, sha256: string): Promise<boolean> {
  const last = await lastEntry(manifest, filename);
  if (!last) return false;
  if (last.sha256 === sha256) return true;
  if (!esHtml(filename)) return false;
  const anterior = join(ROOT, last.path);
  if (!existsSync(anterior)) return false;
  return huella(filename, await readRaw(anterior)) === huella(filename, bytes);
}

/** Guarda `content` en el archivo crudo de la fuente. Devuelve la ruta, o null si no cambió. */
export async function archive(
  source: string,
  filename: string,
  content: Uint8Array | string,
  { url }: { url: string },
): Promise<string | null> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const sourceDir = join(RAW_DIR, source);
  const manifest = join(sourceDir, "manifest.jsonl");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (await sinCambios(manifest, filename, bytes, sha256)) return null;

  const now = new Date();
  const dayDir = join(sourceDir, now.toISOString().slice(0, 10));
  await mkdir(dayDir, { recursive: true });
  const compressed = bytes.length > GZIP_THRESHOLD;
  // data/raw es de solo agregar: si ese día ya se archivó una versión distinta, la nueva va con la hora.
  let path = join(dayDir, filename + (compressed ? ".gz" : ""));
  if (existsSync(path)) {
    const hora = now.toISOString().slice(11, 19).replaceAll(":", "");
    const punto = filename.lastIndexOf(".");
    const conHora = punto > 0 ? `${filename.slice(0, punto)}.${hora}${filename.slice(punto)}` : `${filename}.${hora}`;
    path = join(dayDir, conHora + (compressed ? ".gz" : ""));
  }
  await writeFile(path, compressed ? gzipSync(bytes) : bytes);

  const entry: ManifestEntry = {
    filename,
    path: relative(ROOT, path),
    url,
    fetched_at: `${now.toISOString().slice(0, 19)}Z`,
    sha256,
    bytes: bytes.length,
    gzip: compressed,
  };
  await appendFile(manifest, `${JSON.stringify(entry)}\n`);
  return path;
}

/** Descarga `url` y la archiva bajo la fuente `source`. */
export async function fetchAndArchive(source: string, url: string, filename: string, init?: RequestInit): Promise<string | null> {
  const resp = await get(url, init);
  return archive(source, filename, new Uint8Array(await resp.arrayBuffer()), { url });
}

/** Lee un archivo crudo, descomprimiendo si hace falta. */
export async function readRaw(path: string): Promise<Buffer> {
  const data = await readFile(path);
  return path.endsWith(".gz") ? gunzipSync(data) : data;
}

/** Devuelve la ruta absoluta de la última versión archivada de `filename`, o null. */
export async function latestRaw(source: string, filename: string): Promise<string | null> {
  const manifest = join(RAW_DIR, source, "manifest.jsonl");
  if (!existsSync(manifest)) return null;
  let last: ManifestEntry | undefined;
  for (const line of (await readFile(manifest, "utf8")).split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line) as ManifestEntry;
    if (entry.filename === filename) last = entry;
  }
  return last ? join(ROOT, last.path) : null;
}
