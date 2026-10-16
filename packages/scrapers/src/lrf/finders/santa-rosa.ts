/**
 * Santa Rosa: a classic Google Site with one page per quarter (names without a pattern, so the index labels are read:
 * "Primer Trimestre 2023", "Segundo Trimestre 2024"…). Each page links every annex as a Google Drive file. The link text
 * starts with the bare annex number ("2 DE LA EJECUCION…", "2bis …", "3DE LA…", "4-EJECUCION…", "5-EVOLUCION…"), without
 * the word "anexo", so it is read here instead of with `annexFromName`.
 */

import { ANNEXES, type Annex, FIRST_YEAR, links, page, type Release } from "../release.ts";

const BASE = "https://sites.google.com/site/municipalidadsantarosamendoza/";
const QUARTERS: [RegExp, number][] = [
  [/prim/i, 1],
  [/segund/i, 2],
  [/terc/i, 3],
  [/cuart/i, 4],
];

/** Annex at the start of a link text ("2bis DE…", "3DE LA…", "4-EJECUCION…"). */
function annexOfText(text: string): Annex | null {
  const m = /^\s*(?:anexo\s*)?(\d{1,2})\s*[-.]?\s*(bis)?(?![\d])/i.exec(text);
  if (!m) return null;
  const annex = (m[2] ? `${m[1]}bis` : m[1]) as Annex;
  return ANNEXES.includes(annex) ? annex : null;
}

export async function find(): Promise<Release[]> {
  const $ = await page(BASE, "indice-santa-rosa-lrf.html");
  const releases: Release[] = [];
  const seen = new Set<string>();
  for (const a of links($, BASE)) {
    if (!a.href.startsWith(BASE) || seen.has(a.href)) continue;
    const m = /(primer|segund|tercer|cuart)\w*\s*trimestre\s*(?:de\s*)?(20\d\d)\s*$/i.exec(a.text);
    if (!m || +m[2]! < FIRST_YEAR) continue;
    seen.add(a.href);
    const quarter = QUARTERS.find(([re]) => re.test(m[1]!))![1];
    const files: Release["files"] = {};
    for (const l of links(await page(a.href), a.href)) {
      if (!/drive\.google\.com\/file\/d\//.test(l.href)) continue;
      const annex = annexOfText(l.text);
      if (annex && !files[annex]) files[annex] = l.href;
    }
    if (Object.keys(files).length) releases.push({ municipality: "Santa Rosa", year: +m[2]!, quarter, files });
  }
  return releases;
}
