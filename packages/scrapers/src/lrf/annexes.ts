/**
 * Interpretation layer: reads an LRF annex from its rows of tokens (see `read.ts`), whatever the original format.
 *
 * The annexes follow the model set by the Tribunal de Cuentas (Acuerdo 3949, consolidated text Acuerdo 6644/25): every
 * municipality prints the same numbered columns and the same arithmetic between them, which is what makes one reader
 * per annex enough for all of them and lets each document be checked against itself.
 */

import { spendingObjectCode } from "./classify.ts";
import type { Table, Tok } from "./read.ts";

export interface Period {
  year: number;
  quarter: number;
}

const rowText = (row: Tok[]) => row.map((t) => t.text).join(" ");

/** Period printed in the annex header ("EJERCICIO: 2026", "TRIMESTRE: 2"). */
export function headerPeriod(tables: Table[]): Period | null {
  const text = (tables[0] ?? []).slice(0, 20).map(rowText).join("\n");
  const year = /EJERCICIO[ \t]*:?[ \t]*(\d{4})/i.exec(text);
  const quarter = /TRIMESTRE[ \t]*:?[ \t]*([1-4])\b/i.exec(text);
  return year && quarter ? { year: +year[1]!, quarter: +quarter[1]! } : null;
}

/** Joins a lone "-" with the figure right after it: some PDFs print the sign of a negative amount as a separate text. */
function withSigns(row: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < row.length; i++) {
    const next = row[i + 1];
    if (row[i]!.text === "-" && next && next.num !== null && next.text !== "-") {
      out.push({ text: `-${next.text}`, num: -next.num });
      i++;
    } else out.push(row[i]!);
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

/** Item row with the object code alone: "41100 PERSONAL" (San Martín). */
const FLAT_ITEM = /^(\d{5})\s+(.+)$/;
/**
 * Item, unit and jurisdiction rows inside an area (San Rafael): "1.00.040101.PERSONAL" (jurisdiction.unit.object),
 * "1.01.INTENDENCIA - ADMINIST.CENTRAL" (unit subtotal) and "1.INTENDENCIA" (jurisdiction subtotal). Not anchored at
 * the start: the page footer ("RCTC_ANEXO_02 SRF - RRAMOS") can fall on the same line as the last row of the page.
 */
const AREA_ITEM = /(?:^|\s)(\d+)\.(\d{2})\.(\d{6})\.?\s*(.*)$/;
const UNIT_ROW = /(?:^|\s)(\d+)\.(\d{2})\.\s*(\D.*)$/;
const JURISDICTION_ROW = /(?:^|\s)(\d+)\.\s*(\D.*)$/;
const TOTALS_ROW = /(?:^|\s)total(?:es)?\s*:?$/i;

/**
 * Reads Annex 2 ("De la ejecución del presupuesto con relación a los créditos acumulada al fin del trimestre"). Keeps
 * the item rows (the most detailed level the municipality publishes) and checks them against the document:
 *   - Rejects the document if a row breaks (5) = (2)+(3)-(4) or if the items do not add up to the TOTALES row in a
 *     published column (2 to 9): that means a misread row or a document that cannot be trusted.
 *   - Only notes the problems in the derived columns 10 to 12 (San Martín 2025-T2 has a value of column 12 shifted
 *     to the next row): they are not published and do not change the figures that are.
 */
export function parseSpendingAnnex(tables: Table[]): SpendingAnnex | { error: string } {
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

  if (!totals) return { error: "no se encontró la fila TOTALES" };
  if (!lines.length) return { error: "no se encontraron partidas" };
  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
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

/**
 * Reads Annex 3 ("De la ejecución del presupuesto con relación al cálculo de recursos y financiamiento"). Keeps the
 * revenue items and checks them like Annex 2: (5) = (2)+(3)-(4) on every row and the items adding up to TOTALES in
 * the published columns; the derived column (7) = (5)-(6) is only noted. Labels that the PDF wraps onto the next lines
 * (San Rafael: "110001010001 IMPUESTO" + "SOBRE LOS INGRESOS" + "BRUTOS") are joined back.
 */
export function parseRevenueAnnex(tables: Table[]): RevenueAnnex | { error: string } {
  const lines: RevenueLine[] = [];
  let totals: RevenueFigures | null = null;
  const unknown: string[] = [];

  for (const table of tables) {
    let last: RevenueLine | null = null;
    for (const row of table) {
      const split = splitRow(row, REVENUE_COLUMNS.length);
      if (!split) {
        // A wrapped label: a row with words and at most a number inside the label ("LEY 26075").
        if (last && row.length && row.filter((t) => t.num !== null).length <= 1) last.label = `${last.label} ${rowText(row)}`;
        else last = null;
        continue;
      }
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

  if (!totals) return { error: "no se encontró la fila TOTALES" };
  if (!lines.length) return { error: "no se encontraron recursos" };
  if (unknown.length) return { error: `filas sin reconocer: ${unknown.slice(0, 3).join(" | ")}` };
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
    if (j - i >= DEBT_COLUMNS.length && (!best || j - i > best[1] - best[0])) best = [i, j];
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
  const lines: DebtLine[] = [];
  let totals: DebtFigures | null = null;
  let currency: DebtLine["currency"] = "nacional";
  for (const row of tables.flat().map(withSigns)) {
    const text = rowText(row);
    if (/moneda\s+extranjera/i.test(text)) currency = "extranjera";
    else if (/moneda\s+nacional/i.test(text)) currency = "nacional";
    const split = debtSplit(row);
    if (!split) continue;
    const values = Object.fromEntries(DEBT_COLUMNS.map((c, i) => [c, split.values[i]!])) as DebtFigures;
    if (TOTALS_ROW.test(split.label)) {
      totals = values;
      continue;
    }
    // Section rows ("Moneda Extranjera 0 0 0 0 0") carry the currency, not a debt.
    if (/^(en\s+)?moneda\s+(nacional|extranjera)$/i.test(split.label)) continue;
    // Rows without words are the column numbers ("1 2 3 4 5 6=2-o+3+4+o-5 7 8"), not a debt.
    if (!/\p{L}/u.test(split.label)) continue;
    if (DEBT_COLUMNS.every((c) => values[c] === 0)) continue;
    lines.push({ label: split.label.replace(/\s+/g, " "), currency, ...values });
  }

  if (!totals) return { error: "no se encontró la fila TOTALES" };
  // The sums are checked on the figures as printed, before any normalization.
  for (const column of DEBT_COLUMNS) {
    const sum = lines.reduce((acc, l) => acc + l[column], 0);
    if (!close(sum, totals[column], lines.length + 1))
      return { error: `la suma de las deudas en ${column} (${Math.round(sum)}) no da el total (${Math.round(totals[column])})` };
  }
  const notes: string[] = [];
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
  const off = lines.filter((l) => {
    const base = l.openingBalance - l.payments + l.newDebt;
    return !close(base + l.renegotiation, l.closingBalance) && !close(base - l.renegotiation, l.closingBalance);
  });
  if (off.length) notes.push(`deudas donde el saldo final no da (2)-(3)+(4)±(5): ${off.map((l) => l.label).join(" | ")}`);
  return { lines, totals, notes };
}
