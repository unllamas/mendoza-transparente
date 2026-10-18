/**
 * Vista compacta de un archivo crudo (HTML, PDF, planilla, JSON, CSV, ZIP) para leerla en una terminal o
 * en el contexto de un agente: el texto, los links a documentos y las primeras filas, nunca el archivo entero.
 */

import { collapseSpaces, parseCsv } from "@mt/core";
import * as cheerio from "cheerio";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { pdfPages } from "./pdf.ts";

export interface RenderOptions {
  /** Máximo de caracteres del texto principal. */
  max: number;
  /** Mostrar todos los links (o los que cumplen el patrón), no solo los que llevan a documentos. */
  links?: RegExp | true;
  /** Mostrar solo las líneas que cumplen el patrón, con una línea de contexto. */
  search?: RegExp;
  /** Filas por hoja o por tabla. */
  rows: number;
  /** Páginas del PDF, desde 1 y con el final incluido. */
  pages?: [number, number];
}

export type Kind = "html" | "pdf" | "sheet" | "json" | "csv" | "zip" | "text" | "binary";

// Caracteres invisibles y glifos de fuentes de íconos (uso privado de Unicode) que, si no, quedan como renglones "vacíos".
const tidy = (s: string) => collapseSpaces(s.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD\uE000-\uF8FF]/g, ""));

const DOCUMENT_LINK = /\.(pdf|xlsx?|ods|csv|zip|rar|docx?|json)(\?|#|$)/i;

/** Tipo del archivo por la extensión, el content-type o los primeros bytes. */
export function detectKind(name: string, bytes: Uint8Array, contentType = ""): Kind {
  const ext = name
    .replace(/\.gz$/, "")
    .replace(/[?#].*$/, "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (ext === "pdf" || head.startsWith("%pdf") || contentType.includes("pdf")) return "pdf";
  if (["xls", "xlsx", "ods"].includes(ext ?? "") || contentType.includes("spreadsheet") || contentType.includes("excel")) return "sheet";
  if (ext === "zip" || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return "zip";
  if (ext === "csv" || contentType.includes("csv")) return "csv";
  if (ext === "json" || ext === "geojson" || contentType.includes("json") || /^[[{]/.test(head)) return "json";
  if (["html", "htm", "mht", "php", "asp", "aspx"].includes(ext ?? "") || contentType.includes("html") || /^<(!doctype|html)/.test(head)) {
    return "html";
  }
  if (head.startsWith("<?xml") || contentType.includes("xml") || ext === "xml" || ext === "txt") return "text";
  return bytes.slice(0, 512).some((b) => b === 0) ? "binary" : "text";
}

/** Recorta el texto a `max` caracteres y avisa cuánto quedó afuera. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (recortado: ${(text.length - max).toLocaleString("es-AR")} caracteres más; usar --max o --buscar)`;
}

/** Las líneas que cumplen el patrón, con una línea antes y otra después. */
export function grepLines(text: string, pattern: RegExp, max: number): string {
  const lines = text.split("\n");
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (pattern.test(l)) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < lines.length) keep.add(j);
  });
  if (!keep.size) return `(ninguna línea cumple ${pattern})`;
  const out: string[] = [];
  let prev = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i > prev + 1) out.push("--");
    out.push(`${i + 1}: ${lines[i]}`);
    prev = i;
  }
  return clip(out.join("\n"), max);
}

function body(text: string, opts: RenderOptions): string {
  return opts.search ? grepLines(text, opts.search, opts.max) : clip(text, opts.max);
}

function renderHtml(bytes: Uint8Array, baseUrl: string | undefined, opts: RenderOptions): string {
  const $ = cheerio.load(new TextDecoder().decode(bytes));
  $("script, style, noscript, svg, iframe").remove();
  const out: string[] = [];
  const title = tidy($("title").first().text());
  if (title) out.push(`Título: ${title}`);

  const headings = $("h1, h2, h3")
    .map((_, el) => `${el.tagName}: ${tidy($(el).text())}`)
    .get()
    .filter((h) => !h.endsWith(": "));
  if (headings.length) out.push(`Encabezados (${headings.length}):\n${clip(headings.slice(0, 25).join("\n"), 1500)}`);

  const tables = $("table");
  if (tables.length) {
    const first = tables
      .first()
      .find("tr")
      .slice(0, opts.rows)
      .map((_, tr) =>
        $(tr)
          .find("th, td")
          .map((_, c) => tidy($(c).text()))
          .get()
          .join(" | "),
      )
      .get();
    out.push(`Tablas: ${tables.length}. Primeras filas de la primera:\n${first.join("\n")}`);
  }

  // Un link por URL; si la misma URL aparece varias veces (ícono y texto), queda el texto que no esté vacío.
  const byUrl = new Map<string, string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!href || /^(javascript:|mailto:|tel:|#)/.test(href)) return;
    let url = href;
    try {
      url = baseUrl ? new URL(href, baseUrl).href : href;
    } catch {}
    const text = tidy($(a).text()) || tidy($(a).attr("title") ?? "") || tidy($(a).find("img").attr("alt") ?? "");
    if (!byUrl.get(url)) byUrl.set(url, text);
  });
  const unique = [...byUrl].map(([url, text]) => ({ url, text: text || "(sin texto)" }));
  const shown =
    opts.links === true
      ? unique
      : opts.links
        ? unique.filter((l) => opts.links instanceof RegExp && (opts.links.test(l.url) || opts.links.test(l.text)))
        : unique.filter((l) => DOCUMENT_LINK.test(l.url));
  const label = opts.links ? "Links" : "Links a documentos";
  out.push(
    `${label}: ${shown.length} de ${unique.length}${opts.links ? "" : " (todos con --links)"}` +
      (shown.length ? `\n${clip(shown.map((l) => `- ${l.text} → ${l.url}`).join("\n"), opts.max)}` : ""),
  );

  // Texto visible por bloques: un renglón por párrafo, celda o ítem.
  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article").append("\n");
  const text = $("body").text().split("\n").map(tidy).filter(Boolean).join("\n");
  out.push(`Texto (${text.length.toLocaleString("es-AR")} caracteres):\n${body(text, opts)}`);
  return out.join("\n\n");
}

async function renderPdf(bytes: Uint8Array, opts: RenderOptions): Promise<string> {
  const pages = await pdfPages(bytes);
  const [from, to] = opts.pages ?? [1, pages.length];
  const text = pages
    .slice(from - 1, to)
    .map((p, i) => `── página ${from + i} ──\n${p.trim()}`)
    .join("\n");
  return `PDF de ${pages.length} páginas${opts.pages ? ` (mostrando ${from} a ${to})` : ""}.\n${body(text, opts)}`;
}

function renderSheet(bytes: Uint8Array, opts: RenderOptions): string {
  const wb = XLSX.read(bytes);
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, blankrows: false });
    const width = Math.max(0, ...rows.map((r) => r.length));
    const asText = rows.map((r) => r.map((c) => collapseSpaces(String(c ?? ""))).join(" | "));
    const shown = opts.search ? grepLines(asText.join("\n"), opts.search, opts.max) : asText.slice(0, opts.rows).join("\n");
    return `Hoja «${name}»: ${rows.length} filas × ${width} columnas\n${clip(shown, opts.max)}`;
  }).join("\n\n");
}

function shape(v: unknown, depth = 0): string {
  if (Array.isArray(v)) return `array(${v.length})${v.length && depth < 3 ? ` de ${shape(v[0], depth + 1)}` : ""}`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (depth >= 3) return `{${keys.length} claves}`;
    const inner = keys.slice(0, 15).map((k) => `${k}: ${shape((v as Record<string, unknown>)[k], depth + 1)}`);
    return `{ ${inner.join(", ")}${keys.length > 15 ? `, … ${keys.length - 15} más` : ""} }`;
  }
  if (typeof v === "string") return v.length > 40 ? `string(${v.length})` : JSON.stringify(v);
  return String(v);
}

function renderJson(bytes: Uint8Array, opts: RenderOptions): string {
  const text = new TextDecoder().decode(bytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return `JSON inválido o JSONL.\n${body(text, opts)}`;
  }
  const sample = Array.isArray(data) ? data.slice(0, opts.rows) : data;
  return `Estructura: ${shape(data)}\n\n${body(JSON.stringify(sample, null, 1), opts)}`;
}

function renderCsv(bytes: Uint8Array, opts: RenderOptions): string {
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
  const sep = (text.split("\n")[0]?.split(";").length ?? 0) > (text.split("\n")[0]?.split(",").length ?? 0) ? ";" : ",";
  const rows = sep === "," ? parseCsv(text) : text.split(/\r?\n/).map((l) => l.split(";"));
  const asText = rows.map((r) => r.join(" | "));
  const shown = opts.search ? grepLines(asText.join("\n"), opts.search, opts.max) : asText.slice(0, opts.rows + 1).join("\n");
  return `CSV: ${rows.length} filas (con encabezado), separador «${sep}»\n${clip(shown, opts.max)}`;
}

function renderZip(bytes: Uint8Array, opts: RenderOptions): string {
  const files = Object.entries(unzipSync(bytes)).filter(([n]) => !n.endsWith("/"));
  const list = files.map(([n, b]) => `- ${n} (${b.length.toLocaleString("es-AR")} bytes)`);
  return `ZIP con ${files.length} archivos:\n${clip(list.join("\n"), opts.max)}`;
}

/** Vista compacta según el tipo. `baseUrl` sirve para resolver los links relativos de un HTML. */
export async function render(
  name: string,
  bytes: Uint8Array,
  opts: RenderOptions,
  meta: { url?: string; contentType?: string } = {},
): Promise<string> {
  const kind = detectKind(name, bytes, meta.contentType);
  const size = `${bytes.length.toLocaleString("es-AR")} bytes`;
  let out: string;
  switch (kind) {
    case "html":
      out = renderHtml(bytes, meta.url, opts);
      break;
    case "pdf":
      out = await renderPdf(bytes, opts);
      break;
    case "sheet":
      out = renderSheet(bytes, opts);
      break;
    case "json":
      out = renderJson(bytes, opts);
      break;
    case "csv":
      out = renderCsv(bytes, opts);
      break;
    case "zip":
      out = renderZip(bytes, opts);
      break;
    case "binary":
      out = "(archivo binario: no se muestra)";
      break;
    default:
      out = body(new TextDecoder().decode(bytes), opts);
  }
  return `[${kind}, ${size}]\n${out}`;
}
