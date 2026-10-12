/**
 * Fotos oficiales de los funcionarios de legisladores.csv y autoridades.csv.
 *
 * Sólo fuentes oficiales; cada foto se descarga con get(), se archiva sin tocar en
 * data/raw/fotos/<fecha>/ y se genera una miniatura cuadrada de 192x192 JPEG en
 * data/processed/fotos/<id>.jpg (con `sips`, sólo macOS).
 *
 * Fuentes por grupo:
 *  - Diputados provinciales: páginas de bloque de hcdmza.gob.ar (la <img> del flip-container de cada diputado).
 *  - Senadores provinciales y vicegobernadora: API WordPress de senadomendoza.gob.ar (featured_media de
 *    /senadores y /autoridades; /media da la URL del archivo).
 *  - Diputados nacionales: listado hcdn.gob.ar/diputados/diputados-por-distrito.html (JSON `listado` embebido, campo `foto`; sólo hay
 *    la versión _small.png, de baja resolución).
 *  - Senadores nacionales: senado.gob.ar/senadores/listados/listaSenadoRes (foto GIF por senador). Con este
 *    scraper el sitio no pidió captcha en el listado; la ficha individual no se consulta.
 *  - Ejecutivo provincial: páginas "Información Oficial" de cada ministerio (sitios.mendoza.gob.ar) y portal
 *    informacionoficial.mendoza.gob.ar para el gobernador. Los sitios .gov.ar/.gob.ar de la provincia con
 *    wp-json bloquean REST (403), por eso se lee el HTML.
 *  - Intendentes: sitios oficiales de cada municipio; las URL están cargadas a mano (INTENDENTES) porque cada
 *    sitio es distinto.
 *
 * Uso: bun run scrape fotos
 */

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cheerio from "cheerio";

import { archive, get, latestRaw, PROCESSED_DIR, readRaw, toCsv, type Row } from "@mt/core";

const SOURCE = "fotos";
const HCD = "https://www.hcdmza.gob.ar";
const HCS = "https://www.senadomendoza.gob.ar";
const OUT_DIR = join(PROCESSED_DIR, SOURCE);
const SIZE = 192;

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** CSV simple con comillas (los CSV de entrada las usan en cargos con coma). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  const [head, ...rest] = rows;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(head!.map((h, k) => [h, r[k] ?? ""])));
}

async function readCsv(rel: string) {
  return parseCsv(await readFile(join(PROCESSED_DIR, rel), "utf8"));
}

// Cache de páginas: un pedido por URL, archivado.
const pageCache = new Map<string, string>();
async function page(url: string, filename: string): Promise<string> {
  const hit = pageCache.get(url);
  if (hit !== undefined) return hit;
  const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
  await archive(SOURCE, filename, bytes, { url });
  const text = new TextDecoder().decode(bytes);
  pageCache.set(url, text);
  return text;
}

interface Candidate {
  id: string;
  grupo: string;
  foto_url: string;
  pagina: string;
  credito: string;
  /** Fracción del exceso vertical que se descarta por arriba al recortar (retratos con cabeza arriba). */
  top?: number;
}

// ---------------------------------------------------------------- Diputados provinciales

async function diputadosProv(legs: Record<string, string>[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const byBloque = new Map<string, Record<string, string>[]>();
  for (const l of legs.filter((x) => x.camara === "diputados")) {
    byBloque.set(l.perfil_url!, [...(byBloque.get(l.perfil_url!) ?? []), l]);
  }
  for (const [url, people] of byBloque) {
    const $ = cheerio.load(await page(url, `hcd-bloque-${url.split("/").pop()}.html`));
    const imgs = new Map<string, string>();
    $(".flip-container").each((_, el) => {
      const nombre = $(el).find(".front .sppb-person-name").text().replace(/\s+/g, " ").trim();
      const src = $(el).find(".front img").attr("src");
      if (nombre && src) imgs.set(fold(nombre), new URL(src, HCD).href);
    });
    for (const p of people) {
      const src = imgs.get(fold(p.nombre!));
      if (src) out.push({ id: p.id!, grupo: "diputados_prov", foto_url: src, pagina: url, credito: "Honorable Cámara de Diputados de Mendoza", top: 0.1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Senado provincial

async function mediaUrls(ids: number[]): Promise<Map<number, string>> {
  const url = `${HCS}/wp-json/wp/v2/media?include=${ids.join(",")}&per_page=100&_fields=id,source_url`;
  const data = JSON.parse(await page(url, `hcs-media-${ids.length}-${ids[0]}.json`)) as { id: number; source_url: string }[];
  return new Map(data.map((m) => [m.id, m.source_url]));
}

async function senadoProv(legs: Record<string, string>[]): Promise<Candidate[]> {
  const list = JSON.parse(
    await page(`${HCS}/wp-json/wp/v2/senadores?per_page=100&_fields=id,link,featured_media`, "hcs-senadores-media.json"),
  ) as { link: string; featured_media: number }[];
  const aut = JSON.parse(
    await page(`${HCS}/wp-json/wp/v2/autoridades?per_page=100&_fields=id,link,title,featured_media`, "hcs-autoridades-media.json"),
  ) as { link: string; title: { rendered: string }; featured_media: number }[];
  const media = await mediaUrls([...new Set([...list, ...aut].map((s) => s.featured_media).filter(Boolean))]);

  const out: Candidate[] = [];
  const credito = "Honorable Senado de Mendoza";
  for (const l of legs.filter((x) => x.camara === "senado")) {
    const s = list.find((x) => x.link === l.perfil_url);
    const url = s && media.get(s.featured_media);
    if (url) out.push({ id: l.id!, grupo: "senadores_prov", foto_url: url, pagina: l.perfil_url!, credito, top: 0.1 });
  }
  const hebe = aut.find((a) => /hebe/i.test(a.title.rendered) && /casado/i.test(a.title.rendered));
  const hurl = hebe && media.get(hebe.featured_media);
  if (hebe && hurl) out.push({ id: "hebe-casado", grupo: "ejecutivo", foto_url: hurl, pagina: hebe.link, credito, top: 0.1 });
  return out;
}

// ---------------------------------------------------------------- Congreso de la Nación

async function diputadosNac(auts: Record<string, string>[]): Promise<Candidate[]> {
  const url = "https://www.hcdn.gob.ar/diputados/diputados-por-distrito.html";
  const html = await page(url, "hcdn-diputados-por-distrito.html");
  const m = html.match(/let listado = (\{.*\})\.data\.diputados;/);
  if (!m) throw new Error("No se encontró el JSON listado en hcdn.gob.ar/diputados/");
  const data = JSON.parse(m[1]!) as { data: { diputados: Record<string, { nombre: string; apellido: string; foto: string; mail: string }[]> } };
  const mza = data.data.diputados["MENDOZA"] ?? [];
  const out: Candidate[] = [];
  for (const a of auts.filter((x) => x.poder === "legislativo_nacional" && /diputado/i.test(x.cargo!))) {
    // perfil_url: https://www.hcdn.gob.ar/diputados/<usuario>/ y el usuario es el mail sin dominio.
    const user = a.perfil_url!.split("/").filter(Boolean).pop()!.toLowerCase();
    const d = mza.find((x) => x.mail.split("@")[0]!.toLowerCase() === user);
    if (d?.foto) out.push({ id: a.id!, grupo: "diputados_nac", foto_url: d.foto, pagina: a.perfil_url!, credito: "Honorable Cámara de Diputados de la Nación" });
  }
  return out;
}

async function senadoNac(auts: Record<string, string>[]): Promise<Candidate[]> {
  const url = "https://www.senado.gob.ar/senadores/listados/listaSenadoRes";
  // El Senado de la Nación a veces responde con una página de captcha (F5) en vez del listado.
  // No se intenta resolver: se usa la copia archivada por el scraper `autoridades` (mismo listado).
  let html = new TextDecoder().decode(new Uint8Array(await (await get(url)).arrayBuffer()));
  if (html.includes("/senadores/senador/")) {
    await archive(SOURCE, "senado-lista-senadores.html", html, { url });
  } else {
    console.warn("senado.gob.ar devolvió un captcha para el listado; se usa la copia archivada por `autoridades`.");
    const raw = await latestRaw("autoridades", "senado-lista-senadores.html");
    if (!raw) throw new Error("sin listado del Senado de la Nación");
    html = (await readRaw(raw)).toString("utf8");
  }
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  for (const a of auts.filter((x) => x.poder === "legislativo_nacional" && /senador/i.test(x.cargo!))) {
    const sid = a.perfil_url!.split("/").pop()!;
    const src = $(`a[href$="/senadores/senador/${sid}"] img`).first().attr("data-src");
    if (src) out.push({ id: a.id!, grupo: "senadores_nac", foto_url: new URL(src, "https://www.senado.gob.ar").href, pagina: a.perfil_url!, credito: "Honorable Senado de la Nación" });
  }
  return out;
}

// ---------------------------------------------------------------- Ejecutivo provincial

const SITIOS = "https://sitios.mendoza.gob.ar";
const MINISTERIOS: Record<string, string> = {
  "natalio-mema": `${SITIOS}/gobiernoinfraestructura/informacion-oficial-plantilla-para-ministerios/`,
  "mercedes-rus": `${SITIOS}/seguridadyjusticia/informacion-oficial-plantilla-para-ministerios/`,
  "victor-fayad": `${SITIOS}/haciendayfinanzas/informacion-oficial/`,
  "rodolfo-vargas-arizu": `${SITIOS}/produccion/informacion-oficial/`,
  "rodolfo-montero": `${SITIOS}/saludydeportes/informacion-oficial/`,
  "jimena-latorre": `${SITIOS}/energiayambiente/informacion-oficial-2/`,
  "tadeo-garcia-zalazar": `${SITIOS}/educacion-cultura-infancias-dge/informacion-oficial/`,
  "gabriela-testa": `${SITIOS}/turismo/informacion-oficial/`,
};

/** Primera imagen de contenido (no logos ni íconos del portal) de una página del Gobierno de Mendoza. */
function primeraFoto(html: string, base: string): string | undefined {
  const $ = cheerio.load(html);
  let found: string | undefined;
  $("img").each((_, el) => {
    if (found) return false;
    const src = $(el).attr("src") ?? "";
    const w = Number($(el).attr("width") ?? 0);
    if (!src || /marca_gov|SITIO-AC|Capa_1|icono|logo/i.test(src) || w < 300) return;
    found = new URL(src, base).href;
  });
  return found;
}

async function ejecutivo(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const credito = "Gobierno de Mendoza";
  const home = "https://informacionoficial.mendoza.gob.ar/";
  const gob = primeraFoto(await page(home, "informacionoficial-home.html"), home);
  if (gob) out.push({ id: "alfredo-cornejo", grupo: "ejecutivo", foto_url: gob, pagina: home, credito, top: 0.1 });
  for (const [id, url] of Object.entries(MINISTERIOS)) {
    const src = primeraFoto(await page(url, `ministerio-${id}.html`), url);
    if (src) out.push({ id, grupo: "ejecutivo", foto_url: src, pagina: url, credito, top: 0.1 });
  }
  return out;
}

// ---------------------------------------------------------------- Intendentes (URL cargadas a mano)

interface Manual { foto: string; pagina: string; credito: string; top?: number }
// Incluye al Fiscal de Estado. No hay foto oficial utilizable de Las Heras (sitio caído), La Paz, Tupungato
// ni San Carlos. Guaymallén y Malargüe sólo tienen fotos de noticias sin retrato; Rivadavia publica a otro
// intendente que el de autoridades.csv: se omiten.
const INTENDENTES: Record<string, Manual> = {
  // Rivadavia: el sitio municipal informa a Sergio Miodowsky como intendente (ver data/curado/correcciones.yaml).
  "ricardo-alfredo-mansur": {
    foto: "https://rivadavia.gob.ar/wp-content/themes/theme-riv/_img/intendente/sergio-miodowsky.jpg",
    pagina: "https://rivadavia.gob.ar/gobierno/intendente/",
    credito: "Municipalidad de Rivadavia",
  },
  "ulpiano-leandro-suarez": { foto: "https://ciudaddemendoza.gob.ar/wp-content/uploads/2024/10/ulpiano-suarez.jpg", pagina: "https://ciudaddemendoza.gob.ar/gobierno/", credito: "Municipalidad de la Ciudad de Mendoza" },
  "edgardo-arnaldo-gonzalez": { foto: "https://lavallemendoza.gob.ar/public/wp-content/uploads/2024/06/edgardogonzalez.jpg", pagina: "https://lavallemendoza.gob.ar/public/autoridades/", credito: "Municipalidad de Lavalle" },
  "jose-matias-stevanato": { foto: "https://www.maipu.gob.ar/wp-content/uploads/2025/10/gabinete-stevanato.png", pagina: "https://www.maipu.gob.ar/transparencia/institucional/intendente-y-gabinete/", credito: "Municipalidad de Maipú" },
  "raul-antonio-rufeil": { foto: "https://sanmartinmza.gob.ar/wp-content/uploads/2020/05/rufeil-institucional.jpg.html", pagina: "https://sanmartinmza.gob.ar/intendente/", credito: "Municipalidad de General San Martín" },
  "mario-enrique-nestor-abed": { foto: "https://www.juninmendoza.gov.ar/wp-content/uploads/Mario-Abed.jpg", pagina: "https://www.juninmendoza.gov.ar/autoridades-junin/", credito: "Municipalidad de Junín" },
  "maria-flor-destefanis": { foto: "https://santarosamendoza.gob.ar/wp-content/uploads/2024/11/2.jpg", pagina: "https://santarosamendoza.gob.ar/autoridades/", credito: "Municipalidad de Santa Rosa" },
  "diego-costarelli": { foto: "https://www.godoycruz.gob.ar/wp-content/uploads/2017/08/costarelli.png", pagina: "https://www.godoycruz.gob.ar/gobierno/intendente-2/", credito: "Municipalidad de Godoy Cruz" },
  "andres-esteban-allasino": { foto: "https://lujandecuyo.gob.ar/wp-content/uploads/2023/12/Perfil-Esteban-Allasino.jpeg", pagina: "https://lujandecuyo.gob.ar/estebanallasino/", credito: "Municipalidad de Luján de Cuyo", top: 0.1 },
  "jose-emir-andraos": { foto: "https://www.tunuyan.gov.ar/site/wp-content/uploads/2025/06/Intendente_Emir_Andraos.jpg", pagina: "https://www.tunuyan.gov.ar/site/gabinete-municipal/", credito: "Municipalidad de Tunuyán" },
  "alejandro-adrian-molero": { foto: "https://alvearmendoza.gob.ar/wp-content/uploads/2023/12/MOLERO.jpeg", pagina: "https://alvearmendoza.gob.ar/molero-dio-a-conocer-el-estado-en-el-que-recibio-el-municipio/", credito: "Municipalidad de General Alvear" },
  "omar-chafi-felix": { foto: "https://www.sanrafael.gov.ar/wp-content/uploads/2024/01/omar-intendente.jpg", pagina: "https://www.sanrafael.gov.ar/intendente-omar-felix/", credito: "Municipalidad de San Rafael" },
  "fernando-simon": { foto: "https://fiscaliadeestadomendoza.gob.ar/wp-content/uploads/2024/09/fernando-simon.jpg", pagina: "https://fiscaliadeestadomendoza.gob.ar/autoridades/", credito: "Fiscalía de Estado de Mendoza" },
};

// ---------------------------------------------------------------- Miniaturas

async function sips(...args: string[]): Promise<string> {
  const p = Bun.spawn(["sips", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new Error(`sips ${args.join(" ")}: ${err || out}`);
  return out;
}

/** Recorta a cuadrado (centrado; con sesgo hacia arriba si `top`) y baja a 192x192 JPEG ~80. */
async function thumbnail(src: string, dest: string, top = 0): Promise<void> {
  const info = await sips("-g", "pixelWidth", "-g", "pixelHeight", src);
  const w = Number(info.match(/pixelWidth: (\d+)/)?.[1]);
  const h = Number(info.match(/pixelHeight: (\d+)/)?.[1]);
  if (!w || !h) throw new Error("sips no pudo leer las dimensiones");
  const side = Math.min(w, h);
  const offY = h > w ? Math.round((h - side) * top) : Math.round((h - side) / 2);
  const offX = w > h ? Math.round((w - side) / 2) : 0;
  const tmp = dest + ".tmp.jpg";
  await sips("-s", "format", "jpeg", "-s", "formatOptions", "80", "-c", String(side), String(side), "--cropOffset", String(offY), String(offX), src, "--out", tmp);
  await sips("-z", String(SIZE), String(SIZE), "-s", "format", "jpeg", "-s", "formatOptions", "80", tmp, "--out", dest);
  await rm(tmp, { force: true });
}

function ext(url: string, type: string | null): string {
  const m = new URL(url).pathname.match(/\.(jpe?g|png|gif|webp)$/i);
  if (m) return m[1]!.toLowerCase().replace("jpeg", "jpg");
  if (type?.includes("png")) return "png";
  if (type?.includes("gif")) return "gif";
  if (type?.includes("webp")) return "webp";
  return "jpg";
}

// ---------------------------------------------------------------- Main

export async function run(_args: string[]) {
  const legs = await readCsv("legislatura/legisladores.csv");
  const auts = await readCsv("autoridades/autoridades.csv");
  const personas = new Map<string, { nombre: string; grupo: string }>();
  for (const l of legs) personas.set(l.id!, { nombre: l.nombre!, grupo: l.camara === "senado" ? "senadores_prov" : "diputados_prov" });
  for (const a of auts) {
    const grupo = a.poder === "municipal" ? "intendentes" : a.poder === "ejecutivo_provincial" ? "ejecutivo"
      : /diputado/i.test(a.cargo!) ? "diputados_nac" : "senadores_nac";
    personas.set(a.id!, { nombre: a.nombre!, grupo });
  }

  const cands: Candidate[] = [];
  const guard = async (nombre: string, fn: () => Promise<Candidate[]>) => {
    try { cands.push(...(await fn())); } catch (e) { console.warn(`${nombre}: ${(e as Error).message}`); }
  };
  await guard("diputados provinciales", () => diputadosProv(legs));
  await guard("senado provincial", () => senadoProv(legs));
  await guard("diputados nacionales", () => diputadosNac(auts));
  await guard("senado nacional", () => senadoNac(auts));
  await guard("ejecutivo", ejecutivo);
  for (const [id, m] of Object.entries(INTENDENTES)) {
    cands.push({ id, grupo: "intendentes", foto_url: m.foto, pagina: m.pagina, credito: m.credito, top: m.top });
  }

  await mkdir(OUT_DIR, { recursive: true });
  const work = join(tmpdir(), "mt-fotos");
  await mkdir(work, { recursive: true });

  const rows: Row[] = [];
  const done = new Set<string>();
  for (const c of cands) {
    if (done.has(c.id) || !personas.has(c.id)) continue;
    try {
      const resp = await get(c.foto_url);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const e = ext(c.foto_url, resp.headers.get("content-type"));
      await archive(SOURCE, `${c.id}.${e}`, bytes, { url: c.foto_url });
      const tmp = join(work, `${c.id}.${e}`);
      await writeFile(tmp, bytes);
      await thumbnail(tmp, join(OUT_DIR, `${c.id}.jpg`), c.top ?? 0);
      await rm(tmp, { force: true });
      const kb = (await stat(join(OUT_DIR, `${c.id}.jpg`))).size / 1024;
      if (kb > 25) console.warn(`${c.id}: miniatura de ${kb.toFixed(1)} KB (> 25 KB)`);
      rows.push({ id: c.id, foto: `${c.id}.jpg`, foto_original_url: c.foto_url, pagina_fuente_url: c.pagina, credito: c.credito });
      done.add(c.id);
    } catch (e) {
      console.warn(`${c.id}: ${(e as Error).message}`);
    }
  }

  const orden = [...personas.keys()];
  rows.sort((a, b) => orden.indexOf(String(a.id)) - orden.indexOf(String(b.id)));
  await writeFile(join(OUT_DIR, "fotos.csv"), toCsv(rows, ["id", "foto", "foto_original_url", "pagina_fuente_url", "credito"]));

  const porGrupo: Record<string, { con: number; total: number }> = {};
  const sin: string[] = [];
  for (const [id, p] of personas) {
    const g = (porGrupo[p.grupo] ??= { con: 0, total: 0 });
    g.total++;
    if (done.has(id)) g.con++;
    else sin.push(`${p.nombre} (${p.grupo})`);
  }
  for (const [g, v] of Object.entries(porGrupo)) console.log(`${g}: ${v.con}/${v.total}`);
  console.log(`Total: ${rows.length}/${personas.size}. Sin foto: ${sin.join("; ") || "ninguno"}`);

  const meta = {
    titulo: "Fotos oficiales de legisladores y autoridades",
    descripcion:
      "Cada fila es la foto de un funcionario listado en legisladores.csv o autoridades.csv, tomada del sitio oficial del organismo que la publica (Cámaras legislativas, Gobierno de Mendoza, municipios). La miniatura es un recorte cuadrado de 192 px; el original está archivado en data/raw/fotos. No hay foto de quienes los sitios oficiales no publican.",
    columnas: {
      id: { etiqueta: "Identificador", tipo: "texto", oculta: true },
      foto: { etiqueta: "Miniatura", tipo: "texto", descripcion: "Nombre del archivo en data/processed/fotos/ (JPEG 192x192)." },
      foto_original_url: { etiqueta: "Foto original", tipo: "url", descripcion: "Dirección de la imagen en el sitio oficial." },
      pagina_fuente_url: { etiqueta: "Página de origen", tipo: "url" },
      credito: { etiqueta: "Crédito", tipo: "texto", descripcion: "Organismo que publica la foto." },
    },
    orden: ["id", "foto", "credito", "pagina_fuente_url", "foto_original_url"],
  };
  await writeFile(join(OUT_DIR, "fotos.meta.json"), JSON.stringify(meta, null, 2) + "\n");
}
