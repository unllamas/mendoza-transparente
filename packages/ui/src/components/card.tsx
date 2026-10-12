import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/** Informative block: background only, no border (the border is reserved for what can be tapped). */
export function Tile({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl bg-tile p-4", className)} {...props} />;
}

/**
 * Clickable card: border + surface, border in link color on hover. Pass the link or button as the child with
 * `asChild` (`<CardLink asChild><Link to="…">…</Link></CardLink>`) so the whole card is the target.
 */
export function CardLink({ className, asChild = false, ...props }: ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "a";
  return <Comp className={cn("group flex min-h-11 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-link", className)} {...props} />;
}
