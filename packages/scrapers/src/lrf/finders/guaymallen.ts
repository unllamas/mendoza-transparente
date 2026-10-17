/**
 * Guaymallén: https://www.guaymallen.gob.ar/ley-de-responsabilidad-fiscal/ links one page per quarter
 * ("/segundo-trimestre-2026/", "/cuarto-trimestre-2024-2/") with one PDF per annex. The link texts are missing on some
 * pages, so the annex is recognized by the file name ("anexo2.pdf", "ANEXO-2.pdf", "anexo2Bis.pdf"). Annex 1 is often
 * an old file reused: it is archived as published.
 */

import { annexLinks, FIRST_YEAR, links, page, type Release } from "../release.ts";

const QUARTERS: Record<string, number> = { primer: 1, segundo: 2, tercer: 3, cuarto: 4 };

export async function find(): Promise<Release[]> {
  const base = "https://www.guaymallen.gob.ar/ley-de-responsabilidad-fiscal/";
  const index = await page(base, "indice-guaymallen.html");
  const releases: Release[] = [];
  const seen = new Set<string>();
  for (const l of links(index, base)) {
    const m = /\/(primer|segundo|tercer|cuarto)-trimestre-(20\d\d)(?:-\d)?\/?$/i.exec(l.href);
    if (!m || +m[2]! < FIRST_YEAR || seen.has(l.href)) continue;
    seen.add(l.href);
    const quarter = QUARTERS[m[1]!.toLowerCase()]!;
    if (releases.some((r) => r.year === +m[2]! && r.quarter === quarter)) continue;
    const files = annexLinks(links(await page(l.href), l.href));
    if (Object.keys(files).length) releases.push({ municipality: "Guaymallén", year: +m[2]!, quarter, files });
  }
  return releases;
}
