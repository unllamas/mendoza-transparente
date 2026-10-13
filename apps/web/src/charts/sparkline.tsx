import { useId } from "react";

/**
 * Trend minigraph, no axes: it goes next to a figure, it does not replace it. Kept as plain SVG on
 * purpose: Recharts would mount a ResponsiveContainer (ResizeObserver) per card on the home page for a
 * decorative shape that has no tooltip, and a viewBox already scales to any width without overflow.
 */
export function Sparkline({ values, width = 120, className = "w-28" }: { values: number[]; width?: number; className?: string }) {
  const gradientId = useId();
  if (values.length < 2) return null;
  const w = width;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 4 - ((v - min) / (max - min || 1)) * (h - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-auto max-w-full min-w-0 overflow-visible ${className}`} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-highlight)" stopOpacity={0.12} />
          <stop offset="100%" stopColor="var(--color-highlight)" stopOpacity={0.12} />
        </linearGradient>
      </defs>
      <path d={`${d}L${x(last).toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z`} fill={`url(#${gradientId})`} />
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-highlight" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} className="fill-highlight" />
    </svg>
  );
}
