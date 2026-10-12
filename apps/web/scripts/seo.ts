/**
 * Post-build de SEO (se corre con `bun scripts/seo.ts` después de `vite build`):
 * HTML por ruta con meta tags y JSON-LD, imágenes OG, sitemap.xml y robots.txt.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import {
  canonicalUrl,
  datosMeta,
  OG_SIZE,
  ogImageUrl,
  PAGES,
  SITE_NAME,
  SITE_URL,
  type PageMeta,
} from "../src/seo.ts";
import type { CoparticipacionTema, DataIndex, DeudaTema, EmpleoTema, PoblacionTema } from "../src/types.ts";

const WEB = join(import.meta.dirname, "..");
const DIST = join(WEB, "dist");
const DATA = join(WEB, "public", "data");
const FONTS = join(import.meta.dirname, "fonts");

const ACCENT = "#3987e5";
const nf = new Intl.NumberFormat("es-AR");
const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(DATA, path), "utf8")) as T;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------------------------------------------------------------- HTML

function headTags(path: string, m: PageMeta, ld: unknown[]): string {
  const url = canonicalUrl(path);
  const image = ogImageUrl(m.ogSlug);
  const lines = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="es_AR" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_SIZE.width}" />`,
    `<meta property="og:image:height" content="${OG_SIZE.height}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`),
  ];
  return lines.map((l) => `    ${l}`).join("\n");
}

/** Saca del HTML base los tags que se reemplazan, para no duplicarlos. */
function stripBase(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/g, "")
    .replace(/<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/g, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "");
}

function render(base: string, path: string, m: PageMeta, ld: unknown[]): string {
  return stripBase(base).replace("</head>", `${headTags(path, m, ld)}\n  </head>`);
}

// ---------------------------------------------------------------- OG

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const words = text.split(/ +/);
  for (const [i, w] of words.entries()) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        cur = "";
        lines[maxLines - 1] = lines[maxLines - 1]!.replace(/[\s,.;:]+$/, "") + "…";
        return lines;
      }
    } else cur = cur ? `${cur} ${w}` : w;
    if (i === words.length - 1 && cur) lines.push(cur);
  }
  return lines.slice(0, maxLines);
}

interface OgData {
  eyebrow: string;
  title: string;
  figura: string;
  bajada: string;
}

function ogSvg(d: OgData): string {
  const { width: W, height: H } = OG_SIZE;
  const titleLines = wrap(d.title, 30, 2);
  const titleSize = 64;
  const title = titleLines
    .map((l, i) => `<text x="80" y="${210 + i * 76}" font-size="${titleSize}" font-weight="700" fill="#ffffff">${esc(l)}</text>`)
    .join("");
  const figSize = Math.round(Math.min(titleLines.length > 1 ? 100 : 150, 1040 / (d.figura.length * 0.64)));
  const bajada = wrap(d.bajada, 62, 2)
    .map((l, i) => `<text x="80" y="${487 + i * 40}" font-size="30" fill="#a3a3a3">${esc(l)}</text>`)
    .join("");
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <rect width="${W}" height="${H}" fill="#0d0d0d"/>
  <rect x="80" y="72" width="56" height="6" rx="3" fill="${ACCENT}"/>
  <text x="152" y="82" font-size="22" font-weight="700" letter-spacing="3" fill="#8a8a8a">${esc(d.eyebrow)}</text>
  ${title}
  <text x="76" y="${titleLines.length > 1 ? 430 : 380}" font-size="${figSize}" font-weight="700" letter-spacing="-3" fill="#ffffff">${esc(d.figura)}</text>
  ${bajada}
  <line x1="80" y1="548" x2="${W - 80}" y2="548" stroke="#262626" stroke-width="2"/>
  <text x="80" y="590" font-size="26" font-weight="700" fill="#ffffff">${SITE_NAME}</text>
  <text x="${W - 80}" y="590" font-size="24" text-anchor="end" fill="#8a8a8a">${esc(host)}</text>
</svg>`;
}

async function writeOg(slug: string, d: OgData) {
  const png = new Resvg(ogSvg(d), {
    font: {
      loadSystemFonts: false,
      fontFiles: [join(FONTS, "Inter-Regular.ttf"), join(FONTS, "Inter-Bold.ttf")],
      defaultFontFamily: "Inter",
    },
  })
    .render()
    .asPng();
  const out = join(DIST, "og", `${slug}.png`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);
}

// ---------------------------------------------------------------- main

const index = await json<DataIndex>("index.json");
const [deuda, copa, empleo, poblacion] = await Promise.all([
  json<DeudaTema>("temas/deuda.json"),
  json<CoparticipacionTema>("temas/coparticipacion.json"),
  json<EmpleoTema>("temas/empleo.json"),
  json<PoblacionTema>("temas/poblacion.json"),
]);
const rows = (source: string, file: string) => index.datasets.find((d) => d.source === source && d.file === file)?.rowCount;
const rowsFuente = (id: string) => index.datasets.filter((d) => d.source === id).reduce((a, d) => a + d.rowCount, 0);

const noPublicadoCount = (await json<unknown[]>("temas/no-publicado.json").catch(() => [])).length;

const figuras: Record<string, { figura: string; bajada: string }> = {
  "/": {
    figura: `${index.sources.length} fuentes`,
    bajada: "Deuda, coparticipación, empleo, población y compras del Estado, ordenados y para descargar.",
  },
  "/deuda": {
    figura: `US$ ${nf.format(Math.round(deuda.totalUsd))} M`,
    bajada: `Deuda total de la provincia al ${fechaLarga(deuda.corte)}: unos US$\u00a0${nf.format(Math.round(deuda.porHabitanteUsd))} por habitante.`,
  },
  "/coparticipacion": {
    figura: `$ ${nf.format(Math.round(copa.totalReal / 1e9))} mil M`,
    bajada: `Repartido entre los municipios en ${copa.anioCompleto}, en pesos de ${copa.referencia}.`,
  },
  "/empleo-publico": {
    figura: `${nf1.format(empleo.cadaMilMendoza)} cada mil`,
    bajada: `Empleados públicos cada mil habitantes en ${empleo.anio}. Promedio del país: ${nf1.format(empleo.promedioPais)}.`,
  },
  "/poblacion": {
    figura: nf.format(poblacion.actual),
    bajada: `Habitantes estimados en ${poblacion.anioActual}, repartidos en ${poblacion.departamentos.length} departamentos.`,
  },
  "/fuentes": {
    figura: `${index.sources.length} fuentes`,
    bajada: "Oficiales y abiertas: de dónde sale cada dato, cada cuánto se actualiza y cómo bajarlo.",
  },
  "/no-publicado": {
    figura: `${noPublicadoCount} datos`,
    bajada: "Que deberían ser públicos y no lo son. Te explicamos cómo pedirlos con la Ley 9070.",
  },
  "/compras": {
    figura: `${nf.format(rows("compras-ocds", "procesos.csv") ?? 0)} procesos`,
    bajada: "Contrataciones del Estado provincial: qué compra, a quién y por cuánta plata.",
  },
  "/boletin": {
    figura: `${nf.format(rows("boletin-oficial", "normas.csv") ?? 0)} normas`,
    bajada: "Leyes, decretos y resoluciones del Boletín Oficial, con su texto completo.",
  },
};

const base = await readFile(join(DIST, "index.html"), "utf8");
const lastmod = index.generatedAt.slice(0, 10);
const urls: string[] = [];

const organization = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/favicon.svg`,
};

async function emit(path: string, m: PageMeta, ld: unknown[]) {
  // "/deuda" → dist/deuda.html: Cloudflare Pages lo sirve en /deuda sin redirigir a /deuda/.
  const file = path === "/" ? join(DIST, "index.html") : join(DIST, `${path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(base, path, m, ld));
  urls.push(canonicalUrl(path));
}

for (const [path, m] of Object.entries(PAGES)) {
  if (!m.activa) continue;
  const f = figuras[path]!;
  await writeOg(m.ogSlug, { eyebrow: m.eyebrow, title: m.ogTitle, ...f });
  const ld =
    path === "/"
      ? [
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: `${SITE_URL}/`,
            description: m.description,
            inLanguage: "es-AR",
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          { "@context": "https://schema.org", ...organization },
        ]
      : [];
  await emit(path, m, ld);
}

for (const s of index.sources) {
  const m = datosMeta(s);
  const path = `/datos/${s.id}`;
  await writeOg(m.ogSlug, {
    eyebrow: m.eyebrow,
    title: m.ogTitle,
    figura: `${nf.format(rowsFuente(s.id))} filas`,
    bajada: s.descripcion,
  });
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: s.nombre,
    description: s.descripcion,
    url: canonicalUrl(path),
    creator: { "@type": "Organization", name: s.organismo },
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    inLanguage: "es-AR",
    spatialCoverage: "Mendoza, Argentina",
    isBasedOn: s.url,
    dateModified: s.raw.lastFetch ?? index.generatedAt,
    publisher: { "@id": `${SITE_URL}/#organization` },
    distribution: index.datasets
      .filter((d) => d.source === s.id)
      .map((d) => ({
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE_URL}/data/${d.source}/${d.file}`,
      })),
  };
  await emit(path, m, [dataset]);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
await writeFile(join(DIST, "sitemap.xml"), sitemap);
await writeFile(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`SEO listo: ${urls.length} páginas, sitemap.xml, robots.txt, imágenes OG en dist/og.`);
