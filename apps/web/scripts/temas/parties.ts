/**
 * Parties, fronts and legislative blocs: one name however the official sources write it, and one page each (/partidos).
 *
 * Two layers (docs/procesos/metodologia.md, «Partidos, frentes y bloques»):
 * 1. Automatic: case, accents, punctuation and spaces are ignored ("Frente De Todos" = "Frente de Todos").
 * 2. Curated: data/curado/partidos.yaml joins other spellings of the same name, each with its reason.
 * Anything else stays as its own entity with the name as the source writes it: different parties are never joined,
 * and nobody gets a party the source does not give them.
 */

import { slug } from "../../src/slug.ts";
import type {
  ElectionSummary,
  Funcionario,
  FuncionariosTema,
  GrupoFuncionario,
  HistoryTema,
  PartyDetail,
  PartyMember,
  PartyRef,
  PartySummary,
} from "../../src/types.ts";

/** One entry of data/curado/partidos.yaml. */
export interface PartyEntry {
  slug: string;
  nombre: string;
  sigla?: string | null;
  alias?: { nombre: string; motivo: string }[];
  logo?: string | null;
  logo_fuente?: string | null;
  wikidata?: string | null;
}

/** A name as one source uses it: as a party or front, or as a legislative bloc. */
export interface PartyMention {
  name: string;
  use: "partido" | "bloque";
}

/** Layer 1: the same words with other capitals, accents or punctuation are the same name. */
export const partyKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const CONNECTORS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "por", "para", "en"]);
// Legal prefixes every front has: left out when two other words remain ("Frente Elegí Gestión La Paz" → "EG").
const PREFIXES = new Set(["partido", "frente", "alianza", "bloque"]);

/** "Cambia Mendoza" → "CM"; "Partido Verde" → "PV"; at most two letters (an acronym, when there is one, goes as is). */
export const partyInitials = (name: string) => {
  const words = name.split(/[\s,/-]+/).filter((w) => /^\p{L}/u.test(w) && !CONNECTORS.has(partyKey(w)));
  const core = words.filter((w) => !PREFIXES.has(partyKey(w)));
  return (core.length >= 2 ? core : words)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
};

interface Entity {
  ref: PartyRef;
  entry: PartyEntry | null;
  /** Each spelling the sources use, with how many times it appears. */
  spellings: Map<string, number>;
  uses: Set<"partido" | "bloque">;
}

export interface PartyRegistry {
  /** The entity a name belongs to, or null for an empty name. */
  ref(name: string | null | undefined): PartyRef | null;
  entities(): Entity[];
}

/**
 * Every name the sources mention, grouped: the curated entries first, then one entity per remaining name, shown with
 * its most frequent spelling.
 */
export function buildPartyRegistry(entries: PartyEntry[], mentions: PartyMention[]): PartyRegistry {
  const byKey = new Map<string, Entity>();
  const usedSlugs = new Set<string>();
  for (const e of entries) {
    if (usedSlugs.has(e.slug)) throw new Error(`partidos.yaml: slug repetido «${e.slug}»`);
    usedSlugs.add(e.slug);
    const entity: Entity = {
      ref: {
        slug: e.slug,
        name: e.nombre,
        short: e.sigla ?? partyInitials(e.nombre),
        logo: e.logo ? `/partidos/${e.logo}` : null,
      },
      entry: e,
      spellings: new Map(),
      uses: new Set(),
    };
    for (const name of [e.nombre, ...(e.alias ?? []).map((a) => a.nombre)]) {
      const other = byKey.get(partyKey(name));
      if (other && other !== entity) throw new Error(`partidos.yaml: «${name}» está en «${other.ref.slug}» y en «${e.slug}»`);
      byKey.set(partyKey(name), entity);
    }
  }

  for (const m of mentions) {
    const name = m.name.trim();
    if (!name) continue;
    const key = partyKey(name);
    let entity = byKey.get(key);
    if (!entity) {
      entity = { ref: { slug: "", name, short: "", logo: null }, entry: null, spellings: new Map(), uses: new Set() };
      byKey.set(key, entity);
    }
    entity.spellings.set(name, (entity.spellings.get(name) ?? 0) + 1);
    entity.uses.add(m.use);
  }

  // Names nobody curated: the most frequent spelling, and a slug that does not clash with a curated one.
  const all = [...new Set(byKey.values())];
  for (const entity of all.filter((x) => !x.entry)) {
    const name = [...entity.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0]![0];
    let s = slug(name);
    for (let n = 2; usedSlugs.has(s); n++) s = `${slug(name)}-${n}`;
    usedSlugs.add(s);
    Object.assign(entity.ref, { slug: s, name, short: partyInitials(name) });
  }

  return {
    ref: (name) => (name?.trim() ? (byKey.get(partyKey(name))?.ref ?? null) : null),
    entities: () => all.filter((x) => x.spellings.size > 0),
  };
}

const LEGISLATIVE = new Set<GrupoFuncionario>(["diputados_provincial", "senado_provincial", "diputados_nacional", "senado_nacional"]);

/** The name the badge shows: a legislator's bloc (what the chamber publishes), anyone else's party or front. */
export const affiliationOf = (p: Pick<Funcionario, "grupo" | "bloque" | "partido">) =>
  LEGISLATIVE.has(p.grupo) ? (p.bloque ?? p.partido) : p.partido;

/** Elected positions; appointed ones (ministers, the Fiscal de Estado) have no party in any official source. */
export const isElected = (p: Pick<Funcionario, "grupo" | "cargo">) => p.grupo !== "ejecutivo" || /^(vice)?gobernador/i.test(p.cargo);

/** The names each source uses (officials after the curated corrections, and every election record). */
export function partyMentions(personas: Funcionario[], elected: Record<string, string>[]) {
  const mentions: PartyMention[] = [];
  for (const p of personas) {
    if (p.partido) mentions.push({ name: p.partido, use: "partido" });
    if (p.bloque) mentions.push({ name: p.bloque, use: "bloque" });
  }
  for (const r of elected) if (r.partido) mentions.push({ name: r.partido, use: "partido" });
  return mentions;
}

/** Sets the badge of each current official. Appointed positions get none, and nothing is inferred. */
export function assignParties(personas: Funcionario[], registry: PartyRegistry) {
  for (const p of personas) {
    const elected = isElected(p);
    p.party = elected ? registry.ref(affiliationOf(p)) : null;
    p.partyMissing = elected && !p.party;
  }
}

const GROUP_ORDER: GrupoFuncionario[] = [
  "ejecutivo",
  "intendentes",
  "senado_provincial",
  "diputados_provincial",
  "senado_nacional",
  "diputados_nacional",
];

/** /partidos and /partidos/<slug>, from the officials, the history and the curated entries. */
export function buildParties(registry: PartyRegistry, officials: FuncionariosTema, history: HistoryTema) {
  const details: PartyDetail[] = registry.entities().map((entity) => {
    const { ref, entry } = entity;
    const inOffice = officials.personas.filter((p) => p.party?.slug === ref.slug);
    const members = GROUP_ORDER.map((group) => ({
      group,
      people: inOffice
        .filter((p) => p.grupo === group)
        .map(
          (p): PartyMember => ({
            id: p.id,
            role: p.role,
            slug: p.slug,
            name: p.nombre,
            photo: p.foto,
            // "Tercera sección", not "Tercera sección electoral": the row also says the bloc.
            place: p.grupo === "intendentes" ? p.organismo : (p.seccion?.replace(/ electoral$/, "") ?? p.organismo),
            asWritten: affiliationOf(p)!,
            via: LEGISLATIVE.has(p.grupo) && p.bloque ? "bloque" : "partido",
            mandateTo: p.mandatoHasta,
          }),
        ),
    })).filter((g) => g.people.length > 0);

    const elections = history.elections.flatMap((e: ElectionSummary) => {
      const offices = e.offices.flatMap((o) => {
        const count = o.parties.find((x) => x.slug === ref.slug)?.valor ?? 0;
        return count ? [{ label: o.label, count }] : [];
      });
      return offices.length ? [{ date: e.date, year: e.year, offices, sourceUrl: e.sourceUrl }] : [];
    });

    const former = history.people.flatMap((h) => {
      const won = h.elected.filter((r) => r.partySlug === ref.slug);
      const last = won.at(-1);
      return last ? [{ id: h.id, name: h.name, role: last.role, place: last.place, year: Number(last.date.slice(0, 4)) }] : [];
    });
    former.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, "es"));

    // The curated reason when there is one; layer 1 joins only the same words, so it says that.
    const reasons = new Map((entry?.alias ?? []).map((a) => [partyKey(a.nombre), a.motivo]));
    const aliases = [...entity.spellings.keys()]
      .filter((name) => name !== ref.name)
      .map((name) => ({
        name,
        reason:
          reasons.get(partyKey(name)) ??
          (partyKey(name) === partyKey(ref.name)
            ? "Las mismas palabras, con otras mayúsculas, tildes o signos."
            : "Otra forma del nombre."),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return {
      ...ref,
      inOffice: inOffice.length,
      seatsWon: elections.reduce((sum, e) => sum + e.offices.reduce((s, o) => s + o.count, 0), 0),
      lastElection: elections[0]?.year ?? null,
      uses: (["partido", "bloque"] as const).filter((u) => entity.uses.has(u)),
      aliases,
      logoSource: entry?.logo_fuente ?? null,
      wikidata: entry?.wikidata ?? null,
      members,
      elections,
      former,
    };
  });

  // In office first (by how many), then by seats won, then by name.
  details.sort(
    (a, b) =>
      b.inOffice - a.inOffice ||
      b.seatsWon - a.seatsWon ||
      (b.lastElection ?? 0) - (a.lastElection ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );
  const summaries: PartySummary[] = details.map(({ aliases, logoSource, wikidata, members, elections, former, ...summary }) => summary);
  return { summaries, details };
}
