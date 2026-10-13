import { cx } from "@mt/ui/lib/cx";
import type { ReactNode } from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";

import { useScrollLock } from "../hooks/use-scroll-lock.ts";

/**
 * Full-screen or centered window (the search, the mobile menu), on React Aria: focus stays inside, Escape closes
 * it and the page behind does not scroll. Mount it to open it. For detail panels use `Sheet`.
 * To focus a field when it opens, focus it from an effect of the content (React Aria keeps focus that is
 * already inside).
 */
export function Dialog({
  label,
  onClose,
  children,
  className,
  overlayClassName,
}: {
  /** Accessible name ("Buscar", "Menú"). */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Classes of the layer behind (z-index, dark backdrop). It always covers the screen. */
  overlayClassName?: string;
}) {
  useScrollLock(true);
  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()} className={cx("fixed inset-0", overlayClassName)}>
      {/* The dialog element is the window itself (it has to be a box: React Aria focuses it on open). */}
      <Modal className="contents">
        <AriaDialog aria-label={label} className={cx("fixed outline-none", className)}>
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
