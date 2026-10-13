/**
 * Reglas de arquitectura del monorepo (docs/procesos/arquitectura.md). Corre con `bun run lint:arch`.
 * El código fluye en una sola dirección: packages → lógica compartida → componentes → páginas → app.
 */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Sin dependencias circulares.", from: {}, to: { circular: true } },
    {
      name: "packages-are-independent",
      severity: "error",
      comment: "Los paquetes (@mt/ui, @mt/core) no importan nada de las apps.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "ui-is-generic",
      severity: "error",
      comment: "El design system no depende del router, de la analítica ni de los datos del sitio.",
      from: { path: "^packages/ui/" },
      to: { path: "(@tanstack/react-router|posthog-js|packages/core|packages/scrapers)" },
    },
    {
      name: "pages-do-not-import-pages",
      severity: "error",
      comment: "Cada página se arma con componentes; una página no importa otra.",
      from: { path: "^apps/web/src/pages/([^/]+)\\.tsx$" },
      to: { path: "^apps/web/src/pages/", pathNot: "^apps/web/src/pages/$1\\.tsx$" },
    },
    {
      name: "components-do-not-import-pages",
      severity: "error",
      comment: "Los componentes no conocen las páginas.",
      from: { path: "^apps/web/src/(components|charts)/" },
      to: { path: "^apps/web/src/pages/" },
    },
    {
      name: "logic-has-no-ui",
      severity: "error",
      comment: "La lógica sin interfaz (lib, url-state, analytics, types…) no importa componentes ni páginas.",
      from: { path: "^apps/web/src/[^/]+\\.ts$" },
      to: { path: "^apps/web/src/(components|charts|pages)/" },
    },
    {
      name: "build-scripts-do-not-import-ui",
      severity: "error",
      comment: "Los scripts de build (datos, SEO) usan tipos y funciones puras, nunca componentes.",
      from: { path: "^apps/web/scripts/" },
      to: { path: "^apps/web/src/(components|charts|pages)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(node_modules|dist|public/data|\\.test\\.ts$)" },
    tsConfig: { fileName: require("node:path").join(__dirname, "apps/web/tsconfig.json") },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
