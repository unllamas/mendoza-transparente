import { useEffect } from "react";

import { loadIndex } from "./lib.ts";
import type { DataIndex, SourceMeta } from "./types.ts";

/** Dominio público del sitio. Se cambia con VITE_SITE_URL (o acá) sin tocar nada más. */
export const SITE_URL: string = (import.meta.env?.VITE_SITE_URL ?? "https://mendozatransparente.org").replace(/\/+$/, "");

export const SITE_NAME = "Mendoza Transparente";
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;
export const OG_SIZE = { width: 1200, height: 630 } as const;

export interface PageMeta {
  /** Título de la pestaña y de la vista previa (máx. 60 caracteres). */
  title: string;
  /** Descripción para buscadores y redes (140-160 caracteres). */
  description: string;
  /** Slug de la imagen: /og/<slug>.png */
  ogSlug: string;
  /** Título corto que va grande en la imagen. */
  ogTitle: string;
  /** Rótulo chico arriba del título en la imagen. */
  eyebrow: string;
  /** false mientras la ruta no exista en la app: no se genera HTML ni entra al sitemap. */
  activa: boolean;
}

export const PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Mendoza Transparente: datos públicos de Mendoza",
    description:
      "Transparencia Mendoza: los datos públicos de la provincia ordenados y explicados. Deuda, coparticipación, empleo público, población y compras del Estado.",
    ogSlug: "home",
    ogTitle: "Datos públicos de Mendoza",
    eyebrow: "TRANSPARENCIA",
    activa: true,
  },
  "/deuda": {
    title: `Deuda pública de Mendoza${TITLE_SUFFIX}`,
    description:
      "Deuda pública de Mendoza: cuánto debe la provincia, a quién y en qué moneda. Evolución por gobierno, deuda por habitante y detalle de cada bono y préstamo.",
    ogSlug: "deuda",
    ogTitle: "Deuda pública de Mendoza",
    eyebrow: "DEUDA",
    activa: true,
  },
  "/coparticipacion": {
    title: `Coparticipación municipios Mendoza${TITLE_SUFFIX}`,
    description:
      "Coparticipación a municipios de Mendoza: cuánta plata recibe cada departamento, en pesos de hoy y por habitante, año por año y comparada entre sí.",
    ogSlug: "coparticipacion",
    ogTitle: "Coparticipación a municipios",
    eyebrow: "COPARTICIPACIÓN",
    activa: true,
  },
  "/empleo-publico": {
    title: `Empleo público en Mendoza${TITLE_SUFFIX}`,
    description:
      "Empleo público en Mendoza: cuántos trabajadores tiene el Estado provincial, cuántos cada mil habitantes y cómo se compara con las otras provincias del país.",
    ogSlug: "empleo-publico",
    ogTitle: "Empleo público en Mendoza",
    eyebrow: "EMPLEO PÚBLICO",
    activa: true,
  },
  "/poblacion": {
    title: `Población de Mendoza por departamento${TITLE_SUFFIX}`,
    description:
      "Población de Mendoza por departamento: habitantes actuales, censos 2010 y 2022, cuánto creció cada uno y hacia dónde se mueve la provincia. Mapa y datos.",
    ogSlug: "poblacion",
    ogTitle: "Población de Mendoza",
    eyebrow: "POBLACIÓN",
    activa: true,
  },
  "/fuentes": {
    title: `Fuentes de datos públicos de Mendoza${TITLE_SUFFIX}`,
    description:
      "Datos públicos de Mendoza en un solo lugar: todas las fuentes oficiales que usamos, de dónde salen, cada cuánto se actualizan y cómo descargarlas en CSV.",
    ogSlug: "fuentes",
    ogTitle: "Fuentes de datos públicos",
    eyebrow: "FUENTES",
    activa: true,
  },
  // Rutas por venir: activar cuando existan en la app.
  "/compras": {
    title: `Compras del Estado de Mendoza${TITLE_SUFFIX}`,
    description:
      "Compras del Estado de Mendoza: qué contrata el Gobierno, a qué proveedores y por cuánta plata. Licitaciones, adjudicaciones y el perfil de cada proveedor.",
    ogSlug: "compras",
    ogTitle: "Compras del Estado de Mendoza",
    eyebrow: "COMPRAS",
    activa: false,
  },
  "/boletin": {
    title: `Boletín Oficial de Mendoza, buscable${TITLE_SUFFIX}`,
    description:
      "Boletín Oficial de Mendoza con texto completo: buscá leyes, decretos y resoluciones por palabra, organismo o fecha, sin abrir un PDF por cada norma.",
    ogSlug: "boletin",
    ogTitle: "Boletín Oficial de Mendoza",
    eyebrow: "BOLETÍN OFICIAL",
    activa: false,
  },
};

function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(" ") > 0 ? corte.lastIndexOf(" ") : corte.length).replace(/[\s,.;:]+$/, "")}…`;
}

/** Metadatos de /datos/<fuente> a partir de la fuente de index.json. */
export function datosMeta(fuente: Pick<SourceMeta, "id" | "nombre" | "descripcion" | "organismo">): PageMeta {
  return {
    title: recortar(fuente.nombre, 60 - TITLE_SUFFIX.length) + TITLE_SUFFIX,
    description: recortar(
      `${fuente.descripcion} Datos abiertos de ${fuente.organismo} para descargar en CSV, con diccionario y fuente original. Mendoza Transparente.`,
      160,
    ),
    ogSlug: `datos-${fuente.id}`,
    ogTitle: fuente.nombre,
    eyebrow: "DATOS",
    activa: true,
  };
}

export function normalizePath(pathname: string): string {
  const p = pathname.split(/[?#]/)[0] ?? "/";
  return p.length > 1 ? p.replace(/\/+$/, "") : "/";
}

export function canonicalUrl(pathname: string): string {
  const p = normalizePath(pathname);
  return p === "/" ? `${SITE_URL}/` : `${SITE_URL}${p}`;
}

export function ogImageUrl(slug: string): string {
  return `${SITE_URL}/og/${slug}.png`;
}

/** Resuelve los metadatos de una ruta; para /datos/<fuente> necesita el índice. */
export function metaFor(pathname: string, index?: DataIndex | null): PageMeta | null {
  const p = normalizePath(pathname);
  const estatica = PAGES[p];
  if (estatica) return estatica;
  const m = /^\/datos\/([^/]+)$/.exec(p);
  if (!m) return null;
  const fuente = index?.sources.find((s) => s.id === decodeURIComponent(m[1]!));
  return fuente ? datosMeta(fuente) : null;
}

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: "name" | "property", name: string, content: string) =>
  setTag(
    `meta[${key}="${name}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute(key, name);
      return el;
    },
    "content",
    content,
  );

function applyMeta(pathname: string, m: PageMeta) {
  const url = canonicalUrl(pathname);
  const image = ogImageUrl(m.ogSlug);
  document.title = m.title;
  meta("name", "description", m.description);
  setTag(
    'link[rel="canonical"]',
    () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    },
    "href",
    url,
  );
  meta("property", "og:type", "website");
  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:locale", "es_AR");
  meta("property", "og:title", m.title);
  meta("property", "og:description", m.description);
  meta("property", "og:url", url);
  meta("property", "og:image", image);
  meta("property", "og:image:width", String(OG_SIZE.width));
  meta("property", "og:image:height", String(OG_SIZE.height));
  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", m.title);
  meta("name", "twitter:description", m.description);
  meta("name", "twitter:image", image);
}

/** Actualiza título, description, canonical, Open Graph y Twitter al navegar. */
export function usePageMeta(pathname: string): void {
  useEffect(() => {
    let cancelado = false;
    const estatica = metaFor(pathname);
    if (estatica) {
      applyMeta(pathname, estatica);
      return;
    }
    if (normalizePath(pathname).startsWith("/datos/")) {
      loadIndex()
        .then((index) => {
          const m = metaFor(pathname, index);
          if (m && !cancelado) applyMeta(pathname, m);
        })
        .catch(() => {});
    }
    return () => {
      cancelado = true;
    };
  }, [pathname]);
}
