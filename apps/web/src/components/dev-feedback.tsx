import { lazy, Suspense } from "react";

/**
 * Agentation toolbar (development only): click an element, write what to change, and the agent receives
 * the selector, the React component and the note. With `VITE_AGENTATION_ENDPOINT` set (in `apps/web/.env.local`)
 * and `agentation-mcp` running (see `.mcp.json`), the notes reach the agent directly; without it the toolbar
 * only copies them, and makes no requests that would dirty the console. In production `import.meta.env.DEV`
 * is false, so the package is never bundled.
 * Hidden under automation (`navigator.webdriver`) so `bun run verificar` checks the site, not the toolbar.
 */
const Agentation = import.meta.env.DEV ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation }))) : null;

export function DevFeedback() {
  if (!Agentation || navigator.webdriver) return null;
  return (
    <Suspense fallback={null}>
      <Agentation appName="Mendoza Transparente" endpoint={import.meta.env.VITE_AGENTATION_ENDPOINT} />
    </Suspense>
  );
}
