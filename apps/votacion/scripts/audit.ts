/**
 * Automatic checks over the official figures of one election, so anyone can see whether what is shown matches the
 * sources and where the numbers do not add up. Each alert is a signal to look at, with the rule that found it; it is
 * never a verdict (docs/procesos/metodologia.md).
 *
 *  - sumas: the polling tables of a department add up to the total the source prints for that department.
 *  - provisorio-definitivo: what changed per list between the provisional count and the definitive scrutiny.
 *  - participacion: units with more voters than registered electors, or more ballots than voters.
 *  - mesas-sin-escrutar: departments where not every polling table was counted.
 */

import type { AuditCase, AuditCheck, Scrutiny, Unit, VoteType } from "../src/types.ts";

export interface AuditOffice {
  /** Departments as the source prints them, by name. */
  printed: Map<string, Unit>;
  /** Polling tables of each department, by department name. */
  mesas: Map<string, Unit[]>;
  /** Departments as shown (printed or summed). */
  departamentos: Unit[];
}

const MAX_CASES = 15;
const NUMBER = new Intl.NumberFormat("es-AR");
const signed = (n: number) => `${n > 0 ? "+" : "−"}${NUMBER.format(Math.abs(n))}`;
const VOTE_LABEL: Record<string, string> = {
  blanco: "Votos en blanco",
  nulo: "Votos nulos",
  recurrido: "Votos recurridos",
  impugnado: "Votos impugnados",
  comando_electoral: "Votos del comando electoral",
};

const normalizeName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * How lists of two counts are matched. By number when both sides number every list (names are spelled differently
 * across sources); by force ("501 A" and "501 B" add up to 501) when one count only has the force's total and the
 * other its internal lists; by name when a side has no numbers. Matching by the wrong key turns every list into one
 * that vanished and one that appeared.
 */
type KeyMode = "list" | "force" | "name";

function matchMode(a: Unit[], b: Unit[]): KeyMode {
  const all = [...a, ...b];
  if (!all.every((u) => u.listas.every((l) => l.lista.trim()))) return "name";
  const numbers = (us: Unit[]) => [...new Set(us.flatMap((u) => u.listas.map((l) => l.lista.trim())))].sort().join("|");
  return numbers(a) === numbers(b) ? "list" : "force";
}

const forceNumber = (lista: string) => lista.trim().replace(/^(\d+)\s*[A-Za-z]{1,2}$/, "$1");

function listKey(l: { lista: string; agrupacion: string }, mode: KeyMode) {
  if (mode === "name") return normalizeName(l.agrupacion);
  return `#${mode === "force" ? forceNumber(l.lista) : l.lista.trim()}`;
}

type Tally = Map<string, { label: string; votes: number }>;

/** Votes per list and per vote type, keyed so two units can be compared. */
function tally(u: Unit, mode: KeyMode): Tally {
  const out: Tally = new Map();
  for (const l of u.listas) {
    const k = listKey(l, mode);
    const number = mode === "force" ? forceNumber(l.lista) : l.lista.trim();
    const prev = out.get(k);
    out.set(k, { label: number ? `Lista ${number} · ${l.agrupacion}` : l.agrupacion, votes: (prev?.votes ?? 0) + l.votos });
  }
  for (const [k, v] of Object.entries(u.otros) as [VoteType, number][]) out.set(`~${k}`, { label: VOTE_LABEL[k] ?? k, votes: v });
  return out;
}

function sumTally(units: Unit[], mode: KeyMode): Tally {
  const out: Tally = new Map();
  for (const u of units) for (const [k, v] of tally(u, mode)) out.set(k, { label: v.label, votes: (out.get(k)?.votes ?? 0) + v.votes });
  return out;
}

/** Differences `b − a` per key, largest first. */
function diff(a: Tally, b: Tally) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys]
    .map((k) => {
      const before = a.get(k)?.votes ?? 0;
      const after = b.get(k)?.votes ?? 0;
      return { label: b.get(k)?.label ?? a.get(k)!.label, before, after, delta: after - before };
    })
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

const emitted = (u: Unit) => u.listas.reduce((s, l) => s + l.votos, 0) + Object.values(u.otros).reduce((s, v) => s + (v ?? 0), 0);

type Found = AuditCase & { size: number };

/**
 * The common tail of every check: counts per department (from every case, before cutting), then the largest cases of
 * each department, alerts first.
 */
function finish(
  base: Omit<AuditCheck, "revisados" | "alertas" | "hallados" | "lugares" | "casos">,
  checked: Map<string, number>,
  found: Found[],
): AuditCheck {
  const lugares: AuditCheck["lugares"] = {};
  for (const [lugar, revisados] of checked) lugares[lugar] = { revisados, alertas: 0, hallados: 0 };
  for (const c of found) {
    const l = (lugares[c.lugar] ??= { revisados: 0, alertas: 0, hallados: 0 });
    l.hallados++;
    if (c.alerta) l.alertas++;
  }
  const kept = new Map<string, number>();
  const casos = found
    .sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.size - a.size)
    .filter((c) => {
      const n = kept.get(c.lugar) ?? 0;
      kept.set(c.lugar, n + 1);
      return n < MAX_CASES;
    })
    .map(({ size, ...c }) => c);
  return {
    ...base,
    revisados: [...checked.values()].reduce((s, n) => s + n, 0),
    alertas: found.filter((c) => c.alerta).length,
    hallados: found.length,
    lugares,
    casos,
  };
}

function sums(cargo: string, office: AuditOffice): AuditCheck | null {
  const found: Found[] = [];
  const checked = new Map<string, number>();
  for (const [dep, mesas] of office.mesas) {
    const printed = office.printed.get(dep);
    if (!printed) continue;
    checked.set(dep, 1);
    const mode = matchMode([printed], mesas);
    for (const d of diff(tally(printed, mode), sumTally(mesas, mode)))
      found.push({
        lugar: dep,
        que: d.label,
        antes: d.before,
        despues: d.after,
        parte: Math.abs(d.delta) / Math.max(emitted(printed), 1),
        alerta: true,
        size: Math.abs(d.delta),
        texto: `${d.label}: las mesas suman ${NUMBER.format(d.after)} y el total impreso dice ${NUMBER.format(d.before)} (${signed(d.delta)})`,
      });
  }
  if (checked.size === 0) return null;
  return finish(
    {
      id: "sumas",
      cargo,
      titulo: "Las mesas suman lo mismo que el total de cada departamento",
      descripcion: "Sumamos los votos de cada mesa y los comparamos con el total que la fuente imprime para el departamento.",
      unidad: "departamentos",
    },
    checked,
    found,
  );
}

/** Share of a unit's ballots above which a change between the two counts is an alert and not a routine correction. */
const ALERT_SHARE = 0.01;

/** The list with the most votes in a tally, to see whether a change turns who won. */
const leader = (t: Tally) => [...t].filter(([k]) => !k.startsWith("~")).sort((a, b) => b[1].votes - a[1].votes)[0]?.[0];

function provisionalVsDefinitive(cargo: string, prov: AuditOffice, def: AuditOffice): AuditCheck {
  const found: Found[] = [];
  const checked = new Map<string, number>();
  // Polling table by polling table when both scrutinies have them; else department by department.
  const byTable = prov.mesas.size > 0 && def.mesas.size > 0;
  if (byTable) {
    for (const [dep, defTables] of def.mesas) {
      const provTables = new Map((prov.mesas.get(dep) ?? []).map((u) => [u.nombre, u]));
      checked.set(dep, defTables.length);
      for (const t of defTables) {
        const p = provTables.get(t.nombre);
        if (!p) {
          found.push({ lugar: dep, mesa: t.nombre, alerta: true, size: emitted(t), texto: "No estaba en el conteo de la noche" });
          continue;
        }
        const mode = matchMode([p], [t]);
        const [a, b] = [tally(p, mode), tally(t, mode)];
        const changes = diff(a, b);
        if (changes.length === 0) continue;
        const size = changes.reduce((s, c) => s + Math.abs(c.delta), 0);
        const flipped = leader(a) !== leader(b);
        found.push({
          lugar: dep,
          mesa: t.nombre,
          parte: size / Math.max(emitted(t), 1),
          alerta: size >= emitted(t) * ALERT_SHARE || flipped,
          size,
          texto: `${changes
            .slice(0, 3)
            .map((c) => `${c.label} ${signed(c.delta)}`)
            .join("; ")}${changes.length > 3 ? " y más" : ""}${flipped ? ". Cambió quién ganó la mesa" : ""}`,
        });
      }
    }
  } else {
    const provDeps = new Map(prov.departamentos.map((u) => [u.nombre, u]));
    for (const d of def.departamentos) {
      const p = provDeps.get(d.nombre);
      if (!p) continue;
      checked.set(d.nombre, 1);
      const mode = matchMode([p], [d]);
      const [a, b] = [tally(p, mode), tally(d, mode)];
      const flipped = leader(a) !== leader(b);
      for (const c of diff(a, b))
        found.push({
          lugar: d.nombre,
          que: c.label,
          antes: c.before,
          despues: c.after,
          parte: Math.abs(c.delta) / Math.max(emitted(d), 1),
          alerta: flipped || Math.abs(c.delta) >= emitted(d) * ALERT_SHARE,
          size: Math.abs(c.delta),
          texto: `${c.label} pasó de ${NUMBER.format(c.before)} a ${NUMBER.format(c.after)} (${signed(c.delta)})`,
        });
    }
  }
  return finish(
    {
      id: "provisorio-definitivo",
      cargo,
      titulo: "Del conteo de la noche al escrutinio oficial",
      descripcion: `El conteo de la noche (provisorio) se hace rápido, con el telegrama de cada mesa. Días después, la Junta Electoral revisa cada acta (definitivo) y corrige lo que haga falta: es normal que cambien algunos votos. Lo marcamos para mirar si un cambio mueve más del 1 % de los votos ${byTable ? "de la mesa" : "del departamento"} o cambia quién ganó.`,
      unidad: byTable ? "mesas" : "departamentos",
    },
    checked,
    found,
  );
}

function turnout(cargo: string, office: AuditOffice): AuditCheck | null {
  const found: Found[] = [];
  const checked = new Map<string, number>();
  const units = [
    ...office.departamentos.map((u) => ({ dep: u.nombre, mesa: undefined as string | undefined, u })),
    ...[...office.mesas].flatMap(([dep, us]) => us.map((u) => ({ dep, mesa: u.nombre as string | undefined, u }))),
  ];
  for (const { dep, mesa, u } of units) {
    const p = u.participacion;
    if (!p) continue;
    checked.set(dep, (checked.get(dep) ?? 0) + 1);
    const ballots = emitted(u);
    if (p.votantes != null && p.electores != null && p.votantes > p.electores)
      found.push({
        lugar: dep,
        mesa,
        alerta: true,
        size: p.votantes - p.electores,
        texto: `Votaron ${NUMBER.format(p.votantes)} personas y el padrón tiene ${NUMBER.format(p.electores)}`,
      });
    if (p.votantes != null && ballots > p.votantes)
      found.push({
        lugar: dep,
        mesa,
        alerta: true,
        size: ballots - p.votantes,
        texto: `Hay ${NUMBER.format(ballots)} votos y votaron ${NUMBER.format(p.votantes)} personas`,
      });
  }
  if (checked.size === 0) return null;
  return finish(
    {
      id: "participacion",
      cargo,
      titulo: "Más votos que votantes, o más votantes que electores",
      descripcion:
        "En una mesa o un departamento no puede haber más votos que personas que votaron, ni más votantes que electores en el padrón.",
      unidad: "mesas y departamentos",
    },
    checked,
    found,
  );
}

function uncounted(cargo: string, office: AuditOffice): AuditCheck | null {
  const deps = office.departamentos.filter((u) => u.participacion?.mesasHabilitadas != null && u.participacion.mesasEscrutadas != null);
  if (deps.length === 0) return null;
  return finish(
    {
      id: "mesas-sin-escrutar",
      cargo,
      titulo: "Mesas sin contar",
      descripcion: "Mesas habilitadas que la fuente no muestra escrutadas.",
      unidad: "departamentos",
    },
    new Map(deps.map((u) => [u.nombre, 1])),
    deps
      .filter((u) => u.participacion!.mesasEscrutadas! < u.participacion!.mesasHabilitadas!)
      .map((u) => {
        const n = u.participacion!.mesasHabilitadas! - u.participacion!.mesasEscrutadas!;
        return { lugar: u.nombre, alerta: true, size: n, texto: `${NUMBER.format(n)} ${n === 1 ? "mesa" : "mesas"} sin escrutar` };
      }),
  );
}

export function auditElection(scrutinies: Map<Scrutiny, Map<string, AuditOffice>>): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const def = scrutinies.get("definitivo");
  const prov = scrutinies.get("provisorio");
  const offices = new Set([...(def?.keys() ?? []), ...(prov?.keys() ?? [])]);
  for (const cargo of offices) {
    const main = def?.get(cargo) ?? prov?.get(cargo);
    if (!main) continue;
    const p = prov?.get(cargo);
    const d = def?.get(cargo);
    if (p && d) checks.push(provisionalVsDefinitive(cargo, p, d));
    for (const check of [sums(cargo, main), turnout(cargo, main), uncounted(cargo, main)]) if (check) checks.push(check);
  }
  return checks;
}
