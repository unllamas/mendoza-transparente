import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { loadIndex, loadTema } from "./lib.ts";
import { CoparticipacionPage } from "./pages/coparticipacion.tsx";
import { DatosPage } from "./pages/datos.tsx";
import { DeudaPage } from "./pages/deuda.tsx";
import { EmpleoPage } from "./pages/empleo.tsx";
import { FuentesPage } from "./pages/fuentes.tsx";
import { HomePage } from "./pages/home.tsx";
import { Layout } from "./pages/layout.tsx";
import { PoblacionPage } from "./pages/poblacion.tsx";
import "./styles.css";
import type { CoparticipacionTema, DeudaTema, EmpleoTema, HomeTema, MapaMendoza, PoblacionTema } from "./types.ts";

const rootRoute = createRootRoute({ component: Layout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [index, home, mapa] = await Promise.all([
      loadIndex(),
      loadTema<HomeTema>("home"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
    ]);
    return { index, home, mapa };
  },
  component: HomePage,
});

const fuentesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fuentes",
  loader: loadIndex,
  component: FuentesPage,
});

const datosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/datos/$fuente",
  loader: loadIndex,
  component: DatosPage,
});

const deudaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deuda",
  loader: () => loadTema<DeudaTema>("deuda"),
  component: DeudaPage,
});

const empleoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/empleo-publico",
  loader: () => loadTema<EmpleoTema>("empleo"),
  component: EmpleoPage,
});

const coparticipacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coparticipacion",
  loader: async () => ({
    tema: await loadTema<CoparticipacionTema>("coparticipacion"),
    mapa: await loadTema<MapaMendoza>("mapa"),
  }),
  component: CoparticipacionPage,
});

const poblacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poblacion",
  loader: async () => ({
    tema: await loadTema<PoblacionTema>("poblacion"),
    mapa: await loadTema<MapaMendoza>("mapa"),
  }),
  component: PoblacionPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, deudaRoute, coparticipacionRoute, empleoRoute, poblacionRoute, fuentesRoute, datosRoute]),
  defaultPreload: "intent",
  scrollRestoration: true,
});

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
