/**
 * Classification layer: maps the spending item code each municipality prints in Annex 2 to one common code from the
 * classification by object of expenditure (clasificador por objeto del gasto) used by Mendoza's municipalities.
 *
 * The code is the same classification written in different ways:
 *   - San Martín: "41100" (one digit per level and two trailing zeros).
 *   - San Rafael: "040101" (two digits per level), after the jurisdiction and unit ("1.00.040101.PERSONAL").
 *   - Infogov (General Alvear, Malargüe and others): "41100000" (one digit per level and five trailing zeros).
 *   - Las Heras (2026): "411000" (one digit per level and three trailing zeros).
 *   - Junín: "4110000" (one digit per level and four trailing zeros).
 * Both become "4.1.1". When two municipalities use different codes for the same concept, `EQUIVALENT_CODES` maps one
 * onto the other. The original code and label are always kept next to the normalized ones.
 */

/** Common label for each normalized object code, as shown on the site. */
export const SPENDING_OBJECTS: Record<string, string> = {
  "4.1.1": "Personal",
  "4.1.2": "Bienes corrientes",
  "4.1.3": "Servicios",
  "4.2.1": "Intereses de la deuda",
  "4.3.1": "Transferencias corrientes",
  "4.3.2": "Transferencias de capital",
  "4.4.1": "Crédito adicional para gastos corrientes",
  "5.1.1": "Bienes de capital",
  "5.1.2": "Trabajos públicos",
  "5.2.1": "Aportes de capital",
  "5.2.2": "Préstamos",
  "5.2.3": "Valores financieros",
  "5.2.4": "Otros títulos y valores",
  "5.3.1": "Bienes preexistentes",
  "5.4.1": "Crédito adicional para gastos de capital",
  "5.2": "Inversión financiera",
  "6": "Otras erogaciones",
  "7": "Servicio de la deuda",
  "6.3": "Adelantos a proveedores",
  "8.1.1": "Gastos de ejercicios anteriores",
  "7.2.1": "Amortización de la deuda",
  "7.4.1": "Amortización de la deuda flotante",
};

/** Codes that mean the same as another one in a different municipality's scheme. */
const EQUIVALENT_CODES: Record<string, string> = {
  // San Rafael "AMORTIZACION DE LA DEUDA" (060201) = San Martín "AMORTIZACION DE CAPITAL" (72100).
  "6.2.1": "7.2.1",
  // Lavalle "AMORTIZACION DE LA DEUDA" (61100000).
  "6.1.1": "7.2.1",
  // Capital "AMORTIZACION DE LA DEUDA FLOTANTE" (6.2.2).
  "6.2.2": "7.4.1",
  // Guaymallén "Adelantos a Proveed. de Ejercicios Ants." (670) = Capital "ADELANTOS A PROVEEDORES Y CONTRATISTAS" (6.3).
  "6.7.0": "6.3",
  // Las Heras: "6.3.0.EROGACIONES PARA ATENDER ADELANTOS…" (up to 2025), and in 2026 "422000 INTERESES",
  // "720000 POR OTRAS DEUDAS" / "AMORTIZAC DE LA DEUDA" and "740000 AMORT DE LA D. FL.".
  "6.3.0": "6.3",
  "4.2.2": "4.2.1",
  "7.2.0": "7.2.1",
  "7.4.0": "7.4.1",
  // Junín splits the advances to suppliers: "6310000 ADELANTO PARA EROGACIONES CORRIENTES" and "6320000 … DE CAPITAL".
  "6.3.1": "6.3",
  "6.3.2": "6.3",
  // San Carlos also has "63300000 ADELANTOS P/EROGACIONES DE CAPITAL".
  "6.3.3": "6.3",
};

/** Each way of writing the code, with the three levels it carries. */
const CODE_FORMATS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(\d)(\d)(\d)\d\d$/, (m) => m.slice(1, 4).join(".")], // "41100"
  [/^(\d)(\d)(\d)00000$/, (m) => m.slice(1, 4).join(".")], // "41100000"
  [/^(0\d)(\d\d)(\d\d)$/, (m) => m.slice(1, 4).map(Number).join(".")], // "040101": two digits per level, leading zero
  [/^(\d)(\d)(\d)000$/, (m) => m.slice(1, 4).join(".")], // "411000"
  [/^(\d)(\d)(\d)0000$/, (m) => m.slice(1, 4).join(".")], // "4110000"
];

/** "41100", "41100000", "040101", "411000" or "4110000" → "4.1.1"; anything else → null. */
export function spendingObjectCode(raw: string): string | null {
  for (const [re, toCode] of CODE_FORMATS) {
    const m = re.exec(raw);
    if (m) {
      const code = toCode(m);
      return EQUIVALENT_CODES[code] ?? code;
    }
  }
  return null;
}

/**
 * Kind of revenue from the first digit of its code, the only level that matches across municipalities so far
 * (San Martín "1110101000" and San Rafael "110001010001" are both current revenue). Below that level each one
 * groups items differently: see docs/procesos/metodologia.md.
 */
const REVENUE_KINDS: Record<string, string> = {
  "1": "corriente",
  "2": "capital",
  "7": "financiamiento",
};

export function revenueKind(code: string): string | null {
  // Infogov writes revenue with 4 digits and a leading 5: "51xx" current, "52xx" capital ("7xxx" is financing).
  // Guaymallén writes financing with 5 digits and a leading 57 ("57120 Uso del Crédito a corto plazo"), and Junín the
  // three kinds with 9 digits ("511000000", "521000000", "572000000").
  const leadingFive = /^5([12])\d\d$/.exec(code) ?? /^5(7)\d{3}$/.exec(code) ?? /^5([127])\d{7}$/.exec(code);
  if (leadingFive) return REVENUE_KINDS[leadingFive[1]!]!;
  return REVENUE_KINDS[code[0] ?? ""] ?? null;
}

/**
 * Normalized object code from a hierarchical code already split in levels ("4.1.1.PERSONAL" → ["4", "1", "1"]; Capital,
 * Guaymallén, Godoy Cruz). The object is the first three levels, with corrections where a municipality uses a code for
 * something else, decided by the printed label when there is one:
 *   - Capital's 5.4.1 is capital transfers, which elsewhere is an additional credit.
 *   - Godoy Cruz 2026 swaps 5.1.02 and 5.2.02: the label says which one is public works and which one loans.
 *   - Godoy Cruz splits the debt with a fourth level: 6.2.01.01 consolidated, 6.2.01.02 floating.
 */
export function objectCodeFromLevels(levels: string[], label: string): string {
  const code = levels.slice(0, 3).join(".");
  if (/trabajos?\s+p[uú]blicos/i.test(label)) return "5.1.2";
  if (/^pr[eé]stamos$/i.test(label.trim())) return "5.2.2";
  // Capital's 5.4.1 and Las Heras' 5.4.2 are capital transfers.
  if (code.startsWith("5.4.") && /transferencia/i.test(label)) return "4.3.2";
  if (code === "6.2.1" && levels[3] === "2") return "7.4.1";
  return EQUIVALENT_CODES[code] ?? code;
}

/**
 * Normalized object code from the printed name alone, for documents whose codes belong to another scheme (Luján de
 * Cuyo: "4.2" in 2024 and "7" in 2026 for the debt, with the Concejo Deliberante's items as "8.1.1 PERSONAL HCD" or
 * repeating the municipality's codes). Null if the name is not one of the known ones.
 */
const OBJECT_NAMES: [RegExp, string][] = [
  [/^personal$/, "4.1.1"],
  [/^bienes de consumo$/, "4.1.2"],
  [/^servicios$/, "4.1.3"],
  [/^intereses y gastos de la deuda$/, "4.2.1"],
  [/^transferencias corrientes$/, "4.3.1"],
  [/^transf\.? ?p\/ ?financ\.? ?erog\.? ?(de )?cap/, "4.3.2"],
  [/^bienes( de capital| de uso)?$/, "5.1.1"],
  [/^(trabajos publicos|construcciones)$/, "5.1.2"],
  [/^(inversion en )?bienes preexist/, "5.3.1"],
  [/^otras erogaciones$/, "6"],
  [/^activos financieros$/, "5.2"],
  [/^servicio de la deuda/, "7"],
];

export function objectCodeFromLabel(label: string): string | null {
  const name = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s.-]*hcd\.?$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return OBJECT_NAMES.find(([re]) => re.test(name))?.[1] ?? null;
}
