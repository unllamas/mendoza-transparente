import { tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { MapaMendoza as MapaData } from "@/types.ts";

/** Sequential celeste ramp, from little to a lot; the values per theme are in @mt/ui styles/mt.css (--color-map-0 to --color-map-4). */
const RAMPA = Array.from({ length: 5 }, (_, i) => `var(--color-map-${i})`);

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
  // Tooltip anchored above the hovered (mouse) or focused (keyboard) department; a tap selects instead.
  const [tip, setTip] = useState<{ municipio: string; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const showTip = (el: SVGPathElement, municipio: string) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    setTip({ municipio, x: r.left + r.width / 2 - box.left, y: r.top - box.top });
  };
  // Keep the tooltip inside the map: shift it sideways when the department is near an edge.
  useLayoutEffect(() => {
    const el = tipRef.current;
    const width = boxRef.current?.clientWidth;
    if (!tip || !el || !width) return;
    el.style.left = `${Math.min(Math.max(tip.x - el.offsetWidth / 2, 0), width - el.offsetWidth)}px`;
  }, [tip]);
  const nums = Object.values(valores);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  // Escala por cuantiles: cada tono agrupa una cantidad parecida de departamentos, así un valor
  // extremo (por ejemplo La Paz en coparticipación por habitante) no deja a todos los demás del mismo color.
  const ordenados = [...nums].sort((a, b) => a - b);
  const color = (v: number | undefined) => {
    if (v === undefined) return "var(--color-chart-grid)";
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
            stroke={sel ? "var(--color-text-primary)" : "var(--color-background-primary-default)"}
            strokeWidth={sel ? 3 : 1.2}
            vectorEffect="non-scaling-stroke"
            role="button"
            tabIndex={zoom ? -1 : 0}
            aria-label={`${d.municipio}: ${valores[d.municipio] !== undefined ? formatValue(valores[d.municipio]!) : "sin dato"}`}
            aria-pressed={sel}
            className="cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
            onPointerEnter={(e) => e.pointerType === "mouse" && showTip(e.currentTarget, d.municipio)}
            onPointerLeave={() => setTip(null)}
            onFocus={(e) => showTip(e.currentTarget, d.municipio)}
            onBlur={() => setTip(null)}
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
      <div ref={boxRef} className="relative grid grid-cols-[3fr_2fr] items-start gap-3 sm:gap-4">
        <svg
          viewBox={mapa.viewBox}
          className="block h-auto max-h-[22rem] w-full sm:max-h-[36rem]"
          role="group"
          aria-label="Mapa de departamentos de Mendoza"
        >
          {paths(false)}
        </svg>
        <div className={cx(tileVariants({ size: "sm" }), "flex min-w-0 flex-col gap-1.5 overflow-hidden p-1.5 sm:p-2")}>
          <svg viewBox={inset} className="block aspect-square w-full overflow-hidden" aria-hidden>
            {paths(true)}
          </svg>
          <span className="px-1 text-caption-1-regular text-text-tertiary">Gran Mendoza, ampliado</span>
        </div>
        {tip && (
          <div
            ref={tipRef}
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-regular text-text-primary shadow-dropdown"
            style={{ top: tip.y - 8, left: tip.x }}
          >
            <span className="font-medium">{tip.municipio}</span>{" "}
            <span className="text-text-secondary tabular-nums">
              {valores[tip.municipio] !== undefined ? formatValue(valores[tip.municipio]!) : "sin dato"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption-1-regular text-text-tertiary">{leyenda}</span>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {RAMPA.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <div className="flex justify-between text-caption-1-regular text-text-tertiary tabular-nums">
          <span>Menos · {formatValue(min)}</span>
          <span>{formatValue(max)} · Más</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Locator map: every department dimmed except `focus`, highlighted in the brand color. Other departments
 * are links to their own page (`onOpen`), so the map doubles as navigation between municipalities.
 */
export function MunicipalityLocator({ mapa, focus, onOpen }: { mapa: MapaData; focus: string; onOpen: (municipio: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const zoomed = GRAN_MENDOZA.includes(focus);
  const inset = useMemo(() => {
    const pts = mapa.departamentos.filter((d) => NUCLEO.includes(d.municipio)).map((d) => d.centroide);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 2.4;
    return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
  }, [mapa]);

  const paths = (zoom: boolean) =>
    mapa.departamentos
      .filter((d) => !zoom || GRAN_MENDOZA.includes(d.municipio))
      .map((d) => {
        const isFocus = d.municipio === focus;
        const isHover = d.municipio === hover && !isFocus;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover only highlights; the same action is available from the list.
          <path
            key={d.municipio}
            d={d.path}
            style={{ fill: isFocus ? "var(--color-highlight)" : isHover ? "var(--color-map-1)" : "var(--color-chart-grid)" }}
            stroke="var(--color-background-primary-default)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
            role={isFocus ? "img" : "link"}
            tabIndex={isFocus || zoom ? -1 : 0}
            aria-label={isFocus ? `${d.municipio}, seleccionado` : `Ir a ${d.municipio}`}
            className={isFocus ? "" : "cursor-pointer outline-none"}
            onPointerEnter={() => setHover(d.municipio)}
            onPointerLeave={() => setHover(null)}
            onClick={() => !isFocus && onOpen(d.municipio)}
            onKeyDown={(e) => {
              if (!isFocus && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onOpen(d.municipio);
              }
            }}
          />
        );
      });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[3fr_2fr] items-start gap-3">
        <svg
          viewBox={mapa.viewBox}
          className="block h-auto max-h-[22rem] w-full"
          role="group"
          aria-label={`Ubicación de ${focus} en Mendoza`}
        >
          {paths(false)}
        </svg>
        <div className={cx(tileVariants({ size: "sm" }), "flex min-w-0 flex-col gap-1.5 overflow-hidden p-1.5", !zoomed && "opacity-70")}>
          <svg viewBox={inset} className="block aspect-square w-full overflow-hidden" aria-hidden>
            {paths(true)}
          </svg>
          <span className="px-1 text-caption-1-regular text-text-tertiary">Gran Mendoza, ampliado</span>
        </div>
      </div>
      <span className="min-h-5 truncate text-caption-1-regular text-text-tertiary" aria-live="polite">
        {hover && hover !== focus ? `Ir a ${hover} ›` : "Tocá otro departamento para ir a su página."}
      </span>
    </div>
  );
}
