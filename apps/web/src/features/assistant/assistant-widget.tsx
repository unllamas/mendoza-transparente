import { MascotAvatar } from "@mt/mascots/mascot";
import { useMediaQuery } from "@mt/ui/hooks/use-media-query";
import { useScrollLock } from "@mt/ui/hooks/use-scroll-lock";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowDownSLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { TURNSTILE_KEY, Turnstile } from "@/components/turnstile.tsx";
import { NAME, Panel } from "./panel.tsx";
import { useConversation } from "./use-conversation.ts";

/** Estado cerrado: la cara de la mascota más un verbo corto. Abierto en escritorio se vuelve una flecha que cierra. */
function Launcher({ open, onPress, className }: { open: boolean; onPress: () => void; className?: string }) {
  if (open)
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label="Cerrar la guía"
        className={cx(
          "flex size-14 items-center justify-center rounded-2xl bg-background-inverse text-text-inverse shadow-lg outline-none transition-colors hover:bg-background-inverse-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-full",
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
      aria-label={`Preguntale a ${NAME} por un trámite o un dato`}
      className={cx(
        "flex h-14 items-center gap-2 rounded-full bg-background-inverse py-1.5 pr-5 pl-1.5 shadow-lg outline-none transition-[box-shadow,transform] hover:shadow-xl focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-full motion-safe:active:scale-95",
        className,
      )}
    >
      <MascotAvatar mascot="aco" size={44} decorative className="ring-1 ring-text-inverse/20" />
      <span className="text-body-semibold text-text-inverse">Preguntá</span>
    </button>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** El asistente flotante: lanzador más panel. Pantalla completa en celulares, 380 × 620 px abajo a la derecha en escritorio. */
export default function AssistantWidget({ challenge = false }: { challenge?: boolean }) {
  const [open, setOpen] = useState(false);
  const conversation = useConversation(challenge);
  const dialog = useRef<HTMLDivElement>(null);
  // Lo que tenía el foco cuando se abrió el panel (el lanzador), para que al cerrar vuelva ahí.
  const opener = useRef<HTMLElement | null>(null);
  const isPhone = useMediaQuery("(max-width: 639px)");

  // En celulares el panel es pantalla completa: la página de atrás no debe scrollear (un solo scroll a la vez).
  useScrollLock(open && isPhone);

  const toggle = (next: boolean) => {
    if (next) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      track("assistant.launcher.open");
    }
    setOpen(next);
  };

  // Volver al que lo abrió una vez que el panel ya no está. El botón lanzador es el mismo nodo del DOM abierto o cerrado,
  // y este render lo vuelve a mostrar en celulares, así que darle el foco acá funciona.
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
      // Las teclas dentro de una hoja modal (SearchSheet, FeedbackSheet) son de ella: maneja Escape y atrapa Tab.
      if (e.defaultPrevented || !root.contains(e.target as Node)) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Trampa de foco simple: Tab desde el último control va al primero, Shift+Tab desde el primero al último.
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
          aria-label={`${NAME}, guía de trámites y datos`}
          className="fixed inset-0 z-40 sm:inset-auto sm:right-4 sm:bottom-24 sm:h-[620px] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl"
        >
          <Panel
            turns={conversation.turns}
            thinking={conversation.thinking}
            progress={conversation.progress}
            error={conversation.error}
            onSend={conversation.send}
            onRetry={conversation.retry}
            onRestart={conversation.reset}
            // Sin clave de Turnstile (desarrollo) no hay widget que mostrar: el campo queda siempre a la vista.
            verification={
              conversation.verification.needed &&
              TURNSTILE_KEY && <Turnstile key={conversation.verification.key} onToken={conversation.onToken} />
            }
            verified={conversation.verified}
            onClose={() => toggle(false)}
            // En celulares el panel tapa la página: cerrarlo para que se vea la página que lo abrió. En escritorio queda.
            onNavigate={() => isPhone && toggle(false)}
          />
        </div>
      )}
      <Launcher open={open} onPress={() => toggle(!open)} className={cx("fixed right-4 bottom-4 z-40", open && "max-sm:hidden")} />
    </>
  );
}
