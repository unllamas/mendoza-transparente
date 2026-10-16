/**
 * Lavalle: the old site (/old/acuerdo3949) lists the quarters in a form; a POST with `acuerdo=YYYYQ` returns the
 * links of that quarter's annexes (`/old/pdf/acuerdo3949/<name>(YYYY-Q).pdf`). The file name changes by period
 * ("Acuerdo 3949 - Anexo II(2023-1)", "anexo 2 bis(2023-3)", "Anexo II(2025-1)"), so the links are taken from the HTML.
 * Annex 1 is yearly and only appears in the first quarter. The period printed in each annex is checked later.
 */

import { get } from "@mt/core";
import * as cheerio from "cheerio";
import { annexLinks, FIRST_YEAR, links, page, type Release, sleep } from "../release.ts";

export async function find(): Promise<Release[]> {
  const base = "https://lavallemendoza.gob.ar/old/acuerdo3949";
  const $ = await page(base, "indice-lavalle-lrf.html");
  const periods = $("select#acuerdo option")
    .toArray()
    .map((o) => /^(\d{4})([1-4])$/.exec($(o).attr("value") ?? ""))
    .filter((m): m is RegExpExecArray => !!m && +m[1]! >= FIRST_YEAR);
  const releases: Release[] = [];
  for (const m of periods) {
    const resp = await get(base, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `acuerdo=${m[1]}${m[2]}`,
    });
    const listing = cheerio.load(await resp.text());
    await sleep(800);
    const files = annexLinks(links(listing, base));
    if (Object.keys(files).length) releases.push({ municipality: "Lavalle", year: +m[1]!, quarter: +m[2]!, files });
  }
  return releases;
}
