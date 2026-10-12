import { useMemo, useState } from "react";

import type { MapaMendoza as MapaData } from "../types.ts";

/** Rampa secuencial borravino de poco a mucho; los valores por modo están en styles.css (--map-0 a --map-4). */
const RAMPA = Array.from({ length: 5 }, (_, i) => `var(--map-${i})`);

// Departamentos chicos del Gran Mendoza: se muestran ampliados en un recuadro.
const GRAN_MENDOZA = ["Capital", "Godoy Cruz", "Guaymallén", "Maipú", "Las Heras", "Luján de Cuyo"];
const NUCLEO = ["Capital", "Godoy Cruz", "Guaymallén"];

interface Props {
  mapa: MapaData;
  valores: Record<string, number>;
  formatValue: (v: number) => string;
  seleccionado: string | null;
  onSelect: (municipio: string | null) => void;
  /** Qué representa el color, para la leyenda ("Por habitante, 2025"). */
  leyenda: string;
}

/** Mapa coroplético de los 18 departamentos, con recuadro ampliado del Gran Mendoza. */
export function MapaMendoza({ mapa, valores, formatValue, seleccionado, onSelect, leyenda }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const nums = Object.values(valores);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  // Escala por cuantiles: cada tono agrupa una cantidad parecida de departamentos, así un valor
  // extremo (por ejemplo La Paz en coparticipación por habitante) no deja a todos los demás del mismo color.
  const ordenados = [...nums].sort((a, b) => a - b);
  const color = (v: number | undefined) => {
    if (v === undefined) return "var(--grid)";
    const rank = ordenados.findIndex((x) => x >= v);
    return RAMPA[Math.min(Math.floor((rank / ordenados.length) * RAMPA.length), RAMPA.length - 1)]!;
  };

  // Encuadre del recuadro: los centroides del núcleo del Gran Mendoza con margen.
  const inset = useMemo(() => {
    const pts = mapa.departamentos.filter((d) => NUCLEO.includes(d.municipio)).map((d) => d.centroide);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 2.4;
    return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
  }, [mapa]);

  const activo = hover ?? seleccionado;

  const paths = (zoom: boolean) =>
    mapa.departamentos
      .filter((d) => !zoom || GRAN_MENDOZA.includes(d.municipio))
      .map((d) => {
        const sel = d.municipio === seleccionado;
        return (
          <path
            key={d.municipio}
            d={d.path}
            style={{ fill: color(valores[d.municipio]) }}
            stroke={sel ? "var(--ink)" : "var(--surface)"}
            strokeWidth={sel ? (zoom ? 0.8 : 3) : zoom ? 0.3 : 1.2}
            vectorEffect="non-scaling-stroke"
            role="button"
            tabIndex={zoom ? -1 : 0}
            aria-label={`${d.municipio}: ${valores[d.municipio] !== undefined ? formatValue(valores[d.municipio]!) : "sin dato"}`}
            aria-pressed={sel}
            className="cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
            onPointerEnter={() => setHover(d.municipio)}
            onPointerLeave={() => setHover(null)}
            onClick={() => onSelect(sel ? null : d.municipio)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(sel ? null : d.municipio);
              }
            }}
          />
        );
      });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[3fr_2fr] items-start gap-3 sm:gap-4">
        <svg viewBox={mapa.viewBox} className="block h-auto max-h-[22rem] w-full sm:max-h-[36rem]" role="group" aria-label="Mapa de departamentos de Mendoza">
          {paths(false)}
        </svg>
        <div className="flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg bg-surface p-1.5 sm:p-2">
          <svg viewBox={inset} className="block aspect-square w-full overflow-hidden" aria-hidden>
            {paths(true)}
          </svg>
          <span className="px-1 text-xs text-ink-muted">Gran Mendoza, ampliado</span>
        </div>
      </div>

      <div className="flex min-h-11 flex-col justify-center rounded-lg bg-surface px-3 py-2 text-sm" aria-live="polite">
        {activo ? (
          <span>
            <span className="font-medium">{activo}</span>{" "}
            <span className="text-ink-2 tabular-nums">
              {valores[activo] !== undefined ? formatValue(valores[activo]!) : "sin dato"}
            </span>
          </span>
        ) : (
          <span className="text-ink-muted">Tocá un departamento para ver su dato.</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{leyenda}</span>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {RAMPA.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-ink-muted tabular-nums">
          <span>Menos · {formatValue(min)}</span>
          <span>{formatValue(max)} · Más</span>
        </div>
      </div>
    </div>
  );
}
