import { createRootRoute, createRoute, createRouter, lazyRouteComponent, notFound, RouterProvider, redirect } from "@tanstack/react-router";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installClickTracking } from "./analytics.ts";
import { DevFeedback } from "./components/dev-feedback.tsx";
import { Layout } from "./components/layout.tsx";
import { RouteError, RouteNotFound } from "./components/route-states.tsx";
import { loadIndex, loadJson, loadSources, loadTema } from "./lib.ts";
import { cuitDeSlug } from "./slug.ts";
import "./styles.css";
import type {
  AgencyDetail,
  AgencySummary,
  CoparticipacionTema,
  DeudaTema,
  EmpleoTema,
  FuncionariosTema,
  GobiernoOverview,
  HistoryTema,
  HomeGuide,
  HomeTema,
  LeyDetalle,
  LeyResumen,
  MapaMendoza,
  MunicipalBudget,
  MunicipalFees,
  MunicipalProcedure,
  MunicipioPagina,
  NoPublicado,
  OrganismoDetalle,
  OrganismoResumen,
  PartyDetail,
  PartySummary,
  PoblacionTema,
  PosterMunicipality,
  ProcedureGuide,
  ProveedorDetalle,
  ProveedorResumen,
  RecaudacionTema,
  RequestTarget,
  SenalesTema,
  UniversidadesTema,
} from "./types.ts";

// Cada página es su propio chunk: la primera visita baja solo el layout y la página donde entra.
const page = <K extends string>(load: () => Promise<Record<K, () => ReactNode>>, name: K) => lazyRouteComponent(load, name);

const rootRoute = createRootRoute({ component: Layout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [sources, home, mapa, guide] = await Promise.all([
      loadSources(),
      loadTema<HomeTema>("home"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
      loadTema<HomeGuide>("guia").catch(() => null),
    ]);
    return { sources, home, mapa, guide };
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

const recaudacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recaudacion",
  loader: () => loadTema<RecaudacionTema>("recaudacion"),
  component: page(() => import("./pages/recaudacion.tsx"), "RecaudacionPage"),
});

const universidadesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/universidades",
  loader: () => loadTema<UniversidadesTema>("universidades"),
  component: page(() => import("./pages/universidades.tsx"), "UniversidadesPage"),
});

const uncuyoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/universidades/uncuyo",
  loader: () => loadTema<UniversidadesTema>("universidades"),
  component: page(() => import("./pages/universidades.tsx"), "UncuyoPage"),
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
  loader: async () => {
    // En paralelo: uno detrás del otro, el mapa esperaba al tema.
    const [tema, mapa] = await Promise.all([loadTema<CoparticipacionTema>("coparticipacion"), loadTema<MapaMendoza>("mapa")]);
    return { tema, mapa };
  },
  component: page(() => import("./pages/coparticipacion.tsx"), "CoparticipacionPage"),
});

const poblacionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poblacion",
  loader: async () => {
    // En paralelo: uno detrás del otro, el mapa esperaba al tema.
    const [tema, mapa] = await Promise.all([loadTema<PoblacionTema>("poblacion"), loadTema<MapaMendoza>("mapa")]);
    return { tema, mapa };
  },
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

// Estática, así gana sobre /funcionarios/$role.
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/funcionarios/historial",
  loader: () => loadTema<HistoryTema>("history"),
  component: page(() => import("./pages/history.tsx"), "HistoryPage"),
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

const partiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partidos",
  loader: () => loadTema<PartySummary[]>("partidos"),
  component: page(() => import("./pages/partidos.tsx"), "PartiesPage"),
});

const partyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partidos/$slug",
  loader: ({ params }) => loadTema<PartyDetail>(`partidos/${params.slug}`).catch(() => null),
  component: page(() => import("./pages/partidos.tsx"), "PartyPage"),
});

const comoLeerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/como-leer",
  component: page(() => import("./pages/como-leer.tsx"), "ComoLeerPage"),
});

const participarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/participar",
  validateSearch: (s: Record<string, unknown>): { tipo?: string; dato?: string; pagina?: string; titulo?: string; cita?: string } => ({
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
    dato: typeof s.dato === "string" ? s.dato : undefined,
    pagina: typeof s.pagina === "string" ? s.pagina : undefined,
    titulo: typeof s.titulo === "string" ? s.titulo : undefined,
    cita: typeof s.cita === "string" ? s.cita : undefined,
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
    const [municipios, mapa] = await Promise.all([
      loadTema<MunicipioPagina[]>("municipios"),
      loadTema<MapaMendoza>("mapa").catch(() => null),
    ]);
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

const municipalBudgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug/presupuesto/$anio",
  loader: ({ params }) => loadTema<MunicipalBudget>(`municipios/${params.slug}/presupuesto`).catch(() => null),
  component: page(() => import("./pages/municipal-budget.tsx"), "MunicipalBudgetPage"),
});

/** Sin año, el presupuesto abre en el último, aunque todavía esté en curso. */
const municipalBudgetLatestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug/presupuesto",
  beforeLoad: async ({ params }) => {
    const budget = await loadTema<MunicipalBudget>(`municipios/${params.slug}/presupuesto`).catch(() => null);
    const year = budget?.years[0];
    if (!year) throw notFound();
    throw redirect({ to: "/municipios/$slug/presupuesto/$anio", params: { slug: params.slug, anio: String(year.year) }, replace: true });
  },
});

const procedureGuideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tramites/abrir-un-comercio",
  loader: () => loadTema<ProcedureGuide>("tramites/abrir-un-comercio").catch(() => null),
  component: page(() => import("./pages/procedures.tsx"), "ProcedureGuidePage"),
});

const municipalProcedureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug/tramites/abrir-un-comercio",
  loader: ({ params }) => loadTema<MunicipalProcedure>(`municipios/${params.slug}/tramite-abrir-un-comercio`).catch(() => null),
  component: page(() => import("./pages/procedures.tsx"), "MunicipalProcedurePage"),
});

const municipalFeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/municipios/$slug/tasas",
  loader: ({ params }) => loadTema<MunicipalFees>(`municipios/${params.slug}/tasas`).catch(() => null),
  component: page(() => import("./pages/municipal-fees.tsx"), "MunicipalFeesPage"),
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

const text = (v: unknown) => (typeof v === "string" ? v : undefined);

const pedirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pedir",
  validateSearch: (s: Record<string, unknown>): { para?: string; dato?: string } => ({ para: text(s.para), dato: text(s.dato) }),
  loader: () => loadTema<RequestTarget[]>("pedir"),
  component: page(() => import("./pages/pedir.tsx"), "PedirPage"),
});

const cartelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cartel",
  validateSearch: (s: Record<string, unknown>): { municipio?: string; tema?: string; dato?: string; formato?: string } => ({
    municipio: text(s.municipio),
    tema: text(s.tema),
    dato: text(s.dato),
    formato: text(s.formato),
  }),
  loader: () => loadTema<PosterMunicipality[]>("carteles"),
  component: page(() => import("./pages/cartel.tsx"), "CartelPage"),
});

// Solo en desarrollo: /vista-previa/<name> muestra apps/web/src/previews/<name>.tsx, una página descartable (en
// .gitignore) para revisar un cambio de interfaz antes de tocar el real. Proceso: docs/procesos/vista-previa.md.
type PreviewModule = { Preview: (props: { data: unknown }) => ReactNode; loader?: () => Promise<unknown> };
const previews = import.meta.glob<PreviewModule>("./previews/*.tsx");
const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/vista-previa/$name",
  loader: async ({ params }) => {
    const load = previews[`./previews/${params.name}.tsx`];
    if (!load) throw notFound();
    const preview = await load();
    return { Preview: preview.Preview, data: await preview.loader?.() };
  },
  component: function PreviewPage() {
    const { Preview, data } = previewRoute.useLoaderData();
    return <Preview data={data} />;
  },
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    deudaRoute,
    coparticipacionRoute,
    recaudacionRoute,
    universidadesRoute,
    uncuyoRoute,
    empleoRoute,
    poblacionRoute,
    funcionariosRoute,
    historyRoute,
    roleRoute,
    funcionarioRoute,
    partiesRoute,
    partyRoute,
    gobiernoRoute,
    agencyRoute,
    municipiosRoute,
    municipioRoute,
    municipalBudgetRoute,
    municipalBudgetLatestRoute,
    municipalFeesRoute,
    municipalProcedureRoute,
    procedureGuideRoute,
    proveedoresRoute,
    proveedorRoute,
    organismosRoute,
    organismoRoute,
    leyesRoute,
    leyRoute,
    senalesRoute,
    noPublicadoRoute,
    participarRoute,
    pedirRoute,
    cartelRoute,
    comoLeerRoute,
    fuentesRoute,
    datosRoute,
    ...(import.meta.env.DEV ? [previewRoute] : []),
  ]),
  defaultPreload: "intent",
  // Una página que falla muestra RouteError (y lo reporta a PostHog) dentro del layout; el resto sigue andando.
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  // Los datos solo cambian con cada publicación: una vez cargada, la página no los vuelve a pedir cuando cambian
  // los parámetros de su URL (una pestaña, una búsqueda escrita letra por letra).
  defaultStaleTime: Infinity,
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
    <DevFeedback />
  </StrictMode>,
);
