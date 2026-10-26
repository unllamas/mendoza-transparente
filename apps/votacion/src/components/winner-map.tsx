import { tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Contenders, forcesOf, mapFill, sideOf, sideStyle } from "../contenders.ts";
import { formatPercent } from "../labels.ts";
import type { MapData, Unit } from "../types.ts";
import { positives } from "./results.tsx";

// Small departments of Greater Mendoza, shown enlarged in a box (same drawing as the main site).
const GRAN_MENDOZA = ["Capital", "Godoy Cruz", "Guaymallén", "Maipú", "Las Heras", "Luján de Cuyo"];
const CORE = ["Capital", "Godoy Cruz", "Guaymallén"];
const NO_VOTE = "no eligió este cargo en esta elección";

/**
 * Each department painted with the force that won it: blue or orange for the two leading forces of the province,
 * grey for any other, darker the bigger the share. Hover or focus shows the winner; a tap opens the department.
 */
export function WinnerMap({
  map,
  departments,
  forces,
  selected,
  onSelect,
}: {
  map: MapData;
  departments: Unit[];
  forces: Contenders;
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const byName = useMemo(() => new Map(departments.map((d) => [d.nombre, d])), [departments]);
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = tipRef.current;
    const width = boxRef.current?.clientWidth;
    if (!tip || !el || !width) return;
    el.style.left = `${Math.min(Math.max(tip.x - el.offsetWidth / 2, 0), width - el.offsetWidth)}px`;
  }, [tip]);
  const showTip = (el: SVGPathElement, name: string) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    setTip({ name, x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };

  const inset = useMemo(() => {
    const pts = map.departamentos.filter((d) => CORE.includes(d.municipio)).map((d) => d.centroide);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 2.4;
    return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
  }, [map]);

  const winner = (name: string) => {
    const d = byName.get(name);
    const first = d ? forcesOf(d)[0] : undefined;
    if (!d || !first) return null;
    const share = first.votos / positives(d);
    return { list: first, share, side: sideOf(forces, first), label: `${first.agrupacion} ${formatPercent(first.votos, positives(d))}` };
  };

  const active = tip?.name ?? selected;
  const paths = (zoom: boolean) =>
    map.departamentos
      .filter((d) => !zoom || GRAN_MENDOZA.includes(d.municipio))
      .map((d) => {
        const w = winner(d.municipio);
        const dim = active !== null && d.municipio !== active;
        const sel = d.municipio === selected;
        // When both forces' colors look alike, the second one's departments carry white stripes on top.
        const striped = forces.striped && !dim && w?.side === 1;
        return (
          <g key={d.municipio}>
            <path
              d={d.path}
              style={{ fill: dim ? "var(--color-chart-grid)" : w ? mapFill(forces, w.side, w.share) : "var(--color-chart-grid)" }}
              stroke="var(--color-background-primary-default)"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              role="button"
              tabIndex={zoom ? -1 : 0}
              aria-label={`${d.municipio}: ${w ? `ganó ${w.label}` : NO_VOTE}`}
              aria-pressed={sel}
              className="cursor-pointer outline-none transition-[fill] duration-150"
              onPointerEnter={(e) => e.pointerType === "mouse" && showTip(e.currentTarget, d.municipio)}
              onPointerLeave={() => setTip(null)}
              onFocus={(e) => showTip(e.currentTarget, d.municipio)}
              onBlur={() => setTip(null)}
              onClick={() => onSelect(sel ? null : d.municipio)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(sel ? null : d.municipio);
                }
              }}
            />
            {striped && <path d={d.path} fill={`url(#${zoom ? "stripes-zoom" : "stripes"})`} className="pointer-events-none" />}
          </g>
        );
      });

  const stripes = (id: string) => (
    <defs>
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="3" height="8" fill="rgb(255 255 255 / 0.55)" />
      </pattern>
    </defs>
  );

  const tipWinner = tip ? winner(tip.name) : null;
  const absent = map.departamentos.filter((d) => !byName.has(d.municipio)).length;
  return (
    <div className="flex flex-col gap-3">
      {absent > 0 && (
        <p className="text-body-regular text-text-secondary text-pretty">
          En esta elección este cargo se votó en {byName.size} de los {map.departamentos.length} departamentos. En gris claro, los que no lo
          eligieron en esta fecha.
        </p>
      )}
      <div ref={boxRef} className="relative grid grid-cols-[3fr_2fr] items-start gap-3 sm:gap-4">
        <svg
          viewBox={map.viewBox}
          className="block h-auto max-h-[24rem] w-full sm:max-h-[34rem]"
          role="group"
          aria-label="Quién ganó en cada departamento"
        >
          {stripes("stripes")}
          {paths(false)}
        </svg>
        <div className={cx(tileVariants({ size: "sm" }), "flex min-w-0 flex-col gap-1.5 overflow-hidden p-1.5 sm:p-2")}>
          <svg viewBox={inset} className="block aspect-square w-full overflow-hidden" aria-hidden>
            {stripes("stripes-zoom")}
            {paths(true)}
          </svg>
          <span className="px-1 text-caption-1-regular text-text-tertiary">Gran Mendoza, ampliado</span>
        </div>
        {tip && (
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-regular text-text-primary shadow-dropdown"
            style={{ top: tip.y - 8, left: tip.x }}
          >
            <span className="font-medium">{tip.name}</span>{" "}
            <span className="text-text-secondary">{tipWinner ? `ganó ${tipWinner.label}` : NO_VOTE}</span>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption-1-regular text-text-secondary">
        {forces.names.map((n, i) =>
          n ? (
            <li key={n} className="flex min-w-0 items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-full" style={sideStyle(forces, i as 0 | 1)} aria-hidden />
              <span className="truncate">
                Ganó {n}
                {forces.fallback[i] && " (sin color oficial)"}
              </span>
            </li>
          ) : null,
        )}
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full bg-chart-axis" aria-hidden />
          Ganó otra fuerza
        </li>
        {absent > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-full bg-chart-grid ring-1 ring-chart-axis ring-inset" aria-hidden />
            No votó este cargo
          </li>
        )}
        <li>Más oscuro, más votos para quien ganó</li>
      </ul>
    </div>
  );
}
