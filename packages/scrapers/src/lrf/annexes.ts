/**
 * Interpretation layer: reads an LRF annex from its rows of tokens (see `read.ts`), whatever the original format.
 *
 * The annexes follow the model set by the Tribunal de Cuentas (Acuerdo 3949, consolidated text Acuerdo 6644/25): every
 * municipality prints the same numbered columns and the same arithmetic between them, which is what makes one reader
 * per annex enough for all of them and lets each document be checked against itself.
 */

import { objectCodeFromLevels, spendingObjectCode } from "./classify.ts";
import type { Table, Tok } from "./read.ts";

export interface Period {
  year: number;
  quarter: number;
}

const rowText = (row: Tok[]) => row.map((t) => t.text).join(" ");

const headerText = (tables: Table[]) => (tables[0] ?? []).slice(0, 20).map(rowText).join("\n");
const QUARTER_WORDS: Record<string, number> = { primer: 1, segund: 2, tercer: 3, cuart: 4 };

/** Period printed in the annex header ("EJERCICIO: 2026", "TRIMESTRE: 2" or, in Infogov, "Trimestre: Segundo"). */
export function headerPeriod(tables: Table[]): Period | null {
  const text = headerText(tables);
  const year = /EJERCICIO[ \t]*:?[ \t]*(\d{4})/i.exec(text);
  // "2", "2do" (Las Heras 2026), or in words ("Segundo", Infogov).
  const quarter = /TRIMESTRE[ \t]*:?[ \t]*([1-4](?=\s*(?:ro|do|er|to|°|º)?\b)|primer|segund|tercer|cuart)/i.exec(text);
  if (!year || !quarter) return null;
  const q = quarter[1]!.toLowerCase();
  return { year: +year[1]!, quarter: QUARTER_WORDS[q] ?? +q };
}

const ROMAN: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6" };

/**
 * Annex number printed in the title ("ANEXO 2:", "ANEXO II", "ANEXO 2 BIS"), as "2" or "2bis"; null if not found.
 * It catches files published under the wrong name (Rivadavia 2024-T2: "Anexo02.pdf" holds annex 2 bis).
 */
export function headerAnnex(tables: Table[]): string | null {
  const m = /\bANEXO[ \t]+([IVX]+|\d{1,2})\b[ \t]*(BIS)?/i.exec(headerText(tables));
  if (!m) return null;
  const n = ROMAN[m[1]!.toUpperCase()] ?? String(Number(m[1]));
  return m[2] ? `${n}bis` : n;
}

const isAmount = (t: Tok | undefined) => !!t && t.num !== null && /,\d+\)?$/.test(t.text);

/** A document whose pages have no text: a scanned image (Capital 2025-T4, Las Heras 2024). */
const SCANNED = { error: "el documento es una imagen escaneada, sin texto" };
const isScanned = (tables: Table[]) => !tables.some((t) => t.some((row) => row.length));

/**
 * Joins a lone "-" with the figure right after it: some PDFs print the sign of a negative amount as a separate text.
 * By default only when the "-" opens the row or follows another amount; after a word or a number without decimals it
 * can be part of the label ("Prestamo Ley 9356 - 33980500,00", General Alvear). With `afterLabel`, also there: in San
 * Rafael "PRESTAMO GBO MZA LEY9243 - 9.007,97" is a negative balance. Annex 5 tries both and keeps the one that adds
 * up to TOTALES.
 */
function withSigns(row: Tok[], afterLabel = false): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < row.length; i++) {
    const next = row[i + 1];
    const opens = afterLabel || i === 0 || isAmount(row[i - 1]);
    if (row[i]!.text === "-" && opens && next && next.num !== null && next.text !== "-") {
      out.push({ text: `-${next.text}`, num: -next.num });
      i++;
    } else out.push(row[i]!);
  }
  return out;
}

/** The figures of a row made only of `n` figures, with its label on the line above (Guaymallén); null otherwise. */
function figuresOnly(row: Tok[], n: number): number[] | null {
  const toks = withSigns(row);
  return toks.length === n && toks.every((t) => t.num !== null) ? toks.map((t) => t.num!) : null;
}

/**
 * Rows whose last figure spilled alone onto the next line (Godoy Cruz 2026: "1.1.00.00.0000 DE ORIGEN PROVINCIAL" with
 * six figures, and the seventh below) are joined back, so the row ends in its `n` figures.
 */
function joinSpilledFigures(rows: Tok[][], n: number): Tok[][] {
  const out: Tok[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = rows[i + 1];
    let figures = 0;
    while (figures < row.length && row[row.length - 1 - figures]!.num !== null) figures++;
    if (next?.length === 1 && isAmount(next[0]) && figures === n - 1 && figures < row.length) {
      out.push([...row, next[0]!]);
      i++;
    } else out.push(row);
  }
  return out;
}

/** Splits a row into its label and its last `n` figures; null if it does not end in `n` figures. */
export function splitRow(row: Tok[], n: number): { label: string; values: number[] } | null {
  const toks = withSigns(row);
  if (toks.length <= n) return null;
  const tail = toks.slice(-n);
  if (tail.some((t) => t.num === null)) return null;
  return {
    label: toks
      .slice(0, -n)
      .map((t) => t.text)
      .join(" ")
      .trim(),
    values: tail.map((t) => t.num!),
  };
}

// ---------------------------------------------------------------- Annex 2: spending against appropriations

/** Annex 2 columns 2 to 12, in order. Column 1 is the item. */
export const SPENDING_COLUMNS = [
  "votedCredit", // (2) crédito votado original
  "increases", // (3) modificaciones: aumentos
  "decreases", // (4) modificaciones: disminuciones
  "currentCredit", // (5) = 2 + 3 - 4: crédito autorizado definitivo
  "committed", // (6) compromisos contraídos
  "accrued", // (7) devengado
  "ordered", // (8) mandado a pagar
  "paid", // (9) pagado
  "unorderedLiabilities", // (10) = 7 - 8: pasivos sin orden de pago
  "unusedBalance", // (11) = 5 - 6: saldo no utilizado
  "orderedLiabilities", // (12) = 8 - 9: pasivos con orden de pago
] as const;

export type SpendingFigures = Record<(typeof SPENDING_COLUMNS)[number], number>;

export interface SpendingLine extends SpendingFigures {
  /** Jurisdiction and unit as printed, when the municipality breaks spending down by area (San Rafael). */
  jurisdiction: string;
  unit: string;
  /** Item code and label as printed. */
  code: string;
  label: string;
  /** Normalized object code ("4.1.1"). */
  objectCode: string;
}

export interface SpendingAnnex {
  lines: SpendingLine[];
  totals: SpendingFigures;
  /** Problems of the document that do not affect the published columns (see `parseSpendingAnnex`). */
  notes: string[];
}

/** Columns that are published: 2 to 9. Columns 10 to 12 are derived from them and only used as a check. */
export const PUBLISHED_SPENDING_COLUMNS = SPENDING_COLUMNS.slice(0, 8);

const figures = (values: number[]) => Object.fromEntries(SPENDING_COLUMNS.map((c, i) => [c, values[i]!])) as SpendingFigures;

/** Rounding tolerance in pesos: spreadsheets carry floating point noise and PDFs round to the cent. */
const close = (a: number, b: number, slack = 1) => Math.abs(a - b) <= slack + Math.abs(b) * 1e-9;

/** Identity between published columns: a row that breaks it was misread or is wrong in the document. */
const breaksCredit = (f: SpendingFigures) => !close(f.votedCredit + f.increases - f.decreases, f.currentCredit);

/** Identities of the derived columns 10 to 12 that a row breaks, if any. */
function brokenDerived(f: SpendingFigures): string[] {
  const broken: string[] = [];
  if (!close(f.accrued - f.ordered, f.unorderedLiabilities)) broken.push("(10) = (7)-(8)");
  if (!close(f.currentCredit - f.committed, f.unusedBalance)) broken.push("(11) = (5)-(6)");
  if (!close(f.ordered - f.paid, f.orderedLiabilities)) broken.push("(12) = (8)-(9)");
  return broken;
}

/**
 * Item row with the object code alone: "41100 PERSONAL" (San Martín), "411000 PERSONAL" (Las Heras 2026) or
 * "4110000 - PERSONAL" (Junín, which also prints the subtotals of each group: "4000000", "4100000"; up to 2023 with
 * eight digits, "41100000 - PERSONAL").
 */
const FLAT_ITEM = /^(\d{5,8})\s+(?:-\s*)?(\D.*)$/;
/** A Junín group subtotal: the third level at zero ("4100000 - OPERACION"; up to 2023, "41000000 - OPERACION"). */
const isGroupCode = (code: string) => /^\d\d0{5,6}$/.test(code);
/**
 * Item, unit and jurisdiction rows inside an area (San Rafael): "1.00.040101.PERSONAL" (jurisdiction.unit.object),
 * "1.01.INTENDENCIA - ADMINIST.CENTRAL" (unit subtotal) and "1.INTENDENCIA" (jurisdiction subtotal). Not anchored at
 * the start: the page footer ("RCTC_ANEXO_02 SRF - RRAMOS") can fall on the same line as the last row of the page.
 */
const AREA_ITEM = /(?:^|\s)(\d+)\.(\d{2})\.(\d{6})\.?\s*(.*)$/;
const UNIT_ROW = /(?:^|\s)(\d+)\.(\d{2})\.\s*(\D.*)$/;
const JURISDICTION_ROW = /(?:^|\s)(\d+)\.\s*(\D.*)$/;
const TOTALS_ROW = /(?:^|\s)total(?:es)?\s*:?$/i;

/** One row per item with the code and its 11 figures: San Martín ("41100 PERSONAL") and San Rafael (by area). */
function readItemRows(tables: Table[]): { lines: SpendingLine[]; totals: SpendingFigures | null } | { error: string } {
  const lines: SpendingLine[] = [];
  const jurisdictions = new Map<string, string>();
  const units = new Map<string, string>();
  let totals: SpendingFigures | null = null;
  const unknown: string[] = [];
  /** Records the name of a unit or jurisdiction subtotal row; false if the label is not one. */
  const areaName = (label: string): boolean => {
    const unit = UNIT_ROW.exec(label);
    if (unit) units.set(`${unit[1]}.${unit[2]}`, unit[3]!.trim());
    const jurisdiction = unit ? null : JURISDICTION_ROW.exec(label);
    if (jurisdiction) jurisdictions.set(jurisdiction[1]!, jurisdiction[2]!.trim());
    return !!(unit || jurisdiction);
  };

  for (const row of tables.flat()) {
    const split = splitRow(row, SPENDING_COLUMNS.length);
    // Las Heras 2026 prints the totals row without the word: only its 11 figures, after the items.
    const bare = !split && lines.length && !totals ? figuresOnly(row, SPENDING_COLUMNS.length) : null;
    if (bare) {
      totals = figures(bare);
      continue;
    }
    if (!split) {
      // Area subtotals only give the name of the area: it is read even when the row lost figures (San Rafael 2024-T4,
      // where the page footer falls on top of a subtotal). A missing item row is caught by the TOTALES check.
      areaName(
        row
          .filter((t) => t.num === null)
          .map((t) => t.text)
          .join(" "),
      );
      continue;
    }
    const { label, values } = split;
    if (TOTALS_ROW.test(label)) {
      totals = figures(values);
      continue;
    }
    const area = AREA_ITEM.exec(label);
    const flat = area ? null : FLAT_ITEM.exec(label);
    if (area || flat) {
      const raw = area ? area[3]! : flat![1]!;
      if (isGroupCode(raw)) continue;
      const objectCode = spendingObjectCode(raw);
      if (!objectCode) {
        unknown.push(label);
        continue;
      }
      lines.push({
        jurisdiction: area ? (jurisdictions.get(area[1]!) ?? "") : "",
        unit: area ? (units.get(`${area[1]}.${area[2]}`) ?? "") : "",
        code: area ? `${area[1]}.${area[2]}.${raw}` : raw,
        label: (area ? area[4]! : flat![2]!).replace(/[.\s]+$/, "").replace(/\s+/g, " "),
        objectCode,
        ...figures(values),
      });
      continue;
    }
    if (!areaName(label)) unknown.push(label);
  }

  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
  return { lines, totals };
}

/**
 * Hierarchical codes, one level per digit: "4.1.1.PERSONAL" with its subtotals "4.EROGACIONES CORRIENTES" and
 * "4.1.OPERACIÓN" (Capital), or "## 411- Personal" (Guaymallén, only the leaves). The page can split a code
 * ("6. .3.EROGACIONES…", Capital): it is joined back.
 */
const DOTTED_ROW = /^((?:\d\.){1,3})\s*(\D.*)$/;
const THREE_DIGIT_ROW = /^(?:##\s*)?(\d)(\d)(\d)\s*-\s*(\D.*)$/;
/**
 * Godoy Cruz: "4.1.01.00.0000 PERSONAL" (five groups, six in some years: "4.2.01.00.00.0000"), with the name after the
 * code, before it ("Interes y gast 4.2.01…", 2025) or missing (2024). The fourth group splits the debt: 6.2.01.01 is the
 * consolidated debt and 6.2.01.02 the floating one.
 */
const GROUPED_CODE = /(?:^|\s)(\d)\.(\d)\.(\d{2})\.(\d{2})(?:\.\d{2})?(?:\.\d{4})?(?=\s|$)/;
const isDottedLayout = (text: string) => /^\d\.\d\.\d\.\S/.test(text) || GROUPED_CODE.test(text);
const isThreeDigitLayout = (text: string) => /^##\s*\d{3}\s*-/.test(text);

/**
 * Items with hierarchical codes (Capital, Guaymallén). The items are the most detailed codes: those with no child in
 * the document (Capital's 6.3 has no 6.3.x, so it is an item; 4.1 is the subtotal of 4.1.1 to 4.1.3). A label left alone
 * on the line above its figures (Guaymallén) is joined to them.
 */
function readHierarchicalRows(tables: Table[]): { lines: SpendingLine[]; totals: SpendingFigures | null } | { error: string } {
  type Candidate = { levels: string[]; label: string; values: number[] };
  const candidates: Candidate[] = [];
  let totals: SpendingFigures | null = null;
  const unknown: string[] = [];
  let pending = "";
  const parse = (label: string): { levels: string[]; label: string } | null => {
    const text = label.replace(/^(\d)\.\s+\.(\d)\./, "$1.$2.");
    const dotted = DOTTED_ROW.exec(text);
    if (dotted) return { levels: dotted[1]!.split(".").filter(Boolean), label: dotted[2]! };
    const three = THREE_DIGIT_ROW.exec(text);
    if (three) return { levels: [three[1]!, three[2]!, three[3]!], label: three[4]! };
    const grouped = GROUPED_CODE.exec(text);
    if (grouped) {
      const levels = [grouped[1]!, grouped[2]!, String(Number(grouped[3]))];
      if (grouped[4] !== "00") levels.push(String(Number(grouped[4])));
      return { levels, label: text.replace(grouped[0], " ").trim() };
    }
    return null;
  };
  for (const row of tables.flat()) {
    const bare = pending ? figuresOnly(row, SPENDING_COLUMNS.length) : null;
    const split = splitRow(row, SPENDING_COLUMNS.length) ?? (bare ? { label: "", values: bare } : null);
    if (!split) {
      pending = row.some(isAmount) ? "" : rowText(row);
      continue;
    }
    const label = split.label.replace(/^##\s*/, "");
    if (TOTALS_ROW.test(label)) totals = figures(split.values);
    else {
      const item = parse(label) ?? parse(`${pending} ${label}`.trim());
      if (item) candidates.push({ ...item, values: split.values });
      else unknown.push(label);
    }
    pending = "";
  }
  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
  const key = (c: Candidate) => c.levels.join(".");
  const leaves = candidates.filter((c) => !candidates.some((o) => o !== c && key(o).startsWith(`${key(c)}.`)));
  const lines: SpendingLine[] = [];
  for (const c of leaves) {
    const label = c.label.replace(/[.\s]+$/, "").replace(/\s+/g, " ");
    lines.push({
      jurisdiction: "",
      unit: "",
      code: key(c),
      label,
      objectCode: objectCodeFromLevels(c.levels, label),
      ...figures(c.values),
    });
  }
  return { lines, totals };
}

/** Item row of the Infogov layout: "41100000 (Subtotal)". The label and the figures can come on the next lines. */
const INFOGOV_ITEM = /^(\d{8})\s*\(Subtotal\)/i;
const INFOGOV_TOTAL = /^TOTAL\s+GENERAL\b/i;
/** The most detailed level, the one that adds up to TOTAL GENERAL: "41100000" (levels 1 and 2 are "40000000", "41000000"). */
const INFOGOV_LEAF = /^\d\d[1-9]00000$/;
/** Page furniture after the table: user, certification and the system's address. */
const INFOGOV_FURNITURE = /^(usuario|certifico|registros|normativa|www\.|p[áa]gina|hoja)/i;

/**
 * Tunuyán codes the interest of the debt (4.2.1) wrongly: the credit under 42000000 and the execution under 42100000,
 * after a first 42000000 that is the subtotal of both. The leaf is the sum of every 42000000 after the first and of
 * every 42100000 (older documents just repeat 42000000: subtotal and leaf). Same with the amortization (62000000).
 * The TOTAL GENERAL check confirms it.
 */
function mergeInterest(items: { code: string; label: string[]; nums: number[] }[]) {
  for (const group of ["42", "62"]) {
    const subs = items.filter((i) => i.code === `${group}000000`);
    if (subs.length < 2) continue;
    const parts = [...subs.slice(1), ...items.filter((i) => i.code === `${group}100000`)];
    const leaf = subs[1]!;
    leaf.nums = leaf.nums.map((_, k) => parts.reduce((a, p) => a + (p.nums[k] ?? 0), 0));
    leaf.code = `${group}100000`;
    for (const p of parts) if (p !== leaf) p.code = "00000000";
  }
}

/**
 * Infogov layout (pie "www.infogov.com.ar"; General Alvear, Malargüe, Maipú, Lavalle, La Paz and others): each item
 * opens with "41100000 (Subtotal)" and its label and figures follow, on the same line or the next ones, until the next
 * item. Long figures spill onto other lines and mix the order of columns 10 to 12, so only columns 2 to 9 are read and
 * 10 to 12 are derived from them.
 */
function readInfogov(tables: Table[]): { lines: SpendingLine[]; totals: SpendingFigures | null } | { error: string } {
  type Item = { code: string; label: string[]; nums: number[] };
  const items: Item[] = [];
  let total: Item | null = null;
  let current: Item | null = null;
  for (const table of tables) {
    current = null;
    for (const raw of table) {
      const row = withSigns(raw);
      const text = rowText(row);
      const item = INFOGOV_ITEM.exec(text);
      // Some PDFs print the same annex two or three times (Maipú 2023-T4 and 2025-T3): the first copy is enough.
      if (item && total) break;
      if (item) {
        current = { code: item[1]!, label: [], nums: [] };
        items.push(current);
      } else if (INFOGOV_TOTAL.test(text)) {
        current = { code: "TOTAL", label: [], nums: [] };
        total = current;
      } else if (!current || INFOGOV_FURNITURE.test(text)) {
        if (INFOGOV_FURNITURE.test(text)) current = null;
        continue;
      }
      for (const t of row) {
        if (/^\d{8}$/.test(t.text) || /^\(subtotal\)$/i.test(t.text) || /^(total|general)$/i.test(t.text)) continue;
        if (t.text === "-" && current.nums.length === 0) continue;
        if (t.num !== null) current.nums.push(t.num);
        else current.label.push(t.text);
      }
    }
  }
  const derive = (n: number[]): SpendingFigures => {
    const f = figures([...n.slice(0, 8), 0, 0, 0]);
    return {
      ...f,
      unorderedLiabilities: f.accrued - f.ordered,
      unusedBalance: f.currentCredit - f.committed,
      orderedLiabilities: f.ordered - f.paid,
    };
  };
  mergeInterest(items);
  const short = items.filter((i) => INFOGOV_LEAF.test(i.code) && i.nums.length < 8).map((i) => i.code);
  if (short.length) return { error: `partidas con menos de 8 cifras: ${short.slice(0, 3).join(", ")}` };
  const lines: SpendingLine[] = [];
  for (const i of items.filter((x) => INFOGOV_LEAF.test(x.code))) {
    const objectCode = spendingObjectCode(i.code);
    if (!objectCode) return { error: `código sin clasificar: ${i.code}` };
    lines.push({
      jurisdiction: "",
      unit: "",
      code: i.code,
      label: i.label
        .join(" ")
        .replace(/[.\s]+$/, "")
        .replace(/\s+/g, " "),
      objectCode,
      ...derive(i.nums),
    });
  }
  return { lines, totals: total && total.nums.length >= 8 ? derive(total.nums) : null };
}

/**
 * Reads Annex 2 ("De la ejecución del presupuesto con relación a los créditos acumulada al fin del trimestre"), in any
 * of the known layouts, and checks the items against the document:
 *   - Rejects the document if a row breaks (5) = (2)+(3)-(4) or if the items do not add up to the TOTALES row in a
 *     published column (2 to 9): that means a misread row or a document that cannot be trusted.
 *   - Only notes the problems in the derived columns 10 to 12 (San Martín 2025-T2 has a value of column 12 shifted
 *     to the next row): they are not published and do not change the figures that are.
 */
export function parseSpendingAnnex(tables: Table[]): SpendingAnnex | { error: string } {
  if (isScanned(tables)) return SCANNED;
  const texts = tables.flat().map(rowText);
  const read = texts.some((t) => INFOGOV_ITEM.test(t))
    ? readInfogov(tables)
    : texts.some((t) => isDottedLayout(t) || isThreeDigitLayout(t))
      ? readHierarchicalRows(tables)
      : readItemRows(tables);
  if ("error" in read) return read;
  const { lines, totals } = read;
  if (!totals) return { error: "no se encontró la fila de totales" };
  if (!lines.length) return { error: "no se encontraron partidas" };
  // Godoy Cruz prints the decreases as negative amounts: they are turned positive, as the identity (5) = (2)+(3)-(4) reads.
  const negativeDecreases = totals.decreases < 0 && lines.every((l) => l.decreases <= 0);
  if (negativeDecreases) for (const f of [...lines, totals]) f.decreases = Math.abs(f.decreases);
  const broken = lines.filter(breaksCredit).map((l) => l.code);
  if (broken.length) return { error: `partidas donde (5) no da (2)+(3)-(4): ${broken.slice(0, 3).join(", ")}` };
  const notes: string[] = [];
  for (const column of SPENDING_COLUMNS) {
    const sum = lines.reduce((acc, l) => acc + l[column], 0);
    if (close(sum, totals[column], lines.length)) continue;
    const problem = `la suma de las partidas en ${column} (${Math.round(sum)}) no da el total (${Math.round(totals[column])})`;
    if ((PUBLISHED_SPENDING_COLUMNS as readonly string[]).includes(column)) return { error: problem };
    notes.push(problem);
  }
  const derived = lines
    .map((l) => ({ code: l.code, broken: brokenDerived(l) }))
    .filter((x) => x.broken.length)
    .map((x) => `${x.code} ${x.broken.join(", ")}`);
  if (derived.length) notes.push(`el documento no cumple sus cuentas en columnas que no se publican: ${derived.join("; ")}`);
  if (negativeDecreases) notes.push("el documento anota las disminuciones en negativo: se toman en positivo");
  return { lines, totals, notes };
}

// ---------------------------------------------------------------- Annex 3: revenue against estimates

/** Annex 3 columns 2 to 8, in order. Column 1 is the revenue item. */
export const REVENUE_COLUMNS = [
  "originalEstimate", // (2) cálculo original
  "increases", // (3) modificaciones: aumentos
  "decreases", // (4) modificaciones: disminuciones
  "finalEstimate", // (5) = 2 + 3 - 4: cálculo definitivo
  "collected", // (6) ingresado acumulado al fin del trimestre
  "difference", // (7) = 5 - 6: diferencia
  "collectedInQuarter", // (8) ingresado en el trimestre
] as const;

export type RevenueFigures = Record<(typeof REVENUE_COLUMNS)[number], number>;

export interface RevenueLine extends RevenueFigures {
  /** Revenue code and label as printed. */
  code: string;
  label: string;
}

export interface RevenueAnnex {
  lines: RevenueLine[];
  totals: RevenueFigures;
  notes: string[];
}

const revenueFigures = (values: number[]) => Object.fromEntries(REVENUE_COLUMNS.map((c, i) => [c, values[i]!])) as RevenueFigures;

/** Revenue item: a code of 9 to 12 digits and its label ("1110101000 Impuesto sobre los ingresos brutos"). */
const REVENUE_ITEM = /(?:^|\s)(\d{9,12})\s*(.*)$/;
/** Group subtotal: "1. RECURSOS CORRIENTES". */
const REVENUE_GROUP = /^(\d)\.\s*(\D.*)$/;

/** One row per item with a code of 9 to 12 digits and its 7 figures (San Martín, San Rafael). */
function readRevenueRows(tables: Table[]): { lines: RevenueLine[]; totals: RevenueFigures | null } | { error: string } {
  const lines: RevenueLine[] = [];
  let totals: RevenueFigures | null = null;
  const unknown: string[] = [];
  for (const table of tables) {
    let last: RevenueLine | null = null;
    /** A line of words: the label of figures that come alone on the next line (Las Heras 2026: "607 04 1110101000 …"). */
    let pending = "";
    for (const row of table) {
      const bare = pending ? figuresOnly(row, REVENUE_COLUMNS.length) : null;
      const split = splitRow(row, REVENUE_COLUMNS.length) ?? (bare ? { label: pending, values: bare } : null);
      if (!split) {
        const text = rowText(row);
        // A wrapped label: a row with words and at most a number inside the label ("LEY 26075"), never a totals row.
        if (last && row.length && row.filter((t) => t.num !== null).length <= 1 && !TOTALS_ROW.test(text))
          last.label = `${last.label} ${text}`;
        else last = null;
        pending = row.some(isAmount) ? "" : text;
        continue;
      }
      pending = "";
      const { label, values } = split;
      last = null;
      if (TOTALS_ROW.test(label)) {
        totals = revenueFigures(values);
        continue;
      }
      const item = REVENUE_ITEM.exec(label);
      if (item) {
        last = { code: item[1]!, label: item[2]!.trim(), ...revenueFigures(values) };
        lines.push(last);
        continue;
      }
      if (!REVENUE_GROUP.test(label)) unknown.push(label);
    }
  }
  for (const l of lines) l.label = l.label.replace(/[.\s]+$/, "").replace(/\s+/g, " ");
  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
  return { lines, totals };
}

/**
 * Item row of the Infogov layout: "5110 -", or a group with a roman numeral before ("II. 5100 -", "I. 7000 -"); the
 * label and figures can follow on the next lines.
 */
const INFOGOV_REVENUE_ITEM = /^(?:([IVX]+)\.\s*)?(\d{4})\s*-/;

/** Infogov layout of Annex 3: same idea as Annex 2, items with a 4-digit code and a "Totales" row. */
function readInfogovRevenue(tables: Table[]): { lines: RevenueLine[]; totals: RevenueFigures | null } | { error: string } {
  // Groups carry a roman numeral and are left out: the same code can be a group and an item (Malargüe: "II. 7400" and
  // "7400", the surplus of previous years).
  type Item = { code: string; group: boolean; label: string[]; nums: number[] };
  const items: Item[] = [];
  let total: Item | null = null;
  for (const table of tables) {
    let current: Item | null = null;
    for (const raw of table) {
      // The code is read before joining signs: the "-" after it ("5110 - 7.136.942.004,00") is not a minus sign.
      const item = INFOGOV_REVENUE_ITEM.exec(rowText(raw));
      // As in Annex 2, a PDF can print the annex more than once: the first copy is enough.
      if (item && total) break;
      const dash = item ? raw.findIndex((t, i) => i > 0 && t.text === "-" && raw[i - 1]!.text === item[2]) : -1;
      const row = withSigns(item ? raw.slice(dash + 1) : raw);
      const text = rowText(row);
      if (item) {
        current = { code: item[2]!, group: !!item[1], label: [], nums: [] };
        items.push(current);
      } else if (TOTALS_ROW.test(rowText(row.filter((t) => t.num === null)))) {
        current = { code: "TOTAL", group: true, label: [], nums: [] };
        total = current;
      } else if (!current || INFOGOV_FURNITURE.test(text) || /^certifico/i.test(text)) {
        current = null;
        continue;
      }
      for (const t of row) {
        if (t.num !== null) current.nums.push(t.num);
        else if (!/^totales?:?$/i.test(t.text)) current.label.push(t.text);
      }
    }
  }
  const leaves = items.filter((i) => !i.group);
  const short = leaves.filter((i) => i.nums.length < 7).map((i) => i.code);
  if (short.length) return { error: `recursos con menos de 7 cifras: ${short.slice(0, 3).join(", ")}` };
  const lines = leaves.map((i) => ({ code: i.code, label: i.label.join(" ").replace(/\s+/g, " ").trim(), ...revenueFigures(i.nums) }));
  return { lines, totals: total && total.nums.length >= 7 ? revenueFigures(total.nums) : null };
}

/** Revenue groups with dotted codes: "1. RECURSOS CORRIENTES", "1.1. De Jurisdiccion Municipal" (Capital). */
const DOTTED_REVENUE = /^((?:\d\.){1,3})\s+(\D.*)$/;
/** Revenue with a grouped code: "1.1.00.00.0000 DE ORIGEN PROVINCIAL" (Godoy Cruz; up to 2025 with a double dot, "1.1..00.00.0000"). */
const GROUPED_REVENUE = /^(\d)\.(\d)\.+(\d{2})\.(\d{2})\.(\d{3,4})(?:\s+(\D.*))?$/;
/**
 * Revenue with a code of 4 to 6 digits: "5110 Rec. Ctes. de Origen Provincial", "57120 Uso del Crédito…" (Guaymallén);
 * or 9 digits with a dash, "511000000 - DE ORIGEN PROVINCIAL" (Junín).
 */
const SHORT_REVENUE = /^(\d{4,6}|\d{9})\s+(?:-\s*)?(\D.*)$/;

/**
 * Revenue with short codes (Capital, Guaymallén): only a few groups, no detail per tax. The items are the codes with no
 * child in the document (dotted: "1.1" under "1."; numeric: "5110" is a child of "5100"). A label left alone on the line
 * above its figures (Guaymallén: "57220 Aportes No Reintegrables-Jurisdicº" + "Provincial …") is joined to them.
 */
function readShortCodedRevenue(tables: Table[]): { lines: RevenueLine[]; totals: RevenueFigures | null } | { error: string } {
  type Candidate = { code: string; label: string; values: number[] };
  const candidates: Candidate[] = [];
  let totals: RevenueFigures | null = null;
  const unknown: string[] = [];
  let pending = "";
  const rows = joinSpilledFigures(tables.flat(), REVENUE_COLUMNS.length);
  const parse = (label: string): { code: string; label: string } | null => {
    const dotted = DOTTED_REVENUE.exec(label);
    if (dotted) return { code: dotted[1]!.replace(/\.$/, ""), label: dotted[2]! };
    const grouped = GROUPED_REVENUE.exec(label);
    if (grouped) {
      // Trailing zero groups are not levels: "1.1.00.00.0000" is "1.1".
      const code = [grouped[1], grouped[2], grouped[3], grouped[4], grouped[5]]
        .map(Number)
        .join(".")
        .replace(/(\.0)+$/, "");
      return { code, label: grouped[6] ?? "" };
    }
    const short = SHORT_REVENUE.exec(label);
    return short ? { code: short[1]!, label: short[2]! } : null;
  };
  for (const row of rows) {
    const bare = pending ? figuresOnly(row, REVENUE_COLUMNS.length) : null;
    const split = splitRow(row, REVENUE_COLUMNS.length) ?? (bare ? { label: "", values: bare } : null);
    if (!split) {
      pending = row.some(isAmount) ? "" : rowText(row);
      continue;
    }
    if (TOTALS_ROW.test(split.label)) totals = revenueFigures(split.values);
    else {
      const item = parse(split.label) ?? parse(`${pending} ${split.label}`.trim());
      if (item) candidates.push({ ...item, values: split.values });
      // Guaymallén 2025-T3 has a row "sáb 00-ene-00" (a date format gone wrong) with every figure at zero.
      else if (split.values.every((v) => v === 0)) {
        /* nothing to read */
      }
      // Rows with a name and no code (Guaymallén 2024: "Aportes Reintegrables"): items without a kind.
      else if (/\p{L}/u.test(split.label)) candidates.push({ code: "", label: split.label, values: split.values });
      else unknown.push(split.label);
    }
    pending = "";
  }
  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
  // A parent is a prefix of its children: "1" of "1.1", and "51" (from "5100") of "5110". Rows without a code are items.
  const stem = (code: string) => (code.includes(".") ? `${code}.` : code.replace(/0+$/, ""));
  const isParent = (c: Candidate) =>
    !!c.code && candidates.some((o) => o !== c && !!o.code && o.code !== c.code && o.code.startsWith(stem(c.code)));
  const leaves = candidates.filter((c) => !isParent(c));
  const lines = leaves.map((c) => ({ code: c.code, label: c.label.replace(/\s+/g, " ").trim(), ...revenueFigures(c.values) }));
  // Junín prints no totals row: its first group ("500000000 - RECURSOS") holds every other code and is the total.
  const root = candidates[0];
  if (!totals && root?.code && candidates.every((c) => c === root || c.code.startsWith(stem(root.code))))
    return { lines, totals: revenueFigures(root.values) };
  return { lines, totals };
}

/**
 * Reads Annex 3 ("De la ejecución del presupuesto con relación al cálculo de recursos y financiamiento"). Keeps the
 * revenue items and checks them like Annex 2: (5) = (2)+(3)-(4) on every row and the items adding up to TOTALES in
 * the published columns; the derived column (7) = (5)-(6) is only noted. Labels that the PDF wraps onto the next lines
 * (San Rafael: "110001010001 IMPUESTO" + "SOBRE LOS INGRESOS" + "BRUTOS") are joined back.
 */
export function parseRevenueAnnex(tables: Table[]): RevenueAnnex | { error: string } {
  if (isScanned(tables)) return SCANNED;
  const texts = tables.flat().map(rowText);
  const read = texts.some((t) => INFOGOV_REVENUE_ITEM.test(t))
    ? readInfogovRevenue(tables)
    : texts.some((t) => /^\d\.\d\.\s/.test(t) || SHORT_REVENUE.test(t) || /^\d\.\d\.+\d{2}\.\d{2}\.\d{3,4}\b/.test(t))
      ? readShortCodedRevenue(tables)
      : readRevenueRows(tables);
  if ("error" in read) return read;
  const { lines, totals } = read;
  if (!totals) return { error: "no se encontró la fila de totales" };
  if (!lines.length) return { error: "no se encontraron recursos" };
  // As in Annex 2, Godoy Cruz prints the decreases as negative amounts.
  const negativeDecreases = totals.decreases < 0 && lines.every((l) => l.decreases <= 0);
  if (negativeDecreases) for (const f of [...lines, totals]) f.decreases = Math.abs(f.decreases);
  const broken = lines.filter((l) => !close(l.originalEstimate + l.increases - l.decreases, l.finalEstimate)).map((l) => l.code);
  if (broken.length) return { error: `recursos donde (5) no da (2)+(3)-(4): ${broken.slice(0, 3).join(", ")}` };
  const notes: string[] = [];
  for (const column of REVENUE_COLUMNS) {
    const sum = lines.reduce((acc, l) => acc + l[column], 0);
    if (close(sum, totals[column], lines.length)) continue;
    const problem = `la suma de los recursos en ${column} (${Math.round(sum)}) no da el total (${Math.round(totals[column])})`;
    if (column !== "difference") return { error: problem };
    notes.push(problem);
  }
  const derived = lines.filter((l) => !close(l.finalEstimate - l.collected, l.difference)).map((l) => l.code);
  if (derived.length) notes.push(`el documento no cumple (7) = (5)-(6) en: ${derived.join(", ")}`);
  if (negativeDecreases) notes.push("el documento anota las disminuciones en negativo: se toman en positivo");
  return { lines, totals, notes };
}

// ---------------------------------------------------------------- Annex 5: public debt

/** Annex 5 columns 2 to 6, in order. Column 1 is the debt; 7 and 8 (legal norm and creditor) are text. */
export const DEBT_COLUMNS = [
  "openingBalance", // (2) saldo al inicio del trimestre
  "payments", // (3) pagos realizados en el trimestre
  "newDebt", // (4) deuda contraída en el trimestre
  "renegotiation", // (5) variación en el trimestre por renegociación
  "closingBalance", // (6) = 2 - 3 + 4 ± 5: saldo al final del trimestre
] as const;

export type DebtFigures = Record<(typeof DEBT_COLUMNS)[number], number>;

export interface DebtLine extends DebtFigures {
  /** Debt as printed ("Préstamo IPV para Compra de Terreno"). */
  label: string;
  currency: "nacional" | "extranjera";
}

export interface DebtAnnex {
  lines: DebtLine[];
  totals: DebtFigures;
  notes: string[];
}

/**
 * The figures of a debt row: the last 5 of the longest run of consecutive figures. The label can end in a number
 * ("ALUMBRADO PUBLICO LEY 9033") and the legal norm comes after the figures, sometimes with a lone "0".
 */
function debtSplit(row: Tok[]): { label: string; values: number[] } | null {
  let best: [number, number] | null = null;
  for (let i = 0; i < row.length; ) {
    if (row[i]!.num === null) {
      i++;
      continue;
    }
    let j = i;
    while (j < row.length && row[j]!.num !== null) j++;
    // Lone "-" after the balances are the empty legal norm columns (Capital: "253.543.257,85 - - Gobierno").
    let end = j;
    while (end > i && row[end - 1]!.text === "-") end--;
    // A legal norm number right after the balances (Las Heras: "653.700.777,56 34162 M 2022") is not a figure.
    // Only a whole number of four or more digits, after amounts with decimals: zeros and amounts stay.
    const withDecimals = row.slice(i, end).some((t) => /[.,]\d{1,2}$/.test(t.text));
    while (end - i > DEBT_COLUMNS.length && withDecimals && /^\d{4,}$/.test(row[end - 1]!.text)) end--;
    // A year closing the label ("ACUERDO II 2019", "DESEQUILIBRIO FINANCIERO 2020") is not a figure.
    if (i > 0 && /^(19|20)\d\d$/.test(row[i]!.text)) i++;
    if (end - i >= DEBT_COLUMNS.length && (!best || end - i > best[1] - best[0])) best = [i, end];
    i = j;
  }
  if (!best) return null;
  const start = best[1] - DEBT_COLUMNS.length;
  return { label: rowText(row.slice(0, start)).trim(), values: row.slice(start, best[1]).map((t) => t.num!) };
}

/**
 * Reads Annex 5 ("Evolución de la deuda pública consolidada acumulada al fin del trimestre"). One line per debt with a
 * non-zero figure, checked against (6) = (2)-(3)+(4)±(5) and against TOTALES. The legal norm and creditor are not
 * read yet: PDFs wrap them over several lines.
 */
export function parseDebtAnnex(tables: Table[]): DebtAnnex | { error: string } {
  if (isScanned(tables)) return SCANNED;
  const strict = readDebt(tables, false);
  if (!("error" in strict)) return strict;
  const loose = readDebt(tables, true);
  if (!("error" in loose)) return loose;
  // A lone "-" is a zero, not a sign (Tunuyán 2024-T2 prints "0,00 - 153.333.651,52" in the closing columns).
  const plain = readDebt(tables, null);
  return "error" in plain ? strict : plain;
}

/**
 * A negative split over two lines: the row keeps a lone "-" and the amount falls alone on the next line (Santa Rosa
 * and La Paz, in the Subtotal and TOTAL GENERAL rows: "… 0,00 - 13.347.303,11" and below "4.444.444,41").
 */
function joinSplitNegatives(rows: Tok[][]): Tok[][] {
  const out: Tok[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = rows[i + 1];
    const dash = row.findIndex((t) => t.text === "-");
    if (dash >= 0 && next?.length === 1 && isAmount(next[0]) && row.filter(isAmount).length === DEBT_COLUMNS.length - 1) {
      out.push(row.map((t, k) => (k === dash ? { text: `-${next[0]!.text}`, num: -next[0]!.num! } : t)));
      i++;
    } else out.push(row);
  }
  return out;
}

/** A debt name that the line cut short: fewer than four words after the account code. */
const shortName = (label: string) =>
  label
    .replace(/^\d{6,}\s*-?\s*/, "")
    .split(/\s+/)
    .filter(Boolean).length < 4;

function readDebt(tables: Table[], signAfterLabel: boolean | null): DebtAnnex | { error: string } {
  const lines: DebtLine[] = [];
  let totals: DebtFigures | null = null;
  let currency: DebtLine["currency"] = "nacional";
  /** The last debt read, whose name can go on in the next lines. */
  let last: DebtLine | null = null;
  /** The last line of words, the name of a debt whose figures come alone on the next line (Guaymallén). */
  let above = "";
  for (const row of joinSplitNegatives(tables.flat()).map((r) => (signAfterLabel === null ? r : withSigns(r, signAfterLabel)))) {
    const text = rowText(row);
    if (/moneda\s+extranjera/i.test(text)) currency = "extranjera";
    else if (/moneda\s+nacional/i.test(text)) currency = "nacional";
    const found = debtSplit(row);
    // Figures with no name on their line take the line above, only if they are amounts with decimals: a row of column
    // numbers ("1 2 3 4 5 6=2-o+3+4+o-5 7 8") has no name either.
    const split = found && !found.label && above && row.some(isAmount) ? { ...found, label: above } : found;
    if (!split) {
      above = /\p{L}/u.test(text) && !row.some(isAmount) ? text : "";
      // Infogov wraps the account name onto the next lines ("2111000000 - Residuos" + "Pasivos"). Only lines of words
      // after a short name that starts with an account code: in other layouts (Capital, San Rafael) the next lines carry
      // pieces of the legal norm and the creditor.
      if (
        last &&
        /^[\p{L}\s.,()/-]+$/u.test(text) &&
        !/^(subtotal|total|en\s+moneda|moneda)\b/i.test(text) &&
        /^\d{6,}/.test(last.label) &&
        shortName(last.label)
      )
        last.label = `${last.label} ${text}`.replace(/\s+/g, " ");
      else last = null;
      continue;
    }
    last = null;
    above = "";
    const values = Object.fromEntries(DEBT_COLUMNS.map((c, i) => [c, split.values[i]!])) as DebtFigures;
    if (TOTALS_ROW.test(split.label) || /^total\s+general$/i.test(split.label)) {
      totals = values;
      continue;
    }
    // Subtotals of a group (Infogov: "Subtotal OTROS PASIVOS CORRIENTES", Las Heras: "TOTAL EN MONEDA NACIONAL") would count
    // the debts twice.
    if (/^(sub)?total\b/i.test(split.label)) continue;
    // Section rows ("Moneda Extranjera 0 0 0 0 0") carry the currency, not a debt.
    if (/^(en\s+)?moneda\s+(nacional|extranjera)$/i.test(split.label)) continue;
    // Rows without words are the column numbers ("1 2 3 4 5 6=2-o+3+4+o-5 7 8"), not a debt.
    // An account code alone is a debt whose name went to the next line (Santa Rosa: "6162010000 -").
    const codeOnly = /^\d{6,}\s*-?$/.test(split.label);
    if (!/\p{L}/u.test(split.label) && !/^(19|20)\d\d$/.test(split.label) && !codeOnly) continue;
    if (DEBT_COLUMNS.every((c) => values[c] === 0)) continue;
    // Rivadavia opens each row with the year, the quarter and its nomenclator ("2026 2 60212 2117020000 PRESTAMO …").
    const label = split.label
      .replace(/^\d{4}\s+[1-4]\s+\d{5,6}\s+/, "")
      .replace(/\s+-$/, "")
      .replace(/\s+/g, " ");
    last = { label, currency, ...values };
    lines.push(last);
  }

  const notes: string[] = [];
  const balanced = (l: DebtFigures) => {
    const base = l.openingBalance - l.payments + l.newDebt;
    return close(base + l.renegotiation, l.closingBalance) || close(base - l.renegotiation, l.closingBalance);
  };
  if (!totals) {
    // Rivadavia prints no totals row: each debt has to add up on its own, and the document is noted.
    const off = lines.filter((l) => !balanced(l));
    if (!lines.length || off.length) return { error: "no se encontró la fila TOTALES" };
    totals = Object.fromEntries(DEBT_COLUMNS.map((c) => [c, lines.reduce((a, l) => a + l[c], 0)])) as DebtFigures;
    notes.push("el documento no trae fila de totales: cada deuda se controló con sus propias cuentas");
  }
  // The sums are checked on the figures as printed, before any normalization.
  for (const column of DEBT_COLUMNS) {
    const sum = lines.reduce((acc, l) => acc + l[column], 0);
    if (!close(sum, totals[column], lines.length + 1))
      return { error: `la suma de las deudas en ${column} (${Math.round(sum)}) no da el total (${Math.round(totals[column])})` };
  }
  // Accounts 616… (Santa Rosa, La Paz) are the amortization of those same debts seen as spending: they are part of the
  // totals, so they stay for the check above, but listing them would count the payments twice.
  const amortization = lines.filter((l) => /^616\d/.test(l.label));
  if (amortization.length) {
    lines.splice(0, lines.length, ...lines.filter((l) => !amortization.includes(l)));
    notes.push("las cuentas 616 (amortización de la deuda, como gasto) entran en el control de totales y no se listan");
  }
  // A balance owed is never negative: San Martín (2024) prints balances with the sign of a liability, and in 2024-T1
  // mixes a negative opening with a positive closing balance in the same row. Balances are taken in absolute value.
  if (lines.some((l) => l.openingBalance < 0 || l.closingBalance < 0)) {
    notes.push("el documento anota saldos en negativo (como pasivo): se toman en valor absoluto");
    for (const l of lines) {
      l.openingBalance = Math.abs(l.openingBalance);
      l.closingBalance = Math.abs(l.closingBalance);
    }
  }
  // (5) can add or subtract: the closing balance has to match one of both.
  const off = lines.filter((l) => !balanced(l));
  if (off.length) notes.push(`deudas donde el saldo final no da (2)-(3)+(4)±(5): ${off.map((l) => l.label).join(" | ")}`);
  return { lines, totals, notes };
}
