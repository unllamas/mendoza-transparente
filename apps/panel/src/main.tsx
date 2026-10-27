import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Layout } from "./components/layout.tsx";
import { AssistantPage } from "./pages/assistant.tsx";
import { AuditPage } from "./pages/audit.tsx";
import { HomePage } from "./pages/home.tsx";
import { InboxPage, type InboxSearch } from "./pages/inbox.tsx";
import { SecurityPage, type SecuritySearch } from "./pages/security.tsx";
import { StatsPage } from "./pages/stats.tsx";
import "./styles.css";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const rootRoute = createRootRoute({ component: Layout });
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/bandeja",
    // Filters and the open submission live in the URL: a link to the panel opens exactly the same view.
    validateSearch: (s: Record<string, unknown>): InboxSearch => ({
      estado: str(s.estado),
      tipo: str(s.tipo),
      q: str(s.q),
      desde: str(s.desde),
      hasta: str(s.hasta),
      envio: str(s.envio),
    }),
    component: InboxPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/estadisticas", component: StatsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/seguridad",
    validateSearch: (s: Record<string, unknown>): SecuritySearch => ({ hallazgo: str(s.hallazgo) }),
    component: SecurityPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/asistente", component: AssistantPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/auditoria", component: AuditPage }),
];

const router = createRouter({ routeTree: rootRoute.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
