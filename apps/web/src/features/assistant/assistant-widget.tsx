import { cx } from "@mt/ui/lib/cx";
import { RiArrowDownSLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { track } from "@/analytics.ts";
import { Mascot } from "./mascot.tsx";
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
      <Mascot className="size-11" />
      <span className="text-body-semibold text-text-primary">Preguntá</span>
    </button>
  );
}

/** The floating assistant: launcher plus panel. Full screen on phones, 380 × 620 px at the bottom right on desktop. */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const conversation = useConversation();

  const toggle = (next: boolean) => {
    setOpen(next);
    if (next) track("assistant.launcher.open");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={`${NAME}, guía de trámites`}
          className="fixed inset-0 z-40 sm:inset-auto sm:right-4 sm:bottom-24 sm:h-[620px] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl"
        >
          <Panel
            turns={conversation.turns}
            thinking={conversation.thinking}
            failed={conversation.failed}
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
