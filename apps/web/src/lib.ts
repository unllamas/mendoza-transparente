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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

/** "coparticipacion_mensual.csv" → "Coparticipacion mensual" */
export function humanize(file: string): string {
  const s = file.replace(/\.csv$/, "").replaceAll(/[_-]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
