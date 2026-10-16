/**
 * Maipú: the page https://www.maipu.gob.ar/responsabilidad-fiscal/ only shows the latest quarters, but every annex ever
 * uploaded is in the WordPress media library ("Acuerdo-3949" is in every file name). A quarter is deduced from the
 * upload date, which is about two months after the quarter closes (May/June -> T1, August/September -> T2,
 * November/December -> T3, February/March -> T4 of the previous year); the printed header is checked later by the source.
 */

import { get } from "@mt/core";
import type { Period } from "../annexes.ts";
import { type Annex, annexFromName, FIRST_YEAR, page, type Release, sleep } from "../release.ts";

const SITE = "https://www.maipu.gob.ar";

interface Media {
  date: string;
  source_url: string;
}

/** Quarter a document belongs to, from the month it was uploaded. Null for months outside the publishing calendar. */
function periodFromUpload(date: string): Period | null {
  const year = +date.slice(0, 4);
  const month = +date.slice(5, 7);
  if (month === 5 || month === 6) return { year, quarter: 1 };
  if (month === 8 || month === 9) return { year, quarter: 2 };
  if (month === 11 || month === 12) return { year, quarter: 3 };
  if (month === 2 || month === 3) return { year: year - 1, quarter: 4 };
  return null;
}

export async function find(): Promise<Release[]> {
  const media: Media[] = [];
  for (let n = 1; n <= 10; n++) {
    const res = await get(`${SITE}/wp-json/wp/v2/media?search=Acuerdo-3949&per_page=100&page=${n}&_fields=source_url,date`).catch(
      () => null,
    );
    if (!res) break;
    const batch = (await res.json()) as Media[];
    await sleep(800);
    media.push(...batch);
    if (batch.length < 100) break;
  }
  // Newest first, so when a quarter has two versions of an annex the latest one wins.
  media.sort((a, b) => b.date.localeCompare(a.date));

  const quarters = new Map<string, Release>();
  const add = (period: Period, annex: Annex, url: string) => {
    const key = `${period.year}-${period.quarter}`;
    const release = quarters.get(key) ?? { municipality: "Maipú", ...period, files: {} };
    if (!release.files[annex]) release.files[annex] = url;
    quarters.set(key, release);
  };
  for (const m of media) {
    if (!/\.pdf$/i.test(m.source_url)) continue;
    const period = periodFromUpload(m.date);
    const annex = annexFromName(m.source_url.split("/").pop() ?? "");
    if (period && annex && period.year >= FIRST_YEAR) add(period, annex, m.source_url);
  }

  // The index page is archived as the main page of the site; its links are already in the media library.
  await page(`${SITE}/responsabilidad-fiscal/`, "indice-maipu.html").catch(() => null);
  return [...quarters.values()];
}
