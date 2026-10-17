import type { ReactNode } from "react";
import { ChangeChart } from "@/charts/change-chart.tsx";
import { formatNumber } from "@/lib.ts";
import type { QuarterlyChange } from "@/types.ts";

const periodLabel = (p: string) => p.replace(/^(\d{4})-T(\d)$/, "$2.º trimestre de $1");
const signedPositions = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNumber(Math.abs(v))} ${Math.abs(v) === 1 ? "cargo" : "cargos"}`;
const quarters = (n: number) => `${n} ${n === 1 ? "trimestre" : "trimestres"}`;

/** First column of each year, skipping one that would sit right next to the previous mark ('18 and '19 overlapping). */
function yearTicks(changes: QuarterlyChange[]): string[] {
  const indexes: number[] = [];
  changes.forEach((q, i) => {
    if (q.period.slice(0, 4) === changes[i - 1]?.period.slice(0, 4)) return;
    if (indexes.length && i - indexes.at(-1)! < 2) indexes.pop();
    indexes.push(i);
  });
  return indexes.map((i) => periodLabel(changes[i]!.period));
}

function summary(rises: number, falls: number, total: number): string {
  if (rises === total) return `La planta creció en los ${total} trimestres.`;
  if (falls === total) return `La planta se achicó en los ${total} trimestres.`;
  if (!rises) return `La planta se achicó en ${quarters(falls)} y no creció en ninguno.`;
  if (!falls) return `La planta creció en ${quarters(rises)} y no se achicó en ninguno.`;
  return `La planta creció en ${quarters(rises)} y se achicó en ${quarters(falls)}.`;
}

/**
 * How much the planta rose or fell each quarter, with its summary and what it counts. Shared by the whole
 * provincial State, each agency and each municipality; `note` adds what is specific to each one.
 */
export function StaffChange({ changes, subject, note }: { changes: QuarterlyChange[]; subject: string; note?: ReactNode }) {
  if (changes.length < 4) return null;
  const rises = changes.filter((q) => q.change > 0).length;
  const falls = changes.filter((q) => q.change < 0).length;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="pt-2 text-body-semibold">Cuánto subió o bajó cada trimestre</h3>
      <ChangeChart
        columnas={changes.map((q) => ({
          etiqueta: periodLabel(q.period),
          valor: q.change,
          detalle: `frente al ${periodLabel(q.previous)}`,
        }))}
        formatValue={signedPositions}
        ticks={yearTicks(changes)}
        formatTick={(label) => `'${label.slice(-2)}`}
        ariaLabel={`Diferencia de cargos de planta de ${subject} contra el trimestre anterior`}
      />
      <p className="text-body-regular text-text-secondary text-pretty">
        {summary(rises, falls, changes.length)} Cada columna es la diferencia neta: los cargos que se sumaron menos los que se dejaron de
        liquidar.
      </p>
      <p className="text-caption-1-regular text-text-tertiary text-pretty">
        Cuenta cargos de planta (permanentes y temporarios), no personas, y no incluye contratos de locación.{note && <> {note}</>}
      </p>
    </div>
  );
}
