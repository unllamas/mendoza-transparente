/**
 * General Alvear: one tab per quarter ("2° Trimestre | 2026") with every annex at /resp-fiscal/<folder>/anexoN.pdf.
 * The folder name is NOT the quarter from 2023-T4 to 2024-T3 (2023-T4 is in "archivos-1t-2024"): the links are taken
 * from the tab, and the period printed in each annex is checked. Annex 1 is yearly, in other tabs; not used.
 */

import * as cheerio from "cheerio";
import { annexLinks, FIRST_YEAR, links, page, type Release } from "../release.ts";

export async function find(): Promise<Release[]> {
  const base = "https://alvearmendoza.gob.ar/ley-de-responsabilidad-fiscal/";
  const $ = await page(base, "indice-general-alvear.html");
  const releases: Release[] = [];
  $(".tab-pane").each((_, pane) => {
    const m = /(\d)°?\s*trimestre\|(\d{4})/i.exec($(pane).attr("aria-labelledby") ?? "");
    if (!m || +m[2]! < FIRST_YEAR) return;
    const files = annexLinks(links(cheerio.load($(pane).html() ?? ""), base));
    delete files["1"];
    releases.push({ municipality: "General Alvear", year: +m[2]!, quarter: +m[1]!, files });
  });
  return releases;
}
