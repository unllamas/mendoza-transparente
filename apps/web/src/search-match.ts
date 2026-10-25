/**
 * Matcher of the global search (search-dialog.tsx). Pure and dependency-free.
 * - Case and accent insensitive; "9.735" and "9735" are the same.
 * - Every word of the query must match, in any order: as a prefix of a word (best), as a part of one (only from
 *   3 letters), or with one typo (only from 5 letters). Entries that need a typo go after all exact matches.
 * - Names of people rank first when the query looks like a name.
 */

import type { SearchEntry } from "@/types.ts";

/** Lowercase, no accents, and "9.735" → "9735" so law numbers match with or without dots. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1");

/** People, places and laws first: they are what most searches are about. */
export const KIND_WEIGHT: Record<string, number> = {
  Municipio: 6,
  Funcionario: 5,
  Partido: 5,
  "Ex funcionario": 4,
  Ley: 4,
  Organismo: 4,
  Señal: 4,
  "No se publica": 3,
  Proveedor: 3,
  Sección: 3,
};
const PERSON_KINDS = new Set(["Funcionario", "Ex funcionario"]);
const MIN_TYPO_LENGTH = 5;
const MIN_PART_LENGTH = 3;
const FUZZY_PENALTY = 1000;

const tokenize = (s: string) => s.split(/[^a-z0-9ñ]+/).filter(Boolean);

/** True when `a` and `b` differ by at most one insertion, deletion, substitution or swap of two neighbours. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = a.length - b.length;
  if (Math.abs(diff) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (diff === 0) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = diff > 0 ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

interface Prepared {
  entry: SearchEntry;
  title: string;
  titleTokens: string[];
  tokens: string[];
  /** All text without spaces, dots or dashes: "ecoclean" finds "ECO CLEAN S.A.S.", "acp" finds "A.C.P.". */
  compact: string;
}

const cache = new WeakMap<SearchEntry[], Prepared[]>();
function prepare(entries: SearchEntry[]): Prepared[] {
  let prepared = cache.get(entries);
  if (!prepared) {
    prepared = entries.map((entry) => {
      const title = fold(entry.t);
      const all = `${title} ${fold(entry.s)} ${fold(entry.q ?? "")}`;
      return { entry, title, titleTokens: tokenize(title), tokens: tokenize(all), compact: all.replace(/[\s.-]/g, "") };
    });
    cache.set(entries, prepared);
  }
  return prepared;
}

/** How well one query word matches an entry: 0 = no match, 1 = typo, 2 = part of a word, 3 = prefix, 4 = whole word. */
function wordLevel(p: Prepared, w: string): number {
  let best = 0;
  for (const t of p.tokens) {
    if (t === w) return 4;
    if (t.startsWith(w)) best = 3;
    else if (best < 2 && w.length >= MIN_PART_LENGTH && t.includes(w)) best = 2;
  }
  if (best >= 2) return best;
  if (w.length >= MIN_PART_LENGTH && p.compact.includes(w.replace(/[.-]/g, ""))) return 2;
  if (w.length >= MIN_TYPO_LENGTH && /^[a-zñ]+$/.test(w)) {
    for (const t of p.tokens) {
      if (t.length >= w.length - 1 && (withinOneEdit(w, t) || withinOneEdit(w, t.slice(0, w.length)))) return 1;
    }
  }
  return 0;
}

/** Entries that match every word of `query`, best first. */
export function match(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const looksLikeName = words.every((w) => /^[a-zñ]+$/.test(w));
  const scored: [number, Prepared][] = [];
  for (const p of prepare(entries)) {
    let score = KIND_WEIGHT[p.entry.k] ?? 1;
    let fuzzy = false;
    let ok = true;
    for (const w of words) {
      const level = wordLevel(p, w);
      if (!level) {
        ok = false;
        break;
      }
      if (level === 1) fuzzy = true;
      score += level * 2;
      // In the title is worth more than in the line below it or in the hidden text.
      if (p.titleTokens.some((t) => t.startsWith(w) || (level === 1 && withinOneEdit(w, t)))) score += 8;
    }
    if (!ok) continue;
    if (words.every((w) => p.title.includes(w))) score += 20;
    if (p.title.startsWith(words[0]!)) score += 15;
    if (looksLikeName && PERSON_KINDS.has(p.entry.k)) {
      const inTitle = words.every((w) =>
        p.titleTokens.some((t) => t.startsWith(w) || (w.length >= MIN_TYPO_LENGTH && withinOneEdit(w, t))),
      );
      if (inTitle) score += 25;
    }
    if (fuzzy) score -= FUZZY_PENALTY;
    scored.push([score, p]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].entry.t.length - b[1].entry.t.length).map(([, p]) => p.entry);
}
