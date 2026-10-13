import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROCESSED_DIR } from "./paths.ts";

type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Serializa filas a CSV. Las columnas salen de `columns` o de la primera fila. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

/** Escribe un CSV en data/processed/<fuente>/<archivo>. Devuelve la ruta. */
export async function writeProcessed(source: string, filename: string, rows: Row[], columns?: string[]): Promise<string> {
  const path = join(PROCESSED_DIR, source, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toCsv(rows, columns));
  return path;
}

/** Parser CSV mínimo (RFC 4180): comillas, comas y saltos de línea dentro de campos. */
export function parseCsv(text: string): string[][] {
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

/** Lee un CSV de data/processed/<fuente>/<archivo> como filas con nombre de columna. Vacío si no existe. */
export async function readProcessed(source: string, filename: string): Promise<Row[]> {
  const path = join(PROCESSED_DIR, source, filename);
  if (!existsSync(path)) return [];
  const [header = [], ...rows] = parseCsv(await readFile(path, "utf8"));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
