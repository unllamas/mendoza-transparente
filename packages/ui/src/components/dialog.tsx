import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps, ReactNode } from "react";

import { useScrollLock } from "../hooks/use-scroll-lock.ts";
import { cn } from "../lib/utils.ts";

/**
 * Full-screen or centered window (the search, the mobile menu): focus stays inside, Escape closes it and the
 * page behind does not scroll. Mount it to open it. For detail panels use `Sheet`.
 */
export function Dialog({
  label,
  onClose,
  children,
  className,
  overlayClassName,
  onOpenAutoFocus,
}: {
  /** Accessible name ("Buscar", "Menú"). */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Classes of the dark layer behind; omit it to have none (full-screen windows). */
  overlayClassName?: string;
  onOpenAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>["onOpenAutoFocus"];
}) {
  useScrollLock(true);
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {overlayClassName && <DialogPrimitive.Overlay className={overlayClassName} />}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn("fixed outline-none", className)}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
