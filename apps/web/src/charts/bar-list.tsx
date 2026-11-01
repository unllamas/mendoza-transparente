import type { ReactNode } from "react";
import { useReducedMotion } from "./use-reduced-motion.ts";

/**
 * Barra de proporción: `value` sobre `of`, con el fondo (`chart-track`) visible para que se lea cuánto falta para el
 * total. Toda barra horizontal del sitio usa esta, para que el fondo y la escala sean siempre los mismos.
 */
export function ProportionBar({
  value,
  of,
  muted = false,
  className = "h-2",
}: {
  value: number;
  /** Lo que vale la barra llena. */
  of: number;
  /** En gris, para lo que no es lo destacado. */
  muted?: boolean;
  /** Alto de la barra. */
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const pct = of > 0 ? Math.min(Math.max((value / of) * 100, 0.5), 100) : 0;
  return (
    <div className={`overflow-hidden rounded-full bg-chart-track ${className}`}>
      <div
        className={`h-full rounded-full ${reducedMotion ? "" : "transition-[width,opacity] duration-300"} group-hover:opacity-80 ${
          muted ? "bg-chart-axis" : "bg-highlight"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Barras horizontales de una sola serie, ordenadas, con el nombre y el valor a la vista en cada fila.
 *
 * `total` es obligatorio para que cada uso decida qué es la barra llena (docs/procesos/diseno.md, «Gráficos»):
 * - Un número: el total del que cada fila es una parte (todos los viajes, todo lo recaudado). Cada barra mide su
 *   porcentaje y, si la fila no trae `detalle`, se escribe solo («41 %»). Va aunque se muestren solo las primeras.
 * - `"max"`: solo cuando los valores no se suman (una tasa por cada mil habitantes): la barra llena es la más grande.
 */
export function BarList({
  items,
  formatValue,
  total,
}: {
  /**
   * `etiqueta` reemplaza el nombre visible (por ejemplo, con un término del glosario); `nombre` queda como clave y título.
   * `cara` va a la izquierda (la de una persona) y `nota` es una segunda línea debajo del nombre (su cargo).
   */
  items: {
    nombre: string;
    etiqueta?: ReactNode;
    valor: number;
    detalle?: string;
    destacado?: boolean;
    cara?: ReactNode;
    nota?: string;
  }[];
  formatValue: (v: number) => string;
  total: number | "max";
}) {
  const of = total === "max" ? Math.max(...items.map((i) => i.valor)) : total;
  const hasHighlight = items.some((i) => i.destacado);
  const share = (v: number) => (total === "max" || !total ? undefined : `${Math.round((v / total) * 100)} %`);
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const detalle = item.detalle ?? share(item.valor);
        return (
          <li key={item.nombre} className="group flex items-center gap-3">
            {item.cara}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-body-regular">
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`truncate ${item.destacado ? "font-semibold text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}
                    title={item.nombre}
                  >
                    {item.etiqueta ?? item.nombre}
                  </span>
                  {item.nota && <span className="truncate text-caption-1-regular text-text-tertiary">{item.nota}</span>}
                </span>
                <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                  {formatValue(item.valor)}
                  {detalle && <span className="ml-2 font-normal text-text-tertiary">{detalle}</span>}
                </span>
              </div>
              <ProportionBar value={item.valor} of={of} muted={hasHighlight && !item.destacado} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
