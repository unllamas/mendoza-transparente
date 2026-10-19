/**
 * Who held each position: ex officials from the Ética Pública registry (etica-publica/cargos.csv) and everyone the
 * Junta Electoral proclaimed since 2015 (junta-electoral/electos.csv), with the party each election record names.
 * Current officials get their past positions and elections on their own page; the rest go to /funcionarios/historial.
 * The party is never inferred: it only appears for elected positions, as the record says.
 */

import { slug } from "../../src/slug.ts";
import type { ElectedRecord, ElectionSummary, FuncionariosTema, HistoryPerson, HistoryTema, PastPosition } from "../../src/types.ts";

type Row = Record<string, string>;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Thousands of names are compared against thousands: split each one once.
const wordCache = new Map<string, string[]>();
const words = (s: string) => wordCache.get(s) ?? wordCache.set(s, normalize(s).split(" ")).get(s)!;

/** "María Mercedes Rus" and "Mercedes Rus" are the same person: every word of the shorter name is in the longer one. */
function samePerson(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  return x!.length >= 2 && x!.every((w) => y!.includes(w));
}

/** The only candidate that is the same person, or null when there is none or more than one (never guess). */
function uniqueMatch<T>(name: string, candidates: T[], nameOf: (c: T) => string): T | null {
  const found = candidates.filter((c) => samePerson(name, nameOf(c)));
  return found.length === 1 ? found[0]! : null;
}

/** "RODOLFO ALEJANDRO SUAREZ" → "Rodolfo Alejandro Suarez"; names already in mixed case stay as they are, except all-caps words. */
const tidyName = (n: string) =>
  n
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\p{Lu}{2,}/gu, (w) => w[0] + w.slice(1).toLowerCase());

// Words that stay lowercase inside a title, and short capitalized words that are words, not acronyms (HCD, OSEP, DGE).
const SMALL = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "al", "con", "por", "para", "sin"]);
const SHORT_WORDS = new Set(["jefe", "jefa", "juez", "area", "zona", "sub", "vice", "san", "ente", "obra", "ley", "red", "rio"]);

/** Registry text typed in capitals ("DIRECTOR DE RECURSOS HUMANOS", "SECRETARIA de la Suprema") → "Director de Recursos Humanos". */
const tidyTitle = (t: string) =>
  t
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\p{L}+/gu, (w, offset: number) => {
      if (w !== w.toUpperCase()) return w;
      const lower = w.toLowerCase();
      if (w.length === 1) return SMALL.has(lower) ? lower : w;
      if (w.length <= 4 && !SMALL.has(lower) && !SHORT_WORDS.has(normalize(lower))) return w;
      return offset > 0 && SMALL.has(lower) ? lower : lower[0]!.toUpperCase() + lower.slice(1);
    })
    // Departments whose name starts with an article.
    .replace(/\b(las heras|la paz)\b/gi, (m) => m.replace(/^l/, "L"));

/** A real date or null: the registry has placeholders like 0025-12-01 or 2100-01-01. */
const validDate = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  return y >= 1980 && y <= 2060 ? s : null;
};

const OFFICES: [key: string, label: string][] = [
  ["gobernador", "Gobernación"],
  ["vicegobernador", "Vicegobernación"],
  ["intendente", "Intendencias"],
  ["senador_provincial", "Senado provincial"],
  ["diputado_provincial", "Diputados provinciales"],
  ["concejal", "Concejos deliberantes"],
  ["convencional", "Convencionales"],
];
// Names of the seat, not of the person: no "Diputado/a" (docs/procesos/diseno.md, textos).
const ROLE_NAME: Record<string, string> = {
  gobernador: "Gobernación",
  vicegobernador: "Vicegobernación",
  intendente: "Intendencia",
  senador_provincial: "Senado provincial",
  diputado_provincial: "Diputación provincial",
  concejal: "Concejo deliberante",
  convencional: "Convención",
};
const NO_PARTY = "No lo dice el acta";

const byDate = (a: { from: string | null }, b: { from: string | null }) => (a.from ?? "").localeCompare(b.from ?? "");

export function buildHistory(cargos: Row[], electos: Row[], funcionarios: FuncionariosTema, today: string): HistoryTema {
  // ---------------------------------------------------------------- registry positions, by person
  const registry = new Map<string, { name: string; former: boolean; positions: PastPosition[] }>();
  for (const r of cargos) {
    const p = registry.get(r.official_id!) ?? { name: tidyName(r.nombre!), former: r.mandato_cumplido === "si", positions: [] };
    p.positions.push({
      role: tidyTitle(r.cargo!),
      // Ex officials are filed under "Mandato cumplido": that is a status, not where they worked.
      agency: /^mandato cumplido$/i.test(r.reparticion!.trim()) ? "" : tidyTitle(r.reparticion!),
      from: validDate(r.fecha_inicio),
      to: validDate(r.fecha_fin),
    });
    registry.set(r.official_id!, p);
  }
  for (const p of registry.values()) p.positions.sort(byDate);

  // ---------------------------------------------------------------- elections, by person
  const titulares = electos.filter((e) => e.titular_suplente !== "suplente" && e.nombre);
  // The same name written with other capitals ("Frente De Todos") counts as one: the most frequent spelling wins.
  // Different names ("Cambia Mendoza", "Frente Cambia Mendoza") stay apart: that would be inferring.
  const spellings = new Map<string, Map<string, number>>();
  for (const e of titulares) {
    if (!e.partido) continue;
    const m = spellings.get(normalize(e.partido)) ?? new Map<string, number>();
    m.set(e.partido, (m.get(e.partido) ?? 0) + 1);
    spellings.set(normalize(e.partido), m);
  }
  const party = (raw: string | undefined) =>
    raw ? [...spellings.get(normalize(raw))!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0] : null;
  const electedRecord = (e: Row): ElectedRecord => ({
    date: e.eleccion_fecha!,
    role: ROLE_NAME[e.cargo!] ?? tidyTitle(e.cargo_texto || e.cargo!),
    place: e.seccion_electoral ? `${e.seccion_electoral} sección electoral` : e.jurisdiccion || "Mendoza",
    party: party(e.partido),
    sourceUrl: e.fuente_url!,
  });
  // One person across elections: "Alfredo Cornejo" (2015) and "CORNEJO ALFREDO VICTOR" (2023, surname first) are the same.
  // The name shown is the first one written name-first.
  type Elected = { name: string; nameFirst: boolean; aliases: string[]; records: ElectedRecord[] };
  const electedList: Elected[] = [];
  for (const e of [...titulares].sort((a, b) => a.eleccion_fecha!.localeCompare(b.eleccion_fecha!))) {
    const found = electedList.filter((p) => p.aliases.some((alias) => samePerson(alias, e.nombre!)));
    const p = found.length === 1 ? found[0]! : null;
    const nameFirst = e.nombre_orden !== "apellido_nombre";
    if (p) {
      p.aliases.push(e.nombre!);
      p.records.push(electedRecord(e));
      if (nameFirst && !p.nameFirst) Object.assign(p, { name: tidyName(e.nombre!), nameFirst });
    } else electedList.push({ name: tidyName(e.nombre!), nameFirst, aliases: [e.nombre!], records: [electedRecord(e)] });
  }

  // A current legislator or mayor and the record of the seat they hold: "Edgardo Civit Evans" (Legislature) is
  // "CIVIT EDGARDO ALEJANDRO" (2023 record). Two words in common are enough only for the same seat, and only if unique.
  const sharedWords = (a: string, b: string) => words(a).filter((w) => w.length > 2 && words(b).includes(w)).length;
  const electedHere = (f: FuncionariosTema["personas"][number]) => {
    const seat = f.grupo === "intendentes" ? f.organismo : f.seccion;
    if (!seat || !/provincial|intendentes/.test(f.grupo)) return null;
    const found = electedList.filter(
      (c) =>
        c.aliases.some((alias) => sharedWords(alias, f.nombre) >= 2) &&
        c.records.some((r) => normalize(seat).startsWith(normalize(r.place)) || normalize(r.place).startsWith(normalize(seat))),
    );
    return found.length === 1 ? found[0]! : null;
  };

  // ---------------------------------------------------------------- current officials: their past on their page
  const registryList = [...registry.entries()].map(([id, p]) => ({ id, ...p }));
  const usedRegistry = new Set<string>();
  const usedElected = new Set<Elected>();
  const electedMatch = (name: string) => {
    const found = electedList.filter((c) => c.aliases.some((alias) => samePerson(name, alias)));
    return found.length === 1 ? found[0]! : null;
  };
  for (const f of funcionarios.personas) {
    const reg = uniqueMatch(f.nombre, registryList, (c) => c.name);
    if (reg) {
      usedRegistry.add(reg.id);
      const ended = reg.positions.filter((p) => p.to && p.to < today);
      if (ended.length) f.pastPositions = ended;
    }
    const el = electedMatch(f.nombre) ?? electedHere(f);
    if (el) {
      usedElected.add(el);
      f.elected = el.records;
    }
  }

  // ---------------------------------------------------------------- ex officials and past elected
  const people: HistoryPerson[] = [];
  const latest = (positions: PastPosition[]) =>
    [...positions].sort((a, b) => (a.to ?? "9999").localeCompare(b.to ?? "9999") || byDate(a, b)).at(-1);
  for (const reg of registryList) {
    if (!reg.former || usedRegistry.has(reg.id) || reg.positions.length === 0) continue;
    const el = electedMatch(reg.name);
    if (el) usedElected.add(el);
    const last = latest(reg.positions)!;
    people.push({
      id: `etica-${reg.id}`,
      name: reg.name,
      role: last.role,
      agency: last.agency,
      from: last.from?.slice(0, 4) ?? null,
      to: last.to?.slice(0, 4) ?? null,
      positions: reg.positions,
      elected: el?.records ?? [],
    });
  }
  const usedIds = new Set<string>();
  for (const el of electedList) {
    if (usedElected.has(el)) continue;
    const last = el.records.at(-1)!;
    let id = `electo-${slug(el.name)}`;
    for (let n = 2; usedIds.has(id); n++) id = `electo-${slug(el.name)}-${n}`;
    usedIds.add(id);
    people.push({
      id,
      name: el.name,
      role: last.role,
      agency: last.place,
      from: last.date.slice(0, 4),
      to: null,
      positions: [],
      elected: el.records,
    });
  }
  // Ex officials first, who just left at the top (who people look for); then the elected, latest election first.
  people.sort(
    (a, b) =>
      Number(b.positions.length > 0) - Number(a.positions.length > 0) ||
      (b.to ?? b.from ?? "").localeCompare(a.to ?? a.from ?? "") ||
      a.name.localeCompare(b.name, "es"),
  );

  // ---------------------------------------------------------------- how each election was split among parties
  // The 2023 record writes surname first ("CORNEJO ALFREDO VICTOR"): show the name of the official's page when there is one.
  const governorName = (name: string) => uniqueMatch(name, funcionarios.personas, (c) => c.nombre)?.nombre ?? tidyName(name);
  const hrefOf = (name: string) => {
    const f = uniqueMatch(name, funcionarios.personas, (c) => c.nombre);
    if (f) return `/funcionarios/${f.role}/${f.slug}`;
    const h = uniqueMatch(name, people, (c) => c.name);
    return h ? `/funcionarios/historial?persona=${h.id}` : null;
  };
  const byElection = new Map<string, Row[]>();
  for (const e of titulares) byElection.set(e.eleccion_fecha!, [...(byElection.get(e.eleccion_fecha!) ?? []), e]);
  const elections: ElectionSummary[] = [...byElection.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => {
      const gov = rows.find((r) => r.cargo === "gobernador");
      const govHref = gov && hrefOf(gov.nombre!);
      return {
        date,
        year: Number(date.slice(0, 4)),
        governor: gov && govHref ? { name: governorName(gov.nombre!), party: party(gov.partido), href: govHref } : null,
        offices: OFFICES.flatMap(([key, label]) => {
          const of = rows.filter((r) => r.cargo === key);
          if (of.length === 0) return [];
          const count = new Map<string, number>();
          for (const r of of) {
            const name = party(r.partido) ?? NO_PARTY;
            count.set(name, (count.get(name) ?? 0) + 1);
          }
          const parties = [...count].sort((a, b) => b[1] - a[1]).map(([nombre, valor]) => ({ nombre, valor }));
          return [{ key, label, total: of.length, parties }];
        }),
        sourceUrl: rows[0]!.fuente_url!,
      };
    });

  return { people, elections, formerCount: people.filter((p) => p.positions.length > 0).length };
}
