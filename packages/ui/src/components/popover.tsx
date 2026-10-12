import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Small floating note anchored to a control (the explanation of a flag). It opens on tap, never on hover only,
 * and moves itself to stay inside the screen: it never causes horizontal scroll.
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2 text-pretty shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
