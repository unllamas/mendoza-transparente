/** Input normalization shared by the public API and the panel. Every value from outside goes through here. */

/**
 * Control characters, zero-width characters and bidirectional overrides: invisible, and they can make a text
 * read differently from what it says (an RTL override that flips a link, for instance).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

/** One-line text: invisible characters removed, whitespace collapsed, cut at `max`. */
export const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Multi-line text: like `text`, but keeps line breaks (at most one empty line in a row). */
export const longText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t ? t.slice(0, max) : null;
};

export const isoDate = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;

export const email = (v: unknown): string | null => {
  const t = text(v, 200)?.toLowerCase();
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
};

/** Only http(s) links: a `javascript:` or `data:` link would run code when someone in the panel opens it. */
export const url = (v: unknown): string | null => {
  const t = text(v, 500);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/** Filing numbers ("EX-2026-01234567-GDEMZA-MGTYJ", "12345/2026"): letters, digits and separators. */
export const filingNumber = (v: unknown): string | null => {
  const t = text(v, 60)?.toUpperCase().replace(/\s+/g, "");
  return t && /^[A-Z0-9][A-Z0-9\-/._]{2,59}$/.test(t) ? t : null;
};

/** Up to 8 short tags, lowercase, without repeats. */
export const tags = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = new Set<string>();
  for (const x of v) {
    const t = text(x, 30)?.toLowerCase();
    if (t && /^[\p{L}\p{N} _-]+$/u.test(t)) out.add(t);
  }
  return [...out].slice(0, 8);
};

/** Only the path of a page of the site: the full address can carry search terms someone typed. */
export const sitePath = (v: unknown): string | null => {
  const t = text(v, 300);
  if (!t) return null;
  try {
    return new URL(t, "https://mendoza-transparente.com").pathname;
  } catch {
    return null;
  }
};

export const pick = <T extends string>(v: unknown, options: readonly T[]): T | null => options.find((o) => o === v) ?? null;
