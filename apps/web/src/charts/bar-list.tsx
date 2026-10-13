import { useReducedMotion } from "./use-reduced-motion.ts";

/** Horizontal bars of a single series, sorted, with label and value visible on every row. */
export function BarList({
  items,
  formatValue,
}: {
  items: { nombre: string; valor: number; detalle?: string; destacado?: boolean }[];
  formatValue: (v: number) => string;
}) {
  const reducedMotion = useReducedMotion();
  const max = Math.max(...items.map((i) => i.valor));
  const hasHighlight = items.some((i) => i.destacado);
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.nombre} className="group flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-body-regular">
            <span className={item.destacado ? "font-semibold text-text-primary" : "text-text-secondary group-hover:text-text-primary"}>
              {item.nombre}
            </span>
            <span className="font-medium tabular-nums">
              {formatValue(item.valor)}
              {item.detalle && <span className="ml-2 font-normal text-text-tertiary">{item.detalle}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-background-secondary-default">
            <div
              className={`h-full rounded ${reducedMotion ? "" : "transition-[width,opacity] duration-300"} group-hover:opacity-80 ${
                item.destacado || !hasHighlight ? "bg-highlight" : "bg-chart-axis"
              }`}
              style={{ width: `${Math.max((item.valor / max) * 100, 0.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
