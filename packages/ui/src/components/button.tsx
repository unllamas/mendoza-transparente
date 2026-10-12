import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Buttons and button-looking links. Everything clickable is visible before hover (there is no hover on phones):
 * - primary: filled brand color, the main action of a screen.
 * - secondary: border + grey fill, for the rest of the actions (and every icon-only button).
 * - ghost: no border, only inside another control (a menu row, a toolbar).
 * - link: text in link color, underlined on hover.
 * Sizes keep the 44 px touch target (`default`, `icon`); `sm` only where there is room around it.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-hover",
        secondary: "border border-line bg-tile text-ink hover:border-link hover:text-link",
        ghost: "text-ink-2 hover:bg-tile hover:text-ink",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4",
        sm: "min-h-9 px-3",
        icon: "size-11",
        inline: "p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

/** `asChild` renders the child (a router `Link`, an `<a>`) with the button styles. */
export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : (type ?? "button")} {...props} />;
}
