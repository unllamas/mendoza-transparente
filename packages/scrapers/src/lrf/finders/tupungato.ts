/**
 * Tupungato: https://tupungato.gov.ar/?page_id=3094 links one PDF per quarter with the whole report (93 to 141 pages,
 * with debtors' names in annexes 22 and 23). It is a `report`: only the pages of annexes 1 to 5 are kept, found by
 * their printed title. The period comes from the link text ("Segundo Trimestre 2025"); the file names say little and
 * the upload folder misleads (2023 and early 2024 are in /2022/09/). The source checks the period printed in each annex.
 */

import { FIRST_YEAR, links, page, type Release } from "../release.ts";

const QUARTER_WORDS: [RegExp, number][] = [
  [/primer/i, 1],
  [/segund/i, 2],
  [/tercer/i, 3],
  [/cuart/i, 4],
];

export async function find(): Promise<Release[]> {
  const base = "https://tupungato.gov.ar/?page_id=3094";
  const $ = await page(base, "indice-tupungato.html");
  const releases = new Map<string, Release>();
  for (const l of links($, base)) {
    if (!/\.pdf$/i.test(l.href) || !/trimestre/i.test(l.text) || /programaci/i.test(l.text)) continue;
    const year = /(20\d\d)/.exec(l.text)?.[1];
    const quarter = QUARTER_WORDS.find(([re]) => re.test(l.text))?.[1] ?? /([1-4])\s*[°ºo]?\s*trimestre/i.exec(l.text)?.[1];
    if (!year || !quarter || +year < FIRST_YEAR) continue;
    const key = `${year}-${quarter}`;
    if (!releases.has(key)) releases.set(key, { municipality: "Tupungato", year: +year, quarter: +quarter, files: {}, report: l.href });
  }
  return [...releases.values()];
}
