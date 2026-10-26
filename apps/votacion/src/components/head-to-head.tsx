import { cx } from "@mt/ui/lib/cx";
import { type Contenders, forcesOf, sideOf, sideStyle } from "../contenders.ts";
import { formatNumber, formatPercent } from "../labels.ts";
import type { Unit } from "../types.ts";
import { positives } from "./results.tsx";

/**
 * The two leading forces face to face: name, share and votes at each end, and one bar with every list in proportion
 * (the rest in grey) and a mark at 50 %. Below, how much of the count it covers.
 */
export function HeadToHead({ unit, forces }: { unit: Unit; forces: Contenders }) {
  const total = positives(unit);
  const all = forcesOf(unit);
  const pick = (side: 0 | 1) => all.find((f) => sideOf(forces, f) === side);
  const left = pick(0);
  const right = pick(1);
  const p = unit.participacion;
  const counted = p?.mesasEscrutadas != null && p.mesasHabilitadas ? p.mesasEscrutadas / p.mesasHabilitadas : null;
  const segments = [left, ...all.filter((f) => f !== left && f !== right), right].filter((f) => f !== undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        {[left, right].map((l, i) =>
          l ? (
            <div key={l.agrupacion} className={cx("flex min-w-0 flex-col", i === 1 && "items-end text-right")}>
              <span className="flex min-w-0 max-w-full items-center gap-2 text-body-medium text-text-primary">
                <span className="size-2.5 shrink-0 rounded-full" style={sideStyle(forces, i as 0 | 1)} aria-hidden />
                <span className="truncate" title={l.agrupacion}>
                  {l.agrupacion}
                </span>
              </span>
              {l.candidato && <span className="max-w-full truncate text-caption-1-regular text-text-secondary">{l.candidato}</span>}
              <span className="text-title-1-semibold tracking-tight whitespace-nowrap text-text-primary tabular-nums sm:text-display-4-semibold">
                {formatPercent(l.votos, total)}
              </span>
              <span className="text-caption-1-regular whitespace-nowrap text-text-secondary tabular-nums">
                {formatNumber(l.votos)} votos
              </span>
            </div>
          ) : (
            <span key={i} />
          ),
        )}
      </div>

      <div className="relative">
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Votos positivos de cada fuerza">
          {segments.map((l) => {
            const side = sideOf(forces, l);
            return (
              <span
                key={l.key}
                className="h-full"
                style={{ ...sideStyle(forces, side), width: `${(l.votos / total) * 100}%` }}
                title={`${l.agrupacion}: ${formatPercent(l.votos, total)}`}
              />
            );
          })}
        </div>
        <span className="absolute -top-1 left-1/2 h-6 w-0.5 -translate-x-1/2 rounded-full bg-text-primary" aria-hidden />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption-1-regular text-text-secondary">
        <span>
          {counted !== null ? (
            <>
              <span className="font-medium text-text-primary tabular-nums">{formatPercent(p!.mesasEscrutadas!, p!.mesasHabilitadas!)}</span>{" "}
              de las mesas escrutadas
            </>
          ) : (
            "Sin dato de mesas escrutadas"
          )}
        </span>
        <span>La marca del medio es el 50 % de los votos positivos</span>
      </div>
      {counted !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-chart-grid">
          <div className="h-full rounded-full bg-highlight" style={{ width: `${counted * 100}%` }} />
        </div>
      )}
    </div>
  );
}
