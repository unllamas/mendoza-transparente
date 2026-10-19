import { cx, sortCx } from "@mt/ui/lib/cx";
import type { HTMLAttributes, Ref } from "react";

/**
 * Figma source: Board UI → dashboard 1 status dropdown dots (node 3731:3266).
 *
 * 12×12 status indicator: a 6px solid dot centered on a tinted halo.
 * Color pairs from Figma variables:
 *   green  → halo color/green/100,  dot color/green/500
 *   yellow → halo color/yellow/200, dot color/yellow/500
 *   indigo → halo color/indigo/100, dot color/indigo/500
 * In dark mode only the halo drops to 40% opacity; the center dot stays solid.
 */

/** Mendoza Transparente adds `red` and `gray` for the state of a source. */
type StatusDotColor = "green" | "yellow" | "indigo" | "red" | "gray";

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  color?: StatusDotColor;
  /** Slow blink of the center dot, to call attention to a live item. Off with reduced motion. */
  blinking?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

const styles = sortCx({
  base: "inline-flex size-3 shrink-0 items-center justify-center rounded-full",
  halo: {
    green: "bg-status-dot-green-halo",
    yellow: "bg-status-dot-yellow-halo",
    indigo: "bg-status-dot-indigo-halo",
    red: "bg-red-500/15",
    gray: "bg-neutral-400/20",
  },
  dot: {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    indigo: "bg-indigo-500",
    red: "bg-red-500",
    gray: "bg-neutral-400",
  },
});

export function StatusDot({ color = "green", blinking = false, className, ref, ...props }: StatusDotProps) {
  return (
    <span ref={ref} aria-hidden className={cx(styles.base, styles.halo[color], className)} {...props}>
      <span className={cx("size-1.5 rounded-full", styles.dot[color], blinking && "motion-safe:animate-blink")} />
    </span>
  );
}
