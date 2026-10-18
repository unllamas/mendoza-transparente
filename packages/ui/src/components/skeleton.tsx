import { cx } from "@mt/ui/lib/cx";
import type { CSSProperties } from "react";

/**
 * Holds the place of a block whose data has not arrived yet, so nothing moves when it does. Give it the size of what
 * it replaces (`h-*`, `aspect-*`, `min-h-*`): a skeleton of the wrong height still shifts the page.
 * Hidden from screen readers; the block that loads announces itself.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden style={style} className={cx("rounded-lg bg-background-tertiary-default motion-safe:animate-pulse", className)} />;
}

/**
 * A line of text while it loads: as tall as a line of the text it replaces (pass its `text-*` class) and as wide
 * as `w-*` says (half by default).
 */
export function SkeletonText({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("flex h-[1lh] w-1/2 items-center", className)}>
      <span className="h-[0.75em] w-full rounded-md bg-background-tertiary-default motion-safe:animate-pulse" />
    </span>
  );
}
