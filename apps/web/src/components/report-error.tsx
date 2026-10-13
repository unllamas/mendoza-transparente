/**
 * "Report an error on this page": a band at the top of the footer that opens the error form in /participar with
 * the context already filled in, so nobody has to copy it by hand:
 * - `pagina`: the full address, with its parameters (`/organismos/x?proceso=ocds-…` keeps the open sheet).
 * - `titulo`: the page title, read on click (it loads after the route for data pages).
 * - `cita`: the text the person selected on the page before tapping, if any.
 * Documented in docs/procesos/participacion.md.
 */

import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { RiBugLine } from "@remixicon/react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type MouseEvent, useEffect, useRef } from "react";

import { TITLE_SUFFIX } from "@/seo.ts";

const MAX_QUOTE = 300;

export function ReportErrorBand() {
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();
  const quote = useLastSelection(location.pathname);
  const page = location.href;
  if (location.pathname === "/participar") return null;

  // Ctrl/Cmd-click opens a new tab with what the link already carries; a plain click adds the title and selection.
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const title = document.title.replace(TITLE_SUFFIX, "").trim();
    void navigate({
      to: "/participar",
      search: { tipo: "error", pagina: page, titulo: title || undefined, cita: quote.current || undefined },
    });
  };

  return (
    <div className="border-b border-separator-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body-semibold">¿Viste un dato mal en esta página?</span>
          <span className="text-body-regular text-text-secondary text-pretty">
            Avisanos y lo corregimos. Si marcás el texto con el error antes de tocar el botón, lo sumamos al reporte.
          </span>
        </div>
        <Link
          to="/participar"
          search={{ tipo: "error", pagina: page }}
          onClick={onClick}
          id="footer-reportar-error"
          data-track="footer.report_error"
          data-track-path={location.pathname}
          className={buttonClassName({ variant: "secondary", className: "w-fit shrink-0" })}
        >
          <RiBugLine className="size-5" aria-hidden /> Reportar un error
        </Link>
      </div>
    </div>
  );
}

/**
 * The last text selected inside the page's main content. Tapping the button clears the selection before the
 * click, so it is kept as it changes; it resets when the route changes.
 */
function useLastSelection(pathname: string) {
  const last = useRef("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: start over on every new page.
  useEffect(() => {
    last.current = "";
    const onChange = () => {
      const selection = document.getSelection();
      const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
      const node = selection?.anchorNode;
      const inMain = !!node && !!(node instanceof Element ? node : node.parentElement)?.closest("main");
      if (text && inMain) last.current = text.slice(0, MAX_QUOTE);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pathname]);
  return last;
}
