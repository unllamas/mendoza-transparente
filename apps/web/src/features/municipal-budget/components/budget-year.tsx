import { Alert } from "@mt/ui/components/alert";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiArrowRightUpLine, RiBankLine, RiCoinsLine, RiFileList3Line, RiGroupLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { formatMoneda } from "@/celdas.ts";
import { BarList } from "@/charts/bar-list.tsx";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { formatNumber } from "@/lib.ts";
import type { MunicipalBudget, MunicipalBudgetYear } from "@/types.ts";

const money = (v: number) => formatMoneda(v, "ARS");
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
/** Share of a total for a bar: "34 %", or "menos de 1 %" so a small item does not read as nothing. */
const share = (part: number, whole: number) => {
  const p = whole ? (part / whole) * 100 : 0;
  return p > 0 && p < 1 ? "menos de 1 %" : `${Math.round(p)} %`;
};

/** One year of a municipality's budget: what was approved, spent and paid, on what, from where, and the debt. */
export function BudgetYear({ budget, year }: { budget: MunicipalBudget; year: MunicipalBudgetYear }) {
  const y = year;
  const until = y.cutoff.split(" ")[0];
  const change = percent(y.current - y.voted, y.voted);
  const financing = y.revenue?.byKind.find((k) => k.kind === "financiamiento");
  const ownRevenue = y.revenue ? y.revenue.collected - (financing?.collected ?? 0) : 0;
  const evolution = [...budget.years].reverse();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        {y.partial && (
          <Alert variant="note">
            {y.year} todavía no terminó: las cifras van de enero a {until}, el último trimestre que publicó el municipio.
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            icon={RiFileList3Line}
            label="Presupuesto aprobado"
            value={money(y.voted)}
            note="Lo que fijó el presupuesto al empezar el año"
          />
          <StatTile
            icon={RiFileList3Line}
            label="Autorizado con los cambios"
            value={money(y.current)}
            note={change === 0 ? "Igual que el aprobado" : `${change > 0 ? "+" : "−"}${Math.abs(change)} % respecto del aprobado`}
          />
          <StatTile
            icon={RiCoinsLine}
            label="Gastado"
            value={money(y.accrued)}
            note={`${percent(y.accrued, y.current)} % de lo autorizado${y.partial ? `, hasta ${until}` : ""}`}
          />
          <StatTile
            icon={RiGroupLine}
            label="Gastado por habitante"
            value={y.perCapitaReal ? `$ ${formatNumber(Math.round(y.perCapitaReal))}` : "—"}
            note={budget.reference ? `En pesos de ${budget.reference}` : undefined}
          />
        </div>
        <p className="text-body-regular text-text-tertiary">
          «Gastado» es lo devengado: el bien o el servicio ya se recibió, aunque se pague después. De eso, ya se pagaron {money(y.paid)}.{" "}
          <Link to="/como-leer" hash="devengado" className="text-text-link hover:underline">
            Cómo leer estos datos
          </Link>
        </p>
      </div>

      <Section title="En qué se gasta">
        <p className="-mt-2 text-body-regular text-text-tertiary">
          Lo gastado en el año, por tipo de gasto. Es la misma clasificación para todos los municipios.
        </p>
        <BarList
          items={y.byObject
            .filter((o) => o.accrued > 0)
            .map((o) => ({ nombre: o.name, valor: o.accrued, detalle: share(o.accrued, y.accrued) }))}
          formatValue={money}
        />
      </Section>

      {y.byArea && (
        <Section title="Por área de gobierno">
          <p className="-mt-2 text-body-regular text-text-tertiary">Lo gastado por cada área, con los nombres que usa el municipio.</p>
          <BarList
            items={y.byArea
              .filter((a) => a.accrued > 0)
              .map((a) => ({ nombre: a.name, valor: a.accrued, detalle: share(a.accrued, y.accrued) }))}
            formatValue={money}
          />
        </Section>
      )}

      {y.revenue && (
        <Section title="De dónde sale la plata">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              icon={RiCoinsLine}
              label="Ingresó"
              value={money(ownRevenue)}
              note={`Sin contar préstamos ni remanentes${y.partial ? `, hasta ${until}` : ""}`}
            />
            {financing && financing.collected > 0 && (
              <StatTile
                icon={RiBankLine}
                label="Préstamos y remanentes"
                value={money(financing.collected)}
                note="Préstamos tomados y plata de años anteriores"
              />
            )}
          </div>
          <p className="text-body-regular text-text-tertiary">Los recursos que más aportaron, con los nombres que usa el municipio.</p>
          <BarList
            items={y.revenue.top.map((r) => ({ nombre: r.name, valor: r.collected, detalle: share(r.collected, ownRevenue) }))}
            formatValue={money}
          />
        </Section>
      )}

      {y.debt && (
        <Section title="Deuda">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              icon={RiBankLine}
              label={y.debt.quarter === 4 ? `Deuda al cierre de ${y.year}` : `Deuda a ${until}`}
              value={money(y.debt.balance)}
              note={y.debt.newInYear > 0 ? `Tomó ${money(y.debt.newInYear)} de deuda nueva en el año` : "No tomó deuda nueva en el año"}
            />
            <StatTile icon={RiCoinsLine} label="Pagado de deuda en el año" value={money(y.debt.paidInYear)} />
          </div>
          {y.debt.loans.length > 0 && (
            <ul className={listVariants()}>
              {y.debt.loans.map((l) => (
                <li key={l.name} className={listRowVariants()}>
                  <span className="min-w-0 flex-1 truncate" title={l.name}>
                    {l.name}
                  </span>
                  <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{money(l.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {evolution.length > 1 && (
        <Section title={`Gastado por año${budget.reference ? `, en pesos de ${budget.reference}` : ""}`}>
          <ColumnChart
            key={y.year}
            inicial={evolution.findIndex((e) => e.year === y.year)}
            columnas={evolution.map((e) => ({
              etiqueta: e.partial ? `${e.year}*` : String(e.year),
              valor: e.accruedReal,
              detalle: e.partial ? `hasta ${e.cutoff.split(" ")[0]}` : `${money(e.accrued)} de ese año`,
            }))}
            formatValue={money}
            ariaLabel={`Gastado por la Municipalidad de ${budget.name} por año, en pesos de hoy`}
          />
          {evolution.some((e) => e.partial) && (
            <p className="text-caption-1-regular text-text-tertiary">* El año todavía no terminó: no se compara con los años completos.</p>
          )}
        </Section>
      )}

      <Section title="Los documentos originales">
        <p className="-mt-2 text-body-regular text-text-tertiary">
          Los informes que el municipio publica cada trimestre por la Ley de Responsabilidad Fiscal, de {until} de {y.year}.
        </p>
        <ul className={listVariants()}>
          {(
            [
              ["Gastos (anexo 2)", y.sources.spending],
              ["Recursos (anexo 3)", y.sources.revenue],
              ["Deuda (anexo 5)", y.sources.debt],
            ] as const
          )
            .filter(([, href]) => href)
            .filter(([, href], i, all) => all.findIndex(([, h]) => h === href) === i)
            .map(([label, href]) => (
              <li key={label}>
                <a
                  href={href!}
                  target="_blank"
                  rel="noreferrer"
                  className={listRowVariants()}
                  data-track="municipality.budget_source.open"
                  data-track-municipality={budget.name}
                >
                  <span className="min-w-0 flex-1 truncate text-text-link">
                    {y.sources.spending === y.sources.debt ? "Planilla con todos los anexos del trimestre" : label}
                  </span>
                  <RiArrowRightUpLine className="size-4 shrink-0 text-text-link" aria-hidden />
                </a>
              </li>
            ))}
        </ul>
      </Section>
    </div>
  );
}
