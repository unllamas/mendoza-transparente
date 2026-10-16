/**
 * Format layer for the Fiscal Responsibility Law (LRF) annexes: turns a PDF or a spreadsheet into the same thing,
 * rows of tokens (a text and, when it is a number, its value). The annex readers (`annexes.ts`) only see rows, never
 * the original format.
 *
 * PDFs are read by the (x, y) position of each text, not by text order: several municipalities produce PDFs whose
 * text comes out scrambled (San Rafael prints each column as a separate block) and some pages are rotated.
 */

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

// Spanish ("1.234,56", "1.234"), English ("1,234.56"; some municipalities export like that) or "-" (empty).
const NUM_ES = /^(?:-|\d[\d.]*(?:,\d+)?)$/;
const NUM_EN = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})$/;

/** "1.234,56" → 1234.56; "1,234.56" → 1234.56; "5626739118" → 5626739118; "-" → 0. */
export function parseNum(s: string): number {
  if (s === "-") return 0;
  if (NUM_EN.test(s)) return Number(s.replace(/,/g, ""));
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function tokenize(text: string): Tok[] {
  return text
    .replace(/\$/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, num: NUM_EN.test(t) || NUM_ES.test(t) ? parseNum(t) : null }));
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

/** Every page of a PDF as a table of horizontal rows. */
export async function pdfTables(bytes: Uint8Array): Promise<Table[]> {
  return (await allPageItems(bytes)).map((items) => rowsOf(items, "h"));
}

/** Every sheet of an XLS/XLSX workbook as a table: each cell is a token (numbers already come as numbers). */
export function sheetTables(bytes: Uint8Array): { name: string; rows: Table }[] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((name) => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: "" });
    const rows = aoa.map((r) => r.flatMap((c): Tok[] => (typeof c === "number" ? [{ text: String(c), num: c }] : tokenize(String(c)))));
    return { name, rows };
  });
}

/** Every sheet of a workbook as a table, without the sheet names. */
export function sheetRows(bytes: Uint8Array): Table[] {
  return sheetTables(bytes).map((s) => s.rows);
}
