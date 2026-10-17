/**
 * Luján de Cuyo: https://lujandecuyo.gob.ar/responsabilidad-fiscal/ shows only the last quarter, one Google Drive link
 * per annex, and replaces them every quarter. Earlier quarters come from the copies of that page in the Wayback Machine
 * (web.archive.org): each copy has the Drive links of its time, and some of those files are still on Drive (the ones
 * from 2023 were deleted). The page does not say which quarter it shows: it is read from the header of Annex 2, which
 * prints the year and the quarter as columns of the table. The quarters archived in earlier runs are kept, since the
 * site replaces each one with the next.
 */

import { get } from "@mt/core";
import { headerPeriod, type Period } from "../annexes.ts";
import { pdfTables } from "../read.ts";
import { type Annex, annexFromName, archivedReleases, FIRST_YEAR, page, type Release, sleep } from "../release.ts";

const PAGE = "https://lujandecuyo.gob.ar/responsabilidad-fiscal/";

const driveId = (url: string) => /drive\.google\.com\/file\/d\/([^/?#]+)/.exec(url)?.[1] ?? null;

/**
 * Annexes of a copy of the page: each block has a title ("Anexo 2: De la ejecución…") and a "Descargar Anexo" button to
 * Drive, so each Drive link takes the annex of the last title before it.
 */
function annexFiles(html: string): Partial<Record<Annex, string>> {
  const files: Partial<Record<Annex, string>> = {};
  let annex: Annex | null = null;
  for (const m of html.matchAll(/Anexo\s+(\d+(?:\s*BIS)?)\s*:|drive\.google\.com\/file\/d\/([\w-]+)/gi)) {
    if (m[1]) annex = annexFromName(`anexo ${m[1]}`);
    else if (annex && !files[annex]) {
      files[annex] = `https://drive.google.com/file/d/${m[2]}/view`;
      annex = null;
    }
  }
  return files;
}

/** Period printed in an annex on Drive; null if the file is gone or is not a readable PDF. */
async function periodOf(url: string): Promise<Period | null> {
  const id = driveId(url);
  if (!id) return null;
  try {
    const bytes = new Uint8Array(await (await get(`https://drive.google.com/uc?export=download&id=${id}`)).arrayBuffer());
    await sleep(1000);
    if (new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") return null;
    return headerPeriod(await pdfTables(bytes, "v")) ?? headerPeriod(await pdfTables(bytes));
  } catch {
    return null;
  }
}

/** Copies of the page in the Wayback Machine since FIRST_YEAR, oldest first, one per distinct content. */
async function waybackCopies(): Promise<string[]> {
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(PAGE)}&output=json&from=${FIRST_YEAR}&filter=statuscode:200&collapse=digest`;
  try {
    const rows = (await (await get(cdx)).json()) as string[][];
    await sleep(1000);
    return rows.slice(1).map((r) => `https://web.archive.org/web/${r[1]}id_/${PAGE}`);
  } catch {
    return [];
  }
}

export async function find(): Promise<Release[]> {
  // What was archived in earlier runs first: the site replaces each quarter with the next one.
  const byPeriod = new Map((await archivedReleases("Luján de Cuyo", "lujan-de-cuyo")).map((r) => [`${r.year}-${r.quarter}`, r]));
  const add = async (files: Partial<Record<Annex, string>>) => {
    const period = files["2"] ? await periodOf(files["2"]) : null;
    if (!period || period.year < FIRST_YEAR) return;
    byPeriod.set(`${period.year}-${period.quarter}`, { municipality: "Luján de Cuyo", ...period, files });
  };
  // Oldest copies first, the live page last: a later copy of the same quarter replaces the earlier one.
  for (const url of await waybackCopies()) await add(annexFiles((await page(url)).html()));
  await add(annexFiles((await page(PAGE, "indice-lujan-de-cuyo.html")).html()));
  return [...byPeriod.values()];
}
