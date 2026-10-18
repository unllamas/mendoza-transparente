import { cx } from "@mt/ui/lib/cx";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/** Below this, a navigation feels instant and the bar would only flicker. */
const SHOW_AFTER_MS = 300;

type Phase = "hidden" | "start" | "grow" | "finish";

/**
 * Thin bar pinned to the top edge while the router loads the next page (its data or its chunk). The router
 * changes the URL first and keeps the old page on screen until the new one is ready: without a signal, a slow
 * load looks frozen. It floats over everything (`fixed`), so it never moves the layout.
 */
export function NavigationProgress() {
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  const [phase, setPhase] = useState<Phase>("hidden");

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setPhase("start"), SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    setPhase((p) => (p === "hidden" ? p : "finish"));
  }, [loading]);

  useEffect(() => {
    if (phase === "start") {
      // One frame at zero width, so the growth below has somewhere to start from.
      const frame = requestAnimationFrame(() => setPhase("grow"));
      return () => cancelAnimationFrame(frame);
    }
    if (phase === "finish") {
      const timer = setTimeout(() => setPhase("hidden"), 400);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className={cx(
          "h-full origin-left bg-highlight motion-reduce:scale-x-100",
          phase === "hidden" && "scale-x-0 opacity-0",
          phase === "start" && "scale-x-0",
          // Slows down as it advances and never reaches the end on its own: it does not know how long is left.
          phase === "grow" && "scale-x-[0.85] transition-transform duration-[8s] ease-out",
          phase === "finish" && "scale-x-100 opacity-0 transition-[transform,opacity] duration-200",
        )}
      />
    </div>
  );
}
