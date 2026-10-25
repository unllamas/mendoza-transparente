import { useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Columna } from "./column-chart.tsx";
import { useReducedMotion } from "./use-reduced-motion.ts";

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
}

/** Bar rounded at the end away from zero: up for a rise, down for a fall. Recharts gives falls a negative height. */
function ChangeShape({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity }: BarShapeProps) {
  const h = Math.abs(height);
  if (!h) return <rect x={x} y={y - 1} width={width} height={2} rx={1} fill="var(--color-chart-axis)" />;
  const top = Math.min(y, y + height);
  const r = Math.min(4, width / 2, h);
  const d =
    height > 0
      ? `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${top + h}Z`
      : `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + width - r}Q${x + width},${top + h} ${x + width},${top + h - r}V${top}Z`;
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}

/**
 * Columns that go up or down from a zero line: how much something rose or fell in each period. Same
 * reading as ColumnChart (the active column on top, the last one by default); the sign is in the text,
 * not only in the direction of the bar.
 */
export function ChangeChart({
  columnas,
  formatValue,
  formatTick = (label) => label,
  ticks,
  alto = 160,
  ariaLabel,
}: {
  columnas: Columna[];
  /** Signed value with its unit ("+860 cargos", "−1.540 cargos"). */
  formatValue: (v: number) => string;
  /** Short X axis label ("'19"). */
  formatTick?: (etiqueta: string) => string;
  /** Labels shown on the X axis (all of them if omitted). */
  ticks?: string[];
  alto?: number;
  ariaLabel: string;
}) {
  const last = columnas.length - 1;
  const [active, setActive] = useState(last);
  const reducedMotion = useReducedMotion();
  const extent = Math.max(...columnas.map((c) => Math.abs(c.valor)), 1);
  const c = columnas[active] ?? columnas[last];
  if (!c) return null;

  function select(state: { activeTooltipIndex?: number | string | null }) {
    const index = Number(state.activeTooltipIndex);
    if (Number.isInteger(index) && index >= 0 && index <= last) setActive(index);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10 flex-col" aria-live="polite">
        <span className="text-caption-1-regular text-text-tertiary">{c.etiqueta}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-title-3-semibold whitespace-nowrap tabular-nums">{formatValue(c.valor)}</span>
          {c.detalle && <span className="text-caption-1-regular text-text-tertiary">{c.detalle}</span>}
        </span>
      </div>

      <div className="w-full min-w-0 touch-pan-y" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={alto + 24}>
          <BarChart
            data={columnas}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="18%"
            onMouseMove={select}
            onTouchMove={select}
            onClick={select}
            onMouseLeave={() => setActive(last)}
          >
            <YAxis hide domain={[-extent, extent]} />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              ticks={ticks}
              interval={ticks ? 0 : "preserveStartEnd"}
              tickFormatter={formatTick}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            />
            <ReferenceLine y={0} stroke="var(--color-chart-axis)" />
            <Tooltip content={() => null} isAnimationActive={false} cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }} />
            <Bar
              dataKey="valor"
              fill="var(--color-highlight)"
              shape={<ChangeShape />}
              isAnimationActive={!reducedMotion}
              animationDuration={450}
            >
              {columnas.map((col, i) => (
                <Cell key={col.etiqueta} fillOpacity={i === active ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="sr-only">
        {columnas.map((col) => (
          <li key={col.etiqueta}>
            {col.etiqueta}: {formatValue(col.valor)}
          </li>
        ))}
      </ul>
    </div>
  );
}
