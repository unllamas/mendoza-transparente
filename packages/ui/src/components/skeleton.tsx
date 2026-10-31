import { cx } from "@mt/ui/lib/cx";
import type { CSSProperties } from "react";

/**
 * Guarda el lugar de un bloque cuyos datos todavía no llegaron, para que nada se mueva cuando llegan. Va con el
 * tamaño de lo que reemplaza (`h-*`, `aspect-*`, `min-h-*`): un skeleton de otro alto sigue moviendo la página.
 * Ocupa su lugar desde el principio pero se ve recién a los 150 ms, así una respuesta rápida no parpadea.
 * Oculto para los lectores de pantalla: el bloque que llega se anuncia solo.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={style}
      className={cx("animate-skeleton-in rounded-lg bg-background-tertiary-default motion-safe:animate-skeleton", className)}
    />
  );
}

/**
 * Una línea de texto mientras carga: tan alta como una línea del texto que reemplaza (pasarle su clase `text-*`) y
 * tan ancha como dice `w-*` (la mitad por defecto). La barra va de la línea de base a la altura de las mayúsculas,
 * donde caen las letras de verdad, en vez de quedar centrada en la línea.
 */
export function SkeletonText({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("block h-[1lh] w-1/2", className)}>
      <span className="inline-block h-[1cap] w-full animate-skeleton-in rounded-md bg-background-tertiary-default align-baseline motion-safe:animate-skeleton" />
    </span>
  );
}
