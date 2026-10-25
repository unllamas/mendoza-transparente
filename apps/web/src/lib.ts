import type { DataIndex, Preview, SourceCatalog } from "./types.ts";

export async function loadIndex(): Promise<DataIndex> {
  const resp = await fetch("/data/index.json");
  if (!resp.ok) throw new Error("No se pudo cargar el índice de datos");
  return resp.json();
}

let sourcesPromise: Promise<SourceCatalog> | null = null;
/** The sources (fuentes.json), downloaded once per visit: the footer, the home and every «Fuentes» section share it. */
export function loadSources(): Promise<SourceCatalog> {
  sourcesPromise ??= loadJson<SourceCatalog>("fuentes.json").catch((e: unknown) => {
    sourcesPromise = null;
    throw e;
  });
  return sourcesPromise;
}

export async function loadPreview(source: string, file: string, groupSlug?: string): Promise<Preview> {
  const base = file.replace(/\.csv$/, "");
  const resp = await fetch(groupSlug ? `/data/${source}/${base}/${groupSlug}.json` : `/data/${source}/${base}.preview.json`);
  if (!resp.ok) throw new Error(`No se pudo cargar ${file}`);
  return resp.json();
}

export async function loadTema<T>(tema: string): Promise<T> {
  const resp = await fetch(`/data/temas/${tema}.json`);
  if (!resp.ok) throw new Error(`No se pudo cargar el tema ${tema}`);
  return resp.json();
}

export async function loadJson<T>(path: string): Promise<T> {
  const resp = await fetch(`/data/${path}`);
  if (!resp.ok) throw new Error(`No se pudo cargar ${path}`);
  return resp.json();
}

const number = new Intl.NumberFormat("es-AR");
export const formatNumber = (n: number) => number.format(n);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-11..." → "11 oct 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m! - 1]} ${y}`;
}

/** 7 → "jul" */
export const mesCorto = (mes: number) => MESES[mes - 1] ?? String(mes);

/** "coparticipacion_mensual.csv" → "Coparticipacion mensual" */
export function humanize(file: string): string {
  const s = file.replace(/\.csv$/, "").replaceAll(/[_-]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "1-06-06 - Dcción. Gral. de Compras" → "Dirección General de Compras": sin el código interno ni abreviaturas. */
export function limpiarOrganismo(nombre: string): string {
  return nombre
    .replace(/^[\d-]+\s*-\s*/, "")
    .replace(/\bD(?:cci[oó]n|cc|ir)\.\s*/gi, "Dirección ")
    .replace(/\bGral\.\s*/gi, "General ")
    .replace(/\bDpto\.\s*/gi, "Departamento ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text for comparing searches: no accents, lowercase ("Guaymallén" → "guaymallen"). */
export const normalizeText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Saves a file made in the browser (a PDF, an image) with its name. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
