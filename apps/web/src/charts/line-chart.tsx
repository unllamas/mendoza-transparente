import { tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { useId } from "react";
import { Area, ComposedChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "./use-reduced-motion.ts";

export interface Band {
  desde: string;
  hasta: string | null;
  label: string;
}

interface Props {
  data: { fecha: string; valor: number }[];
  bands?: Band[];
  /** Valor completo, para el tooltip ("US$ 775 M"). */
  formatValue: (v: number) => string;
  /** Valor corto para el eje Y, sin unidad ("775"): la unidad va en el título del gráfico. */
  formatAxis?: (v: number) => string;
  formatDate: (fecha: string) => string;
  height?: number;
  ariaLabel: string;
}

const TICK = { fontSize: 11, fill: "var(--color-text-tertiary)" };
// Approximate width of one 11px character, to reserve room for the Y axis labels.
const CHAR_W = 6.6;

/** Round scale for the Y axis: 4-5 round marks that cover [0, max]. */
function niceTicks(max: number): number[] {
  const raw = max / 4 || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if ((ticks.at(-1) ?? 0) < max) ticks.push((ticks.at(-1) ?? 0) + step);
  return ticks;
}

interface Point {
  t: number;
  fecha: string;
  valor: number;
}

/** Single-series area line over time, with optional alternating period bands and an active-point card. */
export function LineChart({ data, bands = [], formatValue, formatAxis = formatValue, formatDate, height = 280, ariaLabel }: Props) {
  const gradientId = useId();
  const reducedMotion = useReducedMotion();
  if (data.length === 0) return null;

  const points: Point[] = data.map((d) => ({ t: Date.parse(d.fecha), fecha: d.fecha, valor: d.valor }));
  const t0 = points[0]!.t;
  const t1 = points.at(-1)!.t;
  const yTicks = niceTicks(Math.max(...points.map((p) => p.valor)));
  const yMax = yTicks.at(-1)!;
  const yWidth = Math.max(...yTicks.map((v) => formatAxis(v).length)) * CHAR_W + 14;

  const startYear = new Date(t0).getUTCFullYear();
  const firstYear = Date.parse(`${startYear}-01-01`) >= t0 ? startYear : startYear + 1;
  const lastYear = new Date(t1).getUTCFullYear();
  // One year label every ~48px at least, in round steps, so labels never overlap (width approximated at 320px).
  const span = Math.max(lastYear - firstYear, 1);
  const yearStep = [1, 2, 5, 10, 20].find((s) => (280 / span) * s >= 48) ?? 20;
  const xTicks: number[] = [];
  for (let yr = firstYear; yr <= lastYear; yr++) if ((yr - firstYear) % yearStep === 0) xTicks.push(Date.parse(`${yr}-01-01`));

  const clamp = (t: number) => Math.min(Math.max(t, t0), t1);
  const visibleBands = bands
    .map((b) => ({ ...b, x1: clamp(Date.parse(b.desde)), x2: b.hasta ? clamp(Date.parse(b.hasta)) : t1 }))
    .filter((b) => b.x2 > b.x1);

  return (
    <div className="w-full min-w-0" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points} margin={{ top: 28, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <defs>
            {/* Flat, faint fill (no fade: diseno.md avoids gradients). */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-highlight)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--color-highlight)" stopOpacity={0.12} />
            </linearGradient>
          </defs>

          {visibleBands.map((b, i) => (
            <ReferenceArea
              key={`${b.desde}-${i}`}
              x1={b.x1}
              x2={b.x2}
              ifOverflow="hidden"
              fill="var(--color-chart-grid)"
              fillOpacity={i % 2 === 0 ? 0.5 : 0}
              stroke="none"
              label={({ viewBox }: { viewBox?: { x?: number; y?: number; width?: number } }) => {
                const { x = 0, y = 0, width = 0 } = viewBox ?? {};
                if (!b.label || width <= b.label.length * 6.5 + 8) return <g />;
                return (
                  <text x={x + width / 2} y={y - 10} textAnchor="middle" fontSize={11} fill="var(--color-text-tertiary)">
                    {b.label}
                  </text>
                );
              }}
            />
          ))}

          <YAxis
            width={yWidth}
            domain={[0, yMax]}
            ticks={yTicks}
            tickFormatter={formatAxis}
            tickLine={false}
            axisLine={false}
            tick={TICK}
          />
          <XAxis
            type="number"
            dataKey="t"
            scale="time"
            domain={[t0, t1]}
            ticks={xTicks}
            tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={16}
            tick={TICK}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }}
            allowEscapeViewBox={{ x: false, y: true }}
            offset={14}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!point) return null;
              return (
                <div className={cx(tileVariants({ size: "sm", floating: true }), "pointer-events-none px-3 py-2 text-body-regular")}>
                  <div className="text-text-tertiary">{formatDate(point.fecha)}</div>
                  <div className="font-semibold tabular-nums">{formatValue(point.valor)}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="var(--color-highlight)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4.5, strokeWidth: 2, fill: "var(--color-highlight)", stroke: "var(--color-background-primary-default)" }}
            isAnimationActive={!reducedMotion}
            animationDuration={450}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
