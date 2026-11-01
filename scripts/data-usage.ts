/**
 * Qué CSV de data/processed usa cada app y cuáles no se muestran en ninguna parte. Es la parte automática
 * del mapa de datos (docs/planes/mapa-de-datos.md): todo CSV se puede descargar en /datos, pero eso no
 * cuenta como mostrarlo.
 *
 * Un CSV cuenta como usado por una app cuando algún archivo de su código nombra el id de la fuente y el
 * nombre del archivo entre comillas, como `readTable("lrf-personal", "personal.csv")`.
 *
 * Uso (desde la raíz del repo):
 *   bun run mapa-de-datos            tabla en Markdown con todos los CSV
 *   bun run mapa-de-datos --sin-uso  solo los que no usa ninguna app
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const PROCESSED = "data/processed";
/** Dónde se busca el uso de cada CSV: el código que arma las páginas, las funciones y el asistente. */
const CODE_GLOBS = ["apps/*/scripts", "apps/*/src", "apps/*/functions", "packages/assistant/src", "packages/assistant/scripts"].map(
  (dir) => new Bun.Glob(`${dir}/**/*.{ts,tsx}`),
);

type Usage = { source: string; file: string; rows: number; usedBy: string[] };

/** Filas de datos de un CSV, sin el encabezado (lee también los .csv.gz). */
function countRows(path: string): number {
  const raw = readFileSync(path);
  const text = path.endsWith(".gz") ? new TextDecoder().decode(gunzipSync(raw)) : raw.toString("utf8");
  return Math.max(0, text.split("\n").filter((l) => l.trim()).length - 1);
}

/** La app o el paquete de una ruta de código: `apps/web/...` → `web`, `packages/assistant/...` → `assistant`. */
const appOf = (path: string) => path.split("/")[1] ?? path;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Si un archivo de código lee el CSV `names` de `source`. Vale el par explícito (`"lrf-personal", "personal.csv"`
 * o `lrf-personal/personal.csv`). Si el archivo no arma pares explícitos con ese nombre (lee las fuentes de una
 * lista, como apps/votacion), alcanza con que nombre la fuente y el archivo por separado.
 */
export function mentions(text: string, source: string, names: string[]): boolean {
  const name = `(?:${names.map(escapeRegExp).join("|")})`;
  const anyPair = new RegExp(`["'\`][\\w-]+["'\`]\\s*,\\s*["'\`]${name}["'\`]|[\\w-]+/${name}\\b`);
  const id = escapeRegExp(source);
  const pair = new RegExp(`["'\`]${id}["'\`]\\s*,\\s*["'\`]${name}["'\`]|\\b${id}/${name}\\b`);
  if (pair.test(text)) return true;
  if (anyPair.test(text)) return false;
  return new RegExp(`["'\`]${id}["'\`]`).test(text) && new RegExp(`["'\`]${name}["'\`]`).test(text);
}

export function dataUsage(root = "."): Usage[] {
  const code = CODE_GLOBS.flatMap((glob) => [...glob.scanSync({ cwd: root })])
    .filter((p) => !p.includes("node_modules"))
    .map((p) => ({ app: appOf(p), text: readFileSync(join(root, p), "utf8") }));

  const usages: Usage[] = [];
  for (const source of readdirSync(join(root, PROCESSED)).sort()) {
    const dir = join(root, PROCESSED, source);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!/\.csv(\.gz)?$/.test(name)) continue;
      const file = name.replace(/\.gz$/, "");
      const usedBy = [...new Set(code.filter((c) => mentions(c.text, source, [name, file])).map((c) => c.app))].sort();
      usages.push({ source, file, rows: countRows(join(dir, name)), usedBy });
    }
  }
  return usages;
}

if (import.meta.main) {
  const onlyUnused = process.argv.includes("--sin-uso");
  const all = dataUsage();
  const rows = onlyUnused ? all.filter((u) => u.usedBy.length === 0) : all;
  const unused = all.filter((u) => u.usedBy.length === 0).length;
  console.log(`${all.length} CSV en ${PROCESSED}; ${unused} no los usa ninguna app (se descargan en /datos).\n`);
  console.log("| Fuente | Archivo | Filas | Lo usa |");
  console.log("|---|---|---:|---|");
  for (const u of rows) {
    console.log(`| \`${u.source}\` | \`${u.file}\` | ${u.rows.toLocaleString("es-AR")} | ${u.usedBy.join(", ") || "—"} |`);
  }
}
