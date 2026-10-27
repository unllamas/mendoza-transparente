/** Regenerates packages/assistant/src/knowledge.json from the catalog and the processed fees. */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, readProcessed } from "@mt/core";
import { buildKnowledge } from "../src/knowledge.ts";

export async function currentKnowledge() {
  const catalog = Bun.YAML.parse(await readFile(join(ROOT, "data", "curado", "tramites.yaml"), "utf8")) as Record<string, unknown>[];
  const fees = await readProcessed("tributos", "rubros_comercio.csv");
  const documents = await readProcessed("tributos", "documentos.csv");
  return `${JSON.stringify(buildKnowledge(catalog, fees, documents))}\n`;
}

if (import.meta.main) {
  const out = join(import.meta.dir, "..", "src", "knowledge.json");
  await writeFile(out, await currentKnowledge());
  console.log(`Listo: ${out}`);
}
