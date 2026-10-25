import type { ListVotes, Unit } from "./types.ts";

/**
 * The two forces that lead the province in one election and office get the two colors of the map (blue and orange);
 * everything else is grey. Color follows the force, not the position in each department: if the second force wins a
 * department, that department is orange.
 *
 * A force is an alliance or party: in the primaries (PASO) its internal lists ("300 A", "300 B") add up to it.
 */
export type Side = 0 | 1 | null;

/** "300 A" → "#300". Lists without a number are matched by name (names change spelling across sources). */
export function forceKey(l: Pick<ListVotes, "lista" | "agrupacion">) {
  const number = l.lista.trim().replace(/^(\d+)\s*[A-Za-z]{1,2}$/, "$1");
  return number ? `#${number}` : l.agrupacion.trim().toLowerCase();
}

export interface Force {
  key: string;
  agrupacion: string;
  /** Only when the force ran a single list (else each internal list has its own). */
  candidato: string;
  votos: number;
}

/** Lists of a unit added up by force, most voted first. */
export function forcesOf(u: Unit): Force[] {
  const byKey = new Map<string, Force & { lists: number }>();
  for (const l of u.listas) {
    const k = forceKey(l);
    const f = byKey.get(k);
    if (f) {
      f.votos += l.votos;
      f.lists++;
    } else byKey.set(k, { key: k, agrupacion: l.agrupacion, candidato: l.candidato, votos: l.votos, lists: 1 });
  }
  return [...byKey.values()]
    .map(({ lists, ...f }) => ({ ...f, candidato: lists === 1 ? f.candidato : "" }))
    .sort((a, b) => b.votos - a.votos);
}

export interface Contenders {
  keys: [string, string | null];
  names: [string, string | null];
}

export function contenders(total: Unit | null): Contenders | null {
  const [a, b] = total ? forcesOf(total) : [];
  if (!a) return null;
  return { keys: [a.key, b?.key ?? null], names: [a.agrupacion, b?.agrupacion ?? null] };
}

export function sideOf(c: Contenders | null, l: Pick<ListVotes, "lista" | "agrupacion"> | Force): Side {
  if (!c) return null;
  const k = "key" in l ? l.key : forceKey(l);
  return k === c.keys[0] ? 0 : k === c.keys[1] ? 1 : null;
}

/** Four steps per side, darker the bigger the winner's share. */
export function mapFill(side: Side, share: number) {
  if (side === null) return "var(--color-chart-axis)";
  const step = share >= 0.55 ? 4 : share >= 0.45 ? 3 : share >= 0.35 ? 2 : 1;
  return side === 0 ? `var(--color-map-${step})` : `var(--color-map-alt-${step})`;
}

export const SIDE_BG = ["bg-map-3", "bg-map-alt-3"] as const;
