import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { loadIndex, loadJson, loadTema } from "./lib.ts";
import { cuitDeSlug } from "./slug.ts";
import { CoparticipacionPage } from "./pages/coparticipacion.tsx";
import { DatosPage } from "./pages/datos.tsx";
import { DeudaPage } from "./pages/deuda.tsx";
import { OrganismoPage, OrganismosPage, ProveedorPage, ProveedoresPage } from "./pages/compras.tsx";
import { FuncionarioPage, FuncionariosPage , RolePage } from "./pages/funcionarios.tsx";
import { LeyesPage, LeyPage } from "./pages/leyes.tsx";
import { MunicipioPage, MunicipiosPage } from "./pages/municipios.tsx";
import { EmpleoPage } from "./pages/empleo.tsx";
import { FuentesPage } from "./pages/fuentes.tsx";
import { AgencyPage, GobiernoPage } from "./pages/gobierno.tsx";
import { HomePage } from "./pages/home.tsx";
import { Layout } from "./pages/layout.tsx";
import { NoPublicadoPage } from "./pages/no-publicado.tsx";
import { PoblacionPage } from "./pages/poblacion.tsx";
import { SenalesPage } from "./pages/senales.tsx";
import "./styles.css";
import type { AgencyDetail, AgencySummary, GobiernoOverview, CoparticipacionTema, DeudaTema, EmpleoTema, FuncionariosTema, HomeTema, LeyDetalle, LeyResumen, MapaMendoza, MunicipioPagina, NoPublicado, OrganismoDetalle, OrganismoResumen, PoblacionTema, ProveedorDetalle, ProveedorResumen, SenalesTema } from "./types.ts";

const rootRoute = createRootRoute({ component: Layout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [index, home, mapa, noPublicado] = await Promise.all([
      loadIndex(),
      loadTema<HomeTema>("home"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
      loadTema<NoPublicado[]>("no-publicado").catch(() => [] as NoPublicado[]),
    ]);
    return { index, home, mapa, noPublicado };
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

const noPublicadoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/no-publicado",
  loader: () => loadTema<NoPublicado[]>("no-publicado"),
  component: NoPublicadoPage,
});

const funcionariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: FuncionariosPage,
});

const roleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios/$role",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: RolePage,
});

const funcionarioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios/$role/$slug",
  loader: () => loadTema<FuncionariosTema>("funcionarios"),
  component: FuncionarioPage,
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
  component: GobiernoPage,
});

const agencyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gobierno/$slug",
  loader: ({ params }) => loadTema<AgencyDetail>(`gobierno/${params.slug}`).catch(() => null),
  component: AgencyPage,
});

const municipiosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios",
  loader: async () => {
    const [municipios, mapa] = await Promise.all([loadTema<MunicipioPagina[]>("municipios"), loadTema<MapaMendoza>("mapa").catch(() => null)]);
    return { municipios, mapa };
  },
  component: MunicipiosPage,
});

const municipioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug",
  loader: async () => {
    const [municipios, mapa] = await Promise.all([loadTema<MunicipioPagina[]>("municipios"), loadTema<MapaMendoza>("mapa").catch(() => null)]);
    return { municipios, mapa };
  },
  component: MunicipioPage,
});

const proveedoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores",
  loader: async () => (await loadTema<ProveedorResumen[]>("proveedores")).filter((p) => p.indexable),
  component: ProveedoresPage,
});

const proveedorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores/$slug",
  loader: async ({ params }) => {
    const cuit = cuitDeSlug(params.slug);
    const ficha = cuit ? await loadJson<ProveedorDetalle>(`temas/compras/proveedores/${cuit}.json`).catch(() => null) : null;
    return { cuit, ficha };
  },
  component: ProveedorPage,
});

const organismosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos",
  loader: () => loadTema<OrganismoResumen[]>("organismos"),
  component: OrganismosPage,
});

const organismoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos/$slug",
  loader: ({ params }) => loadJson<OrganismoDetalle>(`temas/compras/organismos/${params.slug}.json`).catch(() => null),
  component: OrganismoPage,
});

const leyesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leyes",
  loader: () => loadTema<LeyResumen[]>("leyes"),
  component: LeyesPage,
});

const leyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leyes/$numero",
  loader: ({ params }) => loadJson<LeyDetalle>(`temas/leyes/${params.numero}.json`).catch(() => null),
  component: LeyPage,
});

const senalesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/senales",
  loader: () => loadTema<SenalesTema>("senales"),
  component: SenalesPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, deudaRoute, coparticipacionRoute, empleoRoute, poblacionRoute, funcionariosRoute, roleRoute, funcionarioRoute, gobiernoRoute, agencyRoute, municipiosRoute, municipioRoute, proveedoresRoute, proveedorRoute, organismosRoute, organismoRoute, leyesRoute, leyRoute, senalesRoute, noPublicadoRoute, fuentesRoute, datosRoute]),
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
