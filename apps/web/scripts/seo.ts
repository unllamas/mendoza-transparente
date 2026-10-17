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

import { DEFAULT_PHOTO, PHOTOS, type Photo, type PhotoId } from "../src/photos.ts";
import { canonicalUrl, OG_SIZE, ogImageUrl, SITE_NAME, SITE_URL } from "../src/seo.ts";
import { construirPaginas, type Pagina } from "./paginas.ts";
import { preloadTags } from "./preload.ts";

const WEB = join(import.meta.dirname, "..");
const DIST = join(WEB, "dist");
const DATA = join(WEB, "public", "data");
const FONTS = join(import.meta.dirname, "fonts");

const ACCENT = "#74acdf";
/** Goes into the image hash: bump it when the design of the share images changes, so networks fetch them again. */
const OG_DESIGN = 2;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------------------------------------------------------------- HTML

function headTags(p: Pagina): string {
  const { path, title, description } = p;
  const url = canonicalUrl(path);
  // Social networks cache images by URL: a hash of the image content makes them fetch it again when it changes.
  const image = `${ogImageUrl(p.og.slug)}?v=${new Bun.CryptoHasher("sha1")
    .update(JSON.stringify({ ...p.og, photo: p.og.photo ?? DEFAULT_PHOTO, design: OG_DESIGN }))
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

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const words = text.split(/ +/);
  for (const [i, w] of words.entries()) {
    if (cur && `${cur} ${w}`.length > maxChars) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        cur = "";
        lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[\s,.;:]+$/, "")}…`;
        return lines;
      }
    } else cur = cur ? `${cur} ${w}` : w;
    if (i === words.length - 1 && cur) lines.push(cur);
  }
  return lines.slice(0, maxLines);
}

type OgData = Pagina["og"];

/**
 * The page's landscape in dots, like `DotImage` on the site: dim behind the text, brighter toward the top
 * right corner. Each dot is a flat circle with the color of its cell (resvg renders the photo at one pixel per
 * dot to read them), which keeps the PNG under the 300 KB WhatsApp accepts. Drawn once per photo, as a PNG layer.
 */
const photoLayers = new Map<PhotoId, string>();
const NO_SYSTEM_FONTS = { font: { loadSystemFonts: false } }; // loading them takes ~3 s per render

function photoLayer(id: PhotoId): string {
  const cached = photoLayers.get(id);
  if (cached) return cached;
  const { width: W, height: H } = OG_SIZE;
  const photo: Photo = PHOTOS[id];
  const jpg = readFileSync(join(WEB, "public", photo.src));
  // object-position → preserveAspectRatio, which only takes start/middle/end: the closest one is enough here.
  const align = (v = "50%") => {
    const n = Number.parseFloat(v);
    return n < 34 ? "Min" : n > 66 ? "Max" : "Mid";
  };
  const [fx, fy] = (photo.focus ?? "").split(" ");
  const dot = 12;
  const cols = W / dot;
  const rows = Math.ceil(H / dot);
  const grid = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cols}" height="${rows}">
      <image xlink:href="data:image/jpeg;base64,${jpg.toString("base64")}" width="${cols}" height="${rows}" preserveAspectRatio="x${align(fx)}Y${align(fy)} slice"/>
    </svg>`,
    NO_SYSTEM_FONTS,
  ).render().pixels;
  const BG = 13; // #0d0d0d
  const circles: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c / (cols - 1);
      const y = r / (rows - 1);
      // How much of the photo shows: 14 % on the left half, up to 85 % in the top right corner.
      const k = 0.14 + 0.71 * Math.max(0, (x - 0.35) / 0.65) ** 1.2 * (1 - 0.5 * y);
      const i = (r * cols + c) * 4;
      // Quantized to steps of 16: fewer distinct colors make a much smaller PNG, with no visible difference.
      const [cr = 0, cg = 0, cb = 0] = [0, 1, 2].map((o) => Math.round((BG + ((grid[i + o] ?? 0) - BG) * k) / 16) * 16);
      if (Math.max(cr, cg, cb) < BG + 6) continue;
      circles.push(`<circle cx="${c * dot + dot / 2}" cy="${r * dot + dot / 2}" r="${dot * 0.42}" fill="rgb(${cr},${cg},${cb})"/>`);
    }
  }
  const png = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${circles.join("")}</svg>`, NO_SYSTEM_FONTS)
    .render()
    .asPng();
  const uri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  photoLayers.set(id, uri);
  return uri;
}

function ogSvg(d: OgData): string {
  const { width: W, height: H } = OG_SIZE;
  const titleLines = wrap(d.titulo, 30, 2);
  const titleSize = 64;
  const title = titleLines
    .map((l, i) => `<text x="80" y="${210 + i * 76}" font-size="${titleSize}" font-weight="700" fill="#ffffff">${esc(l)}</text>`)
    .join("");
  const figSize = Math.round(Math.min(titleLines.length > 1 ? 100 : 150, 1040 / (d.figura.length * 0.64)));
  const bajada = wrap(d.bajada, 62, 2)
    .map((l, i) => `<text x="80" y="${487 + i * 40}" font-size="30" fill="#d4d4d4">${esc(l)}</text>`)
    .join("");
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <rect width="${W}" height="${H}" fill="#0d0d0d"/>
  <image xlink:href="${photoLayer(d.photo ?? DEFAULT_PHOTO)}" width="${W}" height="${H}"/>
  <rect x="80" y="72" width="56" height="6" rx="3" fill="${ACCENT}"/>
  <text x="152" y="82" font-size="22" font-weight="700" letter-spacing="3" fill="#a3a3a3">${esc(d.eyebrow)}</text>
  ${title}
  <text x="76" y="${titleLines.length > 1 ? 430 : 380}" font-size="${figSize}" font-weight="700" letter-spacing="-3" fill="#ffffff">${esc(d.figura)}</text>
  ${bajada}
  <line x1="80" y1="548" x2="${W - 80}" y2="548" stroke="#262626" stroke-width="2"/>
  <text x="80" y="590" font-size="26" font-weight="700" fill="#ffffff">${SITE_NAME}</text>
  <text x="${W - 80}" y="590" font-size="24" text-anchor="end" fill="#a3a3a3">${esc(host)}</text>
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
for (const p of paginas) {
  // "/deuda" → dist/deuda.html: Cloudflare Pages lo sirve en /deuda sin redirigir a /deuda/.
  const file = p.path === "/" ? join(DIST, "index.html") : join(DIST, `${p.path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(base, p, preloadTags(p.path, manifest, entryChunks, dataExists)));
  if (!slugsOg.has(p.og.slug)) {
    slugsOg.add(p.og.slug);
    await writeOg(p.og.slug, p.og);
  }
}

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
await writeFile(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\n\n${BOTS_IA.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\nSitemap: ${SITE_URL}/sitemap.xml\n`,
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
${seccion("Leyes", "/leyes")}${seccion("Municipios", "/municipios")}${seccion("Funcionarios", "/funcionarios")}${seccion("Organismos que compran", "/organismos")}${seccion("Proveedores del Estado", "/proveedores")}${seccion("Datos abiertos", "/datos")}`,
);

console.log(`SEO listo: ${paginas.length} páginas, ${slugsOg.size} imágenes, sitemap.xml, robots.txt y llms.txt.`);
