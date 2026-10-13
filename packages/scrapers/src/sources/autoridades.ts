/**
 * Autoridades: quiénes representan hoy a Mendoza.
 *
 * Uso: `bun run scrape autoridades`
 *
 * Salidas (data/processed/autoridades/):
 *  - autoridades.csv     Ejecutivo provincial, intendentes y legisladores nacionales por Mendoza.
 *  - remuneraciones.csv  Remuneraciones publicadas por fuentes oficiales (hoy: dieta de diputados y senadores nacionales).
 *
 * Fuentes:
 *  - Ejecutivo provincial: páginas "Información Oficial" de cada ministerio (sitios.mendoza.gob.ar) para los
 *    ministros; acta de proclamación de la Junta Electoral (2023) para gobernador/vicegobernadora y para los
 *    intendentes (con la lista o frente por el que fueron electos); nota de prensa oficial del gabinete (asunción
 *    del 2023-12-09). El Fiscal de Estado figura en una noticia oficial de la Junta Electoral (2026-02-19).
 *  - Diputados nacionales: datos abiertos de la HCDN (diputados_actuales, CKAN) filtrados por distrito MENDOZA.
 *  - Senadores nacionales: listado oficial del Senado (partido o alianza por la que ingresó) y listado por bloque.
 *
 * Los nombres de ministros, intendentes y gobernador están cargados a mano (las fuentes son páginas libres o
 * PDF escaneados) y se VERIFICAN contra el crudo archivado: si un apellido no aparece, se avisa por consola.
 * Nunca se infiere el partido: solo se completa cuando la fuente oficial lo dice.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { archive, fetchAndArchive, get, latestRaw, normalizeMunicipio, PROCESSED_DIR, type Row, readRaw, writeProcessed } from "@mt/core";
import { load } from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";

const ID = "autoridades";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// El WAF del Senado bloquea el User-Agent con sufijo; con uno de navegador común responde.
const UA_NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const SENADO_HEADERS = { "User-Agent": UA_NAVEGADOR, "Accept-Language": "es-AR,es;q=0.9" };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const slug = (s: string) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "dd/mm/yyyy" a "yyyy-mm-dd". */
function isoFecha(s: string): string {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "Apellido, Nombre Nombre" a "Nombre Nombre Apellido". */
function nombreApellido(s: string): string {
  const [ape, ...resto] = s.split(",");
  return resto.length ? clean(`${resto.join(",")} ${ape}`) : clean(s);
}

/** Pasa a "Título" un texto en mayúsculas o minúsculas, respetando partículas. */
function titulo(s: string): string {
  return clean(s)
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["de", "del", "la", "las", "los", "y", "por"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

async function textoRaw(path: string | null): Promise<string> {
  if (!path) return "";
  const data = await readRaw(path);
  if (path.replace(/\.gz$/, "").endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  const html = data.toString("utf8");
  return load(html).text();
}

/** Descarga (si cambió) y devuelve la ruta de la última copia archivada. */
async function bajar(url: string, filename: string, init?: RequestInit): Promise<string | null> {
  await fetchAndArchive(ID, url, filename, init);
  return latestRaw(ID, filename);
}

/** Avisa si el apellido no aparece en el crudo archivado. */
function verificar(texto: string, apellido: string, contexto: string) {
  if (!norm(texto).includes(norm(apellido))) {
    console.warn(`  AVISO: "${apellido}" no aparece en la fuente de ${contexto}; revisar a mano.`);
  }
}

interface Autoridad {
  id: string;
  nombre: string;
  cargo: string;
  poder: "ejecutivo_provincial" | "municipal" | "legislativo_nacional";
  organismo: string;
  partido: string;
  bloque: string;
  mandato_desde: string;
  mandato_hasta: string;
  perfil_url: string;
  fuente_url: string;
}

const COLUMNAS = [
  "id",
  "nombre",
  "cargo",
  "poder",
  "organismo",
  "partido",
  "bloque",
  "mandato_desde",
  "mandato_hasta",
  "perfil_url",
  "fuente_url",
];

// ---------------------------------------------------------------------------
// Ejecutivo provincial
// ---------------------------------------------------------------------------

const ACTA_2023 = "https://jusmendoza.gob.ar/wp-content/uploads/2024/12/Acta-de-Proclamacion-de-Candidatos-03-09-2023-y-24-09-2023.pdf";
const PRENSA_GABINETE = "https://www.mendoza.gov.ar/prensa/estos-son-los-funcionarios-que-formaran-parte-del-gabinete-de-cornejo/";
const NOTICIA_JE_FISCAL = "https://jusmendoza.gob.ar/san-rafael-podra-elegir-convencionales-en-las-elecciones-a-concejales/";
const SITIOS = "https://sitios.mendoza.gob.ar";

// Asunción de los ministros y del gobernador: sábado 2023-12-09 (nota oficial de prensa del 2023-12-06).
const ASUNCION_2023 = "2023-12-09";

interface Ministro {
  nombre: string;
  cargo: string;
  organismo: string;
  pagina: string; // página oficial del ministerio donde figura el titular
  apellido: string;
}

const MINISTROS: Ministro[] = [
  {
    nombre: "Natalio Mema",
    cargo: "Ministro de Gobierno, Infraestructura y Desarrollo Territorial",
    organismo: "Ministerio de Gobierno, Infraestructura y Desarrollo Territorial",
    pagina: `${SITIOS}/gobiernoinfraestructura/informacion-oficial-plantilla-para-ministerios/`,
    apellido: "Mema",
  },
  {
    nombre: "Mercedes Rus",
    cargo: "Ministra de Seguridad y Justicia",
    organismo: "Ministerio de Seguridad y Justicia",
    pagina: `${SITIOS}/seguridadyjusticia/informacion-oficial-plantilla-para-ministerios/`,
    apellido: "Rus",
  },
  {
    nombre: "Víctor Fayad",
    cargo: "Ministro de Hacienda y Finanzas",
    organismo: "Ministerio de Hacienda y Finanzas",
    pagina: `${SITIOS}/haciendayfinanzas/informacion-oficial/`,
    apellido: "Fayad",
  },
  {
    nombre: "Rodolfo Vargas Arizu",
    cargo: "Ministro de Producción",
    organismo: "Ministerio de Producción",
    pagina: `${SITIOS}/produccion/informacion-oficial/`,
    apellido: "Vargas Arizu",
  },
  {
    nombre: "Rodolfo Montero",
    cargo: "Ministro de Salud y Deportes",
    organismo: "Ministerio de Salud y Deportes",
    pagina: `${SITIOS}/saludydeportes/informacion-oficial/`,
    apellido: "Montero",
  },
  {
    nombre: "Jimena Latorre",
    cargo: "Ministra de Energía y Ambiente",
    organismo: "Ministerio de Energía y Ambiente",
    pagina: `${SITIOS}/energiayambiente/informacion-oficial-2/`,
    apellido: "Latorre",
  },
  {
    nombre: "Tadeo García Zalazar",
    cargo: "Ministro de Educación, Cultura, Infancias y DGE",
    organismo: "Ministerio de Educación, Cultura, Infancias y DGE",
    pagina: `${SITIOS}/educacion-cultura-infancias-dge/informacion-oficial/`,
    apellido: "García Zalazar",
  },
];

async function ejecutivo(): Promise<Autoridad[]> {
  const out: Autoridad[] = [];
  const acta = textoRaw(await bajar(ACTA_2023, "acta-proclamacion-2023.pdf"));
  const actaTxt = await acta;
  const gabinete = await textoRaw(await bajar(PRENSA_GABINETE, "prensa-gabinete-2023-12.html"));
  const fiscalTxt = await textoRaw(await bajar(NOTICIA_JE_FISCAL, "junta-electoral-noticia-2026-02-19.html"));

  verificar(actaTxt, "CORNEJO", "acta de proclamación 2023 (gobernador)");
  verificar(actaTxt, "CASADO", "acta de proclamación 2023 (vicegobernadora)");
  const hasta = "2027-12";
  out.push(
    {
      id: "alfredo-cornejo",
      nombre: "Alfredo Víctor Cornejo",
      cargo: "Gobernador",
      poder: "ejecutivo_provincial",
      organismo: "Gobernación de Mendoza",
      partido: "Cambia Mendoza",
      bloque: "",
      mandato_desde: ASUNCION_2023,
      mandato_hasta: hasta,
      perfil_url: "",
      fuente_url: ACTA_2023,
    },
    {
      id: "hebe-casado",
      nombre: "Hebe Silvina Casado",
      cargo: "Vicegobernadora (preside el Senado provincial)",
      poder: "ejecutivo_provincial",
      organismo: "Vicegobernación de Mendoza",
      partido: "Cambia Mendoza",
      bloque: "",
      mandato_desde: ASUNCION_2023,
      mandato_hasta: hasta,
      perfil_url: "",
      fuente_url: ACTA_2023,
    },
  );
  verificar(gabinete, "Cornejo", "nota oficial del gabinete");

  for (const m of MINISTROS) {
    const txt = await textoRaw(await bajar(m.pagina, `ministerio-${slug(m.organismo)}.html`));
    verificar(txt, m.apellido, m.organismo);
    verificar(gabinete, m.apellido, `nota del gabinete (${m.organismo})`);
    out.push({
      id: slug(m.nombre),
      nombre: m.nombre,
      cargo: m.cargo,
      poder: "ejecutivo_provincial",
      organismo: m.organismo,
      partido: "",
      bloque: "",
      mandato_desde: ASUNCION_2023,
      mandato_hasta: "",
      perfil_url: m.pagina,
      fuente_url: m.pagina,
    });
  }

  // Ente Mendoza Turismo (ente autárquico, titular designado).
  const turismoUrl = `${SITIOS}/turismo/informacion-oficial/`;
  const turismoTxt = await textoRaw(await bajar(turismoUrl, "ministerio-turismo.html"));
  verificar(turismoTxt, "Testa", "Ente Mendoza Turismo");
  out.push({
    id: "gabriela-testa",
    nombre: "Gabriela Testa",
    cargo: "Presidente del Ente Mendoza Turismo",
    poder: "ejecutivo_provincial",
    organismo: "Ente Mendoza Turismo (EMETUR)",
    partido: "",
    bloque: "",
    mandato_desde: ASUNCION_2023,
    mandato_hasta: "",
    perfil_url: turismoUrl,
    fuente_url: turismoUrl,
  });

  verificar(fiscalTxt, "Simón", "noticia de la Junta Electoral (Fiscal de Estado)");
  out.push({
    id: "fernando-simon",
    nombre: "Fernando Simón",
    cargo: "Fiscal de Estado",
    poder: "ejecutivo_provincial",
    organismo: "Fiscalía de Estado",
    partido: "",
    bloque: "",
    mandato_desde: "",
    mandato_hasta: "",
    perfil_url: "",
    fuente_url: NOTICIA_JE_FISCAL,
  });
  return out;
}

// ---------------------------------------------------------------------------
// Intendentes (acta de proclamación de la Junta Electoral, elecciones 2023)
// ---------------------------------------------------------------------------

// Municipio, nombre, apellido tal como figura en el acta (para verificar), lista o frente por el que fue electo.
const INTENDENTES: [string, string, string, string][] = [
  ["Capital", "Ulpiano Leandro Suárez", "SUAREZ", "Cambia Mendoza"],
  ["Guaymallén", "Marcos Emanuel Calvente", "CALVENTE", "Cambia Mendoza"],
  ["Las Heras", "Francisco Nicolás Lo Presti", "LO PRESTI", "Cambia Mendoza"],
  ["Lavalle", "Edgardo Arnaldo González", "GONZALEZ EDGARDO", "Elegí Gestión Lavalle"],
  ["Maipú", "José Matías Stevanato", "STEVANATO", "Frente Elegí Maipú Crece"],
  ["San Martín", "Raúl Antonio Rufeil", "RUFEIL", "Cambia Mendoza"],
  ["Junín", "Mario Enrique Néstor Abed", "ABED MARIO", "Cambia Mendoza"],
  ["Rivadavia", "Ricardo Alfredo Mansur", "MANSUR", "Partido Sembrar"],
  ["Santa Rosa", "María Flor Destéfanis", "DESTEFANIS", "Elegí Santa Rosa"],
  ["La Paz", "Fernando Alcides Ubieta", "UBIETA", "Frente Elegí Gestión La Paz"],
  ["Godoy Cruz", "Diego Costarelli", "COSTARELLI", "Cambia Mendoza"],
  // El OCR del PDF escrito "ALLA5lN0": se verifica con el nombre de pila.
  ["Luján de Cuyo", "Andrés Esteban Allasino", "ANDRES ESTEBAN", "La Unión Mendocina"],
  // El OCR parte el apellido ("AN DRAOS").
  ["Tunuyán", "José Emir Andraos", "DRAOS", "Elegí Gestión Tunuyán"],
  ["Tupungato", "José Gustavo Aguilera", "AGUILERA", "Cambia Mendoza"],
  ["San Carlos", "Martín Alejandro Morillas", "MORILLAS", "Frente Encuentro por San Carlos"],
  ["General Alvear", "Alejandro Adrián Molero", "MOLERO", "Cambia Mendoza"],
  ["Malargüe", "Celso Alejandro Jaque", "JAQUE CELSO", "Elegí Mendoza"],
  ["San Rafael", "Omar Chafi Félix", "FELIX OMAR", "Elegí San Rafael Avanza"],
];

async function intendentes(): Promise<Autoridad[]> {
  const actaTxt = await textoRaw(await bajar(ACTA_2023, "acta-proclamacion-2023.pdf"));
  const out: Autoridad[] = [];
  for (const [mun, nombre, clave, partido] of INTENDENTES) {
    const municipio = normalizeMunicipio(mun);
    if (!municipio) throw new Error(`Municipio no reconocido: ${mun}`);
    verificar(actaTxt, clave, `acta de proclamación (intendente de ${municipio})`);
    out.push({
      id: slug(nombre),
      nombre,
      cargo: "Intendente",
      poder: "municipal",
      organismo: municipio,
      partido,
      bloque: "",
      // Mandato de cuatro años (Constitución provincial, art. 197); la fecha exacta de asunción no está en el acta.
      mandato_desde: "2023-12",
      mandato_hasta: "2027-12",
      perfil_url: "",
      fuente_url: ACTA_2023,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legisladores nacionales
// ---------------------------------------------------------------------------

const HCDN_ACTUALES =
  "https://datos.hcdn.gob.ar:443/dataset/a80e0fa7-d73a-4ed1-9dec-80465e368951/resource/bed68ccd-81f4-4165-89b5-2b3ff9720cac/download/diputados_actuales2.2.csv";
const HCDN_LISTADO = "https://www.hcdn.gob.ar/diputados/";
const SENADO_LISTA = "https://www.senado.gob.ar/senadores/listados/listaSenadoRes";
const SENADO_BLOQUES = "https://www.senado.gob.ar/senadores/listados/agrupados-por-bloques";

/** CSV simple con comillas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function diputados(): Promise<Autoridad[]> {
  const csvPath = await bajar(HCDN_ACTUALES, "hcdn-diputados-actuales.csv");
  const htmlPath = await bajar(HCDN_LISTADO, "hcdn-diputados-listado.html");
  if (!csvPath || !htmlPath) throw new Error("No se pudo obtener el listado de diputados");
  const [head, ...rows] = parseCsv((await readRaw(csvPath)).toString("utf8"));
  const idx = (c: string) => head!.indexOf(c);

  // Perfil: el listado del sitio enlaza "/diputados/<usuario>/" con "Apellido, Nombre".
  const $ = load((await readRaw(htmlPath)).toString("utf8"));
  const perfiles = new Map<string, string>();
  $('a[href^="/diputados/"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const t = clean($(a).text());
    if (/^\/diputados\/[a-z0-9]+\/$/.test(href) && t.includes(",")) perfiles.set(norm(t), `https://www.hcdn.gob.ar${href}`);
  });

  const out: Autoridad[] = [];
  for (const r of rows) {
    if (norm(r[idx("DISTRITO")] ?? "") !== "mendoza") continue;
    const ape = clean(r[idx("APELLIDO")]!);
    const nom = clean(r[idx("NOMBRE")]!);
    const mandato = r[idx("MANDATO")]!; // "2023-2027"
    const finAnio = mandato.split("-")[1] ?? "";
    out.push({
      id: slug(`${nom} ${ape}`),
      nombre: `${nom} ${ape}`,
      cargo: "Diputado/a nacional",
      poder: "legislativo_nacional",
      organismo: "Cámara de Diputados de la Nación",
      // La fuente solo informa el bloque actual; la lista por la que fue electo no figura en estos datos.
      partido: "",
      bloque: titulo(r[idx("BLOQUE")]!).replace(/^Ucr - /, "UCR - "),
      mandato_desde: isoFecha(r[idx("FECHA_DE_INICIO")]!),
      mandato_hasta: finAnio ? `${finAnio}-12-09` : "",
      perfil_url: perfiles.get(norm(`${ape}, ${nom}`)) ?? "",
      fuente_url: HCDN_ACTUALES,
    });
  }
  return out;
}

/** Baja una página del Senado; el WAF a veces devuelve un captcha, así que se reintenta. */
async function senadoHtml(url: string, filename: string, marca: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    const resp = await get(url, { headers: SENADO_HEADERS });
    const html = await resp.text();
    if (html.includes(marca)) {
      await archive(ID, filename, html, { url });
      return html;
    }
    await sleep(8000);
  }
  throw new Error(`El Senado devolvió el captcha en ${url}`);
}

async function senadores(): Promise<Autoridad[]> {
  const lista = load(await senadoHtml(SENADO_LISTA, "senado-lista-senadores.html", "senadoresTabla"));
  const bloques = load(await senadoHtml(SENADO_BLOQUES, "senado-senadores-por-bloque.html", "Listado de Senadores Nacionales por Bloque"));

  // Filas alternadas: una con el nombre del bloque y otra oculta con sus integrantes.
  const bloquePorId = new Map<string, string>();
  let bloqueActual = "";
  bloques("table tbody tr").each((_, tr) => {
    const celdas = bloques(tr).children("td");
    if (celdas.first().attr("colspan") === "12") {
      bloques(tr)
        .find('a[href^="/senadores/senador/"]')
        .each((__, a) => {
          const id = (bloques(a).attr("href") ?? "").split("/").pop()!;
          bloquePorId.set(id, bloqueActual);
        });
    } else {
      bloqueActual = clean(celdas.first().text());
    }
  });

  const out: Autoridad[] = [];
  lista("#senadoresTabla tbody tr").each((_, tr) => {
    const td = lista(tr).children("td");
    if (td.length < 5) return;
    const distrito = clean(td.eq(2).text());
    if (norm(distrito) !== "mendoza") return;
    const link = td.eq(1).find("a").first();
    const href = link.attr("href") ?? "";
    const sid = href.split("/").pop() ?? "";
    const nombre = nombreApellido(clean(link.text()));
    const fechas = td
      .eq(4)
      .text()
      .split(/\s+/)
      .filter((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x));
    out.push({
      id: slug(nombre),
      nombre,
      cargo: "Senador/a nacional",
      poder: "legislativo_nacional",
      organismo: "Senado de la Nación",
      partido: clean(td.eq(3).text()),
      bloque: bloquePorId.get(sid) ?? "",
      mandato_desde: isoFecha(fechas[0] ?? ""),
      mandato_hasta: isoFecha(fechas[1] ?? ""),
      perfil_url: href ? `https://www.senado.gob.ar${href}` : "",
      fuente_url: SENADO_LISTA,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Remuneraciones
// ---------------------------------------------------------------------------

const HCDN_CKAN = "https://datos.hcdn.gob.ar/api/3/action/package_show?id=dietas-y-gastos-de-representacion-legisladores-as";
const HCDN_DIETAS_PAGINA = "https://datos.hcdn.gob.ar/dataset/dietas-y-gastos-de-representacion-legisladores-as";
const SENADO_DIETAS = "https://www.senado.gob.ar/dietas";
const SENADO_ESCALA = "https://www.senado.gob.ar/prensa/adjunto/descargarArchivo/tipo/EscalaSalarial";
// Valor del módulo del Senado "desde marzo de 2026", leído de la imagen oficial de la escala salarial
// (la dieta se fija en módulos: 2.500 + 1.000 de gastos de representación + 500 de desarraigo; Res. DR 8/24).
const MODULO_SENADO = 2784.456902;
const MODULO_PERIODO = "2026-03";

function numeroAr(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

async function remuneraciones(): Promise<Row[]> {
  const out: Row[] = [];

  // Diputados: CSV oficial de datos abiertos. El recurso no trae período; se usa su fecha de actualización.
  const ckan = await bajar(HCDN_CKAN, "hcdn-dietas-ckan.json");
  const pkg = JSON.parse((await readRaw(ckan!)).toString("utf8")) as {
    result: { resources: { name: string; format: string; url: string; last_modified: string }[] };
  };
  const recurso = (nombre: string) => {
    const r = pkg.result.resources.find((x) => x.name === nombre && x.format.toUpperCase() === "CSV");
    if (!r) throw new Error(`Recurso ${nombre} no encontrado en datos.hcdn.gob.ar`);
    return r;
  };
  for (const nombre of ["Remuneraciones", "Desarraigo", "Movilidad"]) {
    const r = recurso(nombre);
    const path = await bajar(r.url, `hcdn-dietas-${slug(nombre)}.csv`);
    const periodo = r.last_modified.slice(0, 7);
    const [head, ...rows] = parseCsv((await readRaw(path!)).toString("utf8"));
    const ci = head!.findIndex((h) => norm(h).startsWith("concepto"));
    const ii = head!.findIndex((h) => norm(h) === "importe");
    for (const row of rows) {
      let concepto = clean(row[ci]!);
      if (nombre === "Desarraigo") concepto += " (corresponde solo a quienes lo perciben)";
      if (nombre === "Movilidad") concepto += " (según la opción elegida)";
      out.push({
        cargo_o_persona: "Diputado/a nacional",
        organismo: "Cámara de Diputados de la Nación",
        concepto,
        periodo,
        monto_bruto: numeroAr(row[ii]!),
        fuente_url: HCDN_DIETAS_PAGINA,
      });
    }
  }

  // Senado: la página /dietas está tras un captcha para scripts; la escala salarial (imagen) sí se descarga.
  await bajar(SENADO_ESCALA, "senado-escala-salarial-2026-03.jpg", { headers: SENADO_HEADERS });
  const senado: [string, number][] = [
    ["Dieta (2.500 módulos)", 2500],
    ["Gastos de representación (1.000 módulos)", 1000],
    ["Desarraigo (500 módulos; corresponde solo a quienes lo perciben)", 500],
  ];
  for (const [concepto, modulos] of senado) {
    out.push({
      cargo_o_persona: "Senador/a nacional",
      organismo: "Senado de la Nación",
      concepto,
      periodo: MODULO_PERIODO,
      monto_bruto: Math.round(modulos * MODULO_SENADO * 100) / 100,
      fuente_url: SENADO_DIETAS,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

async function escribirMeta(nombre: string, meta: unknown) {
  const dir = join(PROCESSED_DIR, ID);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, nombre), `${JSON.stringify(meta, null, 2)}\n`);
}

export async function run(_args: string[]) {
  console.log("Ejecutivo provincial...");
  const eje = await ejecutivo();
  console.log("Intendentes...");
  const intend = await intendentes();
  console.log("Diputados nacionales...");
  const dip = await diputados();
  console.log("Senadores nacionales...");
  const sen = await senadores();

  if (intend.length !== 18) throw new Error(`Se esperaban 18 intendentes y hay ${intend.length}`);
  if (dip.length !== 10) console.warn(`AVISO: se esperaban 10 diputados por Mendoza y hay ${dip.length}`);
  if (sen.length !== 3) console.warn(`AVISO: se esperaban 3 senadores por Mendoza y hay ${sen.length}`);

  const todas = [...eje, ...intend, ...dip, ...sen];
  const ids = new Set<string>();
  for (const a of todas) {
    if (ids.has(a.id)) throw new Error(`id duplicado: ${a.id}`);
    ids.add(a.id);
  }
  await writeProcessed(ID, "autoridades.csv", todas as unknown as Row[], COLUMNAS);
  console.log(
    `autoridades.csv: ${todas.length} filas (ejecutivo ${eje.length}, intendentes ${intend.length}, diputados ${dip.length}, senadores ${sen.length})`,
  );

  console.log("Remuneraciones...");
  const rem = await remuneraciones();
  await writeProcessed(ID, "remuneraciones.csv", rem, ["cargo_o_persona", "organismo", "concepto", "periodo", "monto_bruto", "fuente_url"]);
  console.log(`remuneraciones.csv: ${rem.length} filas`);

  await escribirMeta("autoridades.meta.json", {
    titulo: "Autoridades que representan a Mendoza",
    descripcion:
      "Cada fila es una autoridad en funciones: gobernador, vicegobernadora, ministros, Fiscal de Estado y titular de EMETUR; los 18 intendentes; y los diputados y senadores nacionales por Mendoza. El partido solo se completa cuando una fuente oficial lo informa (acta de proclamación de la Junta Electoral 2023 para gobernador, vicegobernadora e intendentes; listado del Senado para senadores). Los ministros son designados, no electos. Los diputados nacionales figuran sin partido: la fuente de la Cámara solo informa el bloque actual. Los intendentes son los proclamados en 2023 (mandato de cuatro años; la fecha exacta de asunción no figura en el acta, por eso solo se indica el mes); no se verificaron licencias ni reemplazos posteriores. En febrero de 2026 hubo elecciones solo de concejales en seis municipios.",
    columnas: {
      id: { etiqueta: "Identificador", tipo: "texto", oculta: true },
      nombre: { etiqueta: "Nombre", tipo: "texto" },
      cargo: { etiqueta: "Cargo", tipo: "texto" },
      poder: {
        etiqueta: "Nivel",
        tipo: "texto",
        valores: { ejecutivo_provincial: "Ejecutivo provincial", municipal: "Municipal", legislativo_nacional: "Legislativo nacional" },
      },
      organismo: { etiqueta: "Organismo", tipo: "texto", descripcion: "Ministerio, municipio o cámara." },
      partido: {
        etiqueta: "Partido o frente",
        tipo: "texto",
        descripcion: "Lista o frente por el que fue electo, solo si una fuente oficial lo dice. Vacío no significa sin partido.",
      },
      bloque: {
        etiqueta: "Bloque legislativo",
        tipo: "texto",
        descripcion: "Bloque actual en la cámara nacional. Solo para legisladores nacionales.",
      },
      mandato_desde: { etiqueta: "Mandato desde", tipo: "fecha" },
      mandato_hasta: {
        etiqueta: "Mandato hasta",
        tipo: "fecha",
        descripcion: "Fin del período para cargos electivos; vacío para designados.",
      },
      perfil_url: { etiqueta: "Perfil oficial", tipo: "url" },
      fuente_url: { etiqueta: "Fuente", tipo: "url" },
    },
    orden: ["nombre", "cargo", "organismo", "partido", "bloque", "poder", "mandato_desde", "mandato_hasta", "perfil_url", "fuente_url"],
  });

  await escribirMeta("remuneraciones.meta.json", {
    titulo: "Remuneraciones publicadas de autoridades",
    descripcion:
      "Cada fila es un concepto remunerativo bruto mensual publicado oficialmente. Hoy solo hay dieta de legisladores nacionales (Diputados: datos abiertos de la HCDN, con período tomado de la fecha de actualización del recurso; Senado: módulos de la Res. DR 8/24 por el valor del módulo desde marzo de 2026 de la escala salarial oficial). No se encontró publicación oficial de sueldos del gobernador, ministros ni de intendentes. Montos nominales en pesos.",
    columnas: {
      cargo_o_persona: { etiqueta: "Cargo", tipo: "texto" },
      organismo: { etiqueta: "Organismo", tipo: "texto" },
      concepto: { etiqueta: "Concepto", tipo: "texto" },
      periodo: { etiqueta: "Período", tipo: "mes", descripcion: "Mes de vigencia o de última actualización de la fuente." },
      monto_bruto: { etiqueta: "Monto bruto mensual", tipo: "moneda", moneda: "ARS", escala: 1 },
      fuente_url: { etiqueta: "Fuente", tipo: "url" },
    },
    orden: ["cargo_o_persona", "concepto", "monto_bruto", "periodo", "organismo", "fuente_url"],
  });
}
