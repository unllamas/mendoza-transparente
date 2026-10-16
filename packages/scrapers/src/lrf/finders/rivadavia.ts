/**
 * Rivadavia: the transparency blog has one post per quarter ("2026 – LRF 2º Trimestre"), paginated from `page_id=8440`
 * ("Entradas más antiguas"). Each post links one PDF per annex (`descargas/.../AAAA-NTrimestre-Anexo02bis.pdf`). Annex 1
 * is yearly: every post links the file named after the first quarter, which is what `annexLinks` takes.
 * Known oddity: in 2024-T2 "Anexo02.pdf" prints annex 2 bis and "Anexo02bis.pdf" prints annex 2; the source detects it
 * from the printed title and reports it, so the finder swaps them.
 */

import { annexLinks, FIRST_YEAR, links, page, type Release, sleep } from "../release.ts";

export async function find(): Promise<Release[]> {
  const releases: Release[] = [];
  let url: string | null = "https://rivadaviamendoza.gob.ar/transparencia/?page_id=8440";
  for (let n = 1; url && n <= 8; n++) {
    const $ = await page(url, `indice-rivadavia-lrf-${n}.html`);
    const found = links($, url);
    for (const a of found) {
      const m = /(\d{4})\s*[–-]\s*LRF\s*(\d)º\s*Trimestre/i.exec(a.text);
      if (!m || +m[1]! < FIRST_YEAR) continue;
      const post = await page(a.href);
      const files = annexLinks(links(post, a.href));
      // Published swapped (checked against the printed titles): "Anexo02" is the quarterly 2 bis, "Anexo02bis" the 2.
      if (+m[1]! === 2024 && +m[2]! === 2 && files["2"] && files["2bis"]) [files["2"], files["2bis"]] = [files["2bis"], files["2"]];
      if (Object.keys(files).length) releases.push({ municipality: "Rivadavia", year: +m[1]!, quarter: +m[2]!, files });
      await sleep(500);
    }
    const older = found.find((l) => /Entradas más antiguas/i.test(l.text));
    url = older ? older.href.replace(/&#038;/g, "&") : null;
  }
  return releases;
}
