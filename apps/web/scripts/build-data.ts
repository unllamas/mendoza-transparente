/**
 * Prepara los datos del sitio antes de compilar. Lee sources.yaml,
 * data/raw/<id>/manifest.jsonl y data/processed/<id>/*.csv, y escribe en public/data:
 *   index.json                    catálogo de fuentes y datasets
 *   <id>/<archivo>.csv            el CSV completo, para descargar
 *   <id>/<archivo>.preview.json   las primeras filas, para mostrar en la web
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { DataIndex, DatasetMeta, Preview, SourceMeta } from "../src/types.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const RAW_DIR = join(ROOT, "data", "raw");
const PROCESSED_DIR = join(ROOT, "data", "processed");
const OUT = join(import.meta.dir, "..", "public", "data");
const PREVIEW_ROWS = 200;

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

const datasets: DatasetMeta[] = [];
for (const id of listDirs(PROCESSED_DIR)) {
  const dir = join(PROCESSED_DIR, id);
  const outDir = join(OUT, id);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
    const path = join(dir, file);
    const [columns = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
    mkdirSync(outDir, { recursive: true });
    cpSync(path, join(outDir, file));
    const preview: Preview = { columns, rows: rows.slice(0, PREVIEW_ROWS) };
    writeFileSync(join(outDir, file.replace(/\.csv$/, ".preview.json")), JSON.stringify(preview));
    datasets.push({ source: id, file, columns, rowCount: rows.length, bytes: statSync(path).size });
  }
}

const index: DataIndex = { generatedAt: new Date().toISOString(), sources, datasets };
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`Datos listos: ${sources.length} fuentes, ${datasets.length} datasets.`);
