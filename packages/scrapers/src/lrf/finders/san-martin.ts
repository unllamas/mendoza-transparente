/**
 * San Martín: Hacienda publishes one workbook per quarter with every annex at web.sanmartinmza.gob.ar/hacienda/ (the
 * folder index answers 403 and no page links them). The file name pattern is tried with a HEAD request.
 */

import { USER_AGENT } from "@mt/core";
import { FIRST_YEAR, type Release, sleep } from "../release.ts";

export async function find(): Promise<Release[]> {
  const base = "https://web.sanmartinmza.gob.ar/hacienda/";
  const releases: Release[] = [];
  for (let year = FIRST_YEAR; year <= new Date().getFullYear(); year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      for (const ext of ["xlsx", "xls"]) {
        const url = `${base}ley_resp_${String(year).slice(2)}_${quarter}.${ext}`;
        const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
        await sleep(400);
        if (head.ok) {
          releases.push({ municipality: "San Martín", year, quarter, files: {}, workbook: url });
          break;
        }
      }
    }
  }
  return releases;
}
