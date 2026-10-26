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

import type { AuditCheck, Scrutiny, Unit, VoteType } from "../src/types.ts";

export interface AuditOffice {
  /** Departments as the source prints them, by name. */
  printed: Map<string, Unit>;
  /** Polling tables of each department, by department name. */
  mesas: Map<string, Unit[]>;
  /** Departments as shown (printed or summed). */
  departamentos: Unit[];
}

const MAX_CASES = 30;
const NUMBER = new Intl.NumberFormat("es-AR");
const signed = (n: number) => `${n > 0 ? "+" : "−"}${NUMBER.format(Math.abs(n))}`;
const VOTE_LABEL: Record<string, string> = {
  blanco: "votos en blanco",
  nulo: "votos nulos",
  recurrido: "votos recurridos",
  impugnado: "votos impugnados",
  comando_electoral: "votos del comando electoral",
};

/** Lists match by their number when there is one (names are spelled differently across sources), else by name. */
const listKey = (l: { lista: string; agrupacion: string }) => (l.lista.trim() ? `#${l.lista.trim()}` : l.agrupacion.trim().toLowerCase());

/** Votes per list and per vote type, keyed so two units can be compared. */
function tally(u: Unit): Map<string, { label: string; votes: number }> {
  const out = new Map<string, { label: string; votes: number }>();
  for (const l of u.listas) {
    const k = listKey(l);
    const prev = out.get(k);
    out.set(k, { label: l.lista ? `lista ${l.lista} (${l.agrupacion})` : l.agrupacion, votes: (prev?.votes ?? 0) + l.votos });
  }
  for (const [k, v] of Object.entries(u.otros) as [VoteType, number][]) out.set(`~${k}`, { label: VOTE_LABEL[k] ?? k, votes: v });
  return out;
}

function sumTally(units: Unit[]) {
  const out = new Map<string, { label: string; votes: number }>();
  for (const u of units) for (const [k, v] of tally(u)) out.set(k, { label: v.label, votes: (out.get(k)?.votes ?? 0) + v.votes });
  return out;
}

/** Differences `b − a` per key, largest first. */
function diff(a: Map<string, { label: string; votes: number }>, b: Map<string, { label: string; votes: number }>) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys]
    .map((k) => ({ label: b.get(k)?.label ?? a.get(k)!.label, delta: (b.get(k)?.votes ?? 0) - (a.get(k)?.votes ?? 0) }))
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

const emitted = (u: Unit) => u.listas.reduce((s, l) => s + l.votos, 0) + Object.values(u.otros).reduce((s, v) => s + (v ?? 0), 0);

function sums(cargo: string, office: AuditOffice): AuditCheck | null {
  const cases: { size: number; text: string }[] = [];
  let checked = 0;
  for (const [dep, mesas] of office.mesas) {
    const printed = office.printed.get(dep);
    if (!printed) continue;
    checked++;
    for (const d of diff(tally(printed), sumTally(mesas)))
      cases.push({ size: Math.abs(d.delta), text: `${dep}: las mesas suman ${signed(d.delta)} ${d.label} que el total impreso` });
  }
  if (checked === 0) return null;
  return {
    id: "sumas",
    cargo,
    titulo: "Las mesas suman lo mismo que el total de cada departamento",
    descripcion: "Sumamos los votos de cada mesa y los comparamos con el total que la fuente imprime para el departamento.",
    revisados: checked,
    alertas: cases.length,
    casos: cases
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_CASES)
      .map((c) => c.text),
  };
}

function provisionalVsDefinitive(cargo: string, prov: AuditOffice, def: AuditOffice): AuditCheck {
  const cases: { size: number; text: string }[] = [];
  let checked = 0;
  // Polling table by polling table when both scrutinies have them; else department by department.
  const byTable = prov.mesas.size > 0 && def.mesas.size > 0;
  const missing: string[] = [];
  if (byTable) {
    for (const [dep, defTables] of def.mesas) {
      const provTables = new Map((prov.mesas.get(dep) ?? []).map((u) => [u.nombre, u]));
      for (const t of defTables) {
        const p = provTables.get(t.nombre);
        checked++;
        if (!p) {
          missing.push(`${dep}, ${t.nombre}`);
          continue;
        }
        const changes = diff(tally(p), tally(t));
        if (changes.length === 0) continue;
        const size = changes.reduce((s, c) => s + Math.abs(c.delta), 0);
        const detail = changes
          .slice(0, 3)
          .map((c) => `${signed(c.delta)} ${c.label}`)
          .join(", ");
        cases.push({ size, text: `${dep}, ${t.nombre}: ${detail}${changes.length > 3 ? " y más" : ""}` });
      }
    }
  } else {
    const provDeps = new Map(prov.departamentos.map((u) => [u.nombre, u]));
    for (const d of def.departamentos) {
      const p = provDeps.get(d.nombre);
      if (!p) continue;
      for (const c of diff(tally(p), tally(d))) {
        checked++;
        cases.push({ size: Math.abs(c.delta), text: `${d.nombre}: ${signed(c.delta)} ${c.label} en el definitivo` });
      }
    }
  }
  const sorted = cases.sort((a, b) => b.size - a.size).map((c) => c.text);
  // Tables the provisional count never loaded go in one line of their own, so they don't hide the ones that changed.
  if (missing.length > 0)
    sorted.unshift(
      `${NUMBER.format(missing.length)} mesas del definitivo no estaban en el provisorio: ${missing.slice(0, 8).join("; ")}${missing.length > 8 ? " y más" : ""}`,
    );
  return {
    id: "provisorio-definitivo",
    cargo,
    titulo: byTable ? "Mesas que cambiaron del provisorio al definitivo" : "Cambios del provisorio al definitivo por departamento",
    descripcion:
      "El provisorio es el conteo de la noche de la elección; el definitivo, el escrutinio de la Junta Electoral. Es normal que cambien algunos votos: acá se ven cuáles y cuántos.",
    revisados: checked,
    alertas: cases.length + missing.length,
    casos: sorted.slice(0, MAX_CASES),
  };
}

function turnout(cargo: string, office: AuditOffice): AuditCheck | null {
  const cases: { size: number; text: string }[] = [];
  let checked = 0;
  const units = [
    ...office.departamentos.map((u) => ({ dep: "", u })),
    ...[...office.mesas].flatMap(([dep, us]) => us.map((u) => ({ dep, u }))),
  ];
  for (const { dep, u } of units) {
    const p = u.participacion;
    if (!p) continue;
    checked++;
    const where = dep ? `${dep}, ${u.nombre}` : u.nombre;
    const ballots = emitted(u);
    if (p.votantes != null && p.electores != null && p.votantes > p.electores)
      cases.push({
        size: p.votantes - p.electores,
        text: `${where}: votaron ${NUMBER.format(p.votantes)} de ${NUMBER.format(p.electores)} electores`,
      });
    if (p.votantes != null && ballots > p.votantes)
      cases.push({
        size: ballots - p.votantes,
        text: `${where}: hay ${NUMBER.format(ballots)} votos y votaron ${NUMBER.format(p.votantes)} personas`,
      });
  }
  if (checked === 0) return null;
  return {
    id: "participacion",
    cargo,
    titulo: "Más votos que votantes, o más votantes que electores",
    descripcion:
      "En una mesa o un departamento no puede haber más votos que personas que votaron, ni más votantes que electores en el padrón.",
    revisados: checked,
    alertas: cases.length,
    casos: cases
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_CASES)
      .map((c) => c.text),
  };
}

function uncounted(cargo: string, office: AuditOffice): AuditCheck | null {
  const deps = office.departamentos.filter((u) => u.participacion?.mesasHabilitadas != null && u.participacion.mesasEscrutadas != null);
  if (deps.length === 0) return null;
  const missing = deps.filter((u) => u.participacion!.mesasEscrutadas! < u.participacion!.mesasHabilitadas!);
  return {
    id: "mesas-sin-escrutar",
    cargo,
    titulo: "Departamentos con mesas sin escrutar",
    descripcion: "Mesas habilitadas que no aparecen escrutadas en la fuente.",
    revisados: deps.length,
    alertas: missing.length,
    casos: missing.map(
      (u) => `${u.nombre}: ${NUMBER.format(u.participacion!.mesasHabilitadas! - u.participacion!.mesasEscrutadas!)} mesas sin escrutar`,
    ),
  };
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
