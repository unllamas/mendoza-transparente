import { MascotAvatar } from "@mt/mascots/mascot";
import { useMediaQuery } from "@mt/ui/hooks/use-media-query";
import { useScrollLock } from "@mt/ui/hooks/use-scroll-lock";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowDownSLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { NAME, Panel } from "./panel.tsx";
import { useConversation } from "./use-conversation.ts";

/** Closed state: the mascot's face plus a short verb. When open on desktop it turns into a chevron that closes. */
function Launcher({ open, onPress, className }: { open: boolean; onPress: () => void; className?: string }) {
  if (open)
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label="Cerrar la guía"
        className={cx(
          "flex size-14 items-center justify-center rounded-2xl bg-background-surface text-text-primary shadow-lg transition-colors hover:bg-background-interactive-hover",
          className,
        )}
      >
        <RiArrowDownSLine className="size-6" aria-hidden />
      </button>
    );
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Preguntale a ${NAME} por un trámite`}
      className={cx(
        "flex h-14 items-center gap-2 rounded-full bg-background-surface py-1.5 pr-5 pl-1.5 shadow-lg transition-[box-shadow,transform] hover:shadow-xl motion-safe:active:scale-95",
        className,
      )}
    >
      <MascotAvatar mascot="aco" size={44} decorative />
      <span className="text-body-semibold text-text-primary">Preguntá</span>
    </button>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The floating assistant: launcher plus panel. Full screen on phones, 380 × 620 px at the bottom right on desktop. */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const conversation = useConversation();
  const dialog = useRef<HTMLDivElement>(null);
  // What had the focus when the panel opened (the launcher), so closing puts it back there.
  const opener = useRef<HTMLElement | null>(null);
  const isPhone = useMediaQuery("(max-width: 639px)");

  // On phones the panel is full screen: the page behind must not scroll (a single scroll at a time).
  useScrollLock(open && isPhone);

  const toggle = (next: boolean) => {
    if (next) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      track("assistant.launcher.open");
    }
    setOpen(next);
  };

  // Back to the opener once the panel is gone. The launcher button is the same DOM node open or closed, and it is
  // shown again on phones by this render, so focusing it here works.
  useEffect(() => {
    if (open) return;
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const root = dialog.current;
      if (!root) return;
      // Keys from inside a modal sheet (SearchSheet, FeedbackSheet) are theirs: they handle Escape and trap Tab.
      if (e.defaultPrevented || !root.contains(e.target as Node)) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Simple focus trap: Tab from the last control goes to the first, Shift+Tab from the first to the last.
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label={`${NAME}, guía de trámites`}
          className="fixed inset-0 z-40 sm:inset-auto sm:right-4 sm:bottom-24 sm:h-[620px] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl"
        >
          <Panel
            turns={conversation.turns}
            thinking={conversation.thinking}
            error={conversation.error}
            onSend={conversation.send}
            onRetry={conversation.retry}
            onClose={() => toggle(false)}
          />
        </div>
      )}
      <Launcher open={open} onPress={() => toggle(!open)} className={cx("fixed right-4 bottom-4 z-40", open && "max-sm:hidden")} />
    </>
  );
}
