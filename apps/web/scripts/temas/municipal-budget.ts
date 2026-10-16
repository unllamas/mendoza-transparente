/**
 * Budget of each municipality from the Fiscal Responsibility Law annexes (data/processed/municipios-lrf): what was
 * approved, how it changed, what was spent and paid, where the money comes from and what is owed. One JSON per
 * municipality with every year (temas/municipios/<slug>/presupuesto.json) and a short summary for its main page.
 *
 * Annexes 2 and 3 accumulate from January: each year uses its last published quarter (the fourth is the whole
 * year). Annex 5 holds the movements of each quarter, so payments add up the quarters and the debt is the closing
 * balance of the last one. Criteria: docs/procesos/metodologia.md#presupuesto-y-gasto-de-cada-municipio.
 */

import { slug } from "../../src/slug.ts";
import type { MunicipalBudget, MunicipalBudgetSummary, MunicipalBudgetYear } from "../../src/types.ts";
import type { Deflactor } from "./inflacion.ts";

type CsvRow = Record<string, string>;

const MONTHS = ["marzo", "junio", "septiembre", "diciembre"];
const num = (s: string | undefined) => Number(s ?? 0) || 0;
const sum = (rows: CsvRow[], col: string) => rows.reduce((acc, r) => acc + num(r[col]), 0);

/** Groups rows by a key and adds up the given columns; sorted by the first column, largest first. */
function totalsBy<C extends string>(rows: CsvRow[], key: (r: CsvRow) => string, cols: C[]): ({ name: string } & Record<C, number>)[] {
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups]
    .map(([name, rs]) => ({ name, ...(Object.fromEntries(cols.map((c) => [c, sum(rs, c)])) as Record<C, number>) }))
    .sort((a, b) => b[cols[0]!] - a[cols[0]!]);
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|E|En|Por|Para|A|Al)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Short names for revenue groups whose official name is too long for a phone and hides what matters at the end
 * (Infogov: "Recursos corrientes de origen provincial").
 */
const REVENUE_NAMES: [RegExp, string][] = [
  [/^recursos corrientes de origen municipal$/i, "Propios del municipio"],
  [/^recursos corrientes de origen nacional$/i, "De la Nación"],
  [/^recursos corrientes de origen provincial$/i, "De la Provincia"],
];
/** A debt without the account code the accounting system puts first ("2113010000 - Ret. Sobre…" or "2.1.4.03 Banco…" → the name alone). */
const debtName = (label: string) => {
  const name = label.replace(/^[\d.]{6,}\s*-?\s*/, "").trim() || label;
  return /\p{Ll}/u.test(name) ? name : titleCase(name);
};
const revenueName = (label: string) => REVENUE_NAMES.find(([re]) => re.test(label.trim()))?.[1] ?? titleCase(label);

/**
 * Municipalities whose Annex 5 lists short-term liabilities (third-party funds, withholdings, bank overdrafts) and
 * not loans: shown as "Deudas de corto plazo". Checked by hand on their documents (docs/procesos/metodologia.md).
 */
const SHORT_TERM_DEBT = new Set(["La Paz", "Malargüe"]);

export function buildMunicipalBudgets(
  spending: CsvRow[],
  revenue: CsvRow[],
  debt: CsvRow[],
  population: Map<string, { anio: number; poblacion: number }[]>,
  real: Deflactor | null,
): MunicipalBudget[] {
  const toReal = (amount: number, year: number) => (real ? real.aReal(amount, year) : amount);
  const out: MunicipalBudget[] = [];

  for (const name of [...new Set(spending.map((r) => r.municipio!))].sort((a, b) => a.localeCompare(b, "es"))) {
    const own = spending.filter((r) => r.municipio === name);
    const years: MunicipalBudgetYear[] = [];
    for (const year of [...new Set(own.map((r) => num(r.anio)))].sort((a, b) => b - a)) {
      const ofYear = own.filter((r) => num(r.anio) === year);
      const quarter = Math.max(...ofYear.map((r) => num(r.trimestre)));
      const rows = ofYear.filter((r) => num(r.trimestre) === quarter);
      const income = revenue.filter((r) => r.municipio === name && num(r.anio) === year && num(r.trimestre) === quarter);
      const debtYear = debt.filter((r) => r.municipio === name && num(r.anio) === year);
      const debtQuarter = Math.max(0, ...debtYear.map((r) => num(r.trimestre)));
      const debtLast = debtYear.filter((r) => num(r.trimestre) === debtQuarter);
      const people = population.get(name)?.find((p) => p.anio === year)?.poblacion ?? population.get(name)?.at(-1)?.poblacion;
      const accrued = sum(rows, "devengado");
      const byArea = rows.some((r) => r.jurisdiccion)
        ? totalsBy(rows, (r) => titleCase(r.jurisdiccion!), ["devengado", "credito_vigente"]).map((a) => ({
            name: a.name,
            accrued: a.devengado,
            current: a.credito_vigente,
          }))
        : null;
      years.push({
        year,
        quarter,
        partial: quarter < 4,
        cutoff: `${MONTHS[quarter - 1]} de ${year}`,
        voted: sum(rows, "credito_votado"),
        current: sum(rows, "credito_vigente"),
        accrued,
        paid: sum(rows, "pagado"),
        accruedReal: toReal(accrued, year),
        perCapitaReal: people ? toReal(accrued, year) / people : null,
        byObject: totalsBy(rows, (r) => r.objeto!, ["devengado", "credito_vigente", "credito_votado"])
          .filter((o) => o.devengado > 0 || o.credito_vigente > 0)
          .map((o) => ({ name: o.name, accrued: o.devengado, current: o.credito_vigente, voted: o.credito_votado })),
        byArea,
        revenue: income.length
          ? {
              estimated: sum(income, "calculo_vigente"),
              collected: sum(income, "ingresado"),
              byKind: totalsBy(income, (r) => r.tipo || "otro", ["ingresado", "calculo_vigente"]).map((k) => ({
                kind: k.name,
                collected: k.ingresado,
                estimated: k.calculo_vigente,
              })),
              top: totalsBy(
                income.filter((r) => r.tipo !== "financiamiento"),
                (r) => revenueName(r.recurso!),
                ["ingresado"],
              )
                .filter((r) => r.ingresado > 0)
                .slice(0, 8)
                .map((r) => ({ name: r.name, collected: r.ingresado })),
            }
          : null,
        debt: debtYear.length
          ? {
              kind: SHORT_TERM_DEBT.has(name) ? "short_term" : "loans",
              quarter: debtQuarter,
              balance: sum(debtLast, "saldo_final"),
              paidInYear: sum(debtYear, "pagos"),
              newInYear: sum(debtYear, "deuda_contraida"),
              loans: totalsBy(debtLast, (r) => debtName(r.deuda!), ["saldo_final"])
                .filter((l) => l.saldo_final > 0)
                .map((l) => ({ name: l.name, balance: l.saldo_final })),
            }
          : null,
        sources: {
          spending: rows[0]?.fuente_url ?? null,
          revenue: income[0]?.fuente_url ?? null,
          debt: debtLast[0]?.fuente_url ?? null,
        },
      });
    }
    out.push({ slug: slug(name), name, reference: real?.referencia ?? null, years });
  }
  return out;
}

/** The last full year (or, without one, the latest) for the municipality's main page. */
export function budgetSummary(b: MunicipalBudget): MunicipalBudgetSummary {
  const y = b.years.find((x) => !x.partial) ?? b.years[0]!;
  return {
    year: y.year,
    partial: y.partial,
    cutoff: y.cutoff,
    accrued: y.accrued,
    current: y.current,
    perCapitaReal: y.perCapitaReal,
    reference: b.reference,
    years: b.years.map((x) => x.year),
  };
}
