import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ComingSoonPage } from "./pages/coming-soon.tsx";
import { YearPage } from "./pages/year.tsx";
import type { YearSearch } from "./search.ts";
import "./styles.css";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const rootRoute = createRootRoute({ component: Outlet });
// Everything that picks what is shown lives in the URL, so a link opens exactly the same view (a party's sheet too).
const validateSearch = (s: Record<string, unknown>): YearSearch => ({
  eleccion: str(s.eleccion),
  escrutinio: str(s.escrutinio),
  cargo: str(s.cargo),
  departamento: str(s.departamento),
  municipio: str(s.municipio),
  partido: str(s.partido),
});
const yearRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$anio",
  validateSearch,
  component: function YearRoute() {
    const { anio } = yearRoute.useParams();
    return <YearPage key="provincial" year={anio} scope="provincial" search={yearRoute.useSearch()} />;
  },
});
const municipalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$anio/municipales",
  validateSearch,
  component: function MunicipalRoute() {
    const { anio } = municipalRoute.useParams();
    return <YearPage key="municipal" year={anio} scope="municipal" search={municipalRoute.useSearch()} />;
  },
});
const routes = [createRoute({ getParentRoute: () => rootRoute, path: "/", component: ComingSoonPage }), yearRoute, municipalRoute];

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
