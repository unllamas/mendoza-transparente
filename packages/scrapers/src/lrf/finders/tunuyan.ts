/**
 * Tunuyán: https://www.tunuyan.gov.ar/site/resp-fiscal/ lists one ZIP per quarter, but only from 2025. The quarters of
 * 2023 and 2024 are loose PDFs in the WordPress media library (no link on the page), found with the public media API.
 * A quarter is deduced from the upload month, which is about two months after the quarter closes (May/June -> T1,
 * August/September -> T2, November/December -> T3, February/March -> T4 of the previous year); the printed header is
 * checked later by the source.
 */

import { get } from "@mt/core";
import type { Period } from "../annexes.ts";
import { type Annex, annexFromName, FIRST_YEAR, links, page, type Release, sleep } from "../release.ts";

const SITE = "https://www.tunuyan.gov.ar/site";

interface Media {
  date: string;
  source_url: string;
}

/** Quarter a document belongs to, from the year and month it was uploaded. Null outside the publishing calendar. */
function periodFromUpload(year: number, month: number): Period | null {
  if (month === 5 || month === 6) return { year, quarter: 1 };
  if (month === 8 || month === 9) return { year, quarter: 2 };
  if (month === 11 || month === 12) return { year, quarter: 3 };
  if (month === 2 || month === 3) return { year: year - 1, quarter: 4 };
  return null;
}

export async function find(): Promise<Release[]> {
  const quarters = new Map<string, Release>();
  const release = (period: Period) => {
    const key = `${period.year}-${period.quarter}`;
    const found = quarters.get(key) ?? { municipality: "Tunuyán" as const, ...period, files: {} };
    quarters.set(key, found);
    return found;
  };

  // Since 2025: a ZIP per quarter. The upload folder (/uploads/AAAA/MM/) gives the quarter, as for the loose PDFs.
  const $ = await page(`${SITE}/resp-fiscal/`, "indice-tunuyan.html");
  for (const l of links($, `${SITE}/resp-fiscal/`)) {
    const m = /\/uploads\/(\d{4})\/(\d{2})\/[^/]+\.zip$/i.exec(l.href);
    const period = m && periodFromUpload(+m[1]!, +m[2]!);
    if (period && period.year >= FIRST_YEAR) release(period).zip = l.href;
  }

  // Before that: loose PDFs in the media library. Newest first, so the latest version of an annex wins.
  const media: Media[] = [];
  for (let n = 1; n <= 10; n++) {
    const res = await get(`${SITE}/wp-json/wp/v2/media?search=anexo&per_page=100&page=${n}&_fields=source_url,date`).catch(() => null);
    if (!res) break;
    const batch = (await res.json()) as Media[];
    await sleep(800);
    media.push(...batch);
    if (batch.length < 100) break;
  }
  media.sort((a, b) => b.date.localeCompare(a.date));
  for (const m of media) {
    if (!/\.pdf$/i.test(m.source_url)) continue;
    const period = periodFromUpload(+m.date.slice(0, 4), +m.date.slice(5, 7));
    const annex: Annex | null = annexFromName(m.source_url.split("/").pop() ?? "");
    if (!period || !annex || period.year < FIRST_YEAR) continue;
    const r = release(period);
    if (!r.zip && !r.files[annex]) r.files[annex] = m.source_url;
  }
  return [...quarters.values()];
}
