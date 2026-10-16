/** San Rafael: one page per year with every annex of each quarter at /archivos-muni/fiscal/AAAA_Nt/anexoN.pdf. */

import { ANNEXES, type Annex, FIRST_YEAR, page, type Release } from "../release.ts";

export async function find(): Promise<Release[]> {
  const base = "https://www.sanrafael.gov.ar/informacion-publica/ley-resp-fiscal/";
  const index = await page(base, "indice-san-rafael.html");
  const years = new Set<string>();
  index("a").each((_, a) => {
    const href = index(a).attr("href") ?? "";
    const m = /ley-de-responsabilidad-fiscal-(\d{4})\/?$/.exec(href);
    if (m && +m[1]! >= FIRST_YEAR) years.add(new URL(href, base).toString());
  });
  const releases = new Map<string, Release>();
  for (const url of years) {
    const $ = await page(url);
    $("a").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      const m = /\/fiscal\/(\d{4})_(\d)t\/anexo(\d+(?:bis)?)\.pdf$/i.exec(href);
      const annex = m?.[3]?.toLowerCase() as Annex | undefined;
      if (!m || !annex || !ANNEXES.includes(annex)) return;
      const key = `${m[1]}-${m[2]}`;
      const release = releases.get(key) ?? { municipality: "San Rafael", year: +m[1]!, quarter: +m[2]!, files: {} };
      release.files[annex] = new URL(href, url).toString();
      releases.set(key, release);
    });
  }
  return [...releases.values()];
}
