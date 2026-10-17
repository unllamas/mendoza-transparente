/**
 * Junín: two pages. https://www.juninmendoza.gov.ar/?page_id=212273 lists one ZIP per closed quarter
 * (`/fiscal/<YEAR>/<QUARTER>.zip`, with every annex inside and folder and file names that change), and
 * https://www.juninmendoza.gov.ar/?page_id=425 has the quarter in progress as loose PDFs (`/fiscal011/Anexo_2.pdf`).
 * The loose files do not say which quarter they are (the PDF leaves the quarter boxes unmarked): they are taken as the
 * quarter after the last ZIP. The 2023-T1 ZIP is broken on the site; the download records it.
 */

import type { Period } from "../annexes.ts";
import { annexLinks, FIRST_YEAR, links, page, type Release } from "../release.ts";

const SITE = "https://www.juninmendoza.gov.ar";

const next = (p: Period): Period => (p.quarter === 4 ? { year: p.year + 1, quarter: 1 } : { year: p.year, quarter: p.quarter + 1 });

export async function find(): Promise<Release[]> {
  const releases: Release[] = [];
  const zipsUrl = `${SITE}/?page_id=212273`;
  for (const l of links(await page(zipsUrl, "indice-junin.html"), zipsUrl)) {
    const m = /\/fiscal\/(\d{4})\/([1-4])\.zip$/i.exec(l.href);
    if (!m || +m[1]! < FIRST_YEAR || releases.some((r) => r.year === +m[1]! && r.quarter === +m[2]!)) continue;
    releases.push({ municipality: "Junín", year: +m[1]!, quarter: +m[2]!, files: {}, zip: l.href });
  }
  releases.sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter));

  const last = releases.at(-1);
  const currentUrl = `${SITE}/?page_id=425`;
  const files = annexLinks(links(await page(currentUrl, "indice-junin-trimestre-en-curso.html"), currentUrl));
  if (last && Object.keys(files).length) releases.push({ municipality: "Junín", ...next(last), files });
  return releases;
}
