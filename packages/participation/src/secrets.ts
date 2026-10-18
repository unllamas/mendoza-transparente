/** Random public codes, edit keys and hashes. Everything uses crypto.getRandomValues, never Math.random. */

/** Crockford base32: no I, L, O or U, so a code read aloud or copied by hand does not get confused. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomBase32(length: number): string {
  // 256 is a multiple of 32, so `byte % 32` has no bias.
  return [...crypto.getRandomValues(new Uint8Array(length))].map((b) => ALPHABET[b % 32]).join("");
}

export type CodePrefix = "P" | "R" | "S";

/**
 * Code of a submission: "P-" for requests, "R-" for reports (both public), "S-" for security findings (panel
 * only). 40 random bits: not sequential, not guessable in bulk.
 */
export const newCode = (prefix: CodePrefix) => `${prefix}-${randomBase32(8)}`;

/** Accepts what people type: lowercase, spaces, and the letters Crockford reads as digits. */
export const normalizeCode = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/^([PR])-?/, "$1-");
  return /^[PR]-[0-9A-HJKMNP-TV-Z]{8}$/.test(t) ? t : null;
};

/** Code of a security finding ("S-…"). Separate from `normalizeCode`, so no public path ever accepts one. */
export const normalizeFindingCode = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.toUpperCase().replace(/\s+/g, "").replace(/[IL]/g, "1").replace(/O/g, "0").replace(/^S-?/, "S-");
  return /^S-[0-9A-HJKMNP-TV-Z]{8}$/.test(t) ? t : null;
};

/** Edit key shown once to whoever registers a request: 100 random bits, in groups of five. */
export const newEditKey = () => randomBase32(20).replace(/(.{5})(?=.)/g, "$1-");

export const normalizeEditKey = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(t) ? t : null;
};

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two hex hashes without stopping at the first difference. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
