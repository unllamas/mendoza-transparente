/**
 * Post-build de SEO y GEO (se corre con `bun scripts/seo.ts` después de `vite build`), a partir del
 * registro de páginas de scripts/paginas.ts:
 * - un HTML por ruta con meta tags, JSON-LD y el contenido escrito dentro de #root (lo leen buscadores,
 *   redes y motores de IA sin ejecutar JavaScript; React lo reemplaza al cargar);
 * - una imagen para compartir por página;
 * - sitemap.xml con la fecha real de cada página, robots.txt y llms.txt.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { canonicalUrl, OG_SIZE, ogImageUrl, SITE_NAME, SITE_URL } from "../src/seo.ts";
import { construirPaginas, type Pagina } from "./paginas.ts";
import { preloadTags } from "./preload.ts";

const WEB = join(import.meta.dirname, "..");
const DIST = join(WEB, "dist");
const DATA = join(WEB, "public", "data");
const FONTS = join(import.meta.dirname, "fonts");

const ACCENT = "#74acdf";
/** La cifra de la imagen, en el azul de la marca (accent-700, el de las acciones). */
const FIGURE = "#185893";
/** Entra en el hash de la imagen: subirlo cuando cambia el diseño, para que las redes la vuelvan a pedir. */
const OG_DESIGN = 3;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------------------------------------------------------------- HTML

function headTags(p: Pagina): string {
  const { path, title, description } = p;
  const url = canonicalUrl(path);
  // Las redes guardan la imagen por URL: un hash de su contenido hace que la vuelvan a pedir cuando cambia.
  const image = `${ogImageUrl(p.og.slug)}?v=${new Bun.CryptoHasher("sha1")
    .update(JSON.stringify({ ...p.og, design: OG_DESIGN }))
    .digest("hex")
    .slice(0, 8)}`;
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
    `<meta property="og:image:type" content="image/webp" />`,
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

function render(base: string, p: Pagina, preload: string[]): string {
  return stripBase(base)
    .replace("</head>", `${[headTags(p), ...preload.map((l) => `    ${l}`)].join("\n")}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${p.html}</div>`);
}

// ---------------------------------------------------------------- OG

/**
 * Corta `text` en líneas de hasta `maxChars` caracteres, parejas: si no entra en una línea, busca el ancho más
 * chico que lo deja en la misma cantidad de líneas, como `text-wrap: balance`. Así nunca queda una palabra huérfana
 * («Cada persona, con su / partido» pasa a «Cada persona, / con su partido»). Si no entra en `maxLines`, corta la
 * última con «…».
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const greedy = (width: number): string[] => {
    const lines: string[] = [];
    let cur = "";
    for (const w of text.split(/ +/)) {
      if (cur && `${cur} ${w}`.length > width) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const lines = greedy(maxChars);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1]!.replace(/[\s,.;:]+$/, "")}…`;
    return cut;
  }
  let best = lines;
  for (let width = maxChars - 1; width > 0; width--) {
    const tried = greedy(width);
    if (tried.length > lines.length) break;
    best = tried;
  }
  return best;
}

type OgData = Pagina["og"];

/**
 * Fondo de todas las imágenes: la ilustración de Mendoza de la portada (`public/fondos/portada.webp`), con un velo
 * blanco detrás del texto, como en el hero. Se prepara una sola vez, al ancho de la imagen y en JPEG (resvg no lee WebP):
 * resvg la decodifica en cada imagen, y una chica es lo que hace rápido el build.
 */
const BACKGROUND = `data:image/jpeg;base64,${Buffer.from(
  await new Bun.Image(readFileSync(join(WEB, "public", "fondos", "portada.webp")))
    .resize(OG_SIZE.width, OG_SIZE.height * 2, { fit: "inside" })
    .jpeg({ quality: 90 })
    .bytes(),
).toString("base64")}`;

function ogSvg(d: OgData): string {
  const { width: W, height: H } = OG_SIZE;
  const titleLines = wrap(d.titulo, 26, 2);
  const title = titleLines
    .map((l, i) => `<text x="80" y="${180 + i * 72}" font-size="60" font-weight="700" letter-spacing="-1" fill="#0a0a0a">${esc(l)}</text>`)
    .join("");
  const figY = 200 + titleLines.length * 72 + 70;
  const figSize = Math.round(Math.min(104, 1040 / (d.figura.length * 0.62)));
  const bajada = wrap(d.bajada, 46, 2)
    .map((l, i) => `<text x="80" y="${figY + 56 + i * 38}" font-size="28" fill="#404040">${esc(l)}</text>`)
    .join("");
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <defs>
    <linearGradient id="velo" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.94"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.82"/>
      <stop offset="0.75" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pie" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <image xlink:href="${BACKGROUND}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${W}" height="${H}" fill="url(#velo)"/>
  <rect y="470" width="${W}" height="160" fill="url(#pie)"/>
  <rect x="80" y="72" width="56" height="6" rx="3" fill="${ACCENT}"/>
  <text x="152" y="82" font-size="22" font-weight="700" letter-spacing="3" fill="#525252">${esc(d.eyebrow)}</text>
  ${title}
  <text x="76" y="${figY}" font-size="${figSize}" font-weight="700" letter-spacing="-3" fill="${FIGURE}">${esc(d.figura)}</text>
  ${bajada}
  <text x="80" y="590" font-size="26" font-weight="700" fill="#0a0a0a">${SITE_NAME}</text>
  <text x="${W - 80}" y="590" font-size="24" text-anchor="end" fill="#525252">${esc(host)}</text>
</svg>`;
}

/**
 * WebP al 80 %: unos 50 KB por imagen, muy por debajo de los 300 KB que acepta WhatsApp. El dibujo es sincrónico y
 * la conversión a WebP corre en otro hilo: se devuelve sin esperarla, para dibujar la siguiente mientras tanto.
 */
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
  const out = join(DIST, "og", `${slug}.webp`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await new Bun.Image(png).webp({ quality: 80 }).bytes());
}

// ---------------------------------------------------------------- main

const paginas = await construirPaginas(DATA);
const rotas = paginas.filter((p) => /\b(?:undefined|NaN|null)\b/.test(p.title + p.description + p.html + JSON.stringify(p.og)));
if (rotas.length) throw new Error(`Páginas con datos faltantes ("undefined", "NaN" o "null"): ${rotas.map((p) => p.path).join(", ")}`);
// Si el script ya corrió, dist/index.html trae el contenido de la portada: se vacía (va en una sola línea).
let base = (await readFile(join(DIST, "index.html"), "utf8")).replace(/<div id="root">[^\n]*<\/div>/, '<div id="root"></div>');
if (!base.includes('<div id="root"></div>')) throw new Error('dist/index.html no tiene <div id="root"></div>');

// The stylesheet goes inside the HTML: one round trip less before the first paint on slow connections
// (it is small, ~8 KB compressed). SPA navigations do not download HTML again, so it is not repeated.
const stylesheet = base.match(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/);
if (stylesheet) {
  const css = await readFile(join(DIST, stylesheet[1]!), "utf8");
  base = base.replace(stylesheet[0], () => `<style>${css}</style>`);
}

// First layer of each page (scripts/preload.ts): its chunk and its JSON start with the HTML. Vite's manifest says which
// chunks each page imports; it is only for this script, so it does not get published.
const manifestFile = join(DIST, ".vite", "manifest.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
await rm(join(DIST, ".vite"), { recursive: true, force: true });
const entryChunks = new Set([...base.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!));
const dataExists = (file: string) => existsSync(join(DIST, "data", file));

const slugsOg = new Set<string>();
/** Imágenes que se están pasando a WebP: hasta 4 a la vez, para no juntar cientos de PNG en memoria. */
const writingOg = new Set<Promise<void>>();
for (const p of paginas) {
  // "/deuda" → dist/deuda.html: Cloudflare Pages lo sirve en /deuda sin redirigir a /deuda/.
  const file = p.path === "/" ? join(DIST, "index.html") : join(DIST, `${p.path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(base, p, preloadTags(p.path, manifest, entryChunks, dataExists)));
  if (!slugsOg.has(p.og.slug)) {
    slugsOg.add(p.og.slug);
    const writing = writeOg(p.og.slug, p.og).finally(() => writingOg.delete(writing));
    writingOg.add(writing);
    if (writingOg.size >= 4) await Promise.race(writingOg);
  }
}
await Promise.all(writingOg);

// 404.html: Cloudflare Pages lo sirve con código 404 para cualquier ruta sin HTML propio. Es la app vacía (React
// resuelve la ruta: un proveedor sin página propia, por ejemplo, igual se ve) pero los buscadores no la indexan.
await writeFile(
  join(DIST, "404.html"),
  stripBase(base).replace(
    "</head>",
    `    <title>Página no encontrada · ${SITE_NAME}</title>\n    <meta name="robots" content="noindex" />\n  </head>`,
  ),
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas.map((p) => `  <url><loc>${canonicalUrl(p.path)}</loc><lastmod>${p.lastmod.slice(0, 10)}</lastmod><priority>${p.prioridad.toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`;
await writeFile(join(DIST, "sitemap.xml"), sitemap);

// Datos públicos: bienvenidos los buscadores y los motores de IA (citan la fuente y traen gente).
const BOTS_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];
// SEO tools crawl the whole site (with every JS file) in bursts and bring no readers: welcome, but slower.
// All of them honor Crawl-delay; Google ignores it and is not on the list.
const SEO_CRAWLERS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "SeekportBot", "serpstatbot"];
await writeFile(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\n\n${BOTS_IA.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\n${SEO_CRAWLERS.map((b) => `User-agent: ${b}`).join("\n")}\nAllow: /\nCrawl-delay: 10\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

// llms.txt (llmstxt.org): mapa del sitio para modelos de lenguaje.
const seccion = (titulo: string, prefijo: string) => {
  const items = paginas.filter((p) => p.path.startsWith(prefijo) && p.path !== prefijo);
  return items.length
    ? `\n## ${titulo}\n\n${items.map((p) => `- [${p.title.replace(/ · Mendoza Transparente$/, "")}](${canonicalUrl(p.path)}): ${p.description}`).join("\n")}\n`
    : "";
};
const principales = paginas.filter((p) => p.path.split("/").length === 2 && p.path !== "/");
await writeFile(
  join(DIST, "llms.txt"),
  `# ${SITE_NAME}

> Proyecto ciudadano e independiente que reúne los datos públicos de la provincia de Mendoza (Argentina): funcionarios, leyes, compras del Estado, deuda, coparticipación, empleo público y población. Cada dato enlaza a su fuente oficial. Las "señales" son patrones que merecen explicación, no acusaciones.

Los datos se actualizan automáticamente desde fuentes oficiales y se pueden descargar en CSV desde cada página de /datos.

## Secciones

${principales.map((p) => `- [${p.title.replace(/ · Mendoza Transparente$/, "")}](${canonicalUrl(p.path)}): ${p.description}`).join("\n")}
${seccion("Leyes", "/leyes")}${seccion("Municipios", "/municipios")}${seccion("Funcionarios", "/funcionarios")}${seccion("Partidos, frentes y bloques", "/partidos")}${seccion("Organismos que compran", "/organismos")}${seccion("Proveedores del Estado", "/proveedores")}${seccion("Datos abiertos", "/datos")}`,
);

console.log(`SEO listo: ${paginas.length} páginas, ${slugsOg.size} imágenes, sitemap.xml, robots.txt y llms.txt.`);
