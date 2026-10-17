/**
 * Las Heras: the annexes are in a public Oracle APEX application (web6.lasheras.gob.ar/apex/f?p=127:32). The table loads
 * by AJAX and its download links expire with the session, so the finder opens a session (cookie and page tokens), asks
 * the rows of each year and quarter, and returns the links with the session cookie for the download, which happens right
 * after in the same run. The annex is recognized by the title of the row ("ANEXO 2: …", "Anexo 2 Bis"). From 2024-T2
 * to 2025-T1 the annexes are scanned images: the readers report them as such.
 */

import { get, USER_AGENT } from "@mt/core";
import { ANNEXES, type Annex, FIRST_YEAR, type Release, sleep } from "../release.ts";

const BASE = "https://web6.lasheras.gob.ar/apex/";

interface Session {
  cookie: string;
  instance: string;
  salt: string;
  protectedItems: string;
  region: string;
  ajax: string;
}

async function openSession(): Promise<Session> {
  const resp = await get(`${BASE}f?p=127:32`);
  const cookie = (resp.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const html = await resp.text();
  await sleep(800);
  const report = /apex\.widget\.report\.init\("R(\d+)","([^"]+)"/.exec(html);
  const instance = /name="p_instance" value="(\d+)"/.exec(html)?.[1];
  const protectedItems = /id="pPageItemsProtected" value="([^"]+)"/.exec(html)?.[1];
  if (!report || !instance || !protectedItems) throw new Error("la página de la aplicación cambió: no se encontró la sesión");
  return {
    cookie,
    instance,
    salt: /value="(\d+)" id="pSalt"/.exec(html)?.[1] ?? "",
    protectedItems: protectedItems.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16))),
    region: report[1]!,
    ajax: report[2]!.replace(/\\u002F/g, "/"),
  };
}

/** The download link of each annex in one year and quarter. */
async function quarterFiles(s: Session, year: number, quarter: number): Promise<Partial<Record<Annex, string>>> {
  const body = new URLSearchParams({
    p_flow_id: "127",
    p_flow_step_id: "32",
    p_instance: s.instance,
    p_debug: "",
    p_request: `PLUGIN=${s.ajax}`,
    p_widget_action: "reset",
    x01: s.region,
    p_json: JSON.stringify({
      pageItems: {
        itemsToSubmit: [
          { n: "P32_LRF_AAAA", v: String(year) },
          { n: "P32_LRF_TRIMESTRE", v: String(quarter) },
          { n: "P32_LRF_TITULO", v: "" },
        ],
        protected: s.protectedItems,
        rowVersion: "",
        formRegionChecksums: [],
      },
      salt: s.salt,
    }),
  });
  const html = await (
    await fetch(`${BASE}wwv_flow.ajax?p_context=127:32:${s.instance}`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: s.cookie,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    })
  ).text();
  await sleep(1200);
  const files: Partial<Record<Annex, string>> = {};
  for (const [, row] of html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
    const cells = [...row!.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) =>
      m[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    const href = /href="([^"]*get_blob[^"]*)"/.exec(row!)?.[1]?.replace(/&amp;/g, "&");
    const title = cells[2] ?? "";
    // The title of annex 30 ("Anexo 30-INFORMES ESCRITOS…") is long; the annexes kept here have short titles.
    const m = /^anexo\s*(\d+)\s*(bis)?\b/i.exec(title);
    const annex = m ? ((m[1]! + (m[2] ? "bis" : "")).toLowerCase() as Annex) : null;
    if (href && annex && ANNEXES.includes(annex) && title.length < 300 && !files[annex]) files[annex] = new URL(href, BASE).toString();
  }
  return files;
}

export async function find(): Promise<Release[]> {
  const session = await openSession();
  const releases: Release[] = [];
  const now = new Date();
  for (let year = FIRST_YEAR; year <= now.getFullYear(); year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      if (year === now.getFullYear() && quarter * 3 > now.getMonth() + 1) break;
      const files = await quarterFiles(session, year, quarter);
      if (Object.keys(files).length)
        releases.push({ municipality: "Las Heras", year, quarter, files, headers: { Cookie: session.cookie } });
    }
  }
  return releases;
}
