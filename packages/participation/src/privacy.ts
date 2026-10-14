/**
 * Personal data that can slip into a text the team is about to publish. It is a net, not a guarantee: a
 * number like "12.345.678" can be a DNI or an amount, so these are warnings someone has to confirm.
 */

export type PrivacyWarning = "email" | "telefono" | "dni" | "cuil";

const PATTERNS: [PrivacyWarning, RegExp][] = [
  ["email", /[^\s@]+@[^\s@]+\.[^\s@]+/],
  ["cuil", /\b(20|23|24|27)-?\d{8}-?\d\b/],
  // Mendoza numbers: 261 / 260 / 263 area codes, mobiles with 15, or +54 9.
  ["telefono", /(\+?54\s?9?\s?)?\(?\b26[0-3]\)?[\s.-]?(15[\s.-]?)?\d{3}[\s.-]?\d{4}\b|\b15[\s.-]?\d{3}[\s.-]?\d{4}\b/],
  ["dni", /\b(dni|documento)\b|\b\d{1,2}\.\d{3}\.\d{3}\b/i],
];

export function privacyWarnings(...texts: (string | null | undefined)[]): PrivacyWarning[] {
  const all = texts.filter(Boolean).join("\n");
  return PATTERNS.filter(([, re]) => re.test(all)).map(([w]) => w);
}
