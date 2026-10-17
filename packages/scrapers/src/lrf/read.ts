/**
 * Format layer for the Fiscal Responsibility Law (LRF) annexes: turns a PDF or a spreadsheet into the same thing,
 * rows of tokens (a text and, when it is a number, its value). The annex readers (`annexes.ts`) only see rows, never
 * the original format.
 *
 * PDFs are read by the (x, y) position of each text, not by text order: several municipalities produce PDFs whose
 * text comes out scrambled (San Rafael prints each column as a separate block) and some pages are rotated.
 */

import * as cheerio from "cheerio";
import { getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";

/** A PDF text with its position. */
export interface Item {
  x: number;
  y: number;
  s: string;
  /** Text height: sets the tolerance used to group rows (some PDFs are printed at a small scale). */
  h?: number;
}

/** One token of a row: its text and, if it is a figure, its value. */
export interface Tok {
  text: string;
  num: number | null;
}

/** A table as rows of tokens: one PDF page or one spreadsheet sheet. */
export type Table = Tok[][];

// Spanish ("1.234,56", "1.234"), English ("1,234.56"; some municipalities export like that) or "-" (empty). Negative
// amounts can come with the sign attached ("-1.234,56") or, in accounting style, in parentheses ("(1.234,56)", Malargüe);
// only amounts with decimals, so the column numbers of the headers ("(1)", "(2)") stay text.
const NUM_ES = /^(?:-|-?\d[\d.]*(?:,\d+)?)$/;
const NUM_EN = /^-?(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})$/;
const NUM_PARENS = /^\((\d[\d.]*,\d+)\)$/;
// Commas for both the thousands and the decimals ("35,522,500,000,00", the totals of Luján de Cuyo).
const NUM_COMMAS = /^-?\d{1,3}(?:,\d{3})+,\d{2}$/;

/** "1.234,56" → 1234.56; "1,234.56" → 1234.56; "1,234,56" → 1234.56; "(1.234,56)" → -1234.56; "5626739118" → 5626739118; "-" → 0. */
export function parseNum(s: string): number {
  if (s === "-") return 0;
  const parens = NUM_PARENS.exec(s);
  if (parens) return -parseNum(parens[1]!);
  if (NUM_COMMAS.test(s)) return Number(s.slice(0, -3).replace(/,/g, "") + "." + s.slice(-2));
  if (NUM_EN.test(s)) return Number(s.replace(/,/g, ""));
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function tokenize(text: string): Tok[] {
  return text
    .replace(/\$/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, num: NUM_EN.test(t) || NUM_ES.test(t) || NUM_PARENS.test(t) || NUM_COMMAS.test(t) ? parseNum(t) : null }));
}

/** The texts of a PDF page with their position (a text with several tokens is spread along x). */
export async function pageItems(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number): Promise<Item[]> {
  const content = await (await pdf.getPage(n)).getTextContent();
  const items: Item[] = [];
  for (const it of content.items as { str: string; transform: number[]; height: number }[]) {
    const parts = it.str.replace(/\$/g, " ").trim().split(/\s+/).filter(Boolean);
    parts.forEach((s, i) =>
      items.push({ x: it.transform[4]! + i * 0.5, y: it.transform[5]!, s, h: Math.abs(it.transform[3]!) || it.height }),
    );
  }
  return items;
}

/** Every page of a PDF as positioned texts. */
export async function allPageItems(bytes: Uint8Array): Promise<Item[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: Item[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) pages.push(await pageItems(pdf, n));
  return pages;
}

/** Groups texts into rows by closeness along one axis (up to 3 points) and sorts each row along the other. */
export function rowsOf(rawItems: Item[], axis: "h" | "v"): Table {
  // Several PDFs print each text twice in the same place (fake bold): repeated ones are dropped.
  const items = rawItems.filter(
    (a, i) => !rawItems.slice(0, i).some((b) => b.s === a.s && Math.abs(b.x - a.x) < 0.3 && Math.abs(b.y - a.y) < 0.3),
  );
  const along = (i: Item) => (axis === "h" ? i.x : i.y);
  const across = (i: Item) => (axis === "h" ? -i.y : i.x);
  const heights = items
    .map((i) => i.h ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const tolerance = heights.length ? Math.min(3, Math.max(0.4, 0.4 * heights[Math.floor(heights.length / 2)]!)) : 3;
  const sorted = [...items].sort((a, b) => across(a) - across(b));
  const rows: Item[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(across(last[0]!) - across(it)) <= tolerance) last.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => along(a) - along(b)).flatMap((i) => tokenize(i.s)));
}

/** An amount whose last characters fell on the next line of its cell ("1.599.740.000,0" + "0", "1.717.250.00" + "0,00"). */
const OPEN_AMOUNT = /^-?\d[\d.]*(?:,\d?)?$/;
const AMOUNT_TAIL = /^[\d,]{1,4}$/;
const isAmount = (s: string) => /^-?\d[\d.]*,\d{2}$/.test(s);
const isCode = (s: string) => /^\d{5,}$/.test(s);

/**
 * Rows of a sideways page whose cells wrap their text over several lines (Junín). Each cell is centered on its row, so
 * the label and the figures of a row spread over up to three lines, and an amount can lose its last characters to the
 * next line of its cell ("27.063.535.000," and below it "00"). First every tail is joined to the open amount right above
 * it in its column; then the lines are grouped into rows: a row starts at the line with its code ("4310000 - …"), the
 * lines with figures only go to the nearest code line, and the label lines with no code go with the row above. Lines far
 * from any code (the totals row, the headers) are rows of their own.
 */
export function cellRows(items: Item[]): Table {
  const heights = items
    .map((i) => i.h ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)] ?? 8;
  const texts = items.map((i) => ({ ...i }));
  const joined = new Set<(typeof texts)[number]>();
  const heads = texts.filter((a) => OPEN_AMOUNT.test(a.s) && /[.,]/.test(a.s) && !isAmount(a.s)).sort((a, b) => a.x - b.x || a.y - b.y);
  for (const head of heads) {
    const tail = texts
      .filter((t) => !joined.has(t) && t !== head && AMOUNT_TAIL.test(t.s) && isAmount(head.s + t.s))
      .filter((t) => t.x - head.x > 0.25 * height && t.x - head.x <= 1.6 * height && t.y >= head.y && t.y - head.y < 90)
      .sort((a, b) => a.x - b.x || a.y - b.y)[0];
    if (!tail) continue;
    head.s += tail.s;
    joined.add(tail);
  }
  const lines: (typeof texts)[] = [];
  for (const it of texts.filter((i) => !joined.has(i)).sort((a, b) => a.x - b.x)) {
    const last = lines.at(-1);
    if (last && it.x - last.at(-1)!.x <= 0.25 * height) last.push(it);
    else lines.push([it]);
  }
  const lineOf = new Map(lines.flatMap((l, n) => l.map((i) => [i, n] as const)));
  const codeLines = lines.filter((l) => l.some((i) => isCode(i.s)));
  const rows = new Map<(typeof texts)[number][], (typeof texts)[number][]>(codeLines.map((l) => [l, [...l]]));
  const own: (typeof texts)[] = [];
  let current: (typeof texts)[number][] | null = null;
  for (const line of lines) {
    const x = line[0]!.x;
    if (rows.has(line)) {
      current = rows.get(line)!;
      own.push(current);
      continue;
    }
    const figuresOnly = line.every((i) => isAmount(i.s));
    const nearest = figuresOnly
      ? codeLines.filter((l) => Math.abs(l[0]!.x - x) <= 1.5 * height).sort((a, b) => Math.abs(a[0]!.x - x) - Math.abs(b[0]!.x - x))[0]
      : null;
    const above = current && x - current.reduce((m, i) => Math.max(m, i.x), 0) <= 1.5 * height ? current : null;
    if (nearest) rows.get(nearest)!.push(...line);
    else if (above) above.push(...line);
    else {
      current = null;
      own.push([...line]);
    }
  }
  // The label first (in reading order), then the figures in the order of the columns.
  return own
    .sort((a, b) => Math.min(...a.map((i) => i.x)) - Math.min(...b.map((i) => i.x)))
    .map((row) => {
      const label = row.filter((i) => !isAmount(i.s)).sort((a, b) => lineOf.get(a)! - lineOf.get(b)! || a.y - b.y);
      const amounts = row.filter((i) => isAmount(i.s)).sort((a, b) => a.y - b.y);
      return [...label, ...amounts].flatMap((i) => tokenize(i.s));
    });
}

/** How the texts of a PDF page become rows: horizontal, sideways, or sideways with cells that wrap (`cellRows`). */
export type Layout = "h" | "v" | "cells";

/**
 * Every page of a PDF as a table of rows. Horizontal by default; "v" reads pages printed sideways (General Alvear's
 * Annex 5, Rivadavia), where the rows of the table run along the page's vertical axis; "cells", sideways pages whose
 * cells wrap (Junín).
 */
export async function pdfTables(bytes: Uint8Array, layout: Layout = "h"): Promise<Table[]> {
  return (await allPageItems(bytes)).map((items) => (layout === "cells" ? cellRows(items) : rowsOf(items, layout)));
}

/**
 * Every sheet of an XLS/XLSX workbook as a table: each cell is a token (numbers already come as numbers).
 * With `blankAsZero`, an empty cell between two numbers of the same row is a zero: spreadsheets leave zero amounts
 * blank (San Martín 2025-T3), which would otherwise shift every figure after it one column to the left.
 */
export function sheetTables(bytes: Uint8Array, { blankAsZero = false } = {}): { name: string; rows: Table }[] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: "" });
    const rows = aoa.map((r) => {
      const numeric = r.flatMap((c, i) => (typeof c === "number" ? [i] : []));
      const [first, last] = [numeric[0] ?? -1, numeric[numeric.length - 1] ?? -1];
      return r.flatMap((c, i): Tok[] => {
        if (typeof c === "number") return [{ text: String(c), num: c }];
        if (blankAsZero && i > first && i < last && String(c).trim() === "") return [{ text: "0", num: 0 }];
        return tokenize(String(c));
      });
    });
    return { name, rows };
  });
}

/** Every sheet of a workbook as a table, without the sheet names. */
export function sheetRows(bytes: Uint8Array): Table[] {
  return sheetTables(bytes).map((s) => s.rows);
}

// ---------------------------------------------------------------- pages saved from the browser

type Encoding = ConstructorParameters<typeof TextDecoder>[0];

/** Text of an HTML document in its declared charset (old pages are usually Latin-1). */
function decodeHtml(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 2000));
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ?? "windows-1252";
  try {
    return new TextDecoder(charset as Encoding).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * The HTML of a page saved from the browser: a plain .htm, or an .mht (Internet Explorer's single file: a MIME message
 * whose text/html part is usually quoted-printable). San Carlos publishes its annexes this way.
 */
export function savedPageHtml(bytes: Uint8Array): string {
  const latin = new TextDecoder("latin1").decode(bytes);
  if (!/^(From:|MIME-Version:)/m.test(latin.slice(0, 300)) || !/multipart\/related/i.test(latin.slice(0, 1500))) return decodeHtml(bytes);
  const part = /Content-Type:\s*text\/html([\s\S]*?)\r?\n\r?\n([\s\S]*?)(?:\r?\n--[^\r\n]*NextPart|$)/i.exec(latin);
  if (!part) return decodeHtml(bytes);
  const headers = part[1]!;
  let body = part[2]!;
  if (/quoted-printable/i.test(headers))
    body = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
  const charset = /charset\s*=\s*"?([\w-]+)/i.exec(headers)?.[1] ?? "windows-1252";
  const raw = Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
  try {
    return new TextDecoder(charset as Encoding).decode(raw);
  } catch {
    return new TextDecoder("windows-1252").decode(raw);
  }
}

/** A saved page as one table: a row per innermost <tr>, each cell tokenized. */
export function htmlTables(bytes: Uint8Array): Table[] {
  const $ = cheerio.load(savedPageHtml(bytes));
  const rows: Table = [];
  $("tr").each((_, tr) => {
    if ($(tr).find("tr").length) return;
    const row = $(tr)
      .children("td,th")
      .toArray()
      .flatMap((td) => tokenize($(td).text().replace(/\s+/g, " ").trim()));
    if (row.length) rows.push(row);
  });
  return [rows];
}
