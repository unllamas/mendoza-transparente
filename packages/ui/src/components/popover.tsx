import { cx } from "@mt/ui/lib/cx";
import type { ComponentProps } from "react";
import { Popover as AriaPopover, Button, Dialog, DialogTrigger } from "react-aria-components";

/**
 * Small floating note anchored to a control (the explanation of a flag), on React Aria. It opens on tap, never on
 * hover only, and moves itself to stay inside the screen: it never causes horizontal scroll.
 *
 *   <Popover>
 *     <PopoverTrigger className="…">Label</PopoverTrigger>
 *     <PopoverContent>Text</PopoverContent>
 *   </Popover>
 *
 * While open, the trigger has `aria-expanded="true"` (style it with `aria-expanded:`).
 */
export const Popover = DialogTrigger;

export function PopoverTrigger({ className, ...props }: Omit<ComponentProps<typeof Button>, "className"> & { className?: string }) {
  return (
    <Button className={cx("cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring", className)} {...props} />
  );
}

export function PopoverContent({ className, children }: { className?: string; children: ComponentProps<typeof Dialog>["children"] }) {
  return (
    <AriaPopover
      placement="bottom start"
      offset={6}
      containerPadding={16}
      className={cx(
        "z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-regular text-text-secondary text-pretty shadow-dropdown outline-none",
        className,
      )}
    >
      <Dialog className="outline-none">{children}</Dialog>
    </AriaPopover>
  );
}
