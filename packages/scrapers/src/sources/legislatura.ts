/**
 * Legislatura de Mendoza: composición actual de ambas cámaras y gasto en viáticos y pasajes.
 *
 * Diputados (Joomla): https://www.hcdmza.gob.ar/site/
 *   /site/institucional/bloques           índice de bloques (un enlace por bloque)
 *   /site/institucional/bloques/<slug>    cada bloque lista a sus diputados: nombre, distrito, período, email
 *                                         institucional y enlace a sus proyectos (autor=APELLIDO,NOMBRE)
 *   /site/institucional/autoridades       presidente y vicepresidentes 1ª a 6ª
 *   /site/informacion-publica/informacion-economica/viaticos-y-pasajes   PDF por año
 *   /site/informacion-publica/informacion-economica/{acuerdo-3949,ejecucion-presupuestaria}  (se archivan los PDF más recientes)
 *   Los diputados no tienen página de perfil individual: perfil_url es la página de su bloque.
 *
 * Senado (WordPress): https://www.senadomendoza.gob.ar/
 *   /wp-json/wp/v2/senadores?per_page=100  senadores (título "Apellido, Nombre") con taxonomías
 *   /wp-json/wp/v2/{bloque,distrito,periodo_legislativo,cargo}  nombres de las taxonomías
 *   /wp-json/wp/v2/autoridades             mesa de conducción (presidente provisional, vicepresidentes)
 *   /viaticos-pasajes-y-contratos/         PDF trimestrales de viáticos y pasajes
 *   La vicegobernadora (Hebe Casado) preside el Senado pero no es una de las 38 bancas: no se incluye.
 *   El Senado no publica email de los senadores.
 *
 * Qué NO se publica: la dieta (sueldo) de los legisladores, los gastos de representación y las escalas
 * salariales no figuran en ninguna de las dos cámaras. Lo único con montos son los listados de viáticos y
 * pasajes. remuneraciones.csv resume esos listados: Diputados informa por legislador (todos "sin consumo");
 * el Senado informa un listado de solicitudes con beneficiario (mayormente personal y autoridades, no
 * senadores), del que sólo se guarda el total por trimestre.
 *
 * Datos personales: sólo nombre, cargo, bloque, distrito, período y email institucional (@hcdmza.gov.ar).
 * No se guarda teléfono, DNI ni domicilio, ni los nombres de secretarios, asesores o beneficiarios.
 *
 * Uso: bun run scrape legislatura
 */

import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";

import { archive, get, readProcessed, writeProcessed, type Row } from "@mt/core";

const SOURCE = "legislatura";
const HCD = "https://www.hcdmza.gob.ar";
const HCS = "https://www.senadomendoza.gob.ar";
const SECCION = ["", "Primera", "Segunda", "Tercera", "Cuarta"];

const COLUMNS = [
  "id", "nombre", "camara", "cargo", "bloque", "partido", "seccion_electoral",
  "mandato_desde", "mandato_hasta", "email", "perfil_url", "fuente_url",
];

/** Descarga y archiva (de a un pedido por vez; get() ya hace pausa). Devuelve el contenido. */
async function fetchBytes(url: string, filename: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
  await archive(SOURCE, filename, bytes, { url });
  return bytes;
}
const fetchText = async (url: string, filename: string) =>
  new TextDecoder().decode(await fetchBytes(url, filename));

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const slug = (s: string) => fold(s).replace(/ /g, "-");
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

interface Leg extends Record<string, string> {}

// ---------------------------------------------------------------- Diputados

async function diputados(): Promise<Leg[]> {
  const indexUrl = `${HCD}/site/institucional/bloques`;
  const $i = cheerio.load(await fetchText(indexUrl, "hcd-bloques.html"));
  const blockPaths = new Set<string>();
  $i("a[href]").each((_, a) => {
    const h = $i(a).attr("href") ?? "";
    if (/^\/site\/institucional\/bloques\/[^/]+$/.test(h)) blockPaths.add(h);
  });

  // Autoridades: se cruzan por nombre (la página las nombra sin segundo nombre).
  const $a = cheerio.load(await fetchText(`${HCD}/site/institucional/autoridades`, "hcd-autoridades.html"));
  const autoridades: { nombre: string; cargo: string }[] = [];
  const lines = $a("#sp-main-body").text().split("\n").map(clean).filter(Boolean);
  for (let k = 0; k < lines.length - 1; k++) {
    const c = lines[k]!;
    if (/^Presidente de la C/i.test(c)) autoridades.push({ cargo: "presidente de la cámara", nombre: lines[k + 1]! });
    const v = c.match(/^Vicepresidente (\d)/i);
    if (v) autoridades.push({ cargo: `vicepresidente ${v[1]}° de la cámara`, nombre: lines[k + 1]! });
  }

  const out: Leg[] = [];
  for (const path of [...blockPaths].sort()) {
    const url = HCD + path;
    const $ = cheerio.load(await fetchText(url, `hcd-bloque-${path.split("/").pop()}.html`));
    const bloque = clean($(".sppb-addon-title").first().text());
    $(".flip-container").each((_, el) => {
      const nombre = clean($(el).find(".front .sppb-person-name").text());
      const back = $(el).find(".back .sppb-person-introtext");
      const info = clean(back.text());
      const dist = info.match(/(\d)ª\s*distrito/i);
      const per = info.match(/(\d{4})\s+(\d{4})/);
      const email = info.match(/[\w.+-]+@hcdmza\.gov\.ar/i)?.[0].toLowerCase() ?? "";
      const autor = back.find("a[href*='autor=']").attr("href")?.match(/autor=([^&]+)/)?.[1];
      const [apellido, nom] = autor ? decodeURIComponent(autor).split(",").map(clean) : ["", ""];
      const key = apellido && nom ? `${apellido} ${nom}` : nombre;
      const auth = autoridades.find((x) => {
        const t = fold(x.nombre).split(" ");
        const n = fold(`${nombre} ${key}`);
        return t.every((w) => n.includes(w));
      });
      out.push({
        id: `diputados-${slug(key)}`,
        nombre,
        camara: "diputados",
        cargo: auth?.cargo ?? "diputado/a",
        bloque,
        partido: "",
        seccion_electoral: dist ? SECCION[Number(dist[1])]! : "",
        mandato_desde: per?.[1] ?? "",
        mandato_hasta: per?.[2] ?? "",
        email,
        perfil_url: url,
        fuente_url: url,
      });
    });
  }
  const sinCargo = autoridades.filter((x) => !out.some((o) => o.cargo === x.cargo));
  if (sinCargo.length) console.warn("Autoridades de Diputados sin cruzar:", sinCargo);
  return out;
}

// ------------------------------------------------------------------- Senado

interface Term { id: number; name: string }

async function wpTerms(rest: string): Promise<Map<number, string>> {
  const url = `${HCS}/wp-json/wp/v2/${rest}?per_page=100&_fields=id,name`;
  const data = JSON.parse(await fetchText(url, `hcs-${rest}.json`)) as Term[];
  return new Map(data.map((t) => [t.id, t.name.replace(/&#8211;/g, "–").replace(/&amp;/g, "&")]));
}

async function senado(): Promise<Leg[]> {
  const bloques = await wpTerms("bloque");
  const distritos = await wpTerms("distrito");
  const periodos = await wpTerms("periodo_legislativo");
  const cargos = await wpTerms("cargo");

  const listUrl = `${HCS}/wp-json/wp/v2/senadores?per_page=100&_fields=id,slug,link,title,bloque,distrito,periodo_legislativo,status`;
  const senadores = JSON.parse(await fetchText(listUrl, "hcs-senadores.json")) as {
    slug: string; link: string; title: { rendered: string }; bloque: number[]; distrito: number[];
    periodo_legislativo: number[]; status: string;
  }[];
  // Respaldo: la página pública, para el reporte de diferencias.
  await fetchText(`${HCS}/senadores-de-mendoza/`, "hcs-senadores-de-mendoza.html");

  const autUrl = `${HCS}/wp-json/wp/v2/autoridades?per_page=100&_fields=title,cargo,class_list`;
  const aut = JSON.parse(await fetchText(autUrl, "hcs-autoridades.json")) as {
    title: { rendered: string }; cargo: number[];
  }[];
  const autoridades = aut.map((a) => ({
    nombre: a.title.rendered.replace(/^Sen\.\s*/i, "").replace(/&#8217;/g, "'"),
    cargo: (cargos.get(a.cargo[0]!) ?? "").replace(/ H\. Cámara de Senadores/i, " de la cámara").toLowerCase(),
  }));

  const decode = (s: string) => s.replace(/^D Ambrogio/, "D'Ambrogio").replace(/&#8217;/g, "'").replace(/&#038;|&amp;/g, "&").replace(/&#8211;/g, "–");
  const out: Leg[] = [];
  for (const s of senadores.filter((x) => x.status === "publish")) {
    const [apellido, nom] = decode(s.title.rendered).split(",").map(clean);
    const nombre = clean(`${nom} ${apellido}`);
    const per = periodos.get(s.periodo_legislativo[0]!)?.match(/(\d{4})-(\d{4})/);
    const dist = distritos.get(s.distrito[0]!)?.match(/(\d)/);
    const auth = autoridades.find((x) => {
      const n = fold(nombre);
      return x.cargo.startsWith("vice") || x.cargo.startsWith("presidente provisional")
        ? fold(x.nombre).split(" ").every((w) => n.includes(w))
        : false;
    });
    out.push({
      id: `senado-${slug(`${apellido} ${nom}`)}`,
      nombre,
      camara: "senado",
      cargo: auth?.cargo ?? "senador/a",
      bloque: bloques.get(s.bloque[0]!) ?? "",
      partido: "",
      seccion_electoral: dist ? SECCION[Number(dist[1])]! : "",
      mandato_desde: per?.[1] ?? "",
      mandato_hasta: per?.[2] ?? "",
      email: "",
      perfil_url: s.link,
      fuente_url: listUrl.replace(/\?.*/, ""),
    });
  }
  const sinCruzar = autoridades.filter((x) => !out.some((o) => o.cargo === x.cargo));
  if (sinCruzar.length)
    console.warn("Autoridades del Senado fuera de las 38 bancas (se omiten):", sinCruzar.map((x) => `${x.nombre} (${x.cargo})`));
  return out;
}

// ------------------------------------------------- Viáticos y pasajes (montos)

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text as string;
}

const arNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

async function diputadosViaticos(): Promise<Row[]> {
  const pageUrl = `${HCD}/site/informacion-publica/informacion-economica/viaticos-y-pasajes`;
  const $ = cheerio.load(await fetchText(pageUrl, "hcd-viaticos-pasajes.html"));
  const pdfs = new Set<string>();
  $("a[href$='.pdf']").each((_, a) => {
    const h = $(a).attr("href")!;
    if (/_(2025|2026)|Abril_2026/.test(h) || /2026\.pdf$/.test(h) || /2025\.pdf$/.test(h)) pdfs.add(h);
  });
  const rows: Row[] = [];
  for (const h of pdfs) {
    const url = encodeURI(HCD + h);
    const text = await pdfText(await fetchBytes(url, `hcd-${h.split("/").pop()}`));
    const per = text.match(/desde (\d\d)\/(\d\d)\/(\d\d) hasta (\d\d)\/(\d\d)\/(\d\d)/);
    if (!per) { console.warn("Sin período en", h); continue; }
    const periodo =
      per[1] === "01" && per[2] === "01" && per[4] === "31" && per[5] === "12"
        ? `20${per[3]}`
        : `20${per[3]}-${per[2]}/20${per[6]}-${per[5]}`;
    const legisladores = (text.match(/^Legislador$/gm) ?? []).length;
    const sinConsumo = (text.match(/^SIN CONSUMO$/gm) ?? []).length;
    const montos = (text.match(/^\d[\d.]*,\d{2}$/gm) ?? []).map(arNum);
    if (sinConsumo !== legisladores || montos.some((m) => m !== 0)) {
      console.warn(`${h}: hay consumos (${legisladores} legisladores, ${sinConsumo} sin consumo); no se extraen, revisar el PDF`);
      continue;
    }
    console.log(`Diputados viáticos ${periodo}: ${legisladores} legisladores, todos sin consumo`);
    for (const concepto of ["Viáticos (total de la cámara)", "Pasajes (total de la cámara)"])
      rows.push({ camara: "diputados", concepto, periodo, monto: 0, fuente_url: url });
  }
  return rows;
}

async function senadoViaticos(): Promise<Row[]> {
  const pageUrl = `${HCS}/viaticos-pasajes-y-contratos/`;
  const $ = cheerio.load(await fetchText(pageUrl, "hcs-viaticos-pasajes-contratos.html"));
  const rows: Row[] = [];
  const items: { trim: string; anio: number; url: string }[] = [];
  $("tr").each((_, tr) => {
    const td = $(tr).find("td").map((_, c) => clean($(c).text())).get();
    const href = $(tr).find("a[href$='.pdf']").attr("href");
    const t = td[0]?.match(/^(Primer|Segundo|Tercer|Cuarto) Trimestre$/i);
    const anio = Number(td[1]);
    if (href && t && anio >= 2025)
      items.push({ trim: String({ primer: 1, segundo: 2, tercer: 3, cuarto: 4 }[t[1]!.toLowerCase() as "primer"]), anio, url: href });
  });
  for (const it of items) {
    const text = clean(await pdfText(await fetchBytes(encodeURI(it.url), `hcs-viaticos-${it.anio}-T${it.trim}.pdf`)));
    const iP = text.search(/\bPASAJES\b/);
    const viat = iP >= 0 ? text.slice(0, iP) : text;
    const pasa = iP >= 0 ? text.slice(iP) : "";
    const sum = (s: string) =>
      [...s.matchAll(/\bHL\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)].reduce((a, m) => a + arNum(m[1]!), 0);
    const nV = [...viat.matchAll(/\bHL\s+\d{1,3}(?:\.\d{3})*,\d{2}\b/g)].length;
    const nP = [...pasa.matchAll(/\bHL\s+\d{1,3}(?:\.\d{3})*,\d{2}\b/g)].length;
    console.log(`Senado ${it.anio}-T${it.trim}: ${nV} viáticos, ${nP} pasajes`);
    const periodo = `${it.anio}-T${it.trim}`;
    rows.push(
      { camara: "senado", concepto: "Viáticos (total de la cámara)", periodo, monto: Math.round(sum(viat) * 100) / 100, fuente_url: it.url },
      { camara: "senado", concepto: "Pasajes (total de la cámara)", periodo, monto: Math.round(sum(pasa) * 100) / 100, fuente_url: it.url },
    );
  }
  return rows;
}

/** Archiva documentos económicos de contexto (no se procesan: presupuesto por partida, no remuneraciones). */
async function archivarContexto() {
  const base = `${HCD}/site/informacion-publica/informacion-economica`;
  for (const [page, file] of [
    ["ejecucion-presupuestaria", "hcd-ejecucion-presupuestaria.html"],
    ["acuerdo-3949", "hcd-acuerdo-3949.html"],
  ] as const) {
    const $ = cheerio.load(await fetchText(`${base}/${page}`, file));
    const first = $("a[href$='.pdf']").first().attr("href");
    if (first) await fetchBytes(encodeURI(HCD + first), `hcd-${first.split("/").pop()}`);
  }
  const url3949 = `${base}/acuerdo-3949/9616-ano-2026`;
  const $a = cheerio.load(await fetchText(url3949, "hcd-acuerdo-3949-2026.html"));
  const pdf = $a("a[href*='a3949'][href$='.pdf']").first().attr("href");
  if (pdf) await fetchBytes(encodeURI(HCD + pdf), `hcd-${pdf.split("/").pop()}`);
}

// --------------------------------------------------------------------- main

/** Filas ya procesadas de una cámara (de la corrida anterior), para no perderlas si su sitio falla. */
async function anteriores(camara: string, archivo = "legisladores.csv"): Promise<Row[]> {
  return (await readProcessed(SOURCE, archivo)).filter((r) => r.camara === camara);
}

/** Corre la parte de una cámara; si su sitio falla, conserva los datos anteriores y avisa. */
async function camara<T>(nombre: string, fn: () => Promise<T[]>): Promise<{ filas: T[]; ok: boolean }> {
  try {
    return { filas: await fn(), ok: true };
  } catch (err) {
    const previas = await anteriores(nombre);
    // Anotación visible en GitHub Actions.
    console.log(`::warning title=Legislatura (${nombre})::No se pudo actualizar (${err instanceof Error ? err.message : err}). Se conservan ${previas.length} filas anteriores.`);
    return { filas: previas as T[], ok: false };
  }
}

export async function run(_args: string[]) {
  const d = await camara("diputados", diputados);
  const s = await camara("senado", senado);
  if (!d.ok && !s.ok) throw new Error("No se pudo actualizar ninguna de las dos cámaras");
  const dip = d.filas;
  const sen = s.filas;
  const todos = [...dip, ...sen].sort(
    (a, b) => a.camara!.localeCompare(b.camara!) || a.id!.localeCompare(b.id!),
  );

  const ids = new Set<string>();
  for (const l of todos) {
    if (ids.has(l.id!)) console.warn("ID duplicado:", l.id);
    ids.add(l.id!);
  }
  const path = await writeProcessed(SOURCE, "legisladores.csv", todos, COLUMNS);
  console.log(`legisladores.csv: ${todos.length} filas -> ${path}`);

  for (const cam of ["diputados", "senado"]) {
    const rows = todos.filter((l) => l.camara === cam);
    const porBloque = new Map<string, number>();
    for (const l of rows) porBloque.set(l.bloque!, (porBloque.get(l.bloque!) ?? 0) + 1);
    console.log(`${cam}: ${rows.length} (esperado ${cam === "diputados" ? 48 : 38})`);
    for (const [b, n] of [...porBloque].sort((a, b) => b[1] - a[1])) console.log(`  ${b}: ${n}`);
  }

  await archivarContexto().catch((err) => console.log(`::warning title=Legislatura::No se archivó el contexto (${err}).`));
  const rem = [
    ...(await diputadosViaticos().catch(() => anteriores("diputados", "remuneraciones.csv"))),
    ...(await senadoViaticos().catch(() => anteriores("senado", "remuneraciones.csv"))),
  ];
  await writeProcessed(SOURCE, "remuneraciones.csv", rem, ["camara", "concepto", "periodo", "monto", "fuente_url"]);
  console.log(`remuneraciones.csv: ${rem.length} filas`);
}
