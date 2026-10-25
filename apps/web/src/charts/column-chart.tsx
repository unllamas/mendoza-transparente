import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "./use-reduced-motion.ts";

export interface Columna {
  etiqueta: string;
  valor: number;
  /** Texto secundario para la lectura del valor activo (por ejemplo, el monto nominal). */
  detalle?: string;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  value?: number | [number, number];
}

/** Bar with rounded top corners; an empty year is a thin line on the baseline so it still shows. */
function ColumnShape({ x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, value }: BarShapeProps) {
  if (!value) {
    return <rect x={x} y={y - 2} width={width} height={2} rx={1} fill="var(--color-chart-axis)" />;
  }
  const r = Math.min(4, width / 2, height);
  const d = `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}

/**
 * Vertical columns of a single series, for amounts per year. The reading on top shows the value of the
 * active column (the last one by default; the one that is tapped, focused or pointed at). Columns at
 * zero stay marked on the baseline so the empty year is noticeable.
 */
export function ColumnChart({
  columnas,
  formatValue,
  alto = 128,
  ariaLabel,
  inicial,
}: {
  columnas: Columna[];
  formatValue: (v: number) => string;
  alto?: number;
  ariaLabel: string;
  /** Column read out when nothing is pointed at (the last one by default): the year the page is about. */
  inicial?: number;
}) {
  const last = columnas.length - 1;
  const rest = inicial !== undefined && inicial >= 0 && inicial <= last ? inicial : last;
  const [active, setActive] = useState(rest);
  const reducedMotion = useReducedMotion();
  const max = Math.max(...columnas.map((c) => c.valor), 1);
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
          <span className="text-title-3-semibold tabular-nums">{c.valor ? formatValue(c.valor) : "Sin adjudicaciones"}</span>
          {c.detalle && c.valor > 0 && <span className="text-caption-1-regular text-text-tertiary">{c.detalle}</span>}
        </span>
      </div>

      <div className="w-full min-w-0 touch-pan-y" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={alto + 24}>
          <BarChart
            data={columnas}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={columnas.length > 8 ? "18%" : "28%"}
            onMouseMove={select}
            onTouchMove={select}
            onClick={select}
            onMouseLeave={() => setActive(rest)}
          >
            <YAxis hide domain={[0, max]} />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-axis)" }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={4}
              tickFormatter={(label: string) => (columnas.length > 8 ? label.replace(/^\d{2}(\d{2})/, "'$1") : label)}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            />
            <Tooltip content={() => null} isAnimationActive={false} cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }} />
            <Bar
              dataKey="valor"
              fill="var(--color-highlight)"
              shape={<ColumnShape />}
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
            {col.etiqueta}: {col.valor ? formatValue(col.valor) : "sin adjudicaciones"}
          </li>
        ))}
      </ul>
    </div>
  );
}
