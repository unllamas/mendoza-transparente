import { describe, expect, test } from "bun:test";

import { headerPeriod, parseSpendingAnnex, splitRow } from "./annexes.ts";
import { spendingObjectCode } from "./classify.ts";
import { type Table, type Tok, tokenize } from "./read.ts";

const row = (text: string): Tok[] => tokenize(text);
const table = (...lines: string[]): Table => lines.map(row);

// Columns 2 to 12 of a row that satisfies every identity: voted 100, +10 −0 → 110, committed 90, accrued 80,
// ordered 70, paid 60 → (10) 10, (11) 20, (12) 10.
const OK = "100,00 10,00 0,00 110,00 90,00 80,00 70,00 60,00 10,00 20,00 10,00";

describe("lrf: interpretation of Annex 2", () => {
  test("period printed in the header", () => {
    expect(headerPeriod([table("ANEXO 2: ... AL FIN DEL TRIMESTRE", "EJERCICIO : 2026 TRIMESTRE : 2")])).toEqual({
      year: 2026,
      quarter: 2,
    });
  });

  test("a lone minus sign belongs to the figure after it (San Rafael PDF)", () => {
    const split = splitRow(row("1.02.040103.SERVICIOS GENERALES 0,00 0,00 0,00 0,00 5,00 5,00 5,00 5,00 0,00 - 5,00 0,00"), 11);
    expect(split?.values[9]).toBe(-5);
  });

  test("flat items (San Martín workbook)", () => {
    const parsed = parseSpendingAnnex([
      table(
        "EJERCICIO: 2026 TRIMESTRE: 2",
        `41100 PERSONAL ${OK}`,
        `51200 TRABAJO PUBLICO ${OK}`,
        "TOTALES 200 20 0 220 180 160 140 120 20 40 20",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.code, l.objectCode, l.label])).toEqual([
      ["41100", "4.1.1", "PERSONAL"],
      ["51200", "5.1.2", "TRABAJO PUBLICO"],
    ]);
    expect(parsed.notes).toEqual([]);
  });

  test("items by area, with the page footer on the same line (San Rafael PDF)", () => {
    const parsed = parseSpendingAnnex([
      table(
        `1.INTENDENCIA ${OK}`,
        // A subtotal that lost figures under the page footer still names its unit.
        "RCTC_ANEXO_02 SRF - RRAMOS 1.07.COORD. DE LA JUVENTUD 0,00 5,00",
        `1.07.040102.BIENES CORRIENTES. ${OK}`,
        `RCTC_ANEXO_02 SRF - RRAMOS 1.07.060201.AMORTIZACION DE LA DEUDA ${OK}`,
        "TOTALES: 200,00 20,00 0,00 220,00 180,00 160,00 140,00 120,00 20,00 40,00 20,00",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.jurisdiction, l.unit, l.code, l.objectCode, l.label])).toEqual([
      ["INTENDENCIA", "COORD. DE LA JUVENTUD", "1.07.040102", "4.1.2", "BIENES CORRIENTES"],
      ["INTENDENCIA", "COORD. DE LA JUVENTUD", "1.07.060201", "7.2.1", "AMORTIZACION DE LA DEUDA"],
    ]);
  });

  test("rejects a document whose items do not add up to TOTALES", () => {
    const parsed = parseSpendingAnnex([table(`41100 PERSONAL ${OK}`, "TOTALES 999 10 0 110 90 80 70 60 10 20 10")]);
    expect("error" in parsed && parsed.error).toContain("votedCredit");
  });

  test("only notes a broken derived column (San Martín 2025-T2)", () => {
    const parsed = parseSpendingAnnex([
      table(`52400 OTROS TITULOS 100 10 0 110 90 80 70 60 10 20 0`, `74100 DEUDA FLOTANTE 0 0 0 0 0 0 0 0 0 0 10`, `TOTALES ${OK}`),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.notes.join()).toContain("52400 (12) = (8)-(9)");
  });
});

describe("lrf: classification", () => {
  test("each municipality's code becomes the common one", () => {
    expect(spendingObjectCode("41100")).toBe("4.1.1");
    expect(spendingObjectCode("040101")).toBe("4.1.1");
    expect(spendingObjectCode("72100")).toBe("7.2.1");
    expect(spendingObjectCode("060201")).toBe("7.2.1");
    expect(spendingObjectCode("PERSONAL")).toBeNull();
  });
});
