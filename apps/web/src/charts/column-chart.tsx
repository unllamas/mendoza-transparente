import { useState } from "react";

export interface Columna {
  etiqueta: string;
  valor: number;
  /** Texto secundario para la lectura del valor activo (por ejemplo, el monto nominal). */
  detalle?: string;
}

/**
 * Columnas verticales de una sola serie, para montos por año. La lectura de arriba muestra el valor
 * de la columna activa (la última por defecto; la que se toca o se señala con el mouse). Las columnas
 * en cero quedan marcadas sobre la línea base para que se note el año vacío.
 */
export function ColumnChart({
  columnas,
  formatValue,
  alto = 128,
  ariaLabel,
}: {
  columnas: Columna[];
  formatValue: (v: number) => string;
  alto?: number;
  ariaLabel: string;
}) {
  const ultima = columnas.length - 1;
  const [activa, setActiva] = useState(ultima);
  const max = Math.max(...columnas.map((c) => c.valor), 1);
  const c = columnas[activa] ?? columnas[ultima];
  if (!c) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10 flex-col" aria-live="polite">
        <span className="text-xs text-ink-muted">{c.etiqueta}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-semibold tabular-nums">{c.valor ? formatValue(c.valor) : "Sin adjudicaciones"}</span>
          {c.detalle && c.valor > 0 && <span className="text-xs text-ink-muted">{c.detalle}</span>}
        </span>
      </div>

      <div role="list" aria-label={ariaLabel} className="flex items-end gap-1" style={{ height: alto }}>
        {columnas.map((col, i) => (
          <button
            key={col.etiqueta}
            type="button"
            role="listitem"
            aria-label={`${col.etiqueta}: ${col.valor ? formatValue(col.valor) : "sin adjudicaciones"}`}
            onPointerEnter={() => setActiva(i)}
            onFocus={() => setActiva(i)}
            onClick={() => setActiva(i)}
            onPointerLeave={() => setActiva(ultima)}
            className="group flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-opacity ${
                col.valor ? "bg-accent" : "bg-axis"
              } ${i === activa ? "opacity-100" : "opacity-55 group-hover:opacity-80"}`}
              style={{ height: col.valor ? `${Math.max((col.valor / max) * 100, 2)}%` : 2 }}
            />
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-t border-axis pt-1.5">
        {columnas.map((col, i) => (
          <span
            key={col.etiqueta}
            className={`min-w-0 flex-1 text-center text-[11px] tabular-nums ${i === activa ? "font-medium text-ink" : "text-ink-muted"}`}
          >
            {columnas.length > 8 ? `'${col.etiqueta.slice(-2)}` : col.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
