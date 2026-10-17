/**
 * Classification layer: maps the spending item code each municipality prints in Annex 2 to one common code from the
 * classification by object of expenditure (clasificador por objeto del gasto) used by Mendoza's municipalities.
 *
 * The code is the same classification written in different ways:
 *   - San Martín: "41100" (one digit per level and two trailing zeros).
 *   - San Rafael: "040101" (two digits per level), after the jurisdiction and unit ("1.00.040101.PERSONAL").
 *   - Infogov (General Alvear, Malargüe and others): "41100000" (one digit per level and five trailing zeros).
 *   - Las Heras (2026): "411000" (one digit per level and three trailing zeros).
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
};

/** Each way of writing the code, with the three levels it carries. */
const CODE_FORMATS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(\d)(\d)(\d)\d\d$/, (m) => m.slice(1, 4).join(".")], // "41100"
  [/^(\d)(\d)(\d)00000$/, (m) => m.slice(1, 4).join(".")], // "41100000"
  [/^(0\d)(\d\d)(\d\d)$/, (m) => m.slice(1, 4).map(Number).join(".")], // "040101": two digits per level, leading zero
  [/^(\d)(\d)(\d)000$/, (m) => m.slice(1, 4).join(".")], // "411000"
];

/** "41100", "41100000", "040101" or "411000" → "4.1.1"; anything else → null. */
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
  const infogov = /^5([12])\d\d$/.exec(code);
  if (infogov) return infogov[1] === "1" ? "corriente" : "capital";
  // Guaymallén writes financing with 5 digits and a leading 57 ("57120 Uso del Crédito a corto plazo").
  if (/^57\d{3}$/.test(code)) return "financiamiento";
  return REVENUE_KINDS[code[0] ?? ""] ?? null;
}

/**
 * Normalized object code from a hierarchical code already split in levels ("4.1.1.PERSONAL" → ["4", "1", "1"]; Capital
 * and Guaymallén). Capital uses 5.4.1 for capital transfers, which elsewhere is an additional credit: the label decides.
 */
export function objectCodeFromLevels(levels: string[], label: string): string {
  const code = levels.join(".");
  if (code === "5.4.1" && /transferencia/i.test(label)) return "4.3.2";
  return EQUIVALENT_CODES[code] ?? code;
}
