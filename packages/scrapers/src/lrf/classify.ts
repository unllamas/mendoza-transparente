/**
 * Classification layer: maps the spending item code each municipality prints in Annex 2 to one common code from the
 * classification by object of expenditure (clasificador por objeto del gasto) used by Mendoza's municipalities.
 *
 * The code is the same classification written in different ways:
 *   - San Martín: "41100" (one digit per level and two trailing zeros).
 *   - San Rafael: "040101" (two digits per level), after the jurisdiction and unit ("1.00.040101.PERSONAL").
 * Both become "4.1.1". When two municipalities use different codes for the same concept, `EQUIVALENT_CODES` maps one
 * onto the other. The original code and label are always kept next to the normalized ones.
 */

/** Common label for each normalized object code, as shown on the site. */
export const SPENDING_OBJECTS: Record<string, string> = {
  "4.1.1": "Personal",
  "4.1.2": "Bienes corrientes",
  "4.1.3": "Servicios",
  "4.2.1": "Intereses y gastos de la deuda",
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
  "7.2.1": "Amortización de la deuda",
  "7.4.1": "Amortización de la deuda flotante",
};

/** Codes that mean the same as another one in a different municipality's scheme. */
const EQUIVALENT_CODES: Record<string, string> = {
  // San Rafael "AMORTIZACION DE LA DEUDA" (060201) = San Martín "AMORTIZACION DE CAPITAL" (72100).
  "6.2.1": "7.2.1",
};

/** "41100" → "4.1.1"; "040101" → "4.1.1"; anything else → null. */
export function spendingObjectCode(raw: string): string | null {
  const fiveDigits = /^(\d)(\d)(\d)\d\d$/.exec(raw);
  const sixDigits = fiveDigits ? null : /^(\d\d)(\d\d)(\d\d)$/.exec(raw);
  const code = fiveDigits ? fiveDigits.slice(1, 4).join(".") : sixDigits ? sixDigits.slice(1, 4).map(Number).join(".") : null;
  return code ? (EQUIVALENT_CODES[code] ?? code) : null;
}
