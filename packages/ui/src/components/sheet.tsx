import { cx } from "@mt/ui/lib/cx";
import { RiCloseLine } from "@remixicon/react";
import { type ReactNode, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useScrollLock } from "../hooks/use-scroll-lock.ts";
import { IconButton } from "./base/buttons/icon-button.tsx";

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
 * Modal sheet on the right, over the whole page (full width on phones), on React Aria. Mount it to open it, call `onClose` to
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
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => !open && onClose()}
      className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
    >
      <Modal
        className={cx(
          "fixed inset-y-0 right-0 z-40 flex w-full flex-col overflow-hidden border-l border-separator-border bg-background-surface shadow-2xl outline-none sm:w-[32rem]",
          className,
        )}
      >
        {/* React Aria focuses the panel itself on open, not the close button (it would show its ring every time). */}
        <Dialog aria-label={title} className="flex min-h-0 flex-1 flex-col outline-none">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-separator-border pr-1.5 pl-4">
            {header}
            <Heading slot="title" className="mr-auto truncate text-headline-medium text-text-primary">
              {title}
            </Heading>
            <IconButton icon={RiCloseLine} aria-label="Cerrar" onClick={onClose} {...closeProps} />
          </div>
          <div className="flex flex-col gap-6 overflow-y-auto overscroll-contain p-4">{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
