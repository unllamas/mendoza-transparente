/**
 * Capital (Ciudad de Mendoza): the latest quarter is loose on https://ciudaddemendoza.gob.ar/responsabilidad-fiscal/,
 * one PDF per annex, and the rest are ZIPs on /historico/ (15 to 21 MB, with annexes 22 and 23, which the download
 * leaves out). The historic list goes from the newest year down, quarters in order; some links do not say the year
 * (2024: "Primer Trimestre"), which follows from the link before.
 */

import type { Period } from "../annexes.ts";
import { annexLinks, FIRST_YEAR, links, page, type Release } from "../release.ts";

const QUARTER_WORDS: [RegExp, number][] = [
  [/primer|\b1\s*[°º]|\b1ro\b/i, 1],
  [/segund|\b2\s*[°º]|\b2do\b/i, 2],
  [/tercer|\b3\s*[°º]|\b3ro\b/i, 3],
  [/cuart|\b4\s*[°º]|\b4to\b/i, 4],
];
const quarterOf = (text: string) => QUARTER_WORDS.find(([re]) => re.test(text))?.[1] ?? null;

export async function find(): Promise<Release[]> {
  const base = "https://ciudaddemendoza.gob.ar/responsabilidad-fiscal/";
  const releases: Release[] = [];

  const current = await page(base, "indice-capital.html");
  const m = /(primer|segund|tercer|cuart)\w*\s+trimestre\s+(20\d\d)/i.exec(current("body").text().replace(/\s+/g, " "));
  const files = annexLinks(links(current, base));
  if (m && Object.keys(files).length) releases.push({ municipality: "Capital", year: +m[2]!, quarter: quarterOf(m[1]!)!, files });

  const history = await page(`${base}historico/`, "indice-capital-historico.html");
  let prev: Period | null = null;
  for (const l of links(history, `${base}historico/`)) {
    if (!/\.zip$/i.test(l.href)) continue;
    const name = decodeURIComponent(l.href.split("/").pop() ?? "");
    const quarter = quarterOf(l.text) ?? quarterOf(name.replace(/-/g, " "));
    if (!quarter) continue;
    const year = /(20\d\d)/.exec(l.text)?.[1] ?? /(20\d\d)/.exec(name)?.[1];
    // Without a year: the same year as the link before, or the one before it when the quarters start over.
    const period: Period | null = year
      ? { year: +year, quarter }
      : prev
        ? { year: quarter <= prev.quarter ? prev.year - 1 : prev.year, quarter }
        : null;
    if (!period) continue;
    prev = period;
    if (period.year < FIRST_YEAR || releases.some((r) => r.year === period.year && r.quarter === period.quarter)) continue;
    releases.push({ municipality: "Capital", ...period, files: {}, zip: l.href });
  }
  return releases;
}
