/**
 * Tries a municipality's tarifaria reader without touching data/:
 *
 *   bun run tributos:probar packages/scrapers/src/tributos/readers/<municipio>.ts
 *
 * Reads data/processed/tributos/textos/<normaId>.txt with the reader and prints how many activities and categories it
 * found, whether it passes `minActivities`, and the rows for common activities, to check them against the PDF.
 * Used by agents working in parallel, one municipality each.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROCESSED_DIR } from "@mt/core";
import type { Reader } from "./readers/types.ts";

const target = process.argv[2];
if (!target) {
  console.error("Uso: bun run tributos:probar <archivo del lector>");
  process.exit(1);
}
const { reader } = (await import(resolve(target))) as { reader: Reader };
const textPath = join(PROCESSED_DIR, "tributos", "textos", `${reader.normaId}.txt`);
if (!existsSync(textPath)) {
  console.error(`No está el texto ${textPath}: correr bun run scrape tributos con la norma en NORMAS.`);
  process.exit(1);
}

const rows = reader.read(readFileSync(textPath, "utf8"));
const activities = new Set(rows.map((r) => `${r.codigo}|${r.rubro}`));
const categories = [...new Set(rows.map((r) => r.categoria))];
const units = [...new Set(rows.map((r) => r.unidad))];
console.log(`${rows.length} filas, ${activities.size} rubros, categorías: ${categories.join(", ")}; unidad: ${units.join(", ")}`);
console.log(
  activities.size >= reader.minActivities
    ? `✓ pasa el mínimo (${reader.minActivities})`
    : `✗ menos rubros que el mínimo (${reader.minActivities})`,
);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
for (const word of ["almacen", "despensa", "kiosco", "ropa", "vestir", "rotiser", "carnic"]) {
  const hits = rows.filter((r) => norm(r.rubro).includes(word));
  const names = [...new Set(hits.map((r) => `${r.codigo} ${r.rubro}`))].slice(0, 3);
  for (const name of names) {
    const cats = hits.filter((r) => `${r.codigo} ${r.rubro}` === name).map((r) => `${r.categoria}=${r.monto}`);
    const first = hits.find((r) => `${r.codigo} ${r.rubro}` === name);
    console.log(`  ${word}: ${name} (pág. ${first?.pagina}) → ${cats.join(" ")} ${first?.unidad}`);
  }
}
