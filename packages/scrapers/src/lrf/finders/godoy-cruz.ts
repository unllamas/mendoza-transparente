/**
 * Godoy Cruz: the annexes are in a GeneXus application (webapps.godoycruz.gob.ar/responsabilidadfiscal) whose list
 * needs an encrypted AJAX request, but each file has a direct address that works without a session:
 * `…areportearchivo?<NAME>,/opt/archivos_aplicativos/anexofiscal/<YEAR>/<QUARTER>/<NAME>`. A name that does not exist
 * answers 200 with an empty body, so the names are tried from the spellings the municipality has used ("ANEXO_2.pdf",
 * "ANEXO+2.pdf", "ANEXO+2+.pdf", "Anexo_2.pdf", …) and the first one that brings a file wins. Annex 1 is yearly and named
 * differently every time ("ANEXO_1_2023.pdf", "PROGRAMACION+FINANCIERA+2026.pdf"): not tried.
 */

import { get } from "@mt/core";
import { type Annex, FIRST_YEAR, type Release, sleep } from "../release.ts";

const BASE = "https://webapps.godoycruz.gob.ar/responsabilidadfiscal/servlet/com.responsabilidadfiscalnuevo.areportearchivo";

/** Spellings seen from 2023 to 2026 ("+" is a space in the file name). */
const NAMES: Partial<Record<Annex, string[]>> = {
  "2": ["ANEXO+2", "ANEXO_2", "ANEXO+2+", "Anexo_2", "ANEXO_2+"],
  "2bis": ["ANEXO+2+BIS", "ANEXO+2+BIS+", "ANEXO_2_BIS", "ANEXO_2BIS", "ANEXO_+2_bis"],
  "3": ["ANEXO+3", "ANEXO_3", "ANEXO+3+", "ANEXO_3+", "Anexo_3"],
  "4": ["ANEXO+4", "ANEXO_4", "ANEXO+4+", "ANEXO_4+", "Anexo_4"],
  "5": ["ANEXO+5", "ANEXO_5", "ANEXO+5+", "ANEXO_5+", "Anexo_5"],
};

const address = (year: number, quarter: number, name: string) =>
  // Only the slashes are encoded: the "+" of the names stays literal, as the application writes it.
  `${BASE}?${name},${`/opt/archivos_aplicativos/anexofiscal/${year}/${quarter}/${name}`.replace(/\//g, "%2F")}`;

/** The first spelling that brings a file, or null. */
async function firstFound(year: number, quarter: number, names: string[]): Promise<string | null> {
  for (const base of names) {
    for (const ext of [".pdf", ".PDF"]) {
      const url = address(year, quarter, `${base}${ext}`);
      const bytes = await (await get(url)).arrayBuffer();
      await sleep(400);
      if (bytes.byteLength > 0) return url;
    }
  }
  return null;
}

export async function find(): Promise<Release[]> {
  const releases: Release[] = [];
  const now = new Date();
  for (let year = FIRST_YEAR; year <= now.getFullYear(); year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      // A quarter is published about two months after it closes.
      if (year === now.getFullYear() && quarter * 3 > now.getMonth() + 1) break;
      const files: Release["files"] = {};
      for (const [annex, names] of Object.entries(NAMES) as [Annex, string[]][]) {
        const url = await firstFound(year, quarter, names);
        if (url) files[annex] = url;
      }
      if (Object.keys(files).length) releases.push({ municipality: "Godoy Cruz", year, quarter, files });
    }
  }
  return releases;
}
