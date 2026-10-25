import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ComingSoonPage } from "./pages/coming-soon.tsx";
import { YearPage, type YearSearch } from "./pages/year.tsx";
import "./styles.css";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const rootRoute = createRootRoute({ component: Outlet });
const yearRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$anio",
  // Everything that picks what is shown lives in the URL, so a link opens exactly the same view.
  validateSearch: (s: Record<string, unknown>): YearSearch => ({
    eleccion: str(s.eleccion),
    escrutinio: str(s.escrutinio),
    cargo: str(s.cargo),
    departamento: str(s.departamento),
  }),
  component: function YearRoute() {
    const { anio } = yearRoute.useParams();
    return <YearPage year={anio} search={yearRoute.useSearch()} />;
  },
});
const routes = [createRoute({ getParentRoute: () => rootRoute, path: "/", component: ComingSoonPage }), yearRoute];

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
