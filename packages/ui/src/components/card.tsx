import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Informative block: background only, no border (the border is reserved for what can be tapped).
 * Sizes: `sm` for a figure inside a grid, `default` for a block, `lg` for a section of a page.
 */
export const tileVariants = cva("bg-tile", {
  variants: { size: { sm: "rounded-lg p-3", default: "rounded-xl p-4", lg: "rounded-2xl p-5" } },
  defaultVariants: { size: "default" },
});

export function Tile({ className, size, asChild = false, ...props }: ComponentProps<"div"> & VariantProps<typeof tileVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return <Comp className={cn(tileVariants({ size }), className)} {...props} />;
}

/**
 * Clickable card: border + surface, border in link color on hover. Apply it to the link or button itself
 * (`className={cardVariants()}` or `<CardLink asChild><Link …/></CardLink>`) so the whole card is the target.
 */
export const cardVariants = cva("group min-h-11 border border-line bg-surface text-left transition-colors hover:border-link", {
  variants: { size: { default: "rounded-xl p-4", lg: "rounded-2xl p-5" } },
  defaultVariants: { size: "default" },
});

export function CardLink({ className, size, asChild = false, ...props }: ComponentProps<"a"> & VariantProps<typeof cardVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "a";
  return <Comp className={cn(cardVariants({ size }), className)} {...props} />;
}
