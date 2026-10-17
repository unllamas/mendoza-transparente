/**
 * San Carlos: https://sancarlos.gob.ar/responsabilidad-fiscal/ has a "Descargar" button per quarter with a ZIP of every
 * annex: annexes 1 to 4 as pages saved from the browser (.htm, and .mht in 2023), annex 5 as a spreadsheet, and annexes
 * 22 and 23, which the download leaves out. The period comes from the file name: "2-2023-resp-fiscal.zip" up to 2024,
 * then names like "…-Primer-Trimestre-2025.zip" or "…-3°-Trimestre-2025B.zip". 2024-T4 is not published.
 */

import { FIRST_YEAR, links, page, type Release } from "../release.ts";

const QUARTER_WORDS: [RegExp, number][] = [
  [/primer/i, 1],
  [/segund/i, 2],
  [/tercer/i, 3],
  [/cuart/i, 4],
];

function periodFromName(name: string): { year: number; quarter: number } | null {
  const old = /(?:^|\/)([1-4])-(20\d\d)-resp-fiscal\.zip$/i.exec(name);
  if (old) return { year: +old[2]!, quarter: +old[1]! };
  const year = /(20\d\d)(?!.*20\d\d)/.exec(name)?.[1];
  const quarter = /([1-4])\s*[°º]\s*-?\s*trimestre/i.exec(name)?.[1] ?? QUARTER_WORDS.find(([re]) => re.test(name))?.[1];
  return year && quarter ? { year: +year, quarter: +quarter } : null;
}

export async function find(): Promise<Release[]> {
  const base = "https://sancarlos.gob.ar/responsabilidad-fiscal/";
  const $ = await page(base, "indice-san-carlos.html");
  const releases = new Map<string, Release>();
  for (const l of links($, base)) {
    if (!/\.zip$/i.test(l.href)) continue;
    const period = periodFromName(decodeURIComponent(l.href.split("/").pop() ?? ""));
    if (!period || period.year < FIRST_YEAR) continue;
    const key = `${period.year}-${period.quarter}`;
    if (!releases.has(key)) releases.set(key, { municipality: "San Carlos", ...period, files: {}, zip: l.href });
  }
  return [...releases.values()];
}
