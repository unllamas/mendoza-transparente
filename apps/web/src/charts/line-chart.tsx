import { useLayoutEffect, useRef, useState } from "react";

export interface Band {
  desde: string;
  hasta: string | null;
  label: string;
}

interface Props {
  data: { fecha: string; valor: number }[];
  bands?: Band[];
  formatValue: (v: number) => string;
  formatDate: (fecha: string) => string;
  height?: number;
  ariaLabel: string;
}

const MARGIN = { top: 28, right: 16, bottom: 28, left: 56 };

/** Escala "linda" para el eje Y: 4-5 marcas redondas que cubren [0, max]. */
function niceTicks(max: number): number[] {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

/** Línea de una sola serie, con franjas temporales opcionales y tooltip con línea guía. */
export function LineChart({ data, bands = [], formatValue, formatDate, height = 280, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) return null;

  const t0 = Date.parse(data[0]!.fecha);
  const t1 = Date.parse(data.at(-1)!.fecha);
  const ticks = niceTicks(Math.max(...data.map((d) => d.valor)));
  const yMax = ticks.at(-1)!;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const x = (fecha: string) => MARGIN.left + ((Date.parse(fecha) - t0) / (t1 - t0)) * innerW;
  const y = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH;
  const clampX = (fecha: string) => Math.min(Math.max(x(fecha), MARGIN.left), MARGIN.left + innerW);

  const path = data.map((d, i) => `${i ? "L" : "M"}${x(d.fecha).toFixed(1)},${y(d.valor).toFixed(1)}`).join("");
  const years: number[] = [];
  const firstYear = new Date(t0).getUTCFullYear() + 1;
  const lastYear = new Date(t1).getUTCFullYear();
  const yearStep = innerW < 480 ? 2 : 1;
  for (let yr = firstYear; yr <= lastYear; yr += yearStep) years.push(yr);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + MARGIN.left;
    let best = 0;
    data.forEach((d, i) => {
      if (Math.abs(x(d.fecha) - px) < Math.abs(x(data[best]!.fecha) - px)) best = i;
    });
    setHover(best);
  }

  const active = hover !== null ? data[hover]! : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {bands.map((b, i) => {
          const bx0 = clampX(b.desde);
          const bx1 = b.hasta ? clampX(b.hasta) : MARGIN.left + innerW;
          if (bx1 - bx0 < 1) return null;
          return (
            <g key={i}>
              {i % 2 === 0 && (
                <rect x={bx0} y={MARGIN.top} width={bx1 - bx0} height={innerH} className="fill-grid" opacity={0.5} />
              )}
              <text x={(bx0 + bx1) / 2} y={MARGIN.top - 10} textAnchor="middle" className="fill-ink-muted text-[11px]">
                {b.label}
              </text>
            </g>
          );
        })}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-axis" : "stroke-grid"} />
            <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
              {formatValue(t)}
            </text>
          </g>
        ))}

        {years.map((yr) => (
          <text
            key={yr}
            x={x(`${yr}-01-01`)}
            y={height - 8}
            textAnchor="middle"
            className="fill-ink-muted text-[11px] tabular-nums"
          >
            {yr}
          </text>
        ))}

        <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-accent" />

        {active && (
          <g>
            <line x1={x(active.fecha)} x2={x(active.fecha)} y1={MARGIN.top} y2={MARGIN.top + innerH} className="stroke-axis" />
            <circle cx={x(active.fecha)} cy={y(active.valor)} r={4.5} strokeWidth={2} className="fill-accent stroke-surface" />
          </g>
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-sm"
          style={{
            left: Math.min(x(active.fecha) + 12, width - 160),
            top: Math.max(y(active.valor) - 56, 0),
          }}
        >
          <div className="text-ink-muted">{formatDate(active.fecha)}</div>
          <div className="font-semibold tabular-nums">{formatValue(active.valor)}</div>
        </div>
      )}
    </div>
  );
}
