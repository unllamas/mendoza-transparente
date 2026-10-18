/**
 * First-layer data of each page, for the `<link rel="preload">` of its prerendered HTML (scripts/seo.ts): the JS chunk
 * of the page and the JSON its loader awaits start downloading with the HTML, instead of waiting for main.js to run
 * and ask for them. Same files as the loaders in src/main.tsx: when a loader changes, this changes too.
 * Layers: docs/procesos/web.md, «Velocidad de carga».
 */
import { cuitDeSlug } from "../src/slug.ts";

type RoutePreload = { module: string; data: string[] };

const tema = (name: string) => `temas/${name}.json`;

/** Page module (as in src/main.tsx) and first-layer JSON (relative to /data/) of a public path; null if unknown. */
export function routePreload(path: string): RoutePreload | null {
  const s = path.split("/").filter(Boolean);
  const page = (file: string, ...data: string[]): RoutePreload => ({ module: `src/pages/${file}.tsx`, data });
  switch (s[0]) {
    case undefined:
      return page("home", "fuentes.json", tema("home"), tema("mapa"), tema("guia"));
    case "fuentes":
      return page("fuentes", "index.json");
    case "datos":
      return page("datos", "index.json");
    case "deuda":
      return page("deuda", tema("deuda"));
    case "empleo-publico":
      return page("empleo", tema("empleo"));
    case "coparticipacion":
      return page("coparticipacion", tema("coparticipacion"), tema("mapa"));
    case "poblacion":
      return page("poblacion", tema("poblacion"), tema("mapa"));
    case "no-publicado":
      return page("no-publicado", tema("no-publicado"));
    case "participar":
      return page("participar", tema("no-publicado"));
    case "como-leer":
      return page("como-leer");
    case "funcionarios":
      return page("funcionarios", tema("funcionarios"));
    case "gobierno":
      return s[1] ? page("gobierno", tema(`gobierno/${s[1]}`)) : page("gobierno", tema("gobierno"), tema("gobierno-resumen"));
    case "municipios":
      if (!s[1]) return page("municipios", tema("municipios"), tema("mapa"));
      if (s[2] === "presupuesto") return page("municipal-budget", tema(`municipios/${s[1]}/presupuesto`));
      return page("municipios", tema("municipios"), tema("mapa"), tema("leyes"));
    case "proveedores": {
      if (!s[1]) return page("compras", tema("proveedores"));
      const cuit = cuitDeSlug(s[1]);
      return page("compras", ...(cuit ? [`temas/compras/proveedores/${cuit}.json`] : []));
    }
    case "organismos":
      return s[1] ? page("compras", `temas/compras/organismos/${s[1]}.json`) : page("compras", tema("organismos"));
    case "leyes":
      return s[1] ? page("leyes", `temas/leyes/${s[1]}.json`) : page("leyes", tema("leyes"));
    case "senales":
      return page("senales", tema("senales"));
    default:
      return null;
  }
}

type Manifest = Record<string, { file: string; imports?: string[]; css?: string[] }>;

/**
 * `<link>` tags for a page: modulepreload for its chunk and every chunk it imports (except those main.js already
 * preloads), and preload for its JSON. `entryChunks`: the files the base HTML already lists. A JSON that does not exist is
 * left out: a preload that fails shows up as an error in the console.
 */
export function preloadTags(path: string, manifest: Manifest, entryChunks: Set<string>, dataExists: (file: string) => boolean): string[] {
  const route = routePreload(path);
  if (!route) return [];
  const chunks: string[] = [];
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (!chunk || entryChunks.has(chunk.file) || chunks.includes(chunk.file)) return;
    chunks.push(chunk.file);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  visit(route.module);
  return [
    // `crossorigin` matches fetch()'s default mode: without it the browser downloads the file twice.
    ...route.data.filter(dataExists).map((d) => `<link rel="preload" href="/data/${d}" as="fetch" crossorigin="anonymous" />`),
    ...chunks.map((file) => `<link rel="modulepreload" crossorigin href="/${file}" />`),
  ];
}
