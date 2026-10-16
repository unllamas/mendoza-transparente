/**
 * What every municipality's finder needs (lrf/finders/<municipality>.ts) and how a quarter's documents are downloaded,
 * whatever the container: one file per annex (PDF, spreadsheet or Google Drive) or a ZIP with all of them. The
 * workbook with a sheet per annex (San Martín) is handled by the source itself.
 */

import { archive, get, type Municipio } from "@mt/core";
import * as cheerio from "cheerio";
import { unzipSync } from "fflate";
import type { Period } from "./annexes.ts";

export const LRF_SOURCE = "municipios-lrf";
/** The site shows the last four years. */
export const FIRST_YEAR = 2023;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Annexes archived for each quarter. Annexes 22 and 23 list debtors with names and are never downloaded. */
export const ANNEXES = ["1", "2", "2bis", "3", "4", "5"] as const;
export type Annex = (typeof ANNEXES)[number];
export const annexName = (annex: Annex) => (annex === "2bis" ? "2 bis" : annex);

/** The documents of one quarter: one file per annex, a ZIP with every annex, or a workbook with a sheet per annex. */
export interface Release extends Period {
  municipality: Municipio;
  files: Partial<Record<Annex, string>>;
  zip?: string;
  workbook?: string;
}

/** A municipality's finder: every quarter it publishes (the source drops those before FIRST_YEAR). */
export type Finder = () => Promise<Release[]>;

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };

/**
 * Annex named in a link text or file name, in any of the spellings found: "anexo2bis.pdf", "Anexo-II.pdf",
 * "ANEXO-2-DE-LA-EJECUCION…", "Anxo-2-bis-…", "Anexi-III.pdf". Null if it is not one of the annexes archived here.
 * The printed title is checked later (`headerAnnex`): a file can be published under the wrong name.
 */
export function annexFromName(name: string): Annex | null {
  let text = name;
  try {
    text = decodeURIComponent(name);
  } catch {
    /* not encoded */
  }
  const m = /an[e]?x[oi]?[\s_-]*(vi|iv|v|i{1,3}|\d{1,2})[\s_-]*(bis)?(?![a-z\d])/i.exec(text);
  if (!m) return null;
  const n = ROMAN[m[1]!.toLowerCase()] ?? String(Number(m[1]));
  const annex = (m[2] ? `${n}bis` : n) as Annex;
  return ANNEXES.includes(annex) ? annex : null;
}

/**
 * `try-finder.ts` sets LRF_DRY_RUN: nothing is written to data/raw while a finder is being tried. Read when called, not
 * at import: the script sets the variable after its imports are evaluated.
 */
const dryRun = () => !!process.env.LRF_DRY_RUN;

/** Downloads a listing page, with a pause; archives it when given a file name (the main index of each site). */
export async function page(url: string, filename = ""): Promise<cheerio.CheerioAPI> {
  const text = await (await get(url)).text();
  if (filename && !dryRun()) await archive(LRF_SOURCE, filename, text, { url });
  await sleep(800);
  return cheerio.load(text);
}

/** Links of a page, absolute. */
export function links($: cheerio.CheerioAPI, base: string): { text: string; href: string }[] {
  return $("a")
    .toArray()
    .flatMap((a) => {
      const href = $(a).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript")) return [];
      try {
        return [{ text: $(a).text().replace(/\s+/g, " ").trim(), href: new URL(href.trim().replace(/ /g, "%20"), base).toString() }];
      } catch {
        return [];
      }
    });
}

/** The archived annexes among a page's document links, recognized by the file name or the link text. */
export function annexLinks(found: { text: string; href: string }[]): Partial<Record<Annex, string>> {
  const files: Partial<Record<Annex, string>> = {};
  for (const l of found) {
    if (!/\.(pdf|xlsx?)(\?|$)/i.test(l.href) && !/drive\.google\.com\/file\/d\//.test(l.href)) continue;
    const annex = annexFromName(l.href.split("/").pop() ?? "") ?? annexFromName(l.text);
    if (annex && !files[annex]) files[annex] = l.href;
  }
  return files;
}

// ---------------------------------------------------------------- download

export type DocumentExt = "pdf" | "xlsx" | "xls";

/** One downloaded annex, ready to archive or read. */
export interface AnnexDocument {
  annex: Annex;
  bytes: Uint8Array;
  ext: DocumentExt;
  url: string;
}

/** Google Drive viewer link → direct download, which works without a session. */
const driveDownload = (url: string) => {
  const id = /drive\.google\.com\/file\/d\/([^/?#]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
};

/** File type from its first bytes (Drive and some sites serve documents without an extension). */
export function documentExt(bytes: Uint8Array): DocumentExt | null {
  const head = Array.from(bytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (head === "25504446") return "pdf";
  if (head === "d0cf11e0") return "xls";
  if (head === "504b0304") return "xlsx";
  return null;
}

/**
 * Downloads the annexes of a release that are not in `skip`, sequentially and with pauses. From a ZIP only the archived
 * annexes are kept (the ZIPs also carry annexes 22 and 23, with debtors' names). Returns what could not be downloaded.
 */
export async function downloadRelease(r: Release, skip: Set<Annex>): Promise<{ docs: AnnexDocument[]; problems: string[] }> {
  const docs: AnnexDocument[] = [];
  const problems: string[] = [];
  if (r.zip) {
    if (ANNEXES.every((a) => skip.has(a))) return { docs, problems };
    const bytes = new Uint8Array(await (await get(r.zip)).arrayBuffer());
    await sleep(1000);
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      return { docs, problems: [`ZIP dañado en el sitio del municipio (${bytes.length} bytes)`] };
    }
    for (const [name, data] of Object.entries(entries)) {
      if (name.startsWith("__MACOSX")) continue;
      const annex = annexFromName(name.split("/").pop() ?? "");
      const ext = documentExt(data);
      if (!annex || !ext || skip.has(annex) || docs.some((d) => d.annex === annex)) continue;
      docs.push({ annex, bytes: data, ext, url: r.zip });
    }
    return { docs, problems };
  }
  for (const annex of ANNEXES) {
    const url = r.files[annex];
    if (!url || skip.has(annex)) continue;
    try {
      const bytes = new Uint8Array(await (await get(driveDownload(url))).arrayBuffer());
      const ext = documentExt(bytes);
      if (ext) docs.push({ annex, bytes, ext, url });
      else problems.push(`anexo ${annexName(annex)}: el archivo no es PDF ni planilla`);
    } catch (err) {
      problems.push(`anexo ${annexName(annex)}: ${(err as Error).message}`);
    }
    await sleep(1000);
  }
  return { docs, problems };
}
