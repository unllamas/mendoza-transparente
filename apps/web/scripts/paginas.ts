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
  LeyDetalle,
  LeyResumen,
  MunicipioPagina,
  NoPublicado,
  OrganismoResumen,
  PoblacionTema,
  ProveedorResumen,
  SenalesTema,
} from "../src/types.ts";

export interface Pagina {
  path: string;
  title: string;
  description: string;
  /** Imagen para compartir. */
  og: { slug: string; eyebrow: string; titulo: string; figura: string; bajada: string };
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
  ["/gobierno", "Gobierno por dentro"],
  ["/municipios", "Municipios"],
  ["/leyes", "Leyes"],
  ["/proveedores", "Proveedores del Estado"],
  ["/organismos", "Organismos que compran"],
  ["/deuda", "Deuda"],
  ["/coparticipacion", "Coparticipación"],
  ["/empleo-publico", "Empleo público"],
  ["/poblacion", "Población"],
  ["/no-publicado", "Lo que no se publica"],
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
  const funcionarios = await json<FuncionariosTema>("temas/funcionarios.json", { personas: [] });
  const municipios = await json<MunicipioPagina[]>("temas/municipios.json", []);
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
          ...(filiacion ? { affiliation: { "@type": "Organization", name: filiacion } } : {}),
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
        secciones: p.municipalities.length
          ? [
              {
                titulo: p.grupo === "intendentes" ? "Gobierna" : `Representa a la ${p.seccion?.toLowerCase() ?? "sección"}`,
                items: p.municipalities.map((m) => ({ texto: m.name, href: `/municipios/${m.slug}` })),
              },
            ]
          : [],
        fuente: {
          nombre: "Fuentes oficiales: Legislatura, Gobierno de Mendoza, Junta Electoral, Congreso y Oficina de Ética Pública",
          url: p.fuenteUrl,
        },
      }),
      lastmod: p.ddjj?.fecha ?? hoy,
      prioridad: 0.7,
    });
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
