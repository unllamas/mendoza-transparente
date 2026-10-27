import type { AssistantStatus } from "@mt/assistant/types";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchStatus } from "./api.ts";

const AssistantWidget = lazy(() => import("./assistant-widget.tsx"));

/** Asks the API whether the assistant is on, and only then loads the widget: the first load of the page pays for one small request. */
export function AssistantGate() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!status) return null;
  return (
    <Suspense fallback={null}>
      <AssistantWidget challenge={status.challenge === true} />
    </Suspense>
  );
}
