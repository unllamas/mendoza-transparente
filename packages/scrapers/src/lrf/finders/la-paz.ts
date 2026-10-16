/**
 * La Paz: the home page https://lapazmendoza.gob.ar/ links every file in folders
 * `Documentos/Información publica/<YYYY>/<NN>_<ORDINAL> TRIMESTRE/<file>.pdf`. NN is the order of appearance in the year
 * (not the quarter) and the folder names have typos ("PRIEMR", "PEIMER"), so the quarter is read from the ordinal word.
 * The file names change almost every quarter, so annexes are recognized from the name. The folder year is taken as the
 * quarter's year; the period printed in each annex is checked later by the source.
 */

import type { Period } from "../annexes.ts";
import { annexLinks, FIRST_YEAR, links, page, type Release } from "../release.ts";

const BASE = "https://lapazmendoza.gob.ar/";

/** Quarter named in a folder, tolerating the typos found ("PRIEMR", "PEIMER"). */
function quarterOf(word: string): number | null {
  const w = word.toUpperCase();
  if (w.startsWith("P")) return 1;
  if (w.startsWith("SEG")) return 2;
  if (w.startsWith("TER")) return 3;
  if (w.startsWith("CUA")) return 4;
  return null;
}

export async function find(): Promise<Release[]> {
  const $ = await page(BASE, "indice-la-paz-lrf.html");
  const byQuarter = new Map<string, { period: Period; found: { text: string; href: string }[] }>();
  for (const l of links($, BASE)) {
    const m = /Documentos\/Informaci[oó]n publica\/(\d{4})\/\d+_([A-ZÁÉÍÓÚ]+)[ _]TRIMESTRE\//i.exec(decodeURIComponent(l.href));
    if (!m) continue;
    const quarter = quarterOf(m[2]!);
    const year = +m[1]!;
    if (!quarter || year < FIRST_YEAR) continue;
    const key = `${year}-${quarter}`;
    const entry = byQuarter.get(key) ?? { period: { year, quarter }, found: [] };
    entry.found.push(l);
    byQuarter.set(key, entry);
  }
  const releases: Release[] = [];
  for (const { period, found } of byQuarter.values()) {
    const files = annexLinks(found);
    if (Object.keys(files).length) releases.push({ municipality: "La Paz", ...period, files });
  }
  return releases;
}
