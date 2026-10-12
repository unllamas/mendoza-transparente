import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROCESSED_DIR } from "./paths.ts";

type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

function escape(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Serializa filas a CSV. Las columnas salen de `columns` o de la primera fila. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(","));
  return lines.join("\n") + "\n";
}

/** Escribe un CSV en data/processed/<fuente>/<archivo>. Devuelve la ruta. */
export async function writeProcessed(
  source: string,
  filename: string,
  rows: Row[],
  columns?: string[],
): Promise<string> {
  const path = join(PROCESSED_DIR, source, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toCsv(rows, columns));
  return path;
}
