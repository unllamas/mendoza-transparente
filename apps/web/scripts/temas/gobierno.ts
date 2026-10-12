/**
 * "Gobierno por dentro": one page per agency of the provincial Executive (/gobierno/<slug>), crossing
 * the curated agency table (data/curado/jurisdicciones.yaml) with:
 * - staff and personnel cost (Ley de Responsabilidad Fiscal, annex 19: lrf-personal),
 * - leadership team (Oficina de Ética Pública),
 * - purchases (COMPR.AR, by budget code prefix),
 * - appointments published in the Boletín Oficial (designaciones).
 * Plan: docs/planes/el-estado-por-dentro.md.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AgencyDetail, AgencySummary, FuncionariosTema, GobiernoOverview, OrganismoResumen, ProveedorResumen } from "../../src/types.ts";
import type { Deflactor } from "./inflacion.ts";

type Row = Record<string, string>;

interface CuratedAgency {
  id: string;
  nombre: string;
  sigla?: string;
  tipo: string;
  depende_de: string | null;
  que_hace?: string | null;
  puntos?: string[];
  norma?: string | null;
  fuente_url?: string | null;
  sitio_url?: string | null;
  nota?: string | null;
  antes?: string[];
  alias?: {
    nombres?: string[];
    etica_publica_reparticion?: string[];
    codigos_presupuesto?: string[];
    prefijos_compras?: string[];
  };
}

export interface AgencyTable {
  organismos: CuratedAgency[];
  equivalencias_lrf: Record<string, string | null>;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "DIRECTOR GENERAL DE ADMINISTRACION" → "Director general de administración" (leaves mixed case alone). */
const sentence = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase()) return t;
  const low = t.toLowerCase().replace(/\bmendoza\b/g, "Mendoza");
  return low.charAt(0).toUpperCase() + low.slice(1);
};
const properName = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase())
    .trim();

/** Hierarchy rank for the leadership team: lower goes first. */
function rank(role: string): number {
  const r = normalize(role);
  if (/^(gobernador|vicegobernador|ministr)/.test(r)) return 0;
  if (/^(secretari|jefe de gabinete)/.test(r)) return 1;
  if (/^subsecretari/.test(r)) return 2;
  if (/^(presidente|vicepresidente|administrador general|director general|directora general|fiscal de estado|contador general|tesorer)/.test(r)) return 3;
  if (/^(director|directora|coordinador|coordinadora)/.test(r)) return 4;
  if (/^(subdirector|subdirectora)/.test(r)) return 5;
  if (/^(jefe|jefa|administrador|administradora)/.test(r)) return 6;
  if (/^asesor/.test(r)) return 7;
  return 8;
}

const quarterKey = (r: Row) => `${r.anio}-T${r.trimestre}`;

/** Budget/purchase code prefixes of an agency: purchase prefixes ("1-08-") plus full unit codes ("2-05-02"). */
function prefixesFor(o: CuratedAgency): Set<string> {
  const out = new Set(o.alias?.prefijos_compras ?? []);
  for (const c of o.alias?.codigos_presupuesto ?? []) if (c.includes("-")) out.add(c);
  return out;
}

export function buildGobierno(
  table: AgencyTable,
  lrf: Row[],
  etica: Row[],
  funcionarios: FuncionariosTema,
  procesos: Row[],
  adjudicaciones: Row[],
  buyers: OrganismoResumen[],
  suppliers: ProveedorResumen[],
  appointments: Row[],
  budgetPositions: Row[],
  budgetVacancies: Row[],
  inflation: Deflactor | null,
  outDir: string,
): AgencySummary[] {
  mkdirSync(join(outDir, "gobierno"), { recursive: true });
  const byId = new Map(table.organismos.map((o) => [o.id, o]));
  const supplierSlug = new Map(suppliers.filter((p) => p.indexable).map((p) => [p.cuit, p.slug]));
  const adjByOcid = new Map<string, Row[]>();
  for (const a of adjudicaciones) adjByOcid.set(a.ocid!, [...(adjByOcid.get(a.ocid!) ?? []), a]);

  // Annex 19 rows grouped by current agency (via the curated equivalence table).
  const lrfByAgency = new Map<string, Row[]>();
  for (const r of lrf) {
    const id = table.equivalencias_lrf[`${r.grupo}|${r.organismo}`];
    if (id) lrfByAgency.set(id, [...(lrfByAgency.get(id) ?? []), r]);
  }
  const quarters = [...new Set(lrf.map(quarterKey))].sort();
  const lastQuarter = quarters.at(-1) ?? null;

  const details: AgencyDetail[] = [];
  for (const o of table.organismos) {
    if (o.tipo === "poder") continue;
    const nameKeys = [o.nombre, ...(o.alias?.nombres ?? [])].map(normalize);
    const rows = lrfByAgency.get(o.id) ?? [];

    // Staff by quarter
    const staffSeries = quarters
      .map((q) => {
        const qs = rows.filter((r) => quarterKey(r) === q);
        const sum = (tipo: string, field = "cantidad") => qs.filter((r) => r.tipo_personal === tipo).reduce((s, r) => s + (Number(r[field]) || 0), 0);
        return {
          period: q,
          permanent: sum("permanente"),
          temporary: sum("temporaria"),
          contracts: sum("contratos_locacion"),
          teachingHours: sum("permanente", "horas_catedra") + sum("temporaria", "horas_catedra"),
        };
      })
      .filter((p) => p.permanent + p.temporary + p.contracts + p.teachingHours > 0);
    const latest = staffSeries.at(-1);

    // Cost by year: amounts are accumulated from January, so the year's total is its last quarter.
    const years = [...new Set(rows.map((r) => Number(r.anio)))].sort();
    const costByYear = years.map((year) => {
      const yearRows = rows.filter((r) => Number(r.anio) === year);
      const lastQ = Math.max(...yearRows.map((r) => Number(r.trimestre)));
      const nominal = yearRows.filter((r) => Number(r.trimestre) === lastQ).reduce((s, r) => s + (Number(r.importe) || 0), 0);
      return { year, nominal, real: inflation ? inflation.aReal(nominal, year) : nominal, complete: lastQ === 4 };
    }).filter((c) => c.nominal > 0);
    const lastComplete = [...costByYear].reverse().find((c) => c.complete) ?? null;
    const positionsInYear = lastComplete
      ? staffSeries.filter((p) => p.period.startsWith(`${lastComplete.year}-`)).map((p) => p.permanent + p.temporary + p.contracts)
      : [];
    const avgPositions = positionsInYear.length ? positionsInYear.reduce((a, b) => a + b, 0) / positionsInYear.length : 0;

    const units = lastQuarter
      ? [...new Set(rows.filter((r) => quarterKey(r) === lastQuarter).map((r) => r.organismo!))].map((name) => {
          const q = rows.filter((r) => quarterKey(r) === lastQuarter && r.organismo === name);
          return {
            name,
            staff: q.filter((r) => r.tipo_personal !== "contratos_locacion").reduce((s, r) => s + (Number(r.cantidad) || 0), 0),
            contracts: q.filter((r) => r.tipo_personal === "contratos_locacion").reduce((s, r) => s + (Number(r.cantidad) || 0), 0),
          };
        })
      : [];

    // Positions in the budget law (planillas 8.2 and 8.6), by "carácter-jurisdicción-unidad" code prefix.
    const budgetPrefixes = [...prefixesFor(o)];
    const budgetCode = (r: Row) => `${r.codigo_caracter}-${r.codigo_jurisdiccion!.padStart(2, "0")}-${r.codigo_unidad!.padStart(2, "0")}`;
    const inBudget = (r: Row) => budgetPrefixes.some((p) => budgetCode(r).startsWith(p));
    const budgetYears = [...new Set(budgetPositions.map((r) => Number(r.anio)))].sort();
    const budget = budgetPrefixes.length
      ? budgetYears
          .map((year) => {
            const yr = budgetPositions.filter((r) => Number(r.anio) === year && inBudget(r));
            return {
              year,
              positions: yr.reduce((s, r) => s + (Number(r.cargos) || 0), 0),
              // Only when the year's sheet has unit codes (2025's came without them: unknown per agency).
              vacancies: budgetVacancies.some((r) => Number(r.anio) === year && r.codigo_caracter !== "0")
                ? budgetVacancies.filter((r) => Number(r.anio) === year && inBudget(r)).reduce((s, r) => s + (Number(r.cargos) || 0), 0)
                : null,
              project: yr.some((r) => r.es_proyecto === "1"),
            };
          })
          .filter((b) => b.positions > 0)
      : [];

    // Leadership: Executive officials from the officials page, plus Ética Pública declarants.
    const executives = funcionarios.personas.filter((p) => p.grupo === "ejecutivo" && nameKeys.includes(normalize(p.organismo)));
    const reparticiones = new Set(o.alias?.etica_publica_reparticion ?? []);
    const declarants = etica
      .filter((r) => reparticiones.has(r.reparticion!) && !r.fecha_fin_cargo)
      .map((r) => ({ name: properName(r.nombre!), role: sentence(r.cargo!), since: r.fecha_inicio_cargo || null, path: null as string | null }));
    // Same person in both sources ("Rodolfo Marcial Montero" / "Rodolfo Montero"): first and last name match.
    const nameKey = (n: string) => {
      const w = normalize(n).split(" ");
      return `${w[0]} ${w.at(-1)}`;
    };
    const execNames = new Set(executives.map((p) => nameKey(p.nombre)));
    const isoDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d : null);
    const team = [
      ...executives.map((p) => {
        const declared = declarants.find((d) => nameKey(d.name) === nameKey(p.nombre));
        return { name: p.nombre, role: p.cargo, since: isoDate(declared?.since ?? p.mandatoDesde), path: `/funcionarios/${p.role}/${p.slug}` };
      }),
      ...declarants.filter((d) => !execNames.has(nameKey(d.name))),
    ].sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name, "es"));
    // The head is the top-ranked person only if their role is a leadership one (not an adviser or clerk).
    const head = team[0] && rank(team[0].role) <= 4 ? { name: team[0].name, role: team[0].role, path: team[0].path } : null;

    // Purchases by budget code prefix ("1-08-")
    const prefixes = o.alias?.prefijos_compras ?? [];
    const matches = (buyer: string) => prefixes.some((p) => buyer.startsWith(p));
    const procs = prefixes.length ? procesos.filter((p) => matches(p.comprador ?? "")) : [];
    let purchases: AgencyDetail["purchases"] = null;
    if (procs.length) {
      const adjs = procs.flatMap((p) => adjByOcid.get(p.ocid!) ?? []);
      const bySupplier = new Map<string, { name: string; amount: number }>();
      for (const a of adjs) {
        if (!a.proveedor_cuit) continue;
        const v = bySupplier.get(a.proveedor_cuit) ?? { name: a.proveedor_nombre!, amount: 0 };
        v.amount += Number(a.monto) || 0;
        bySupplier.set(a.proveedor_cuit, v);
      }
      const withBids = procs.filter((p) => p.cantidad_oferentes !== "");
      purchases = {
        processes: procs.length,
        total: adjs.reduce((s, a) => s + (Number(a.monto) || 0), 0),
        direct: (procs.filter((p) => /directa/i.test(p.metodo_contratacion ?? "")).length / procs.length) * 100,
        singleBid: withBids.length ? (withBids.filter((p) => p.cantidad_oferentes === "1").length / withBids.length) * 100 : 0,
        topSuppliers: [...bySupplier]
          .sort((a, b) => b[1].amount - a[1].amount)
          .slice(0, 8)
          .map(([cuit, v]) => ({ name: v.name, amount: v.amount, slug: supplierSlug.get(cuit) ?? null })),
        buyers: buyers.filter((b) => matches(b.buyer)).map((b) => ({ slug: b.slug, name: b.nombre, processes: b.procesos })),
      };
    }

    // Appointments published in the Boletín, matched by issuing agency or unit name.
    const agencyAppointments = appointments
      .filter((a) => !/martiller/i.test(a.cargo ?? ""))
      .filter((a) => {
        const issuer = normalize(a.organismo_emisor ?? "");
        const unit = normalize(a.reparticion ?? "");
        return nameKeys.some((k) => k && (issuer === k || unit === k || issuer.includes(k) || (unit && k.includes(unit) && unit.length > 12)));
      })
      .sort((a, b) => (b.fecha_boletin ?? "").localeCompare(a.fecha_boletin ?? ""))
      .slice(0, 15)
      .map((a) => ({
        date: a.fecha_boletin!,
        action: a.modalidad || a.accion!,
        person: properName(a.persona!),
        role: a.cargo ? sentence(a.cargo) : "",
        unit: a.reparticion ? sentence(a.reparticion) : "",
        url: a.url_pdf!,
      }));

    const parent = o.depende_de && byId.get(o.depende_de) ? { slug: o.depende_de, name: byId.get(o.depende_de)!.nombre } : null;
    const detail: AgencyDetail = {
      slug: o.id,
      name: o.nombre,
      kind: o.tipo,
      parent,
      staff: latest ? latest.permanent + latest.temporary : null,
      staffPeriod: latest?.period ?? null,
      annualCostReal: lastComplete?.real ?? null,
      head,
      whatItDoes: o.que_hace ?? null,
      points: o.puntos ?? [],
      law: o.norma ?? null,
      lawUrl: o.fuente_url ?? null,
      site: o.sitio_url ?? null,
      note: o.nota ?? null,
      before: o.antes ?? [],
      children: table.organismos.filter((c) => c.depende_de === o.id && c.tipo !== "poder").map((c) => ({ slug: c.id, name: c.nombre })),
      realReference: inflation?.referencia ?? null,
      staffSeries,
      costByYear,
      monthlyCostPerPosition: lastComplete && avgPositions ? lastComplete.real / avgPositions / 12 : null,
      units: units.filter((u) => u.staff > 0).length > 1 ? units.filter((u) => u.staff > 0).sort((a, b) => b.staff - a.staff) : [],
      team: team.slice(0, 30),
      teamTotal: team.length,
      purchases,
      appointments: agencyAppointments,
      budget,
    };
    details.push(detail);
    for (const p of executives) p.agency ??= { slug: o.id, name: o.nombre };
    writeFileSync(join(outDir, "gobierno", `${o.id}.json`), JSON.stringify(detail));
  }

  writeFileSync(join(outDir, "gobierno-resumen.json"), JSON.stringify(buildOverview(lrf, details)));

  return details.map(({ slug, name, kind, parent, staff, staffPeriod, annualCostReal, head }) => ({
    slug,
    name,
    kind,
    parent,
    staff,
    staffPeriod,
    annualCostReal,
    head,
  }));
}

const QUARTER_END = ["03-31", "06-30", "09-30", "12-31"];
/** Start of the current administration (Dec 2023) and the previous one (Dec 2019), as quarterly cut-offs. */
const BASELINES = { current: "2023-T4", previous: "2019-T4" } as const;

/**
 * Crosses for the /gobierno overview: total staff over time and agencies that stand out.
 * They are signals that deserve an explanation, not accusations (docs/procesos/metodologia.md).
 */
export function buildOverview(lrf: Row[], details: AgencyDetail[]): GobiernoOverview {
  const quarters = [...new Set(lrf.map(quarterKey))].sort();
  const series = quarters.map((q) => {
    const rows = lrf.filter((r) => quarterKey(r) === q);
    const sum = (pred: (r: Row) => boolean) => rows.filter(pred).reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
    const [y, t] = q.split("-T");
    return {
      period: q,
      date: `${y}-${QUARTER_END[Number(t) - 1]}`,
      staff: sum((r) => r.tipo_personal !== "contratos_locacion"),
      contracts: sum((r) => r.tipo_personal === "contratos_locacion"),
    };
  });
  const at = (a: AgencyDetail, period: string) => {
    const p = a.staffSeries.find((x) => x.period === period);
    return p ? p.permanent + p.temporary : null;
  };
  const changes = details
    .map((a) => {
      const from = at(a, BASELINES.current);
      const to = a.staff;
      // Agencies whose structure changed (curated `antes`) are flagged: their change is not like for like.
      return from && to && from >= 50
        ? { slug: a.slug, name: a.name, from, to, pct: ((to - from) / from) * 100, restructured: a.before.length > 0 }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.pct - a.pct);
  const contractShare = details
    .map((a) => {
      const last = a.staffSeries.at(-1);
      if (!last || !a.staff || a.staff < 20) return null;
      return { slug: a.slug, name: a.name, contracts: last.contracts, staff: a.staff, ratio: (last.contracts / a.staff) * 100 };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && c.contracts > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 8);
  return { series, baseline: BASELINES.current, changes, contractShare };
}
