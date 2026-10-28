/**
 * Registro de todas las páginas del sitio, con su SEO y GEO:
 * - título y descripción armados con el dato real de cada página;
 * - imagen para compartir (cifra principal);
 * - datos estructurados (schema.org): Person, Organization, GovernmentOrganization, AdministrativeArea,
 *   Legislation, Dataset, BreadcrumbList y FAQPage;
 * - contenido escrito en el HTML (`html`), para buscadores, redes y motores de IA que no ejecutan JavaScript.
 *
 * Lo usan scripts/seo.ts (HTML por ruta, imágenes, sitemap, robots, llms.txt) y scripts/build-data.ts
 * (public/data/meta.json, que la web usa para actualizar los metadatos al navegar).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GLOSSARY } from "../src/glossary.ts";
import { NO_PUBLICADO_CATEGORIES } from "../src/no-publicado-categories.ts";
import { municipalityPhoto, type PhotoId } from "../src/photos.ts";
import { datosMeta, PAGES, SITE_NAME, SITE_URL, TITLE_SUFFIX } from "../src/seo.ts";
import { ROLES } from "../src/slug.ts";
import type {
  AgencyDetail,
  AgencySummary,
  CoparticipacionTema,
  DataIndex,
  DeudaTema,
  EmpleoTema,
  FuncionariosTema,
  HistoryTema,
  LeyDetalle,
  LeyResumen,
  MunicipalBudget,
  MunicipalFees,
  MunicipalProcedure,
  MunicipioPagina,
  NoPublicado,
  OnlineStatus,
  OrganismoResumen,
  PartyDetail,
  PartySummary,
  PoblacionTema,
  ProcedureGuide,
  ProcedureStep,
  ProveedorResumen,
  RecaudacionTema,
  SenalesTema,
  UniversidadesTema,
} from "../src/types.ts";

export interface Pagina {
  path: string;
  title: string;
  description: string;
  /** Imagen para compartir. */
  og: { slug: string; eyebrow: string; titulo: string; figura: string; bajada: string; photo?: PhotoId };
  /** Datos estructurados (sin @context: se agrega al escribir). */
  ld: Record<string, unknown>[];
  /** Contenido principal en HTML semántico (h1, resumen, datos, enlaces). */
  html: string;
  lastmod: string;
  /** Prioridad relativa para el sitemap. */
  prioridad: number;
}

const nf = new Intl.NumberFormat("es-AR");
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[m! - 1]} de ${y}`;
};
const pesos = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$ ${nf1.format(v / 1e9)} mil millones`;
  if (abs >= 1e6) return `$ ${nf1.format(v / 1e6)} millones`;
  return `$ ${nf.format(Math.round(v))}`;
};
const pesosCorto = (v: number) =>
  Math.abs(v) >= 1e9
    ? `$ ${nf1.format(v / 1e9)} mil M`
    : Math.abs(v) >= 1e6
      ? `$ ${nf1.format(v / 1e6)} M`
      : `$ ${nf.format(Math.round(v))}`;

/** What the municipality's sheet says about starting the habilitación online (src/features/procedures/utils/format.ts). */
const ONLINE_TEXT: Record<OnlineStatus, string> = {
  online: "Se puede iniciar en línea.",
  in_person: "Se inicia en persona.",
  unknown: "La ficha oficial no dice cómo se inicia.",
  not_published: "El municipio no publica si se puede hacer completo en línea.",
};
const periodoTexto = (period: string) =>
  period
    ? `El monto es ${period === "año" ? "anual" : period === "mes" ? "mensual" : "bimestral"}.`
    : "La ordenanza no aclara si el monto es mensual o anual.";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (path: string) => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);

/** Recorta a `max` caracteres sin cortar palabras. */
export function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, corte.lastIndexOf(" ") > 0 ? corte.lastIndexOf(" ") : corte.length).replace(/[\s,.;:]+$/, "")}…`;
}
/** Con la marca si entra en 60 caracteres; si no, prima el contenido (es lo que se busca). */
const titulo = (t: string) => (t.length + TITLE_SUFFIX.length <= 60 ? t + TITLE_SUFFIX : recortar(t, 60));
const descripcion = (t: string) => recortar(t, 160);

// ------------------------------------------------------------------ piezas de HTML y JSON-LD

const NAV = [
  ["/senales", "Para mirar de cerca"],
  ["/funcionarios", "Funcionarios"],
  ["/partidos", "Partidos"],
  ["/gobierno", "Gobierno por dentro"],
  ["/municipios", "Municipios"],
  ["/leyes", "Leyes"],
  ["/proveedores", "Proveedores del Estado"],
  ["/organismos", "Organismos que compran"],
  ["/deuda", "Deuda"],
  ["/coparticipacion", "Coparticipación"],
  ["/recaudacion", "Recaudación"],
  ["/universidades", "Universidades"],
  ["/empleo-publico", "Empleo público"],
  ["/poblacion", "Población"],
  ["/no-publicado", "Lo que no se publica"],
  ["/pedir", "Pedí información"],
  ["/cartel", "Hacé un cartel"],
  ["/participar", "Participá"],
  ["/como-leer", "Cómo leer estos datos"],
  ["/fuentes", "Fuentes"],
] as const;

type Miga = [string, string];

function cuerpo(o: {
  migas: Miga[];
  h1: string;
  resumen: string;
  datos?: [string, string][];
  secciones?: { titulo: string; items: { texto: string; href?: string }[] }[];
  fuente?: { nombre: string; url?: string };
  actualizado?: string;
}): string {
  const migas = o.migas.map(([href, t]) => `<a href="${href}">${esc(t)}</a>`).join(" › ");
  const datos = o.datos?.length ? `<dl>${o.datos.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "";
  const secciones = (o.secciones ?? [])
    .filter((s) => s.items.length)
    .map(
      (s) =>
        `<section><h2>${esc(s.titulo)}</h2><ul>${s.items
          .map((i) => `<li>${i.href ? `<a href="${i.href}">${esc(i.texto)}</a>` : esc(i.texto)}</li>`)
          .join("")}</ul></section>`,
    )
    .join("");
  const fuente = o.fuente
    ? `<p>Fuente: ${o.fuente.url ? `<a href="${esc(o.fuente.url)}" rel="noopener">${esc(o.fuente.nombre)}</a>` : esc(o.fuente.nombre)}.${
        o.actualizado ? ` Actualizado el ${fechaLarga(o.actualizado)}.` : ""
      }</p>`
    : "";
  const nav = `<nav aria-label="Secciones"><ul>${NAV.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul></nav>`;
  return `<div class="prerender">${nav}<main><nav aria-label="Ruta">${migas}</nav><h1>${esc(o.h1)}</h1><p>${esc(o.resumen)}</p>${datos}${secciones}${fuente}</main></div>`;
}

const breadcrumb = (migas: Miga[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: migas.map(([href, name], i) => ({ "@type": "ListItem", position: i + 1, name, item: url(href) })),
});

const faq = (preguntas: [string, string][]) => ({
  "@type": "FAQPage",
  mainEntity: preguntas.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

const MENDOZA = {
  "@type": "AdministrativeArea",
  name: "Provincia de Mendoza",
  containedInPlace: { "@type": "Country", name: "Argentina" },
};
const publisher = { "@id": `${SITE_URL}/#organization` };
/** The same @id on the party page and on each person's affiliation: search engines join them as one entity. */
const partyId = (slug: string) => `${SITE_URL}/partidos/${slug}#partido`;

// ------------------------------------------------------------------ construcción

export async function construirPaginas(dataDir: string): Promise<Pagina[]> {
  const json = async <T>(p: string, fallback?: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(join(dataDir, p), "utf8")) as T;
    } catch (err) {
      if (fallback !== undefined) return fallback;
      throw err;
    }
  };
  const index = await json<DataIndex>("index.json");
  const deuda = await json<DeudaTema | null>("temas/deuda.json", null);
  const copa = await json<CoparticipacionTema | null>("temas/coparticipacion.json", null);
  const empleo = await json<EmpleoTema | null>("temas/empleo.json", null);
  const poblacion = await json<PoblacionTema | null>("temas/poblacion.json", null);
  const recaudacion = await json<RecaudacionTema | null>("temas/recaudacion.json", null);
  const universidades = await json<UniversidadesTema | null>("temas/universidades.json", null);
  const funcionarios = await json<FuncionariosTema>("temas/funcionarios.json", { personas: [] });
  const historial = await json<HistoryTema>("temas/history.json", { people: [], elections: [], formerCount: 0 });
  const municipios = await json<MunicipioPagina[]>("temas/municipios.json", []);
  const partidos = await json<PartySummary[]>("temas/partidos.json", []);
  const organismos = await json<OrganismoResumen[]>("temas/organismos.json", []);
  const proveedores = (await json<ProveedorResumen[]>("temas/proveedores.json", [])).filter((p) => p.indexable);
  const leyes = await json<LeyResumen[]>("temas/leyes.json", []);
  const senales = await json<SenalesTema>("temas/senales.json", { generado: "", senales: [] });
  const noPublicado = await json<NoPublicado[]>("temas/no-publicado.json", []);
  const hoy = index.generatedAt.slice(0, 10);
  const fuente = (id: string) => index.sources.find((s) => s.id === id);
  const lastFetch = (id: string) => fuente(id)?.raw.lastFetch?.slice(0, 10) ?? hoy;
  const paginas: Pagina[] = [];

  const estatica = (path: string, o: Omit<Pagina, "path" | "title" | "description" | "og"> & { figura: string; bajada: string }) => {
    const m = PAGES[path]!;
    paginas.push({
      path,
      title: m.title,
      description: m.description,
      og: { slug: m.ogSlug, eyebrow: m.eyebrow, titulo: m.ogTitle, figura: o.figura, bajada: o.bajada },
      ld: o.ld,
      html: o.html,
      lastmod: o.lastmod,
      prioridad: o.prioridad,
    });
  };

  // ---------------------------------------------------------------- portada y temas
  // The share image leads with the number of records analyzed: more striking than the number of sources.
  const records = index.datasets.reduce((sum, d) => sum + d.rowCount, 0);
  estatica("/", {
    figura: `${nf.format(records)} registros`,
    bajada: `De ${index.sources.length} fuentes oficiales: funcionarios, leyes, compras del Estado, deuda y municipios.`,
    ld: [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: url("/"),
        description: PAGES["/"]!.description,
        inLanguage: "es-AR",
        publisher,
        about: MENDOZA,
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: url("/"),
        logo: `${SITE_URL}/favicon.svg`,
        areaServed: MENDOZA,
      },
    ],
    html: cuerpo({
      migas: [["/", "Inicio"]],
      h1: "Mendoza Transparente: los datos públicos de Mendoza, ordenados y explicados",
      resumen:
        "Proyecto ciudadano e independiente que reúne los datos públicos de la provincia de Mendoza (Argentina) para mirar en qué se gasta la plata, quién decide y qué falta publicar: quiénes son los funcionarios y cuánto declaran, qué leyes se sancionan, a quién le compra el Estado, cuánto debe la provincia, cuánta gente trabaja en cada organismo y cuánta plata recibe cada municipio. Cada número enlaza a su fuente oficial.",
      datos: [
        ...(deuda
          ? ([["Deuda pública", `US$ ${nf.format(Math.round(deuda.totalUsd))} millones (${fechaLarga(deuda.corte)})`]] as [
              string,
              string,
            ][])
          : []),
        ...(poblacion ? ([["Habitantes", `${nf.format(poblacion.actual)} (${poblacion.anioActual})`]] as [string, string][]) : []),
        ["Funcionarios relevados", nf.format(funcionarios.personas.length)],
        ["Fuentes oficiales", nf.format(index.sources.length)],
      ],
      secciones: [{ titulo: "Secciones", items: NAV.map(([href, texto]) => ({ texto, href })) }],
    }),
    lastmod: hoy,
    prioridad: 1,
  });

  if (deuda) {
    const pico = deuda.serie.reduce((m, p) => (p.usd > m.usd ? p : m));
    const resumen = `La deuda pública consolidada de Mendoza es de US$ ${nf.format(Math.round(deuda.totalUsd))} millones al ${fechaLarga(deuda.corte)}, unos US$ ${nf.format(Math.round(deuda.porHabitanteUsd))} por habitante. El máximo de la serie fue de US$ ${nf.format(Math.round(pico.usd))} millones en ${pico.fecha.slice(0, 4)}.`;
    estatica("/deuda", {
      figura: `US$ ${nf.format(Math.round(deuda.totalUsd))} M`,
      bajada: `Deuda total al ${fechaLarga(deuda.corte)}: unos US$ ${nf.format(Math.round(deuda.porHabitanteUsd))} por habitante.`,
      ld: [
        breadcrumb([
          ["/", "Inicio"],
          ["/deuda", "Deuda pública"],
        ]),
        faq([
          ["¿Cuánto debe la provincia de Mendoza?", resumen],
          [
            "¿A quién le debe Mendoza?",
            `Principalmente a tenedores de bonos (${nf.format(Math.round(deuda.porAcreedor[0]?.usd ?? 0))} millones de dólares) y a organismos internacionales como el BID.`,
          ],
        ]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/deuda", "Deuda pública"],
        ],
        h1: "¿Cuánto debe Mendoza? Deuda pública de la provincia",
        resumen,
        datos: deuda.mandatos.map((m) => [
          `${m.gobierno} ${m.desde.slice(0, 4)}–${m.hasta?.slice(0, 4) ?? "hoy"}`,
          `de US$ ${nf.format(Math.round(m.inicio.usd))} M a US$ ${nf.format(Math.round(m.fin.usd))} M`,
        ]),
        secciones: [
          {
            titulo: "A quién le debe",
            items: deuda.porAcreedor.map((a) => ({ texto: `${a.nombre}: US$ ${nf.format(Math.round(a.usd))} millones` })),
          },
        ],
        fuente: { nombre: "Ministerio de Hacienda y Finanzas de Mendoza", url: fuente("hacienda-deuda-stock")?.url },
        actualizado: lastFetch("hacienda-deuda-stock"),
      }),
      lastmod: lastFetch("hacienda-deuda-stock"),
      prioridad: 0.8,
    });
  }

  if (copa) {
    const ranking = [...copa.municipios].sort((a, b) => b.perCapita - a.perCapita);
    const resumen = `En ${copa.anioCompleto} la provincia repartió ${pesos(copa.totalReal)} (en pesos de ${copa.referencia}) entre los 18 municipios de Mendoza. ${ranking[0]!.municipio} es el que más recibe por habitante (${pesos(ranking[0]!.perCapita)}) y ${ranking.at(-1)!.municipio} el que menos (${pesos(ranking.at(-1)!.perCapita)}).`;
    estatica("/coparticipacion", {
      figura: `$ ${nf.format(Math.round(copa.totalReal / 1e9))} mil M`,
      bajada: `Repartido entre los municipios en ${copa.anioCompleto}, en pesos de ${copa.referencia}.`,
      ld: [
        breadcrumb([
          ["/", "Inicio"],
          ["/coparticipacion", "Coparticipación"],
        ]),
        faq([["¿Cuánta coparticipación reciben los municipios de Mendoza?", resumen]]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/coparticipacion", "Coparticipación"],
        ],
        h1: "Coparticipación a los municipios de Mendoza",
        resumen,
        secciones: [
          {
            titulo: "Por habitante",
            items: ranking.map((m) => ({
              texto: `${m.municipio}: ${pesos(m.perCapita)} por habitante`,
              href: `/municipios/${slugMunicipio(m.municipio)}`,
            })),
          },
        ],
        fuente: { nombre: "Ministerio de Hacienda y Finanzas de Mendoza", url: fuente("hacienda-participacion-municipal")?.url },
        actualizado: lastFetch("hacienda-participacion-municipal"),
      }),
      lastmod: lastFetch("hacienda-participacion-municipal"),
      prioridad: 0.8,
    });
  }

  if (empleo) {
    const resumen = `Mendoza tiene ${nf1.format(empleo.cadaMilMendoza)} empleados públicos provinciales cada mil habitantes (${empleo.anio}), el ${empleo.posicion}.º más bajo de las 24 jurisdicciones. El promedio del país es ${nf1.format(empleo.promedioPais)}.`;
    estatica("/empleo-publico", {
      figura: `${nf1.format(empleo.cadaMilMendoza)} cada mil`,
      bajada: `Empleados públicos cada mil habitantes en ${empleo.anio}. Promedio del país: ${nf1.format(empleo.promedioPais)}.`,
      ld: [
        breadcrumb([
          ["/", "Inicio"],
          ["/empleo-publico", "Empleo público"],
        ]),
        faq([["¿Cuántos empleados públicos tiene Mendoza?", resumen]]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/empleo-publico", "Empleo público"],
        ],
        h1: "Empleo público en Mendoza comparado con las demás provincias",
        resumen,
        secciones: [
          {
            titulo: "Empleados públicos cada mil habitantes",
            items: empleo.ranking.map((r) => ({ texto: `${r.provincia}: ${nf1.format(r.cadaMil)}` })),
          },
        ],
        fuente: { nombre: "Dirección Nacional de Asuntos Provinciales", url: fuente("dnap-ocupacion")?.url },
        actualizado: lastFetch("dnap-ocupacion"),
      }),
      lastmod: lastFetch("dnap-ocupacion"),
      prioridad: 0.7,
    });
  }

  if (poblacion) {
    const resumen = `Mendoza tiene ${nf.format(poblacion.actual)} habitantes estimados en ${poblacion.anioActual} (proyección de INDEC). Entre los censos 2010 y 2022 la población creció ${nf1.format((poblacion.censo2022 / poblacion.censo2010 - 1) * 100)} %.`;
    estatica("/poblacion", {
      figura: nf.format(poblacion.actual),
      bajada: `Habitantes estimados en ${poblacion.anioActual}, repartidos en 18 departamentos.`,
      ld: [
        breadcrumb([
          ["/", "Inicio"],
          ["/poblacion", "Población"],
        ]),
        faq([["¿Cuántos habitantes tiene Mendoza?", resumen]]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/poblacion", "Población"],
        ],
        h1: "Población de Mendoza por departamento",
        resumen,
        secciones: [
          {
            titulo: "Habitantes por departamento",
            items: [...poblacion.departamentos]
              .sort((a, b) => b.actual - a.actual)
              .map((d) => ({
                texto: `${d.municipio}: ${nf.format(d.actual)} habitantes`,
                href: `/municipios/${slugMunicipio(d.municipio)}`,
              })),
          },
        ],
        fuente: { nombre: "INDEC, censos y proyecciones de población", url: fuente("poblacion")?.url },
      }),
      lastmod: lastFetch("poblacion"),
      prioridad: 0.6,
    });
  }

  if (recaudacion) {
    const r = recaudacion;
    const change = ((r.total.actual - r.total.anterior) / r.total.anterior) * 100;
    const resumen = `De ${r.periodo} de ${r.anio} la Administración Tributaria Mendoza recaudó ${pesos(r.total.actual)} (en pesos de ${r.referencia}), ${nf1.format(Math.abs(change))} % ${change >= 0 ? "más" : "menos"} que en los mismos meses de ${r.anio - 1}, descontada la inflación. Ingresos Brutos es el impuesto que más recauda.`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/recaudacion", "Recaudación"],
    ];
    estatica("/recaudacion", {
      figura: pesosCorto(r.total.actual),
      bajada: `Recaudado de ${r.periodo} de ${r.anio}, en pesos de ${r.referencia}.`,
      ld: [breadcrumb(migas), faq([["¿Cuánto recauda Mendoza con sus impuestos?", resumen]])],
      html: cuerpo({
        migas,
        h1: "¿Cuánto recauda Mendoza con sus impuestos?",
        resumen,
        datos: r.porImpuesto.map((i) => [i.nombre, pesos(i.actual)]),
        fuente: { nombre: "Administración Tributaria Mendoza (ATM)", url: fuente("atm-recaudacion")?.url },
        actualizado: lastFetch("atm-recaudacion"),
      }),
      lastmod: lastFetch("atm-recaudacion"),
      prioridad: 0.7,
    });
  }

  if (universidades) {
    const u = universidades;
    const students = u.estudiantes.at(-1);
    const hubMigas: Miga[] = [
      ["/", "Inicio"],
      ["/universidades", "Universidades"],
    ];
    const hubResumen = `En Mendoza hay dos universidades nacionales: la UNCuyo, que tiene presupuestados ${pesos(u.enCurso.presupuestado)} de Nación para ${u.enCurso.anio}, y la UTN, que informa una sola cifra para todo el país y no permite saber cuánto queda en sus facultades de Mendoza y San Rafael.`;
    estatica("/universidades", {
      figura: "UNCuyo y UTN",
      bajada: "Cuánto les transfiere Nación y qué datos faltan.",
      ld: [breadcrumb(hubMigas), faq([["¿Cuánta plata reciben las universidades nacionales en Mendoza?", hubResumen]])],
      html: cuerpo({
        migas: hubMigas,
        h1: "Universidades nacionales en Mendoza",
        resumen: hubResumen,
        secciones: [{ titulo: "Universidades", items: [{ texto: "Universidad Nacional de Cuyo", href: "/universidades/uncuyo" }] }],
        fuente: { nombre: "Presupuesto Abierto, Ministerio de Economía", url: fuente("universidades-presupuesto")?.url },
        actualizado: lastFetch("universidades-presupuesto"),
      }),
      lastmod: lastFetch("universidades-presupuesto"),
      prioridad: 0.6,
    });

    const migas: Miga[] = [...hubMigas, ["/universidades/uncuyo", "UNCuyo"]];
    const resumen = `Para ${u.enCurso.anio} la Universidad Nacional de Cuyo tiene presupuestados ${pesos(u.enCurso.presupuestado)} del Tesoro nacional (en pesos de ${u.referencia}), y al ${fechaLarga(u.enCurso.corte)} ya recibió ${pesos(u.enCurso.devengado)}.${students ? ` En ${students.anio} tuvo ${nf.format(students.estudiantes)} estudiantes de pregrado y grado y ${nf.format(students.egresados)} egresados.` : ""}`;
    estatica("/universidades/uncuyo", {
      figura: pesosCorto(u.enCurso.presupuestado),
      bajada: `Presupuesto de Nación para ${u.enCurso.anio}, en pesos de ${u.referencia}.`,
      ld: [breadcrumb(migas), faq([["¿Cuánta plata recibe la UNCuyo?", resumen]])],
      html: cuerpo({
        migas,
        h1: "¿Cuánto recibe la UNCuyo y a cuántos forma?",
        resumen,
        datos: u.transferencias.map((t) => [`Recibido en ${t.anio}`, pesos(t.real)]),
        secciones: u.disciplinas
          ? [
              {
                titulo: `Estudiantes por disciplina (${u.disciplinas.anio})`,
                items: u.disciplinas.items.map((d) => ({
                  texto: `${d.disciplina}: ${nf.format(d.estudiantes)} estudiantes y ${nf.format(d.egresados)} egresados`,
                })),
              },
            ]
          : [],
        fuente: { nombre: "Presupuesto Abierto y Anuario de Estadísticas Universitarias", url: fuente("universidades-presupuesto")?.url },
        actualizado: lastFetch("universidades-presupuesto"),
      }),
      lastmod: lastFetch("universidades-presupuesto"),
      prioridad: 0.6,
    });
  }

  estatica("/senales", {
    figura: `${senales.senales.length} señales`,
    bajada: "Contrataciones directas, una sola oferta, empresas nuevas: patrones que merecen explicación.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/senales", "Para mirar de cerca"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/senales", "Para mirar de cerca"],
      ],
      h1: "Señales en el gasto público de Mendoza",
      resumen:
        "Patrones en los datos oficiales de compras del Estado de Mendoza que merecen una explicación. No son acusaciones: son preguntas con los casos concretos para revisar.",
      secciones: [{ titulo: "Señales", items: senales.senales.map((s) => ({ texto: `${s.cifra} ${s.titulo}. ${s.matiz}` })) }],
      fuente: { nombre: "COMPR.AR Mendoza (contrataciones abiertas) y Registro Nacional de Sociedades", url: fuente("compras-ocds")?.url },
    }),
    lastmod: lastFetch("compras-ocds"),
    prioridad: 0.9,
  });

  estatica("/no-publicado", {
    figura: `${noPublicado.length} datos`,
    bajada: "Que deberían ser públicos y no lo son. Te explicamos cómo pedirlos con la Ley 9070.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/no-publicado", "Lo que no se publica"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/no-publicado", "Lo que no se publica"],
      ],
      h1: "Lo que el Estado de Mendoza no publica",
      resumen:
        "Datos que deberían ser públicos y no están en ningún sitio oficial de Mendoza. Cualquier persona puede pedirlos con la Ley 9070 de Acceso a la Información Pública.",
      secciones: Object.entries(NO_PUBLICADO_CATEGORIES)
        .map(([c, cat]) => ({
          titulo: cat.label,
          items: noPublicado
            .filter((n) => n.categoria === c)
            .map((n) => ({ texto: `${n.titulo}: ${n.que_es} Debería publicarlo: ${n.organismo}.` })),
        }))
        .filter((g) => g.items.length),
    }),
    lastmod: hoy,
    prioridad: 0.7,
  });

  estatica("/pedir", {
    figura: "Nota en PDF",
    bajada: "Un pedido de acceso a la información pública, listo para presentar. Gratis y sin abogado.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/pedir", "Pedí información"],
      ]),
      faq([
        [
          "¿Cómo pido información pública en Mendoza?",
          "Con una nota de acceso a la información pública (Ley 9070): se indica a quién se pide, qué información y los datos de quien la pide (nombre, domicilio y un correo o teléfono). Se presenta en mesa de entradas o en el canal en línea del organismo, es gratis y no hace falta abogado.",
        ],
        [
          "¿Cuánto tienen para responder?",
          "Quince días hábiles desde que reciben el pedido (artículo 13 de la Ley 9070), que se pueden prorrogar una sola vez por otros quince con una explicación.",
        ],
        [
          "¿Tengo que explicar para qué quiero la información?",
          "No. La Ley 9070 dice que no hace falta justificar el pedido (artículo 9).",
        ],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/pedir", "Pedí información"],
      ],
      h1: "Pedí información pública",
      resumen:
        "Armá una nota formal de acceso a la información pública para cualquiera de los 18 municipios de Mendoza o para un organismo de la provincia, completala en la página y descargala en PDF para presentarla. Tus datos no salen de tu dispositivo.",
    }),
    lastmod: hoy,
    prioridad: 0.7,
  });

  estatica("/cartel", {
    figura: "Para imprimir o compartir",
    bajada: "Qué publica tu municipio, cuánta plata recibe, en qué gasta y cuántos empleados tiene.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/cartel", "Hacé un cartel"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/cartel", "Hacé un cartel"],
      ],
      h1: "Hacé un cartel con datos de tu municipio",
      resumen:
        "Elegí tu municipio y qué querés mostrar: qué datos publica, uno que no publica, cuánta plata recibe de la Provincia, en qué gasta o cuántas personas trabajan. Descargalo en PDF para imprimir o como imagen para WhatsApp e Instagram, con su fuente y un código QR.",
    }),
    lastmod: hoy,
    prioridad: 0.6,
  });

  estatica("/como-leer", {
    figura: "Guía y glosario",
    bajada: "Para qué sirve, cómo empezar y qué significan los términos que más confunden.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/como-leer", "Cómo leer estos datos"],
      ]),
      faq([
        [
          "¿Para qué sirve Mendoza Transparente?",
          "Reúne los datos públicos de la provincia de Mendoza, dispersos en decenas de sitios oficiales, y los ordena para entender en qué se gasta la plata, quién decide y qué falta publicar. Cada número enlaza a su fuente oficial.",
        ],
        ...GLOSSARY.map((g) => [`¿Qué es ${g.term.replace(/\s*\(.*\)$/, "").toLowerCase()}?`, g.definition] as [string, string]),
      ]),
      {
        "@type": "DefinedTermSet",
        name: "Glosario de Mendoza Transparente",
        url: url("/como-leer"),
        hasDefinedTerm: GLOSSARY.map((g) => ({
          "@type": "DefinedTerm",
          name: g.term,
          description: g.definition,
          url: url(`/como-leer#${g.id}`),
        })),
      },
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/como-leer", "Cómo leer estos datos"],
      ],
      h1: "Para qué sirve Mendoza Transparente y cómo usarlo",
      resumen:
        "Mendoza Transparente reúne los datos públicos de la provincia de Mendoza y los ordena para que cualquier persona pueda entender en qué se gasta la plata, quién decide y qué falta publicar. Cada número enlaza a su fuente oficial.",
      secciones: [{ titulo: "Glosario", items: GLOSSARY.map((g) => ({ texto: `${g.term}: ${g.definition}` })) }],
    }),
    lastmod: hoy,
    prioridad: 0.7,
  });

  estatica("/participar", {
    figura: "Participá",
    bajada: "Registrá tu pedido de información y contanos qué te respondió el Estado.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/participar", "Participá"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/participar", "Participá"],
      ],
      h1: "Sumate a Mendoza Transparente",
      resumen:
        "Registrá los pedidos de acceso a la información pública que presentaste en Mendoza (Ley 9070) con su número de trámite, contanos qué te respondieron, reportá errores o sugerí datos. Publicamos cuántos pedidos hay y cuánto responde el Estado.",
    }),
    lastmod: hoy,
    prioridad: 0.6,
  });

  estatica("/fuentes", {
    figura: `${index.sources.length} fuentes`,
    bajada: "Oficiales y abiertas: de dónde sale cada dato, cada cuánto se actualiza y cómo bajarlo.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/fuentes", "Fuentes"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/fuentes", "Fuentes"],
      ],
      h1: "Fuentes de datos públicos de Mendoza",
      resumen: "Todas las fuentes oficiales que usa Mendoza Transparente, con su organismo, frecuencia y descarga en CSV.",
      secciones: [
        { titulo: "Fuentes", items: index.sources.map((s) => ({ texto: `${s.nombre} (${s.organismo})`, href: `/datos/${s.id}` })) },
      ],
    }),
    lastmod: hoy,
    prioridad: 0.5,
  });

  // ---------------------------------------------------------------- funcionarios
  const GRUPO: Record<string, string> = {
    ejecutivo: "Poder Ejecutivo provincial",
    intendentes: "Intendentes",
    diputados_provincial: "Diputados provinciales",
    senado_provincial: "Senadores provinciales",
    diputados_nacional: "Diputados nacionales por Mendoza",
    senado_nacional: "Senadores nacionales por Mendoza",
  };
  estatica("/funcionarios", {
    figura: `${funcionarios.personas.length} funcionarios`,
    bajada: "Gobierno, Legislatura, intendentes y Congreso: partido, mandato, patrimonio y sueldo.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/funcionarios", "Funcionarios"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/funcionarios", "Funcionarios"],
      ],
      h1: "Funcionarios públicos de Mendoza",
      resumen:
        "Quiénes representan a Mendoza: gobernador, ministros, diputados y senadores provinciales, intendentes y legisladores nacionales, con su partido o bloque, mandato, declaración jurada y sueldo cuando es público.",
      secciones: Object.entries(GRUPO).map(([g, t]) => ({
        titulo: t,
        items: funcionarios.personas
          .filter((p) => p.grupo === g)
          .map((p) => ({ texto: `${p.nombre}, ${p.cargo}`, href: `/funcionarios/${p.role}/${p.slug}` })),
      })),
    }),
    lastmod: hoy,
    prioridad: 0.9,
  });

  // Who held each position before: /funcionarios/historial (ex officials open in a sheet, so they have no page).
  if (historial.people.length || historial.elections.length) {
    const path = "/funcionarios/historial";
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/funcionarios", "Funcionarios"],
      [path, "Historial"],
    ];
    const governors = historial.elections.filter((e) => e.governor);
    const firstYear = historial.elections.at(-1)?.year;
    const resumen = `Quiénes ganaron cada elección en Mendoza${firstYear ? ` desde ${firstYear}` : ""} y por qué partido, según las actas de la Junta Electoral${historial.formerCount ? `, y ${nf.format(historial.formerCount)} ex funcionarios con los cargos que ocuparon y sus fechas, según la Oficina de Ética Pública` : ""}.`;
    paginas.push({
      path,
      title: titulo("Quién ocupó cada cargo en Mendoza"),
      description: descripcion(resumen),
      og: {
        slug: "funcionarios-historial",
        eyebrow: "FUNCIONARIOS",
        titulo: "¿Quién ocupó cada cargo?",
        figura: `${nf.format(historial.people.length)} personas`,
        bajada: "Gobernadores, elecciones y ex funcionarios de Mendoza, con sus fechas.",
      },
      ld: [
        breadcrumb(migas),
        faq(
          governors.map((e) => [
            `¿Quién ganó la elección a gobernador de Mendoza en ${e.year}?`,
            `${e.governor!.name}${e.governor!.party ? `, por ${e.governor!.party}` : ""}, según el acta de proclamación de la Junta Electoral.`,
          ]),
        ),
      ],
      html: cuerpo({
        migas,
        h1: "¿Quién ocupó cada cargo?",
        resumen,
        secciones: [
          {
            titulo: "Gobernadores",
            items: governors.map((e) => ({
              texto: `${e.year}: ${e.governor!.name}${e.governor!.party ? ` (${e.governor!.party})` : ""}`,
              href: e.governor!.href,
            })),
          },
          ...historial.elections.map((e) => ({
            titulo: `Elección del ${fechaLarga(e.date)}`,
            items: e.offices.map((o) => ({
              texto: `${o.label} (${o.total}): ${o.parties.map((x) => `${x.nombre} ${x.valor}`).join(", ")}`,
            })),
          })),
        ],
        fuente: { nombre: "Junta Electoral de Mendoza y Oficina de Ética Pública" },
      }),
      lastmod: hoy,
      prioridad: 0.7,
    });
  }

  // One page per role: /funcionarios/diputados-provinciales
  for (const [key, role] of Object.entries(ROLES)) {
    const people = funcionarios.personas.filter((p) => p.grupo === key);
    if (!people.length) continue;
    const path = `/funcionarios/${role.slug}`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/funcionarios", "Funcionarios"],
      [path, role.title],
    ];
    paginas.push({
      path,
      title: titulo(role.title),
      description: descripcion(role.description),
      og: {
        slug: `cargo-${role.slug}`,
        eyebrow: "FUNCIONARIOS",
        titulo: role.title,
        figura: `${people.length} ${people.length === 1 ? "persona" : "personas"}`,
        bajada: role.description,
      },
      ld: [breadcrumb(migas)],
      html: cuerpo({
        migas,
        h1: role.title,
        resumen: role.description,
        secciones: [
          {
            titulo: role.title,
            items: people.map((p) => ({
              texto: `${p.nombre}, ${[p.cargo, p.bloque ?? p.partido, p.seccion].filter(Boolean).join(", ")}`,
              href: `/funcionarios/${p.role}/${p.slug}`,
            })),
          },
        ],
      }),
      lastmod: hoy,
      prioridad: 0.8,
    });
  }

  for (const p of funcionarios.personas) {
    const path = `/funcionarios/${p.role}/${p.slug}`;
    const lugar = p.grupo === "intendentes" ? `intendente de ${p.organismo}` : p.cargo.replace(/\s*\(.*\)$/, "");
    const filiacion = p.partido ?? p.bloque;
    const bienes = p.ddjj
      ? `Declaró inmuebles y vehículos a su nombre por ${pesos(p.ddjj.totalBienes)} (pesos a valor fiscal, menor al de mercado; ${p.ddjj.inmuebles} inmuebles y ${p.ddjj.rodados} vehículos). Los montos de cuentas y otros bienes no se publican.`
      : "";
    const sueldo = p.remuneracion.length ? `Cobra una dieta de ${pesos(p.remuneracion[0]!.monto)} brutos.` : "Su sueldo no está publicado.";
    const resumen =
      `${p.nombre} es ${lugar}${p.grupo.endsWith("nacional") ? "" : " de Mendoza"}${filiacion ? ` (${filiacion})` : ""}${p.mandatoHasta ? `, con mandato hasta ${p.mandatoHasta}` : ""}. ${bienes} ${sueldo}`
        .replace(/\s+/g, " ")
        .trim();
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/funcionarios", "Funcionarios"],
      [`/funcionarios/${p.role}`, ROLES[p.grupo].title],
      [path, p.nombre],
    ];
    const datos: [string, string][] = [
      ["Cargo", p.cargo],
      ["Organismo", p.organismo],
      ...(p.partido ? ([["Partido o frente", p.partido]] as [string, string][]) : []),
      ...(p.bloque ? ([["Bloque", p.bloque]] as [string, string][]) : []),
      ...(p.seccion ? ([["Electo por", p.seccion]] as [string, string][]) : []),
      ...(p.mandatoDesde || p.mandatoHasta
        ? ([["Mandato", `${p.mandatoDesde ?? "?"}–${p.mandatoHasta ?? "?"}`]] as [string, string][])
        : []),
      ...(p.ddjj ? ([["Bienes declarados (valor fiscal)", pesos(p.ddjj.totalBienes)]] as [string, string][]) : []),
      ["Sueldo", p.remuneracion.length ? p.remuneracion.map((r) => `${r.concepto}: ${pesos(r.monto)}`).join("; ") : "No publicado"],
    ];
    paginas.push({
      path,
      title: titulo(
        `${p.nombre}: ${p.grupo === "intendentes" ? `intendente de ${p.organismo}` : recortar(p.cargo.replace(/\s*\(.*\)$/, ""), 30)}`,
      ),
      description: descripcion(resumen),
      og: {
        slug: `funcionario-${p.id}`,
        eyebrow: GRUPO[p.grupo]!.toUpperCase(),
        titulo: p.nombre,
        figura: p.ddjj ? pesosCorto(p.ddjj.totalBienes) : (filiacion ?? lugar),
        bajada: p.ddjj
          ? `Inmuebles y vehículos declarados, en pesos a valor fiscal. ${lugar}.`
          : `${lugar}${p.mandatoHasta ? `, mandato hasta ${p.mandatoHasta}` : ""}.`,
      },
      ld: [
        {
          "@type": "Person",
          name: p.nombre,
          jobTitle: p.cargo,
          url: url(path),
          ...(p.foto ? { image: `${SITE_URL}${p.foto}` } : {}),
          worksFor: { "@type": "GovernmentOrganization", name: p.organismo, areaServed: MENDOZA },
          ...(p.party ? { affiliation: { "@type": "PoliticalParty", "@id": partyId(p.party.slug), name: p.party.name } } : {}),
          description: resumen,
        },
        breadcrumb(migas),
        faq([
          [`¿Quién es ${p.nombre}?`, resumen],
          [
            `¿Cuánto gana ${p.nombre}?`,
            p.remuneracion.length
              ? sueldo
              : "Su sueldo no está publicado en ningún sitio oficial. Se puede pedir con la Ley 9070 de Acceso a la Información Pública.",
          ],
          ...(p.ddjj ? ([[`¿Qué patrimonio declaró ${p.nombre}?`, bienes]] as [string, string][]) : []),
        ]),
      ],
      html: cuerpo({
        migas,
        h1: `${p.nombre}, ${lugar}`,
        resumen,
        datos,
        secciones: [
          ...(p.party
            ? [{ titulo: "Partido, frente o bloque", items: [{ texto: filiacion ?? p.party.name, href: `/partidos/${p.party.slug}` }] }]
            : []),
          ...(p.municipalities.length
            ? [
                {
                  titulo: p.grupo === "intendentes" ? "Gobierna" : `Representa a la ${p.seccion?.toLowerCase() ?? "sección"}`,
                  items: p.municipalities.map((m) => ({ texto: m.name, href: `/municipios/${m.slug}` })),
                },
              ]
            : []),
          {
            titulo: "Elecciones que ganó",
            items: (p.elected ?? []).map((e) => ({
              texto: `${e.date.slice(0, 4)}: ${e.role}, ${e.place}${e.party ? ` (${e.party})` : ""}`,
            })),
          },
          {
            titulo: "Cargos anteriores",
            items: (p.pastPositions ?? []).map((c) => ({
              texto: `${[c.role, c.agency].filter(Boolean).join(", ")}${c.from ? ` (${c.from.slice(0, 4)}–${c.to?.slice(0, 4) ?? ""})` : ""}`,
            })),
          },
        ],
        fuente: {
          nombre: "Fuentes oficiales: Legislatura, Gobierno de Mendoza, Junta Electoral, Congreso y Oficina de Ética Pública",
          url: p.fuenteUrl,
        },
      }),
      lastmod: p.ddjj?.fecha ?? hoy,
      prioridad: 0.7,
    });
  }

  // ---------------------------------------------------------------- partidos, frentes y bloques
  if (partidos.length) {
    const migasIndice: Miga[] = [
      ["/", "Inicio"],
      ["/funcionarios", "Funcionarios"],
      ["/partidos", "Partidos"],
    ];
    const conCargos = partidos.filter((x) => x.inOffice > 0);
    const linea = (x: PartySummary) =>
      [
        x.inOffice > 0 && `${nf.format(x.inOffice)} en funciones`,
        x.seatsWon > 0 && `${nf.format(x.seatsWon)} ${x.seatsWon === 1 ? "cargo ganado" : "cargos ganados"} desde 2015`,
      ]
        .filter(Boolean)
        .join(", ");
    estatica("/partidos", {
      figura: `${conCargos.length} con cargos hoy`,
      bajada: "Quiénes ocupan un cargo con cada partido, frente o bloque, y qué ganó cada uno desde 2015.",
      ld: [
        breadcrumb(migasIndice),
        {
          "@type": "ItemList",
          name: "Partidos, frentes y bloques de Mendoza",
          itemListElement: partidos.map((x, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: x.name,
            url: url(`/partidos/${x.slug}`),
          })),
        },
      ],
      html: cuerpo({
        migas: migasIndice,
        h1: "Partidos, frentes y bloques de Mendoza",
        resumen: `${conCargos.length} partidos, frentes o bloques tienen hoy a alguien en un cargo electo en Mendoza: Legislatura, intendencias, gobernación y Congreso. Para cada uno, quiénes son y cuántas bancas y cargos ganó en las elecciones desde 2015, según las actas de la Junta Electoral. Los cargos designados, como los ministros, no tienen partido en ninguna fuente oficial.`,
        secciones: [
          { titulo: "Con cargos hoy", items: conCargos.map((x) => ({ texto: `${x.name}: ${linea(x)}`, href: `/partidos/${x.slug}` })) },
          {
            titulo: "En elecciones anteriores",
            items: partidos.filter((x) => x.inOffice === 0).map((x) => ({ texto: `${x.name}: ${linea(x)}`, href: `/partidos/${x.slug}` })),
          },
        ],
        fuente: { nombre: "Legislatura de Mendoza, Gobierno de Mendoza y Junta Electoral de Mendoza" },
      }),
      lastmod: hoy,
      prioridad: 0.8,
    });

    for (const summary of partidos) {
      const x = await json<PartyDetail>(`temas/partidos/${summary.slug}.json`);
      const path = `/partidos/${x.slug}`;
      const migas: Miga[] = [...migasIndice, [path, x.name]];
      // "UCR" is how people search it; the full name goes too.
      const nombre = x.short && x.short !== x.name && x.short.length > 2 && x.name.length > 3 ? `${x.short} (${x.name})` : x.name;
      const count = (group: string) => x.members.find((g) => g.group === group)?.people.length ?? 0;
      const legislators = count("diputados_provincial") + count("senado_provincial");
      const mayors = count("intendentes");
      const national = count("diputados_nacional") + count("senado_nacional");
      const partes = [
        legislators && `${nf.format(legislators)} ${legislators === 1 ? "legislador provincial" : "legisladores provinciales"}`,
        mayors && `${nf.format(mayors)} ${mayors === 1 ? "intendente" : "intendentes"}`,
        national && `${nf.format(national)} ${national === 1 ? "legislador nacional" : "legisladores nacionales"}`,
        count("ejecutivo") && "la gobernación",
      ].filter(Boolean) as string[];
      const listaHumana = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
      const hoyTiene = partes.length ? `Hoy tiene ${listaHumana(partes)}` : "Hoy no tiene cargos electos en funciones";
      const gano = x.seatsWon
        ? `En las elecciones desde 2015 ganó ${nf.format(x.seatsWon)} ${x.seatsWon === 1 ? "cargo" : "cargos"} como titular, según las actas de la Junta Electoral`
        : "";
      const tambien = x.aliases.length ? ` También figura como ${listaHumana(x.aliases.map((a) => a.name))}.` : "";
      const resumen = `${hoyTiene}.${gano ? ` ${gano}.` : ""}${tambien}`;
      // "Cambia Mendoza", not "Cambia Mendoza en Mendoza".
      const enMendoza = (n: string) => (/mendoza/i.test(n) ? n : `${n} en Mendoza`);
      const quienes =
        count("ejecutivo") && mayors
          ? "gobernador e intendentes"
          : legislators && mayors
            ? "legisladores e intendentes"
            : legislators
              ? "sus legisladores"
              : mayors
                ? "sus intendentes"
                : "";
      const titleBase = quienes ? `${enMendoza(nombre)}: ${quienes}` : enMendoza(nombre);
      paginas.push({
        path,
        title: titulo(titleBase.length > 60 ? enMendoza(nombre) : titleBase),
        description: descripcion(`${enMendoza(x.name)}. ${resumen}`),
        og: {
          slug: `partido-${x.slug}`,
          eyebrow: "PARTIDOS",
          titulo: x.name,
          figura: x.inOffice ? `${nf.format(x.inOffice)} en funciones` : `${nf.format(x.seatsWon)} cargos ganados`,
          bajada: x.inOffice ? `${listaHumana(partes)}.` : `Cargos ganados desde 2015, según la Junta Electoral.`,
        },
        ld: [
          {
            "@type": "PoliticalParty",
            "@id": partyId(x.slug),
            name: x.name,
            ...(x.aliases.length || x.short.length > 2
              ? { alternateName: [...new Set([...(x.short.length > 2 ? [x.short] : []), ...x.aliases.map((a) => a.name)])] }
              : {}),
            url: url(path),
            ...(x.logo ? { logo: `${SITE_URL}${x.logo}` } : {}),
            ...(x.wikidata ? { sameAs: [`https://www.wikidata.org/wiki/${x.wikidata}`] } : {}),
            areaServed: MENDOZA,
            description: resumen,
            ...(x.inOffice
              ? {
                  member: x.members.flatMap((g) =>
                    g.people.map((m) => ({ "@type": "Person", name: m.name, url: url(`/funcionarios/${m.role}/${m.slug}`) })),
                  ),
                }
              : {}),
          },
          breadcrumb(migas),
          faq([
            ...(legislators
              ? ([
                  [
                    `¿Cuántos legisladores tiene ${nombre} en Mendoza?`,
                    `${nf.format(legislators)} en la Legislatura de Mendoza (${nf.format(count("senado_provincial"))} en el Senado y ${nf.format(count("diputados_provincial"))} en Diputados), según los bloques que publica cada cámara.`,
                  ],
                ] as [string, string][])
              : []),
            ...(mayors
              ? ([
                  [
                    `¿Qué intendentes de Mendoza son de ${nombre}?`,
                    `${listaHumana(x.members.find((g) => g.group === "intendentes")!.people.map((m) => `${m.name} (${m.place})`))}.`,
                  ],
                ] as [string, string][])
              : []),
            ...(x.seatsWon ? ([[`¿Cuántos cargos ganó ${nombre} en Mendoza?`, `${gano}.`]] as [string, string][]) : []),
          ]),
        ],
        html: cuerpo({
          migas,
          h1: enMendoza(x.name),
          resumen,
          secciones: [
            ...x.members.map((g) => ({
              titulo: GRUPO[g.group]!,
              items: g.people.map((m) => ({
                texto: `${m.name}, ${m.place}${m.asWritten !== x.name ? ` (${m.via === "bloque" ? "bloque" : "figura como"} ${m.asWritten})` : ""}`,
                href: `/funcionarios/${m.role}/${m.slug}`,
              })),
            })),
            {
              titulo: "Qué ganó en cada elección",
              items: x.elections.map((e) => ({
                texto: `${fechaLarga(e.date)}: ${e.offices.map((o) => `${o.label} ${o.count}`).join(", ")}`,
              })),
            },
            {
              titulo: "Electos que hoy no tienen cargo",
              items: x.former.slice(0, 50).map((f) => ({
                texto: `${f.name}, ${f.role} (${f.place}, ${f.year})`,
                href: `/funcionarios/historial?persona=${f.id}`,
              })),
            },
            { titulo: "También figura como", items: x.aliases.map((a) => ({ texto: `${a.name}: ${a.reason}` })) },
          ],
          fuente: { nombre: "Legislatura de Mendoza, Gobierno de Mendoza y Junta Electoral de Mendoza" },
        }),
        lastmod: hoy,
        prioridad: x.inOffice ? 0.7 : 0.5,
      });
    }
  }

  // ---------------------------------------------------------------- gobierno por dentro
  const agencies = await json<AgencySummary[]>("temas/gobierno.json", []);
  if (agencies.length) {
    const totalStaff = agencies.reduce((s, a) => s + (a.staff ?? 0), 0);
    estatica("/gobierno", {
      figura: `${nf.format(totalStaff)} cargos`,
      bajada: "Cada ministerio y organismo: quién lo conduce, cuántos cargos tiene y cuánto cuesta.",
      ld: [
        breadcrumb([
          ["/", "Inicio"],
          ["/gobierno", "Gobierno por dentro"],
        ]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/gobierno", "Gobierno por dentro"],
        ],
        h1: "Cómo está organizado el Estado de Mendoza",
        resumen: `El Estado provincial de Mendoza tiene ${nf.format(totalStaff)} cargos de planta, repartidos en ministerios, organismos de control y entes. Para cada uno: quién lo conduce, cuántos cargos tiene, cuánto cuesta su personal, qué hace y qué compra.`,
        secciones: [
          {
            titulo: "Organismos",
            items: agencies.map((a) => ({
              texto: `${a.name}${a.head ? `: ${a.head.name}, ${a.head.role}` : ""}${a.staff ? ` (${nf.format(a.staff)} cargos)` : ""}`,
              href: `/gobierno/${a.slug}`,
            })),
          },
        ],
        fuente: { nombre: "Ley de Responsabilidad Fiscal (anexo 19), Oficina de Ética Pública y COMPR.AR" },
      }),
      lastmod: hoy,
      prioridad: 0.8,
    });
  }
  for (const s of agencies) {
    const a = await json<AgencyDetail | null>(`temas/gobierno/${s.slug}.json`, null);
    if (!a) continue;
    const path = `/gobierno/${a.slug}`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/gobierno", "Gobierno por dentro"],
      ...(a.parent ? ([[`/gobierno/${a.parent.slug}`, a.parent.name]] as Miga[]) : []),
      [path, a.name],
    ];
    const resumen = [
      `${a.name}${a.parent ? `, que depende de ${a.parent.name},` : ""} es un organismo del Estado de Mendoza.`,
      a.head ? `Lo conduce ${a.head.name} (${a.head.role}).` : "",
      a.staff
        ? `Tiene ${nf.format(a.staff)} cargos de planta${a.staffPeriod ? ` (${a.staffPeriod.replace("-T", ", trimestre ")})` : ""}.`
        : "",
      a.annualCostReal ? `Su personal cuesta ${pesos(a.annualCostReal)} por año, en pesos de ${a.realReference}.` : "",
      a.purchases ? `Hizo ${nf.format(a.purchases.processes)} procesos de compra.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    paginas.push({
      path,
      title: titulo(a.name.length > 36 ? a.name : `${a.name}: personal, costo y compras`),
      description: descripcion(a.whatItDoes ? `${resumen} ${a.whatItDoes}` : resumen),
      og: {
        slug: `gobierno-${a.slug}`,
        eyebrow: "GOBIERNO DE MENDOZA",
        titulo: a.name,
        figura: a.staff ? `${nf.format(a.staff)} cargos` : (a.head?.name ?? "Organismo"),
        bajada: a.annualCostReal
          ? `Costo anual del personal: ${pesosCorto(a.annualCostReal)} (pesos de hoy).`
          : a.whatItDoes
            ? recortar(a.whatItDoes, 110)
            : "Quién lo conduce y qué compra.",
      },
      ld: [
        {
          "@type": "GovernmentOrganization",
          name: a.name,
          url: url(path),
          areaServed: MENDOZA,
          ...(a.whatItDoes ? { description: a.whatItDoes } : {}),
          ...(a.parent
            ? { parentOrganization: { "@type": "GovernmentOrganization", name: a.parent.name, url: url(`/gobierno/${a.parent.slug}`) } }
            : {}),
          ...(a.head
            ? {
                employee: {
                  "@type": "Person",
                  name: a.head.name,
                  jobTitle: a.head.role,
                  ...(a.head.path ? { url: url(a.head.path) } : {}),
                },
              }
            : {}),
          ...(a.staff ? { numberOfEmployees: { "@type": "QuantitativeValue", value: a.staff } } : {}),
          ...(a.site ? { sameAs: a.site } : {}),
        },
        breadcrumb(migas),
        faq([
          ...(a.head ? ([[`¿Quién conduce ${a.name}?`, `${a.head.name}, ${a.head.role}.`]] as [string, string][]) : []),
          ...(a.staff
            ? ([
                [
                  `¿Cuántos empleados tiene ${a.name}?`,
                  `${nf.format(a.staff)} cargos de planta según el último informe de Responsabilidad Fiscal. Son cargos, no personas.`,
                ],
              ] as [string, string][])
            : []),
          ...(a.whatItDoes ? ([[`¿Qué hace ${a.name}?`, a.whatItDoes]] as [string, string][]) : []),
        ]),
      ],
      html: cuerpo({
        migas,
        h1: a.name,
        resumen,
        datos: [
          ...(a.head ? ([["Conducción", `${a.head.name}, ${a.head.role}`]] as [string, string][]) : []),
          ...(a.staff ? ([["Cargos de planta", nf.format(a.staff)]] as [string, string][]) : []),
          ...(a.annualCostReal ? ([["Costo anual del personal", pesos(a.annualCostReal)]] as [string, string][]) : []),
          ...(a.law ? ([["Norma", a.law]] as [string, string][]) : []),
        ],
        secciones: [
          { titulo: "Qué hace", items: a.points.map((texto) => ({ texto })) },
          {
            titulo: "Equipo de conducción",
            items: a.team.map((t) => ({ texto: `${t.name}, ${t.role}`, ...(t.path ? { href: t.path } : {}) })),
          },
          {
            titulo: "Principales proveedores",
            items: (a.purchases?.topSuppliers ?? []).map((p) => ({
              texto: `${p.name}: ${pesos(p.amount)}`,
              ...(p.slug ? { href: `/proveedores/${p.slug}` } : {}),
            })),
          },
          { titulo: "Organismos que dependen de este", items: a.children.map((c) => ({ texto: c.name, href: `/gobierno/${c.slug}` })) },
        ],
        fuente: { nombre: "Ley de Responsabilidad Fiscal (anexo 19), Oficina de Ética Pública, COMPR.AR y Boletín Oficial" },
      }),
      lastmod: hoy,
      prioridad: 0.7,
    });
  }

  // ---------------------------------------------------------------- municipios
  estatica("/municipios", {
    figura: "18 municipios",
    bajada: "Intendente, habitantes, coparticipación y legisladores de cada departamento de Mendoza.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/municipios", "Municipios"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/municipios", "Municipios"],
      ],
      h1: "Los 18 municipios de Mendoza",
      resumen:
        "Datos públicos de cada departamento de Mendoza: quién es el intendente, cuántos habitantes tiene, cuánta coparticipación recibe y quiénes son sus legisladores.",
      secciones: [
        {
          titulo: "Municipios",
          items: municipios.map((m) => ({
            texto: `${m.nombre}${m.intendente ? `: intendente ${m.intendente.nombre}` : ""}`,
            href: `/municipios/${m.slug}`,
          })),
        },
      ],
    }),
    lastmod: hoy,
    prioridad: 0.8,
  });

  for (const m of municipios) {
    const path = `/municipios/${m.slug}`;
    const c = m.coparticipacion;
    const resumen = `${m.nombre} es uno de los 18 departamentos de Mendoza, con ${nf.format(m.poblacion.actual)} habitantes estimados (${m.poblacion.puesto}.º de la provincia).${
      m.intendente ? ` Su intendente es ${m.intendente.nombre}${m.intendente.partido ? ` (${m.intendente.partido})` : ""}.` : ""
    }${c ? ` En ${c.anio} recibió ${pesos(c.perCapita)} de coparticipación por habitante, ${c.puesto}.º entre los 18.` : ""}`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/municipios", "Municipios"],
      [path, m.nombre],
    ];
    paginas.push({
      path,
      title: titulo(`${m.nombre}, Mendoza: intendente, habitantes y coparticipación`),
      description: descripcion(resumen),
      og: {
        slug: `municipio-${m.slug}`,
        eyebrow: "MUNICIPIO",
        photo: municipalityPhoto(m.slug),
        titulo: `${m.nombre}, Mendoza`,
        figura: `${nf.format(m.poblacion.actual)} hab.`,
        bajada: c
          ? `${pesos(c.perCapita)} de coparticipación por habitante en ${c.anio} (${c.puesto}.º de 18).`
          : "Datos públicos del municipio.",
      },
      ld: [
        {
          "@type": "AdministrativeArea",
          name: `Departamento de ${m.nombre}`,
          containedInPlace: MENDOZA,
          url: url(path),
          additionalProperty: [{ "@type": "PropertyValue", name: "Habitantes estimados", value: m.poblacion.actual }],
        },
        {
          "@type": "GovernmentOrganization",
          name: `Municipalidad de ${m.nombre}`,
          areaServed: { "@type": "AdministrativeArea", name: m.nombre, containedInPlace: MENDOZA },
          ...(m.intendente
            ? {
                employee: {
                  "@type": "Person",
                  name: m.intendente.nombre,
                  jobTitle: "Intendente",
                  url: url(`/funcionarios/${m.intendente.role}/${m.intendente.slug}`),
                },
              }
            : {}),
        },
        breadcrumb(migas),
        faq([
          ...(m.intendente
            ? ([
                [
                  `¿Quién es el intendente de ${m.nombre}?`,
                  `${m.intendente.nombre}${m.intendente.partido ? `, de ${m.intendente.partido}` : ""}${m.intendente.mandatoHasta ? `, con mandato hasta ${m.intendente.mandatoHasta}` : ""}.`,
                ],
              ] as [string, string][])
            : []),
          [
            `¿Cuántos habitantes tiene ${m.nombre}?`,
            `${nf.format(m.poblacion.actual)} habitantes estimados (INDEC). En el Censo 2022 tenía ${nf.format(m.poblacion.censo2022)}.`,
          ],
          ...(c
            ? ([
                [
                  `¿Cuánta coparticipación recibe ${m.nombre}?`,
                  `${pesos(c.real)} en ${c.anio} (en pesos de ${c.referencia}), ${pesos(c.perCapita)} por habitante.`,
                ],
              ] as [string, string][])
            : []),
        ]),
      ],
      html: cuerpo({
        migas,
        h1: `${m.nombre}, Mendoza: datos públicos del municipio`,
        resumen,
        datos: [
          ["Habitantes", `${nf.format(m.poblacion.actual)} (Censo 2022: ${nf.format(m.poblacion.censo2022)})`],
          ["Crecimiento 2010–2022", `${nf1.format(m.poblacion.variacion)} %`],
          ...(c ? ([["Coparticipación por habitante", `${pesos(c.perCapita)} (${c.anio})`]] as [string, string][]) : []),
          ...(m.seccion ? ([["Sección electoral", m.seccion]] as [string, string][]) : []),
        ],
        secciones: [
          ...(m.intendente
            ? [
                {
                  titulo: "Intendente",
                  items: [{ texto: m.intendente.nombre, href: `/funcionarios/${m.intendente.role}/${m.intendente.slug}` }],
                },
              ]
            : []),
          ...(m.commerce
            ? [
                {
                  titulo: "Abrir un comercio",
                  items: [
                    ...(m.commerce.procedure
                      ? [
                          {
                            texto: `Abrir un comercio en ${m.nombre}: pasos y costos`,
                            href: `/municipios/${m.slug}/tramites/abrir-un-comercio`,
                          },
                        ]
                      : []),
                    ...(m.commerce.feesYear
                      ? [
                          {
                            texto: `Tasa de comercio ${m.commerce.feesYear} de ${m.nombre}, rubro por rubro`,
                            href: `/municipios/${m.slug}/tasas`,
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
          {
            titulo: `Legisladores provinciales de la ${m.seccion ?? ""} sección`,
            items: m.legisladores.map((l) => ({
              texto: `${l.nombre}, ${l.cargo}${l.bloque ? ` (${l.bloque})` : ""}`,
              href: `/funcionarios/${l.role}/${l.slug}`,
            })),
          },
        ],
        fuente: { nombre: "Ministerio de Hacienda, INDEC y Junta Electoral de Mendoza" },
      }),
      lastmod: hoy,
      prioridad: 0.8,
    });
  }

  // Budget of each municipality, one page per year (only those whose annexes are already read).
  for (const m of municipios.filter((x) => x.budget)) {
    const budget = await json<MunicipalBudget | null>(`temas/municipios/${m.slug}/presupuesto.json`, null);
    for (const y of budget?.years ?? []) {
      const path = `/municipios/${m.slug}/presupuesto/${y.year}`;
      const hasta = y.partial ? ` hasta ${y.cutoff.split(" ")[0]}` : "";
      const top = y.byObject[0];
      const resumen = `En ${y.year}${hasta}, la Municipalidad de ${m.nombre} gastó ${pesos(y.accrued)} de los ${pesos(y.current)} que tenía autorizados (el presupuesto aprobado era de ${pesos(y.voted)}).${
        top ? ` Lo que más pesa es ${top.name.toLowerCase()}: ${pesos(top.accrued)}.` : ""
      }${y.perCapitaReal && budget?.reference ? ` Son ${pesos(y.perCapitaReal)} por habitante en pesos de ${budget.reference}.` : ""}`;
      const migas: Miga[] = [
        ["/", "Inicio"],
        ["/municipios", "Municipios"],
        [`/municipios/${m.slug}`, m.nombre],
        [path, `Presupuesto ${y.year}`],
      ];
      paginas.push({
        path,
        title: titulo(`Presupuesto ${y.year} de ${m.nombre}: en qué se gasta`),
        description: descripcion(resumen),
        og: {
          slug: `municipio-${m.slug}-presupuesto-${y.year}`,
          eyebrow: "PRESUPUESTO MUNICIPAL",
          photo: municipalityPhoto(m.slug),
          titulo: `${m.nombre}, ${y.year}${y.partial ? ` (hasta ${y.cutoff.split(" ")[0]})` : ""}`,
          figura: pesosCorto(y.accrued),
          bajada: `Gastado de ${pesos(y.current)} autorizados.`,
        },
        ld: [
          {
            "@type": "Dataset",
            name: `Ejecución del presupuesto de ${m.nombre}, ${y.year}`,
            description: resumen,
            url: url(path),
            creator: { "@type": "GovernmentOrganization", name: `Municipalidad de ${m.nombre}` },
            publisher,
            temporalCoverage: `${y.year}`,
            spatialCoverage: { "@type": "AdministrativeArea", name: m.nombre, containedInPlace: MENDOZA },
            isBasedOn: y.sources.spending ?? undefined,
          },
          breadcrumb(migas),
          faq([
            [`¿Cuánto gastó la Municipalidad de ${m.nombre} en ${y.year}?`, resumen],
            ...(y.revenue?.top[0]
              ? ([
                  [
                    `¿De dónde sale la plata de ${m.nombre}?`,
                    `Su principal ingreso en ${y.year} fue ${y.revenue.top[0].name.toLowerCase()} (${pesos(y.revenue.top[0].collected)}). En total ingresaron ${pesos(y.revenue.collected)}.`,
                  ],
                ] as [string, string][])
              : []),
          ]),
        ],
        html: cuerpo({
          migas,
          h1: `Presupuesto ${y.year} de la Municipalidad de ${m.nombre}`,
          resumen,
          datos: [
            ["Presupuesto aprobado", pesos(y.voted)],
            ["Autorizado con los cambios del año", pesos(y.current)],
            ["Gastado (devengado)", pesos(y.accrued)],
            ["Pagado", pesos(y.paid)],
            ...(y.debt
              ? ([[y.debt.kind === "short_term" ? "Deudas de corto plazo al cierre" : "Deuda al cierre", pesos(y.debt.balance)]] as [
                  string,
                  string,
                ][])
              : []),
          ],
          secciones: [
            { titulo: "En qué se gasta", items: y.byObject.map((o) => ({ texto: `${o.name}: ${pesos(o.accrued)}` })) },
            ...(y.byArea
              ? [{ titulo: "Por área de gobierno", items: y.byArea.map((a) => ({ texto: `${a.name}: ${pesos(a.accrued)}` })) }]
              : []),
            ...(y.revenue
              ? [{ titulo: "De dónde sale la plata", items: y.revenue.top.map((r) => ({ texto: `${r.name}: ${pesos(r.collected)}` })) }]
              : []),
            {
              titulo: "Otros años",
              items: (budget?.years ?? [])
                .filter((o) => o.year !== y.year)
                .map((o) => ({ texto: `Presupuesto ${o.year}`, href: `/municipios/${m.slug}/presupuesto/${o.year}` })),
            },
          ],
          fuente: {
            nombre: "Anexos de la Ley de Responsabilidad Fiscal publicados por el municipio",
            url: y.sources.spending ?? undefined,
          },
          actualizado: lastFetch("municipios-lrf"),
        }),
        lastmod: lastFetch("municipios-lrf"),
        prioridad: y.partial ? 0.6 : 0.7,
      });
    }
  }

  // ---------------------------------------------------------------- trámites: abrir un comercio
  // The province guide, the procedure of each municipality and the trade fee of those whose tarifaria is read.
  const guide = await json<ProcedureGuide | null>("temas/tramites/abrir-un-comercio.json", null);
  if (guide) {
    const guidePath = "/tramites/abrir-un-comercio";
    const online = guide.municipalities.filter((m) => m.online === "online");
    const withTable = guide.municipalities.filter((m) => m.fee === "table");
    const guideMigas: Miga[] = [
      ["/", "Inicio"],
      [guidePath, "Abrir un comercio"],
    ];
    const guideSummary = `Los pasos para abrir un comercio en Mendoza: CUIT y monotributo en ARCA, Ingresos Brutos en la ATM y la habilitación del municipio. Comparamos ${guide.municipalities.length} municipios: ${online.length} se pueden iniciar en línea y ${withTable.length} publican la tasa por rubro.`;
    const stepTitles = (steps: ProcedureStep[]) => steps.map((s) => s.title).join("; ");
    paginas.push({
      path: guidePath,
      title: titulo("Cómo abrir un comercio en Mendoza: pasos y costos"),
      description: descripcion(guideSummary),
      og: {
        slug: "tramites-abrir-un-comercio",
        eyebrow: "TRÁMITES",
        titulo: "Abrir un comercio en Mendoza",
        figura: `${guide.municipalities.length} municipios`,
        bajada: "Los pasos de Nación, Provincia y municipio, con su fuente oficial y lo que no se publica.",
      },
      ld: [
        {
          "@type": "GovernmentService",
          name: "Abrir un comercio en Mendoza",
          serviceType: "Habilitación de comercio",
          description: guideSummary,
          url: url(guidePath),
          areaServed: MENDOZA,
          provider: [
            { "@type": "GovernmentOrganization", name: "ARCA" },
            { "@type": "GovernmentOrganization", name: "Administración Tributaria Mendoza (ATM)" },
            ...guide.municipalities.map((m) => ({ "@type": "GovernmentOrganization", name: `Municipalidad de ${m.name}` })),
          ],
          publisher,
        },
        breadcrumb(guideMigas),
        faq([
          [
            "¿Qué pasos hay que hacer para abrir un comercio en Mendoza?",
            `Primero, ${stepTitles(guide.national).toLowerCase()} en ARCA y ${stepTitles(guide.province).toLowerCase()} en la ATM. Después, los trámites del municipio donde está el local: uso de suelo, habilitación y, según el municipio, ficha ambiental, libreta sanitaria o permiso de cartel.`,
          ],
          [
            "¿Se puede habilitar un comercio en línea en Mendoza?",
            online.length
              ? `Según sus fichas oficiales, se puede iniciar en línea en ${online.map((m) => m.name).join(", ")}. En el resto la ficha dice que se inicia en persona o no aclara cómo se hace.`
              : "Ninguna de las fichas oficiales que revisamos dice que se pueda iniciar en línea.",
          ],
          [
            "¿Cuánto cuesta habilitar un comercio en Mendoza?",
            `Depende del municipio y del rubro. ${withTable.map((m) => m.name).join(", ")} publican en su ordenanza tarifaria el derecho de comercio de cada rubro; en el resto no encontramos una tabla completa.`,
          ],
        ]),
      ],
      html: cuerpo({
        migas: guideMigas,
        h1: "Abrir un comercio en Mendoza",
        resumen: guideSummary,
        secciones: [
          {
            titulo: "Primero: Nación y Provincia",
            items: [...guide.national, ...guide.province].map((s) => ({ texto: `${s.agency}: ${s.title}. ${s.detail}`, href: s.href })),
          },
          {
            titulo: "Lo que Nación y Provincia no publican",
            items: guide.provinceNotPublished.map((n) => ({
              texto: `${n.agency === "ATM" ? "La ATM" : n.agency} no publica ${n.what.charAt(0).toLowerCase()}${n.what.slice(1)}.`,
            })),
          },
          {
            titulo: "Después: el municipio del local",
            items: guide.municipalities.map((m) => ({
              texto: `${m.name}: ${m.ownSteps} pasos propios`,
              href: `/municipios/${m.slug}/tramites/abrir-un-comercio`,
            })),
          },
          {
            titulo: "Tasa de comercio por rubro",
            items: withTable.map((m) => ({ texto: `${m.name} ${m.feeYear}`, href: `/municipios/${m.slug}/tasas` })),
          },
        ],
        fuente: { nombre: "Fichas oficiales de ARCA, la ATM y cada municipio, y ordenanzas tarifarias del Boletín Oficial" },
        actualizado: guide.verified,
      }),
      lastmod: guide.verified,
      prioridad: 0.8,
    });

    for (const m of municipios.filter((x) => x.commerce)) {
      const overview = guide.municipalities.find((x) => x.slug === m.slug);
      const procedure = m.commerce?.procedure
        ? await json<MunicipalProcedure | null>(`temas/municipios/${m.slug}/tramite-abrir-un-comercio.json`, null)
        : null;
      const muni = { "@type": "GovernmentOrganization", name: `Municipalidad de ${m.nombre}` };
      const area = { "@type": "AdministrativeArea", name: m.nombre, containedInPlace: MENDOZA };
      const base: Miga[] = [
        ["/", "Inicio"],
        ["/municipios", "Municipios"],
        [`/municipios/${m.slug}`, m.nombre],
      ];

      if (procedure && overview) {
        const path = `/municipios/${m.slug}/tramites/abrir-un-comercio`;
        const migas: Miga[] = [...base, [path, "Abrir un comercio"]];
        const fee = procedure.fee;
        const feeText = fee.table
          ? `el derecho de comercio por rubro (${fee.year}) está en su ordenanza tarifaria`
          : fee.examples.length
            ? `publica el derecho de comercio de algunos rubros (${fee.year})`
            : "no publica un monto calculable del derecho de comercio";
        const resumen = `Cómo abrir un comercio en ${m.nombre}: ${procedure.steps.length} pasos propios del municipio (${procedure.steps.map((s) => s.title.toLowerCase()).join(", ")}). ${ONLINE_TEXT[overview.online]} ${feeText.charAt(0).toUpperCase()}${feeText.slice(1)}.`;
        paginas.push({
          path,
          title: titulo(`Abrir un comercio en ${m.nombre}: pasos y costos`),
          description: descripcion(resumen),
          og: {
            slug: `municipio-${m.slug}-abrir-un-comercio`,
            eyebrow: "TRÁMITES",
            photo: municipalityPhoto(m.slug),
            titulo: `Abrir un comercio en ${m.nombre}`,
            figura: `${procedure.steps.length} pasos`,
            bajada: "Requisitos, costos y lo que el municipio no publica.",
          },
          ld: [
            {
              "@type": "GovernmentService",
              name: `Abrir un comercio en ${m.nombre}`,
              serviceType: "Habilitación de comercio",
              description: resumen,
              url: url(path),
              provider: muni,
              areaServed: area,
              publisher,
            },
            breadcrumb(migas),
            faq([
              [
                `¿Qué pasos hay que hacer para habilitar un comercio en ${m.nombre}?`,
                `${procedure.steps.map((s) => s.title).join("; ")}. Antes, los de Nación (ARCA) y la Provincia (ATM), que son los mismos en toda Mendoza.`,
              ],
              [
                `¿Se puede habilitar un comercio en línea en ${m.nombre}?`,
                overview.online === "not_published"
                  ? ONLINE_TEXT.not_published
                  : `${ONLINE_TEXT[overview.online]} ${overview.onlineNote}`.trim(),
              ],
              ...(procedure.costs.length
                ? ([
                    [
                      `¿Cuánto cuesta habilitar un comercio en ${m.nombre}?`,
                      procedure.costs.map((c) => `${c.concept}: ${c.detail}`).join(" "),
                    ],
                  ] as [string, string][])
                : []),
              ...(procedure.promotion
                ? ([[`¿Hay beneficios para un comercio nuevo en ${m.nombre}?`, procedure.promotion.detail]] as [string, string][])
                : []),
            ]),
          ],
          html: cuerpo({
            migas,
            h1: `Abrir un comercio en ${m.nombre}`,
            resumen,
            secciones: [
              { titulo: `Pasos en ${m.nombre}`, items: procedure.steps.map((s) => ({ texto: `${s.title}. ${s.detail}`, href: s.href })) },
              { titulo: "Cuánto cuesta", items: procedure.costs.map((c) => ({ texto: `${c.concept}. ${c.detail}`, href: c.href })) },
              ...(procedure.promotion
                ? [{ titulo: "Régimen de promoción", items: [{ texto: procedure.promotion.detail, href: procedure.promotion.href }] }]
                : []),
              {
                titulo: `Lo que ${m.nombre} no publica`,
                items: procedure.notPublished.map((n) => ({
                  texto: `${n.agency} no publica ${n.what.charAt(0).toLowerCase()}${n.what.slice(1)}.`,
                })),
              },
              {
                titulo: "Más",
                items: [
                  { texto: "Abrir un comercio en toda Mendoza: los pasos de Nación y la Provincia", href: guidePath },
                  ...(m.commerce?.feesYear
                    ? [
                        {
                          texto: `Tasa de comercio ${m.commerce.feesYear} de ${m.nombre}, rubro por rubro`,
                          href: `/municipios/${m.slug}/tasas`,
                        },
                      ]
                    : []),
                  { texto: `${m.nombre}: datos públicos del municipio`, href: `/municipios/${m.slug}` },
                ],
              },
            ],
            fuente: { nombre: `Ficha oficial de la Municipalidad de ${m.nombre} y su ordenanza tarifaria` },
            actualizado: procedure.verified,
          }),
          lastmod: procedure.verified,
          prioridad: 0.7,
        });
      }

      const fees = m.commerce?.feesYear ? await json<MunicipalFees | null>(`temas/municipios/${m.slug}/tasas.json`, null) : null;
      if (fees) {
        const path = `/municipios/${m.slug}/tasas`;
        const migas: Miga[] = [...base, [path, `Tasas ${fees.year}`]];
        const sample = fees.highlights.slice(0, 3);
        const resumen = `Cuánto cobra ${m.nombre} por el derecho de comercio en ${fees.year}: ${fees.rows.length} rubros de su ordenanza tarifaria ${fees.ordinance.number}.${
          sample.length ? ` ${sample.map((h) => `${h.name}, de ${pesos(h.min)} a ${pesos(h.max)}`).join("; ")}.` : ""
        } ${periodoTexto(fees.period)}`;
        paginas.push({
          path,
          title: titulo(`Tasa de comercio ${m.nombre} ${fees.year}: monto por rubro`),
          description: descripcion(resumen),
          og: {
            slug: `municipio-${m.slug}-tasas`,
            eyebrow: "TASA DE COMERCIO",
            photo: municipalityPhoto(m.slug),
            titulo: `${m.nombre}, ${fees.year}`,
            figura: `${nf.format(fees.rows.length)} rubros`,
            bajada: `Derecho de comercio de la Ordenanza tarifaria ${fees.ordinance.number}.`,
          },
          ld: [
            {
              "@type": "GovernmentService",
              name: `Derecho de comercio de ${m.nombre}`,
              serviceType: "Tasa de inspección y control de comercios",
              description: resumen,
              url: url(path),
              provider: muni,
              areaServed: area,
              isBasedOn: fees.ordinance.href || undefined,
              publisher,
            },
            breadcrumb(migas),
            faq([
              [
                `¿Cuánto es el derecho de comercio en ${m.nombre}?`,
                `${sample.length ? `${sample.map((h) => `${h.name}: de ${pesos(h.min)} a ${pesos(h.max)}`).join("; ")}. ` : ""}Depende del rubro y de la categoría. ${periodoTexto(fees.period)}`,
              ],
              ...(fees.note ? ([[`¿Cómo se define la categoría del comercio en ${m.nombre}?`, fees.note]] as [string, string][]) : []),
              [
                `¿Dónde figura el monto del derecho de comercio de ${m.nombre}?`,
                `En la ordenanza tarifaria ${fees.ordinance.number} de ${fees.year}${fees.ordinance.bulletinDate ? `, publicada en el Boletín Oficial el ${fechaLarga(fees.ordinance.bulletinDate)}` : ""}.`,
              ],
            ]),
          ],
          html: cuerpo({
            migas,
            h1: `Tasa de comercio de ${m.nombre}, ${fees.year}`,
            resumen,
            datos: [
              ["Ordenanza", `Tarifaria ${fees.ordinance.number} (${fees.year})`],
              ["Rubros en la tarifaria", nf.format(fees.rows.length)],
              ["Unidad", fees.unit === "pesos" ? "Pesos" : `${fees.unit}${fees.unitValue ? ` a ${pesos(fees.unitValue)}` : ""}`],
            ],
            secciones: [
              {
                titulo: "Rubros comunes",
                items: fees.highlights.map((h) => ({ texto: `${h.name}: de ${pesos(h.min)} a ${pesos(h.max)}` })),
              },
              {
                titulo: "Más",
                items: [
                  { texto: `Abrir un comercio en ${m.nombre}: pasos y costos`, href: `/municipios/${m.slug}/tramites/abrir-un-comercio` },
                  { texto: "Abrir un comercio en toda Mendoza", href: guidePath },
                  { texto: `${m.nombre}: datos públicos del municipio`, href: `/municipios/${m.slug}` },
                ],
              },
            ],
            fuente: {
              nombre: `Ordenanza tarifaria ${fees.ordinance.number} de ${m.nombre}, Boletín Oficial`,
              url: fees.ordinance.href || undefined,
            },
            actualizado: fees.verified,
          }),
          lastmod: fees.verified,
          prioridad: 0.7,
        });
      }
    }
  }

  // ---------------------------------------------------------------- proveedores y organismos
  estatica("/proveedores", {
    figura: `${proveedores.length} empresas`,
    bajada: "Las empresas que más contratos ganaron con el Estado de Mendoza, con cada adjudicación.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/proveedores", "Proveedores del Estado"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/proveedores", "Proveedores del Estado"],
      ],
      h1: "Proveedores del Estado de Mendoza",
      resumen:
        "Las empresas que le venden al Estado provincial de Mendoza: cuánto ganaron en contrataciones, en cuántos procesos y qué organismos les compran.",
      secciones: [
        {
          titulo: "Empresas con más adjudicaciones",
          items: proveedores.map((p) => ({
            texto: `${p.nombre}: ${pesos(p.total)} en ${p.procesos} procesos`,
            href: `/proveedores/${p.slug}`,
          })),
        },
      ],
      fuente: { nombre: "COMPR.AR Mendoza (contrataciones abiertas)", url: fuente("compras-ocds")?.url },
    }),
    lastmod: lastFetch("compras-ocds"),
    prioridad: 0.8,
  });

  for (const p of proveedores) {
    const path = `/proveedores/${p.slug}`;
    const anios = p.primera && p.ultima ? ` entre ${p.primera.slice(0, 4)} y ${p.ultima.slice(0, 4)}` : "";
    const quien = [p.tipoSocietario, p.localidad ? `de ${p.localidad}` : null, p.actividad ? `(${p.actividad.toLowerCase()})` : null]
      .filter(Boolean)
      .join(" ");
    const resumen = `${p.nombre} ganó ${pesos(p.total)} en contrataciones con el Estado de Mendoza en ${p.procesos} procesos${anios}.${quien ? ` Es una ${quien}.` : ""}`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/proveedores", "Proveedores"],
      [path, p.nombre],
    ];
    paginas.push({
      path,
      title: titulo(`${p.nombre}: contratos con Mendoza`),
      description: descripcion(`${resumen} Quién le compra y cada adjudicación, con su fuente oficial.`),
      og: {
        slug: `proveedor-${p.cuit}`,
        eyebrow: "PROVEEDOR DEL ESTADO",
        titulo: p.nombre,
        figura: pesosCorto(p.total),
        bajada: `Adjudicado en ${p.procesos} procesos${anios}.`,
      },
      ld: [
        {
          "@type": "Organization",
          name: p.nombre,
          legalName: p.nombre,
          taxID: p.cuit,
          url: url(path),
          ...(p.localidad ? { address: { "@type": "PostalAddress", addressLocality: p.localidad, addressCountry: "AR" } } : {}),
          ...(p.actividad ? { description: p.actividad } : {}),
        },
        breadcrumb(migas),
        faq([[`¿Cuánto le vendió ${p.nombre} al Estado de Mendoza?`, resumen]]),
      ],
      html: cuerpo({
        migas,
        h1: `${p.nombre}: contratos con el Estado de Mendoza`,
        resumen,
        datos: [
          ["CUIT", p.cuit],
          ["Total adjudicado", pesos(p.total)],
          ["Procesos ganados", nf.format(p.procesos)],
          ...(p.tipoSocietario ? ([["Tipo de sociedad", p.tipoSocietario]] as [string, string][]) : []),
          ...(p.localidad ? ([["Domicilio", p.localidad]] as [string, string][]) : []),
        ],
        fuente: { nombre: "COMPR.AR Mendoza y Registro Nacional de Sociedades", url: fuente("compras-ocds")?.url },
      }),
      lastmod: p.ultima ?? hoy,
      prioridad: 0.6,
    });
  }

  estatica("/organismos", {
    figura: `${organismos.length} organismos`,
    bajada: "Qué compra cada organismo del Estado de Mendoza, a quién y cómo.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/organismos", "Organismos que compran"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/organismos", "Organismos que compran"],
      ],
      h1: "Organismos del Estado de Mendoza que compran",
      resumen:
        "Hospitales, ministerios y reparticiones del Estado de Mendoza: cuánto compran, a qué proveedores y qué parte por contratación directa.",
      secciones: [
        {
          titulo: "Organismos",
          items: organismos.map((o) => ({
            texto: `${o.nombre}: ${pesos(o.total)} en ${o.procesos} procesos`,
            href: `/organismos/${o.slug}`,
          })),
        },
      ],
      fuente: { nombre: "COMPR.AR Mendoza (contrataciones abiertas)", url: fuente("compras-ocds")?.url },
    }),
    lastmod: lastFetch("compras-ocds"),
    prioridad: 0.7,
  });

  for (const o of organismos) {
    const path = `/organismos/${o.slug}`;
    const resumen = `${o.nombre} adjudicó ${pesos(o.total)} en ${o.procesos} procesos de compra. El ${Math.round(o.pctDirecta)} % fueron contrataciones directas y el ${Math.round(o.pctUnaOferta)} % recibió una sola oferta.${
      o.proveedorPrincipal
        ? ` Su principal proveedor es ${o.proveedorPrincipal.nombre} (${Math.round(o.proveedorPrincipal.pct)} % del total).`
        : ""
    }`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/organismos", "Organismos"],
      [path, o.nombre],
    ];
    paginas.push({
      path,
      title: titulo(`Compras de ${o.nombre}`),
      description: descripcion(resumen),
      og: {
        slug: `organismo-${o.slug}`,
        eyebrow: "ORGANISMO QUE COMPRA",
        titulo: o.nombre,
        figura: pesosCorto(o.total),
        bajada: `${o.procesos} procesos · ${Math.round(o.pctDirecta)} % por contratación directa.`,
      },
      ld: [
        { "@type": "GovernmentOrganization", name: o.nombre, url: url(path), areaServed: MENDOZA, description: resumen },
        breadcrumb(migas),
      ],
      html: cuerpo({
        migas,
        h1: `Compras de ${o.nombre}`,
        resumen,
        datos: [
          ["Total adjudicado", pesos(o.total)],
          ["Procesos", nf.format(o.procesos)],
          ["Contratación directa", `${nf1.format(o.pctDirecta)} %`],
          ["Una sola oferta", `${nf1.format(o.pctUnaOferta)} %`],
        ],
        fuente: { nombre: "COMPR.AR Mendoza (contrataciones abiertas)", url: fuente("compras-ocds")?.url },
      }),
      lastmod: lastFetch("compras-ocds"),
      prioridad: 0.5,
    });
  }

  // ---------------------------------------------------------------- leyes
  estatica("/leyes", {
    figura: `${leyes.length} leyes`,
    bajada: "Qué dice cada ley provincial, explicado en pocas palabras y con el documento oficial.",
    ld: [
      breadcrumb([
        ["/", "Inicio"],
        ["/leyes", "Leyes"],
      ]),
    ],
    html: cuerpo({
      migas: [
        ["/", "Inicio"],
        ["/leyes", "Leyes"],
      ],
      h1: "Leyes de la provincia de Mendoza",
      resumen:
        "Leyes provinciales de Mendoza publicadas en el Boletín Oficial: qué dice cada una explicado en lenguaje simple, su número, fecha y el enlace al texto oficial.",
      secciones: [{ titulo: "Leyes", items: leyes.map((l) => ({ texto: `Ley ${l.numero}: ${l.titulo}`, href: `/leyes/${l.numero}` })) }],
      fuente: { nombre: "Boletín Oficial de la Provincia de Mendoza", url: fuente("boletin-oficial")?.url },
    }),
    lastmod: leyes[0]?.publicada ?? hoy,
    prioridad: 0.8,
  });

  for (const l of leyes) {
    const path = `/leyes/${l.numero}`;
    const numero = `Ley ${nf.format(Number(l.numero))}`;
    const d = await json<LeyDetalle | null>(`temas/leyes/${l.numero}.json`, null);
    const sancion = l.fecha ? ` (${fechaLarga(l.fecha)})` : "";
    const resumen = d?.resumen
      ? `${numero} de Mendoza${sancion}: ${d.resumen.texto}`
      : `La ${numero} de la provincia de Mendoza${sancion}: ${l.titulo.replace(/…$/, "")}.`;
    const migas: Miga[] = [
      ["/", "Inicio"],
      ["/leyes", "Leyes"],
      [path, numero],
    ];
    const articulos = (d?.bloques ?? []).flatMap((b) =>
      b.tipo === "articulo"
        ? [{ texto: `Artículo ${b.numero}${b.titulo ? ` (${b.titulo})` : ""}: ${recortar(b.parrafos.join(" "), 600)}` }]
        : [],
    );
    paginas.push({
      path,
      title: titulo(`${numero} de Mendoza: ${l.titulo}`),
      description: descripcion(resumen),
      og: {
        slug: `ley-${l.numero}`,
        eyebrow: `LEY ${nf.format(Number(l.numero))} DE MENDOZA`,
        titulo: l.titulo,
        figura: numero,
        bajada: recortar(d?.resumen?.texto ?? l.titulo, 120),
      },
      ld: [
        {
          "@type": "Legislation",
          name: `${numero} de la Provincia de Mendoza: ${l.titulo}`,
          alternateName: numero,
          legislationIdentifier: numero,
          legislationType: "Ley",
          legislationJurisdiction: "Provincia de Mendoza, Argentina",
          ...(l.fecha ? { legislationDate: l.fecha } : {}),
          ...(l.publicada ? { datePublished: l.publicada } : {}),
          abstract: d?.resumen?.texto ?? l.titulo,
          ...(l.tema ? { keywords: l.tema } : {}),
          inLanguage: "es-AR",
          url: url(path),
          ...(l.urlPdf ? { encoding: { "@type": "MediaObject", contentUrl: l.urlPdf, encodingFormat: "application/pdf" } } : {}),
          legislationPassedBy: { "@type": "GovernmentOrganization", name: "Legislatura de la Provincia de Mendoza" },
        },
        breadcrumb(migas),
        ...(d?.resumen ? [faq([[`¿Qué dice la ${numero} de Mendoza?`, `${d.resumen.texto} ${d.resumen.puntos.join(" ")}`]])] : []),
      ],
      html: cuerpo({
        migas,
        h1: `${numero} de Mendoza: ${l.titulo}`,
        resumen,
        datos: [
          ["Número", numero],
          ...(l.tema ? ([["Tema", l.tema]] as [string, string][]) : []),
          ...(l.fecha ? ([["Sancionada", fechaLarga(l.fecha)]] as [string, string][]) : []),
          ...(l.publicada
            ? ([["Publicada en el Boletín Oficial", `${fechaLarga(l.publicada)}${l.boletin ? ` (N.º ${l.boletin})` : ""}`]] as [
                string,
                string,
              ][])
            : []),
        ],
        secciones: [
          ...(d?.resumen?.puntos.length ? [{ titulo: "En pocas palabras", items: d.resumen.puntos.map((texto) => ({ texto })) }] : []),
          { titulo: "Texto de la ley", items: articulos },
        ],
        fuente: { nombre: "Boletín Oficial de la Provincia de Mendoza", url: l.urlPdf ?? fuente("boletin-oficial")?.url },
      }),
      lastmod: l.publicada ?? hoy,
      prioridad: 0.6,
    });
  }

  // ---------------------------------------------------------------- datos
  for (const s of index.sources) {
    const m = datosMeta(s);
    const path = `/datos/${s.id}`;
    const tablas = index.datasets.filter((d) => d.source === s.id);
    paginas.push({
      path,
      title: m.title,
      description: m.description,
      og: {
        slug: m.ogSlug,
        eyebrow: m.eyebrow,
        titulo: m.ogTitle,
        figura: `${nf.format(tablas.reduce((a, d) => a + d.rowCount, 0))} filas`,
        bajada: s.descripcion,
      },
      ld: [
        {
          "@type": "Dataset",
          name: s.nombre,
          description: s.descripcion,
          url: url(path),
          creator: { "@type": "Organization", name: s.organismo },
          license: "https://creativecommons.org/licenses/by/4.0/",
          isAccessibleForFree: true,
          inLanguage: "es-AR",
          spatialCoverage: { "@type": "Place", name: "Mendoza, Argentina" },
          isBasedOn: s.url,
          dateModified: s.raw.lastFetch ?? index.generatedAt,
          publisher,
          distribution: tablas.map((d) => ({
            "@type": "DataDownload",
            encodingFormat: "text/csv",
            contentUrl: `${SITE_URL}/data/${d.source}/${d.file}`,
          })),
        },
        breadcrumb([
          ["/", "Inicio"],
          ["/fuentes", "Fuentes"],
          [path, s.nombre],
        ]),
      ],
      html: cuerpo({
        migas: [
          ["/", "Inicio"],
          ["/fuentes", "Fuentes"],
          [path, s.nombre],
        ],
        h1: s.nombre,
        resumen: `${s.descripcion} Datos abiertos de ${s.organismo}, para descargar en CSV.`,
        secciones: [
          {
            titulo: "Tablas para descargar",
            items: tablas.map((d) => ({
              texto: `${d.dict?.titulo ?? d.file} (${nf.format(d.rowCount)} filas)`,
              href: `/data/${d.source}/${d.file}`,
            })),
          },
        ],
        fuente: { nombre: s.organismo, url: s.url },
        actualizado: s.raw.lastFetch ?? undefined,
      }),
      lastmod: (s.raw.lastFetch ?? index.generatedAt).slice(0, 10),
      prioridad: 0.4,
    });
  }

  return paginas;
}

/** Igual que slug() de src/slug.ts, para los links desde los temas. */
function slugMunicipio(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
