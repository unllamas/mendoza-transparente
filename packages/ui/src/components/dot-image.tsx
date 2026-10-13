import { cx } from "@mt/ui/lib/cx";
import type { CSSProperties } from "react";

/**
 * A photo seen through a grid of dots: each dot takes the color of the photo under it.
 * Pure CSS (a repeated radial mask over the image), so it is prerendered and needs no JavaScript.
 * The photo can be small (~480 px): the dots hide the detail. Decorative, so `alt=""`.
 * Size it with `className` (`h-64 w-full`, `aspect-[3/1]`…).
 */
export function DotImage({
  src,
  dotSize = 7,
  focus = "center",
  fade = true,
  className,
}: {
  src: string;
  /** Distance between dot centers, in px. */
  dotSize?: number;
  /** Which part stays in view when the box crops the photo (CSS `object-position`). */
  focus?: string;
  /** Fades the bottom into the page background. */
  fade?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("relative overflow-hidden", fade && "mask-b-from-45%", className)} aria-hidden>
      <img
        src={src}
        alt=""
        decoding="async"
        className="absolute inset-0 size-full object-cover contrast-110 saturate-125 [mask-image:radial-gradient(circle_closest-side,#000_82%,transparent_96%)] [mask-size:var(--dot)_var(--dot)]"
        style={{ objectPosition: focus, "--dot": `${dotSize}px` } as CSSProperties}
      />
    </div>
  );
}
