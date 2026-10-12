/** Minigráfico de tendencia, sin ejes: acompaña a una cifra, no la reemplaza. */
export function Sparkline({ values, width = 120, className = "w-28" }: { values: number[]; width?: number; className?: string }) {
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
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-accent" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} className="fill-accent" />
    </svg>
  );
}
