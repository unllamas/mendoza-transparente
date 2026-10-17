import { describe, expect, test } from "bun:test";

import { headerAnnex, headerPeriod, parseDebtAnnex, parseRevenueAnnex, parseSpendingAnnex, splitRow } from "./annexes.ts";
import { spendingObjectCode } from "./classify.ts";
import { htmlTables, type Table, type Tok, tokenize } from "./read.ts";

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

describe("lrf: interpretation of Annexes 3 and 5", () => {
  test("revenue labels wrapped onto the next lines are joined (San Rafael PDF)", () => {
    const parsed = parseRevenueAnnex([
      table(
        "1. RECURSOS CORRIENTES 100,00 0,00 0,00 100,00 40,00 60,00 10,00",
        "120001020000 FINANCIA. EDUC. 100,00 0,00 0,00 100,00 40,00 60,00 10,00",
        "LEY 26075",
        "Totales: 100,00 0,00 0,00 100,00 40,00 60,00 10,00",
        "RCTC_ANEXO_03 SRF - RR",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.code, l.label, l.collected])).toEqual([["120001020000", "FINANCIA. EDUC. LEY 26075", 40]]);
  });

  test("a row with the collected amount in the wrong column is rejected (San Martín 2025-T1)", () => {
    const parsed = parseRevenueAnnex([table("1110605010 Coparticipación 0 1603 -1603 0 0 1603 1603", "total 0 1603 -1603 0 0 1603 1603")]);
    expect("error" in parsed && parsed.error).toContain("1110605010");
  });

  test("debts: the label can end in a number and balances printed as negative become positive", () => {
    const parsed = parseDebtAnnex([
      table(
        "1 2 3 4 5 6=2-o+3+4+o-5 7 8",
        "En Moneda Nacional",
        "ALUMBRADO PUBLICO LEY 9033 -100,00 25,00 0,00 0,00 -75,00 CONTRAT 0 PROVINCIA",
        "PRESTAMO SALDADO 0,00 0,00 0,00 0,00 0,00",
        "Moneda Extranjera 0 0 0 0 0",
        "TOTALES -100,00 25,00 0,00 0,00 -75,00",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.label, l.openingBalance, l.payments, l.closingBalance])).toEqual([
      ["ALUMBRADO PUBLICO LEY 9033", 100, 25, 75],
    ]);
    expect(parsed.notes.join()).toContain("valor absoluto");
  });
});

describe("lrf: Infogov layout (General Alvear, Malargüe and others)", () => {
  test("period with the quarter in words and annex number in roman", () => {
    const t = [table("ANEXO II: DE LA EJECUCIÓN DEL PRESUPUESTO", "Ejercicio: 2026", "Trimestre: Segundo")];
    expect(headerPeriod(t)).toEqual({ year: 2026, quarter: 2 });
    expect(headerAnnex(t)).toBe("2");
    expect(headerAnnex([table("RCTC_ANEXO_02 SRF", "ANEXO 2 BIS: DE LA EJECUCIÓN")])).toBe("2bis");
  });

  test("spending items open with the code and carry their label and figures on the next lines", () => {
    const parsed = parseSpendingAnnex([
      table(
        "40000000 (Subtotal) 110 10 0 120 100 90 80 70 10 20 10",
        "EROGACIONES CORRIENTES",
        "41100000 (Subtotal)",
        "100 10 0 110 90 80 70 60 10 20 10",
        "PERSONAL",
        "62100000 (Subtotal) AMORTIZACIÓN DE 10 0 0 10 10 10 10 10 0 0 0",
        "LA DEUDA",
        "TOTAL GENERAL 110 10 0 120 100 90 80 70 10 20 10",
        "CERTIFICO QUE LA INFORMACION 2026",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.code, l.objectCode, l.label, l.accrued])).toEqual([
      ["41100000", "4.1.1", "PERSONAL", 80],
      ["62100000", "7.2.1", "AMORTIZACIÓN DE LA DEUDA", 10],
    ]);
  });

  test("revenue: the dash after the code is not a minus sign, and only the leaves are kept", () => {
    const parsed = parseRevenueAnnex([
      table(
        "I. 5000 -",
        "100,00 0,00 0,00 100,00 40,00 60,00 10,00",
        "RECURSOS",
        "5110 - 70,00 0,00 0,00 70,00 30,00 40,00 5,00",
        "RECURSOS CORRIENTES DE ORIGEN MUNICIPAL",
        "5220 - 30,00 0,00 0,00 30,00 10,00 20,00 5,00",
        "REEMBOLSO DE OBRAS PUBLICAS",
        "Totales 100,00 0,00 0,00 100,00 40,00 60,00 10,00",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => [l.code, l.label, l.originalEstimate])).toEqual([
      ["5110", "RECURSOS CORRIENTES DE ORIGEN MUNICIPAL", 70],
      ["5220", "REEMBOLSO DE OBRAS PUBLICAS", 30],
    ]);
  });
});

describe("lrf: cases found while adding the Infogov municipalities", () => {
  test("a PDF that prints the annex twice is read once (Maipú)", () => {
    const copy = ["41100000 (Subtotal) PERSONAL 100 0 0 100 90 80 70 60 10 10 10", "TOTAL GENERAL 100 0 0 100 90 80 70 60 10 10 10"];
    const parsed = parseSpendingAnnex([table(...copy, ...copy)]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines).toHaveLength(1);
  });

  test("debt: a negative split over two lines, and the 616 accounts kept out of the list (Santa Rosa)", () => {
    const parsed = parseDebtAnnex([
      table(
        "2212200000 - PRESTAMO DEL BANCO 17.777.777,64 4.444.444,41 0,00 -4.444.444,41 13.333.333,23",
        "6162010000 - AMORTIZACION DE LA 0,00 4.444.444,41 4.444.444,41 0,00 0,00",
        "TOTAL GENERAL 17.777.777,64 8.888.888,82 4.444.444,41 - 13.333.333,23",
        "4.444.444,41",
      ),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => l.label)).toEqual(["2212200000 - PRESTAMO DEL BANCO"]);
    expect(parsed.totals.renegotiation).toBe(-4444444.41);
  });

  test("debt without a totals row: each debt checked on its own (Rivadavia)", () => {
    const parsed = parseDebtAnnex([
      table("2026 2 60212 2117020000 PRESTAMO CONVENIO I.P.V. 909.951,81 0,00 0,00 0,00 909.951,81 Resolución"),
    ]);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.lines.map((l) => l.label)).toEqual(["2117020000 PRESTAMO CONVENIO I.P.V."]);
    expect(parsed.notes.join()).toContain("no trae fila de totales");
  });

  test("Lavalle's amortization code", () => {
    expect(spendingObjectCode("61100000")).toBe("7.2.1");
  });
});

describe("lrf: pages saved from the browser (San Carlos)", () => {
  test("an .mht with quoted-printable HTML in Latin-1 becomes rows", () => {
    const mht = [
      "From: <Guardado por Windows Internet Explorer 9>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; type="text/html"; boundary="----=_NextPart_000"',
      "",
      "------=_NextPart_000",
      'Content-Type: text/html; charset="iso-8859-1"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<HTML><BODY><TABLE><TR><TD>ANEXO II: EJECUCI=D3N</TD></TR><TR><TD>41100000 (Subtotal) =",
      "PERSONAL</TD><TD>1.234,50</TD></TR></TABLE></BODY></HTML>",
      "------=_NextPart_000--",
    ].join("\r\n");
    const rows = htmlTables(new TextEncoder().encode(mht))[0]!;
    expect(rows.map((r) => r.map((t) => t.text).join(" "))).toEqual(["ANEXO II: EJECUCIÓN", "41100000 (Subtotal) PERSONAL 1.234,50"]);
  });
});
