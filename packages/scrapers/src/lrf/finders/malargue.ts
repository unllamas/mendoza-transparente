/**
 * Malargüe: one page per quarter, listed in the sitemap ("/responsabilidad-fiscal-2o-trimestre-2024/", and from 2025
 * "-2-trimestre-"). Some quarters have a second page ending in "-2" and only one of them has the files (2023-T1 and T4
 * are in the "-2" one): the page with documents wins. File names change every quarter (roman or arabic numbers,
 * typos). The site is slow: about a minute per page.
 */

import { get } from "@mt/core";
import type { Period } from "../annexes.ts";
import { annexLinks, FIRST_YEAR, links, page, type Release, sleep } from "../release.ts";

export async function find(): Promise<Release[]> {
  const pages = new Map<string, { period: Period; urls: string[] }>();
  for (const n of [1, 2, 3]) {
    const xml = await (await get(`https://www.malargue.gov.ar/wp-sitemap-posts-post-${n}.xml`)).text();
    await sleep(800);
    for (const m of xml.matchAll(
      /<loc>(https:\/\/www\.malargue\.gov\.ar\/responsabilidad-fiscal-(\d)o?-trimestre-(\d{4})(?:-\d)?\/)<\/loc>/g,
    )) {
      if (+m[3]! < FIRST_YEAR) continue;
      const key = `${m[3]}-${m[2]}`;
      const entry = pages.get(key) ?? { period: { year: +m[3]!, quarter: +m[2]! }, urls: [] };
      entry.urls.push(m[1]!);
      pages.set(key, entry);
    }
  }
  const releases: Release[] = [];
  for (const { period, urls } of pages.values()) {
    for (const url of urls.sort((a, b) => a.length - b.length)) {
      const files = annexLinks(links(await page(url), url));
      if (Object.keys(files).length) {
        releases.push({ municipality: "Malargüe", ...period, files });
        break;
      }
    }
  }
  return releases;
}
