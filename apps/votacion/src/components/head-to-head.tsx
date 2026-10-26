import { Tooltip, TooltipTrigger } from "@mt/ui/components/base/tooltip/tooltip";
import { cx } from "@mt/ui/lib/cx";
import { Button } from "react-aria-components";
import { type Contenders, type Force, forceStyle, forcesOf, sideOf } from "../contenders.ts";
import { formatNumber, formatPercent } from "../labels.ts";
import type { PartyRef, Unit } from "../types.ts";
import { PartyMark } from "./party-mark.tsx";
import { positives } from "./results.tsx";

/**
 * The two leading forces face to face: name, share and votes at each end, and one bar with every force in proportion
 * and a mark at 50 %. Each stretch of the bar says which force it is (hover or focus) and opens its sheet (tap).
 * Below, how much of the count it covers.
 */
export function HeadToHead({
  unit,
  forces,
  colors,
  parties,
  onPick,
}: {
  unit: Unit;
  forces: Contenders;
  colors: Record<string, string>;
  parties: Record<string, PartyRef>;
  onPick: (f: Force) => void;
}) {
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
            <div key={l.key} className={cx("flex min-w-0 flex-col", i === 1 && "items-end text-right")}>
              <button
                type="button"
                onClick={() => onPick(l)}
                className="-my-2 flex min-h-11 max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md text-body-medium text-text-link outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <PartyMark party={parties[l.agrupacion]} style={forceStyle(forces, colors, l)} />
                <span className="truncate" title={l.agrupacion}>
                  {l.agrupacion}
                </span>
              </button>
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
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
          {segments.map((l) => (
            <TooltipTrigger key={l.key}>
              <Button
                aria-label={`${l.agrupacion}: ${formatPercent(l.votos, total)} de los votos positivos`}
                onPress={() => onPick(l)}
                className="h-full cursor-pointer outline-none hover:opacity-80 focus-visible:opacity-80"
                style={{ ...forceStyle(forces, colors, l), width: `${(l.votos / total) * 100}%` }}
              />
              <Tooltip size="md">
                <span className="flex items-center gap-2">
                  <PartyMark party={parties[l.agrupacion]} style={forceStyle(forces, colors, l)} />
                  <span className="min-w-0">
                    {l.agrupacion}
                    <span className="block font-normal text-text-secondary tabular-nums">
                      {formatPercent(l.votos, total)} · {formatNumber(l.votos)} votos
                    </span>
                  </span>
                </span>
              </Tooltip>
            </TooltipTrigger>
          ))}
        </div>
        <span
          className="pointer-events-none absolute -top-1 left-1/2 h-6 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
          aria-hidden
        />
      </div>

      <p className="text-caption-1-regular text-text-secondary text-pretty">
        Cada tramo de la barra es una fuerza, del tamaño de sus votos; tocalo para ver cuál es. La marca del medio es la mitad de los votos
        positivos: quien la pasa ganó con mayoría propia.
      </p>
      {counted !== null && (
        <div className="flex flex-col gap-1.5">
          <span className="text-caption-1-regular text-text-secondary">
            <span className="font-medium text-text-primary tabular-nums">{formatPercent(p!.mesasEscrutadas!, p!.mesasHabilitadas!)}</span>{" "}
            de las mesas escrutadas
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-chart-grid">
            <div className="h-full rounded-full bg-highlight" style={{ width: `${counted * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
