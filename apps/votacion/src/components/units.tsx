import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine } from "@remixicon/react";
import { useState } from "react";
import { type Contenders, forcesOf, sideOf, sideStyle } from "../contenders.ts";
import { formatNumber, formatPercent } from "../labels.ts";
import type { Unit } from "../types.ts";
import { positives } from "./results.tsx";

/** Winner of a unit and its share of positive votes. */
function winner(u: Unit) {
  const first = forcesOf(u)[0];
  return first ? { name: first.agrupacion, share: formatPercent(first.votos, positives(u)) } : null;
}

/**
 * One row per unit (department, section, circuit or polling table) with who came first and turnout. With `onSelect`
 * the rows open that unit; without it they only inform.
 */
export function UnitList({
  units,
  onSelect,
  limit,
  forces,
}: {
  units: Unit[];
  onSelect?: (u: Unit) => void;
  limit?: number;
  forces: Contenders | null;
}) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? units.slice(0, limit) : units;
  return (
    <div className="flex flex-col gap-3">
      <ul className={listVariants()}>
        {shown.map((u) => {
          const w = winner(u);
          const p = u.participacion;
          const content = (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cx("truncate text-body-medium", onSelect ? "text-text-link" : "text-text-primary")}>{u.nombre}</span>
                {/* The winner's name truncates; its share always stays visible. */}
                <span className="flex min-w-0 gap-1 text-caption-1-regular text-text-secondary">
                  {w ? (
                    <>
                      <span className="truncate">{w.name}</span>
                      <span className="shrink-0 tabular-nums">· {w.share}</span>
                    </>
                  ) : (
                    "Sin votos positivos"
                  )}
                </span>
                {forces && <SplitBar unit={u} forces={forces} />}
              </span>
              <span className="flex shrink-0 flex-col items-end text-caption-1-regular whitespace-nowrap text-text-secondary tabular-nums">
                <span className="text-body-medium text-text-primary">{formatNumber(positives(u))}</span>
                {p?.votantes != null && p.electores != null && <span>Participación {formatPercent(p.votantes, p.electores)}</span>}
              </span>
              {onSelect && <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />}
            </>
          );
          return (
            <li key={u.nombre}>
              {onSelect ? (
                <button type="button" className={listRowVariants()} onClick={() => onSelect(u)}>
                  {content}
                </button>
              ) : (
                <div className={listRowVariants({ interactive: false })}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length < units.length && (
        <button type="button" className={cx(buttonClassName({ variant: "secondary" }), "self-start")} onClick={() => setAll(true)}>
          Mostrar {units.length - shown.length} más
        </button>
      )}
    </div>
  );
}

/** The two leading forces of the province in this unit, as one thin bar over its positive votes (the rest is grey). */
function SplitBar({ unit, forces }: { unit: Unit; forces: Contenders }) {
  const total = positives(unit);
  if (!total) return null;
  const share = (side: 0 | 1) => unit.listas.filter((l) => sideOf(forces, l) === side).reduce((s, l) => s + l.votos, 0) / total;
  return (
    <span className="mt-1 flex h-1.5 max-w-60 gap-px overflow-hidden rounded-full bg-chart-grid" aria-hidden>
      <span style={{ ...sideStyle(forces, 0), width: `${share(0) * 100}%` }} />
      <span className="flex-1" />
      <span style={{ ...sideStyle(forces, 1), width: `${share(1) * 100}%` }} />
    </span>
  );
}
