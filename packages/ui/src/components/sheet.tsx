import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useLayoutEffect, useState, useSyncExternalStore } from "react";

import { useScrollLock } from "../hooks/use-scroll-lock.ts";
import { cn } from "../lib/utils.ts";
import { IconButton } from "./icon-button.tsx";

// Stack of open sheets, in the order they were mounted. Only the topmost one is shown: two modal dialogs open
// at once hide each other from screen readers (each marks everything else aria-hidden). When the top one
// closes, the one below comes back.
let sequence = 0;
const openSheets = new Set<number>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const topSheet = () => Math.max(-1, ...openSheets);

function useIsTopSheet() {
  const [id] = useState(() => ++sequence);
  useLayoutEffect(() => {
    openSheets.add(id);
    emit();
    return () => {
      openSheets.delete(id);
      emit();
    };
  }, [id]);
  const top = useSyncExternalStore(subscribe, topSheet, () => -1);
  return top === -1 || top === id;
}

/**
 * Modal sheet on the right, over the whole page (full width on phones). Mount it to open it, call `onClose` to
 * close it. When two are stacked (a case over a signal), only the top one is shown; Escape, the X and tapping
 * outside close it and the one below comes back. Focus stays inside while it is open. Header of 56 px with the title and the close button.
 */
export function Sheet({
  title,
  onClose,
  children,
  header,
  className,
  closeProps,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra controls in the header, before the title (a "Volver" button). */
  header?: ReactNode;
  className?: string;
  /** Extra attributes for the close button (analytics `data-*`). */
  closeProps?: Record<`data-${string}`, string>;
}) {
  useScrollLock(true);
  if (!useIsTopSheet()) return null;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the panel itself, not the close button: the button would show its focus ring on every open.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-40 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl outline-none sm:w-[32rem]",
            className,
          )}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-4">
            {header}
            <Dialog.Title className="mr-auto truncate text-base font-medium">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Cerrar" {...closeProps}>
                <X className="size-5" aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-6 overflow-y-auto overscroll-contain p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
