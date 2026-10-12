/** Barras horizontales de una sola serie, ordenadas, con etiqueta y valor visibles en cada fila. */
export function BarList({
  items,
  formatValue,
}: {
  items: { nombre: string; valor: number; detalle?: string; destacado?: boolean }[];
  formatValue: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.nombre} className="group flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={item.destacado ? "font-semibold text-ink" : "text-ink-2 group-hover:text-ink"}>
              {item.nombre}
            </span>
            <span className="font-medium tabular-nums">
              {formatValue(item.valor)}
              {item.detalle && <span className="ml-2 font-normal text-ink-muted">{item.detalle}</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-grid/60">
            <div
              className={`h-full rounded-full transition-opacity group-hover:opacity-80 ${
                item.destacado || !items.some((i) => i.destacado) ? "bg-accent" : "bg-axis"
              }`}
              style={{ width: `${Math.max((item.valor / max) * 100, 0.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
