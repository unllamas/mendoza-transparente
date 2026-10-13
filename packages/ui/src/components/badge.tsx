import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Short labels on one line: a topic, a state, a flag. Informative badges have no border (a border means
 * clickable); `warning` is the amber of signals, always with an icon next to the text.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-tile text-ink-2",
        brand: "bg-brand/10 text-link",
        warning: "bg-aviso-fondo text-ink [&_svg]:text-aviso",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "neutral", size: "default" },
  },
);

export function Badge({ className, variant, size, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
