import type { CSSProperties } from "react";
import type { ListVotes, Unit } from "./types.ts";

/**
 * The two forces that lead the province in one election and office get the two colors of the map (blue and orange);
 * everything else is grey. Color follows the force, not the position in each department: if the second force wins a
 * department, that department is orange.
 *
 * A force is an alliance or party: in the primaries (PASO) its internal lists ("300 A", "300 B") add up to it.
 */
export type Side = 0 | 1 | null;

const normalizeName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * "300 A" → "#300 cambia mendoza". The number joins the internal lists of a force; the name keeps apart forces that
 * share a number in different departments (in a municipal election each department numbers its own ballot, so 504
 * is one local front in Maipú and another one in San Rafael).
 */
export function forceKey(l: Pick<ListVotes, "lista" | "agrupacion">) {
  const number = l.lista.trim().replace(/^(\d+)\s*[A-Za-z]{1,2}$/, "$1");
  return number ? `#${number} ${normalizeName(l.agrupacion)}` : normalizeName(l.agrupacion);
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
  /** The color of each side: the force's official color, or the default blue and orange when it has none. */
  colors: [string, string];
  /** Which sides have no official color (the legend says so). */
  fallback: [boolean, boolean];
  /** True when both official colors look alike: the second side is drawn with stripes so they can be told apart. */
  striped: boolean;
}

// Validated pair (dataviz palette) for forces without an official color.
const FALLBACK = ["var(--color-map-3)", "var(--color-map-alt-3)"] as const;

/** sRGB hex → OKLab, to tell whether two colors look alike. */
function oklab(hex: string): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const distance = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** `colors`: official color by force name as the source writes it (Election.colores). */
export function contenders(total: Unit | null, colors: Record<string, string>): Contenders | null {
  const [a, b] = total ? forcesOf(total) : [];
  if (!a) return null;
  const official = [colors[a.agrupacion], b ? colors[b.agrupacion] : undefined];
  const striped = official[0] !== undefined && official[1] !== undefined && distance(official[0], official[1]) < 0.12;
  return {
    keys: [a.key, b?.key ?? null],
    names: [a.agrupacion, b?.agrupacion ?? null],
    colors: [official[0] ?? FALLBACK[0], official[1] ?? FALLBACK[1]],
    fallback: [official[0] === undefined, official[1] === undefined],
    striped,
  };
}

export function sideOf(c: Contenders | null, l: Pick<ListVotes, "lista" | "agrupacion"> | Force): Side {
  if (!c) return null;
  const k = "key" in l ? l.key : forceKey(l);
  return k === c.keys[0] ? 0 : k === c.keys[1] ? 1 : null;
}

const OTHER = "var(--color-chart-axis)";
const STRIPES = "repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 0.55) 4px 6px)";

/** Fill of a bar or a dot for one side (the force's color, striped for the second when both look alike). */
export function sideStyle(c: Contenders | null, side: Side): CSSProperties {
  if (!c || side === null) return { backgroundColor: OTHER };
  return { backgroundColor: c.colors[side], backgroundImage: side === 1 && c.striped ? STRIPES : undefined };
}

/** Map fill: the winner's color, lighter the smaller its share (four steps). Grey for any other force. */
export function mapFill(c: Contenders, side: Side, share: number) {
  if (side === null) return OTHER;
  const strength = share >= 0.55 ? 100 : share >= 0.45 ? 78 : share >= 0.35 ? 58 : 40;
  return `color-mix(in oklab, ${c.colors[side]} ${strength}%, var(--color-background-full))`;
}
