/**
 * Post-build de SEO y GEO (se corre con `bun scripts/seo.ts` después de `vite build`), a partir del
 * registro de páginas de scripts/paginas.ts:
 * - un HTML por ruta con meta tags, JSON-LD y el contenido escrito dentro de #root (lo leen buscadores,
 *   redes y motores de IA sin ejecutar JavaScript; React lo reemplaza al cargar);
 * - una imagen para compartir por página;
 * - sitemap.xml con la fecha real de cada página, robots.txt y llms.txt.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { canonicalUrl, OG_SIZE, ogImageUrl, SITE_NAME, SITE_URL } from "../src/seo.ts";
import { construirPaginas, type Pagina } from "./paginas.ts";

const WEB = join(import.meta.dirname, "..");
const DIST = join(WEB, "dist");
const DATA = join(WEB, "public", "data");
const FONTS = join(import.meta.dirname, "fonts");

const ACCENT = "#c0395f";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------------------------------------------------------------- HTML

function headTags(p: Pagina): string {
  const { path, title, description } = p;
  const url = canonicalUrl(path);
  const image = ogImageUrl(p.og.slug);
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="es-AR" href="${url}" />`,
    `<meta property="og:type" content="${path.split("/").length > 2 ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="es_AR" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_SIZE.width}" />`,
    `<meta property="og:image:height" content="${OG_SIZE.height}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta property="og:image:alt" content="${esc(`${p.og.titulo}: ${p.og.figura}`)}" />`,
    ...p.ld.map((o) => `<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", ...o })}</script>`),
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

function render(base: string, p: Pagina): string {
  return stripBase(base)
    .replace("</head>", `${headTags(p)}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${p.html}</div>`);
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

type OgData = Pagina["og"];

function ogSvg(d: OgData): string {
  const { width: W, height: H } = OG_SIZE;
  const titleLines = wrap(d.titulo, 30, 2);
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

const paginas = await construirPaginas(DATA);
const rotas = paginas.filter((p) => /\b(?:undefined|NaN|null)\b/.test(p.title + p.description + p.html + JSON.stringify(p.og)));
if (rotas.length) throw new Error(`Páginas con datos faltantes ("undefined", "NaN" o "null"): ${rotas.map((p) => p.path).join(", ")}`);
// Si el script ya corrió, dist/index.html trae el contenido de la portada: se vacía (va en una sola línea).
const base = (await readFile(join(DIST, "index.html"), "utf8")).replace(/<div id="root">[^\n]*<\/div>/, '<div id="root"></div>');
if (!base.includes('<div id="root"></div>')) throw new Error('dist/index.html no tiene <div id="root"></div>');

const slugsOg = new Set<string>();
for (const p of paginas) {
  // "/deuda" → dist/deuda.html: Cloudflare Pages lo sirve en /deuda sin redirigir a /deuda/.
  const file = p.path === "/" ? join(DIST, "index.html") : join(DIST, `${p.path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(base, p));
  if (!slugsOg.has(p.og.slug)) {
    slugsOg.add(p.og.slug);
    await writeOg(p.og.slug, p.og);
  }
}

// 404.html: Cloudflare Pages lo sirve con código 404 para cualquier ruta sin HTML propio. Es la app vacía (React
// resuelve la ruta: un proveedor sin página propia, por ejemplo, igual se ve) pero los buscadores no la indexan.
await writeFile(
  join(DIST, "404.html"),
  stripBase(base).replace("</head>", `    <title>Página no encontrada · ${SITE_NAME}</title>\n    <meta name="robots" content="noindex" />\n  </head>`),
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas.map((p) => `  <url><loc>${canonicalUrl(p.path)}</loc><lastmod>${p.lastmod.slice(0, 10)}</lastmod><priority>${p.prioridad.toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`;
await writeFile(join(DIST, "sitemap.xml"), sitemap);

// Datos públicos: bienvenidos los buscadores y los motores de IA (citan la fuente y traen gente).
const BOTS_IA = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "meta-externalagent"];
await writeFile(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\n\n${BOTS_IA.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

// llms.txt (llmstxt.org): mapa del sitio para modelos de lenguaje.
const seccion = (titulo: string, prefijo: string) => {
  const items = paginas.filter((p) => p.path.startsWith(prefijo) && p.path !== prefijo);
  return items.length ? `\n## ${titulo}\n\n${items.map((p) => `- [${p.title.replace(/ · Mendoza Transparente$/, "")}](${canonicalUrl(p.path)}): ${p.description}`).join("\n")}\n` : "";
};
const principales = paginas.filter((p) => p.path.split("/").length === 2 && p.path !== "/");
await writeFile(
  join(DIST, "llms.txt"),
  `# ${SITE_NAME}

> Proyecto ciudadano e independiente que reúne los datos públicos de la provincia de Mendoza (Argentina): funcionarios, leyes, compras del Estado, deuda, coparticipación, empleo público y población. Cada dato enlaza a su fuente oficial. Las "señales" son patrones que merecen explicación, no acusaciones.

Los datos se actualizan automáticamente desde fuentes oficiales y se pueden descargar en CSV desde cada página de /datos.

## Secciones

${principales.map((p) => `- [${p.title.replace(/ · Mendoza Transparente$/, "")}](${canonicalUrl(p.path)}): ${p.description}`).join("\n")}
${seccion("Leyes", "/leyes")}${seccion("Municipios", "/municipios")}${seccion("Funcionarios", "/funcionarios")}${seccion("Organismos que compran", "/organismos")}${seccion("Proveedores del Estado", "/proveedores")}${seccion("Datos abiertos", "/datos")}`,
);

console.log(`SEO listo: ${paginas.length} páginas, ${slugsOg.size} imágenes, sitemap.xml, robots.txt y llms.txt.`);
