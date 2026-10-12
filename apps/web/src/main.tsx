import { createRootRoute, createRoute, createRouter, lazyRouteComponent, RouterProvider } from "@tanstack/react-router";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installClickTracking } from "./analytics.ts";
import { loadIndex, loadJson, loadTema } from "./lib.ts";
import { cuitDeSlug } from "./slug.ts";
import { Layout } from "./pages/layout.tsx";
import "./styles.css";
import type { AgencyDetail, AgencySummary, GobiernoOverview, HomeGuide, CoparticipacionTema, DeudaTema, EmpleoTema, FuncionariosTema, HomeTema, LeyDetalle, LeyResumen, MapaMendoza, MunicipioPagina, NoPublicado, OrganismoDetalle, OrganismoResumen, PoblacionTema, ProveedorDetalle, ProveedorResumen, SenalesTema } from "./types.ts";

// Each page is its own chunk: the first visit downloads only the layout and the page it lands on.
const page = <K extends string>(load: () => Promise<Record<K, () => ReactNode>>, name: K) => lazyRouteComponent(load, name);

const rootRoute = createRootRoute({ component: Layout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [index, home, mapa, noPublicado, guide] = await Promise.all([
      loadIndex(),
      loadTema<HomeTema>("home"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
      loadTema<NoPublicado[]>("no-publicado").catch(() => [] as NoPublicado[]),
      loadTema<HomeGuide>("guia").catch(() => null),
    ]);
    return { index, home, mapa, noPublicado, guide };
  },
  component: page(() => import("./pages/home.tsx"), "HomePage"),
});

const fuentesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fuentes",
  loader: loadIndex,
  component: page(() => import("./pages/fuentes.tsx"), "FuentesPage"),
});

const datosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/datos/$fuente",
  loader: loadIndex,
  component: page(() => import("./pages/datos.tsx"), "DatosPage"),
});

const deudaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deuda",
  loader: () => loadTema<DeudaTema>("deuda"),
  component: page(() => import("./pages/deuda.tsx"), "DeudaPage"),
});

const empleoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/empleo-publico",
  loader: () => loadTema<EmpleoTema>("empleo"),
  component: page(() => import("./pages/empleo.tsx"), "EmpleoPage"),
});

const coparticipacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coparticipacion",
  loader: async () => ({
    tema: await loadTema<CoparticipacionTema>("coparticipacion"),
    mapa: await loadTema<MapaMendoza>("mapa"),
  }),
  component: page(() => import("./pages/coparticipacion.tsx"), "CoparticipacionPage"),
});

const poblacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poblacion",
  loader: async () => ({
    tema: await loadTema<PoblacionTema>("poblacion"),
    mapa: await loadTema<MapaMendoza>("mapa"),
  }),
  component: page(() => import("./pages/poblacion.tsx"), "PoblacionPage"),
});

const noPublicadoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/no-publicado",
  loader: () => loadTema<NoPublicado[]>("no-publicado"),
  component: page(() => import("./pages/no-publicado.tsx"), "NoPublicadoPage"),
});

const funcionariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: page(() => import("./pages/funcionarios.tsx"), "FuncionariosPage"),
});

const roleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios/$role",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: page(() => import("./pages/funcionarios.tsx"), "RolePage"),
});

const funcionarioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios/$role/$slug",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: page(() => import("./pages/funcionarios.tsx"), "FuncionarioPage"),
});

const comoLeerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/como-leer",
  component: page(() => import("./pages/como-leer.tsx"), "ComoLeerPage"),
});

const participarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/participar",
  validateSearch: (s: Record<string, unknown>): { tipo?: string; dato?: string; pagina?: string } => ({
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
    dato: typeof s.dato === "string" ? s.dato : undefined,
    pagina: typeof s.pagina === "string" ? s.pagina : undefined,
  }),
  loader: () => loadTema<NoPublicado[]>("no-publicado").catch(() => [] as NoPublicado[]),
  component: page(() => import("./pages/participar.tsx"), "ParticiparPage"),
});

const gobiernoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gobierno",
  loader: async () => {
    const [agencies, overview] = await Promise.all([
      loadTema<AgencySummary[]>("gobierno"),
      loadTema<GobiernoOverview>("gobierno-resumen").catch(() => null),
    ]);
    return { agencies, overview };
  },
  component: page(() => import("./pages/gobierno.tsx"), "GobiernoPage"),
});

const agencyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gobierno/$slug",
  loader: ({ params }) => loadTema<AgencyDetail>(`gobierno/${params.slug}`).catch(() => null),
  component: page(() => import("./pages/gobierno.tsx"), "AgencyPage"),
});

const municipiosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios",
  loader: async () => {
    const [municipios, mapa] = await Promise.all([loadTema<MunicipioPagina[]>("municipios"), loadTema<MapaMendoza>("mapa").catch(() => null)]);
    return { municipios, mapa };
  },
  component: page(() => import("./pages/municipios.tsx"), "MunicipiosPage"),
});

const municipioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug",
  loader: async () => {
    const [municipios, mapa, leyes] = await Promise.all([
      loadTema<MunicipioPagina[]>("municipios"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
      loadTema<LeyResumen[]>("leyes").catch(() => []),
    ]);
    return { municipios, mapa, leyes };
  },
  component: page(() => import("./pages/municipios.tsx"), "MunicipioPage"),
});

const proveedoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores",
  loader: async () => (await loadTema<ProveedorResumen[]>("proveedores")).filter((p) => p.indexable),
  component: page(() => import("./pages/compras.tsx"), "ProveedoresPage"),
});

const proveedorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores/$slug",
  loader: async ({ params }) => {
    const cuit = cuitDeSlug(params.slug);
    const ficha = cuit ? await loadJson<ProveedorDetalle>(`temas/compras/proveedores/${cuit}.json`).catch(() => null) : null;
    return { cuit, ficha };
  },
  component: page(() => import("./pages/compras.tsx"), "ProveedorPage"),
});

const organismosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos",
  loader: () => loadTema<OrganismoResumen[]>("organismos"),
  component: page(() => import("./pages/compras.tsx"), "OrganismosPage"),
});

const organismoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos/$slug",
  loader: ({ params }) => loadJson<OrganismoDetalle>(`temas/compras/organismos/${params.slug}.json`).catch(() => null),
  component: page(() => import("./pages/compras.tsx"), "OrganismoPage"),
});

const leyesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leyes",
  loader: () => loadTema<LeyResumen[]>("leyes"),
  component: page(() => import("./pages/leyes.tsx"), "LeyesPage"),
});

const leyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leyes/$numero",
  loader: ({ params }) => loadJson<LeyDetalle>(`temas/leyes/${params.numero}.json`).catch(() => null),
  component: page(() => import("./pages/leyes.tsx"), "LeyPage"),
});

const senalesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/senales",
  loader: () => loadTema<SenalesTema>("senales"),
  component: page(() => import("./pages/senales.tsx"), "SenalesPage"),
});

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, deudaRoute, coparticipacionRoute, empleoRoute, poblacionRoute, funcionariosRoute, roleRoute, funcionarioRoute, gobiernoRoute, agencyRoute, municipiosRoute, municipioRoute, proveedoresRoute, proveedorRoute, organismosRoute, organismoRoute, leyesRoute, leyRoute, senalesRoute, noPublicadoRoute, participarRoute, comoLeerRoute, fuentesRoute, datosRoute]),
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

installClickTracking();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
