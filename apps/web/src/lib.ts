import type { DataIndex, Preview } from "./types.ts";

export async function loadIndex(): Promise<DataIndex> {
  const resp = await fetch("/data/index.json");
  if (!resp.ok) throw new Error("No se pudo cargar el índice de datos");
  return resp.json();
}

export async function loadPreview(source: string, file: string): Promise<Preview> {
  const resp = await fetch(`/data/${source}/${file.replace(/\.csv$/, ".preview.json")}`);
  if (!resp.ok) throw new Error(`No se pudo cargar ${file}`);
  return resp.json();
}

export async function loadTema<T>(tema: string): Promise<T> {
  const resp = await fetch(`/data/temas/${tema}.json`);
  if (!resp.ok) throw new Error(`No se pudo cargar el tema ${tema}`);
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
