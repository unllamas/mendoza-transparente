import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { loadIndex, loadTema } from "./lib.ts";
import { DatosPage } from "./pages/datos.tsx";
import { DeudaPage } from "./pages/deuda.tsx";
import { FuentesPage } from "./pages/fuentes.tsx";
import { HomePage } from "./pages/home.tsx";
import { Layout } from "./pages/layout.tsx";
import "./styles.css";
import type { DeudaTema } from "./types.ts";

const rootRoute = createRootRoute({ component: Layout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: loadIndex,
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

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, deudaRoute, fuentesRoute, datosRoute]),
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
