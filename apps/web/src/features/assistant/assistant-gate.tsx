import { lazy, Suspense, useEffect, useState } from "react";
import { fetchStatus } from "./api.ts";

const AssistantWidget = lazy(() => import("./assistant-widget.tsx"));

/** Asks the API whether the assistant is on, and only then loads the widget: the first load of the page pays for one small request. */
export function AssistantGate() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchStatus().then((ok) => !cancelled && setEnabled(ok));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <AssistantWidget />
    </Suspense>
  );
}
