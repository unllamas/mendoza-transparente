/**
 * Lo que el sitio publica, para Aco: proveedores, organismos compradores, autoridades, municipios, leyes, lo que el
 * Estado no publica y una guía corta de cada sección. `apps/web/scripts/temas/assistant-data.ts` lo arma con los
 * mismos archivos que leen las páginas y lo escribe en /data/asistente.json; la Function lo lee de los archivos
 * estáticos del sitio (sin tokens del modelo, sin servicio extra). Cada valor ya viene formateado, así que el modelo
 * puede citar una cifra pero nunca tiene que calcular una.
 */

import { findMunicipality, normalize } from "./tools.ts";
import type { DataCard } from "./types.ts";

/** Una cifra como la muestra la tarjeta: qué es, el valor en una línea, y el resto (período, posición) debajo. */
export interface Fact {
  label: string;
  value: string;
  detail?: string;
}

export interface SiteSection {
  id: string;
  title: string;
  path: string;
  /** El enlace a la página, como acción ("Ver la deuda", "Armar el pedido"). */
  action: string;
  /** Lo que responde la página, en una oración. */
  what: string;
  /** Las cifras principales de la página, formateadas ("US$ 775 millones"). */
  facts: Fact[];
  note?: string;
}

export interface SiteSupplier {
  name: string;
  slug: string;
  /** Total adjudicado, en pesos nominales, formateado. */
  total: string;
  /** Total sin formatear, solo para ordenar. */
  amount: number;
  purchases: number;
  first: string;
  last: string;
  activity?: string;
}

export interface SiteAgency {
  name: string;
  slug: string;
  /** Compras: total adjudicado (formateado) y procesos. */
  total?: string;
  amount?: number;
  purchases?: number;
  direct?: string;
  singleOffer?: string;
  mainSupplier?: string;
  /** Personal, de "Gobierno por dentro", cuando el organismo tiene página ahí ("12.263 personas"), y su trimestre. */
  staff?: string;
  staffPeriod?: string;
  head?: string;
  govPath?: string;
}

export interface SitePerson {
  name: string;
  role: string;
  agency: string;
  party?: string;
  term?: string;
  municipalities: string[];
  /** Último sueldo publicado ("$ 6,6 millones brutos") y su mes, cuando el organismo lo publica. */
  pay?: { value: string; period: string };
  /** Cuando no se publica: el ítem de /no-publicado que lo dice. */
  payUnpublished?: { what: string; agency: string };
  /** Última declaración jurada: su año y el patrimonio declarado, formateado. */
  assets?: { year: string; value: string };
  path: string;
}

export interface SiteMunicipality {
  name: string;
  slug: string;
  mayor?: Fact;
  facts: Fact[];
  note?: string;
}

export interface SiteLaw {
  number: string;
  title: string;
  topic: string;
  /** Fecha de publicación en el Boletín Oficial (YYYY-MM-DD). */
  published: string;
}

export interface SiteUnpublished {
  what: string;
  agency: string;
  detail: string;
}

export interface SiteData {
  generatedAt: string;
  /** "2020 a 2025": los años que cubren las compras. */
  purchasesPeriod: string;
  sections: SiteSection[];
  suppliers: SiteSupplier[];
  agencies: SiteAgency[];
  people: SitePerson[];
  municipalities: SiteMunicipality[];
  laws: SiteLaw[];
  unpublished: SiteUnpublished[];
}

/** Misma regla que el sitio (formatMoneda de celdas.ts): millones desde un millón. */
export function formatMoney(value: number, currency: "ARS" | "USD" = "ARS"): string {
  const sign = currency === "USD" ? "US$" : "$";
  const abs = Math.abs(value);
  const minus = value < 0 ? "−" : "";
  const n = (v: number, digits: number) => v.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  if (abs >= 1e6) return `${minus}${sign} ${n(abs / 1e6, abs >= 1e8 ? 0 : 1)} millones`;
  return `${minus}${sign} ${n(abs, 0)}`;
}

export const formatCount = (n: number) => Math.round(n).toLocaleString("es-AR");

const STOPWORDS = new Set(
  "que quien quienes cual cuales cuanto cuanta cuantos cuantas como donde cuando del los las una uno unos unas por para con sin sobre esta este estos estas ese esa mas mendoza provincia gobierno estado datos dato tenes tienen tiene hay sabes saber quiero".split(
    " ",
  ),
);

/** Palabras de búsqueda del texto de la persona: sin palabras vacías y a la raíz, así "ministra" encuentra "ministro". */
export function searchWords(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => (w.length > 6 ? w.slice(0, 6) : w));
}

/** Si cada palabra de búsqueda empieza una palabra de `text`. */
export function matchesAll(text: string, words: string[]): boolean {
  if (!words.length) return false;
  const tokens = normalize(text).split(" ");
  return words.every((w) => tokens.some((t) => t.startsWith(w)));
}

/** Resultados por respuesta: alcanzan para contestar y son pocos para entrar en el widget y en el contexto del modelo. */
const LIMIT = 5;

export const SECTION_IDS = [
  "proveedores",
  "organismos",
  "senales",
  "funcionarios",
  "gobierno",
  "empleo-publico",
  "municipios",
  "deuda",
  "recaudacion",
  "coparticipacion",
  "poblacion",
  "leyes",
  "partidos",
  "universidades",
  "no-publicado",
  "pedir",
  "datos",
  "tramites",
] as const;

export interface SectionResult {
  found: boolean;
  section?: { title: string; path: string; what: string; facts: Fact[]; note?: string };
  card?: DataCard;
}

export function findSitePage(d: SiteData, args: { section?: string }): SectionResult {
  const s = d.sections.find((x) => x.id === args.section);
  if (!s) return { found: false };
  return {
    found: true,
    section: { title: s.title, path: s.path, what: s.what, facts: s.facts, ...(s.note ? { note: s.note } : {}) },
    card: {
      title: s.title,
      rows: s.facts,
      // Sin cifras (pedir, señales), lo que hace la página explica por qué abrirla.
      ...(s.note || !s.facts.length ? { note: s.note ?? s.what } : {}),
      link: { label: s.action, href: s.path },
    },
  };
}

export interface PurchasesResult {
  kind: "top_suppliers" | "suppliers" | "agencies" | "none";
  period: string;
  rows: { name: string; total?: string; purchases?: number; detail?: string; activity?: string; path: string }[];
  card?: DataCard;
  note: string;
}

/**
 * Compras provinciales (compras-ocds): los proveedores que más vendieron, un proveedor por nombre, o qué compró un
 * organismo y a quién. Nunca un ranking de personas ni un juicio: los mismos hechos que muestran las páginas
 * /proveedores y /organismos.
 */
export function searchPurchases(d: SiteData, args: { query?: string; kind?: string }): PurchasesResult {
  const note = `Compras adjudicadas por la Provincia de ${d.purchasesPeriod}, en pesos de cada año (sin ajustar por inflación).`;
  const words = searchWords(args.query ?? "");
  const wantsAgency = args.kind === "agency";
  const supplierRows = (list: SiteSupplier[]) =>
    list.slice(0, LIMIT).map((s) => ({
      name: s.name,
      total: s.total,
      purchases: s.purchases,
      detail: `${s.purchases} ${s.purchases === 1 ? "proceso" : "procesos"}, ${s.first.slice(0, 4)} a ${s.last.slice(0, 4)}`,
      ...(s.activity ? { activity: s.activity } : {}),
      path: `/proveedores/${s.slug}`,
    }));
  const toCard = (title: string, rows: PurchasesResult["rows"], link: DataCard["link"]): DataCard => ({
    title,
    rows: rows.map((r) => ({ label: r.name, value: r.total ?? "", ...(r.detail ? { detail: r.detail } : {}), href: r.path })),
    note,
    link,
  });

  if (!words.length && !wantsAgency) {
    const rows = supplierRows([...d.suppliers].sort((a, b) => b.amount - a.amount));
    return {
      kind: "top_suppliers",
      period: d.purchasesPeriod,
      rows,
      card: toCard("Los proveedores que más le vendieron a la Provincia", rows, {
        label: "Ver proveedores",
        href: "/proveedores",
      }),
      note,
    };
  }
  const agencies = d.agencies.filter((a) => a.total && matchesAll(a.name, words)).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const suppliers = d.suppliers.filter((s) => matchesAll(s.name, words)).sort((a, b) => b.amount - a.amount);
  if (agencies.length && (wantsAgency || !suppliers.length)) {
    const rows = agencies.slice(0, LIMIT).map((a) => ({
      name: a.name,
      total: a.total,
      purchases: a.purchases,
      detail: [
        a.purchases ? `${a.purchases} procesos` : "",
        a.direct ? `${a.direct} por contratación directa` : "",
        a.mainSupplier ? `proveedor principal: ${a.mainSupplier}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      path: `/organismos/${a.slug}`,
    }));
    return {
      kind: "agencies",
      period: d.purchasesPeriod,
      rows,
      card: toCard("Lo que compró", rows, { label: "Ver organismos", href: "/organismos" }),
      note,
    };
  }
  if (suppliers.length) {
    const rows = supplierRows(suppliers);
    return {
      kind: "suppliers",
      period: d.purchasesPeriod,
      rows,
      card: toCard(rows.length === 1 ? "Lo que le vendió a la Provincia" : "Proveedores con ese nombre", rows, {
        label: "Ver proveedores",
        href: "/proveedores",
      }),
      note,
    };
  }
  return {
    kind: "none",
    period: d.purchasesPeriod,
    rows: [],
    note: `No aparece con ese nombre entre los proveedores ni los organismos de ${d.purchasesPeriod}. Puede estar escrito distinto: la lista completa está en /proveedores.`,
  };
}

export interface PeopleResult {
  people: Omit<SitePerson, "municipalities">[];
  agencies: { name: string; head?: string; staff?: string; staffPeriod?: string; path: string }[];
  card?: DataCard;
  note?: string;
}

/**
 * Autoridades por nombre, cargo, organismo o municipio ("ministro de salud", "intendente de Maipú", "Cornejo"), y los
 * organismos del Ejecutivo con quién los conduce y cuánta gente trabaja ahí.
 */
export function searchPeople(d: SiteData, args: { query?: string; municipality?: string }): PeopleResult {
  const municipality = findMunicipality(args.municipality ?? "") ?? findMunicipality(args.query ?? "");
  const words = searchWords((args.query ?? "").replace(new RegExp(municipality ?? "^$", "i"), " "));
  const people = d.people
    .filter((p) => {
      if (municipality && !p.municipalities.includes(municipality) && !normalize(p.agency).includes(normalize(municipality))) return false;
      return words.length ? matchesAll(`${p.name} ${p.role} ${p.agency} ${p.party ?? ""}`, words) : !!municipality;
    })
    .slice(0, LIMIT);
  // También los organismos del Ejecutivo: "ministerio de seguridad" es su ministro y también cuánta gente trabaja ahí.
  const agencies = d.agencies
    .filter((a) => a.govPath && matchesAll(a.name, words))
    .slice(0, 3)
    .map((a) => ({
      name: a.name,
      ...(a.head ? { head: a.head } : {}),
      ...(a.staff ? { staff: a.staff, staffPeriod: a.staffPeriod ?? "" } : {}),
      path: a.govPath!,
    }));
  if (!people.length && !agencies.length)
    return {
      people: [],
      agencies: [],
      note: "No aparece en la lista de autoridades que publicamos (gobernador, ministros, intendentes y legisladores).",
    };
  const staffRows = agencies
    .filter((a) => a.staff)
    .slice(0, 1)
    .map((a) => ({ label: `Personal de ${a.name}`, value: a.staff!, ...(a.staffPeriod ? { detail: a.staffPeriod } : {}), href: a.path }));
  const one = people.length === 1 ? people[0]! : null;
  const card: DataCard = one
    ? {
        title: one.name,
        rows: [
          // El organismo solo cuando el cargo no lo dice ya ("Ministra de Seguridad" es la del ministerio).
          {
            label: "Cargo",
            value: one.role,
            ...(one.agency && !matchesAll(one.role, searchWords(one.agency)) ? { detail: one.agency } : {}),
          },
          ...(one.party ? [{ label: "Partido", value: one.party }] : []),
          ...(one.term
            ? [
                one.term.startsWith("desde")
                  ? { label: "En el cargo", value: `Desde ${one.term.slice(6)}` }
                  : { label: "Mandato", value: one.term },
              ]
            : []),
          ...(one.pay
            ? [{ label: "Sueldo", value: one.pay.value, detail: one.pay.period }]
            : one.payUnpublished
              ? [{ label: "Sueldo", value: "No se publica" }]
              : []),
          ...(one.assets ? [{ label: `Declaración jurada ${one.assets.year}`, value: one.assets.value }] : []),
          ...staffRows,
        ],
        link: { label: "Ver la ficha", href: one.path },
      }
    : people.length
      ? {
          title: "Autoridades",
          rows: [...people.map((p) => ({ label: p.role, value: p.name, href: p.path })), ...staffRows],
          link: { label: "Ver autoridades", href: "/funcionarios" },
        }
      : {
          title: agencies.length === 1 ? agencies[0]!.name : "Organismos",
          rows: agencies.map((a) => ({
            label: a.name,
            value: a.staff ?? "",
            ...(a.head ? { detail: `Lo conduce ${a.head}` } : {}),
            href: a.path,
          })),
          link: { label: "Ver el Gobierno", href: "/gobierno" },
        };
  return { people: people.map(({ municipalities: _, ...p }) => p), agencies, card };
}

export interface MunicipalityResult {
  found: boolean;
  municipality?: { name: string; mayor?: Fact; facts: Fact[]; note?: string; path: string };
  card?: DataCard;
}

export function getMunicipality(d: SiteData, args: { municipality?: string }): MunicipalityResult {
  const name = findMunicipality(args.municipality ?? "");
  const m = d.municipalities.find((x) => x.name === name);
  if (!m) return { found: false };
  const path = `/municipios/${m.slug}`;
  return {
    found: true,
    municipality: { name: m.name, ...(m.mayor ? { mayor: m.mayor } : {}), facts: m.facts, ...(m.note ? { note: m.note } : {}), path },
    card: {
      title: m.name,
      rows: [...(m.mayor ? [m.mayor] : []), ...m.facts],
      ...(m.note ? { note: m.note } : {}),
      link: { label: `Ver ${m.name}`, href: path },
    },
  };
}

export interface LawsResult {
  laws: (SiteLaw & { path: string })[];
  card?: DataCard;
  note?: string;
}

/** Leyes provinciales publicadas en el Boletín Oficial: las últimas, o por palabras de su título o tema. */
export function searchLaws(d: SiteData, args: { query?: string }): LawsResult {
  const words = searchWords(args.query ?? "").filter(
    (w) => !["ley", "leyes", "aproba", "sancio", "public", "ultima", "nuevas", "recien"].includes(w),
  );
  const sorted = [...d.laws].sort((a, b) => b.published.localeCompare(a.published));
  const number = (args.query ?? "").match(/\b(\d{4})\b/)?.[1];
  const laws = (
    number
      ? sorted.filter((l) => l.number === number)
      : words.length
        ? sorted.filter((l) => matchesAll(`${l.title} ${l.topic}`, words))
        : sorted
  )
    .slice(0, LIMIT)
    .map((l) => ({ ...l, path: `/leyes/${l.number}` }));
  if (!laws.length) return { laws: [], note: "No encontramos una ley con esas palabras entre las que publicamos." };
  const day = (iso: string) => iso.split("-").reverse().join("/");
  return {
    laws,
    card: {
      title: words.length || number ? "Leyes" : "Las últimas leyes publicadas",
      rows: laws.map((l) => ({ label: `Ley ${l.number} · ${day(l.published)}`, value: "", detail: l.title, href: l.path })),
      link: { label: "Ver las leyes", href: "/leyes" },
    },
  };
}

/** Lo que el Estado no publica (data/curado/no-publicado.yaml), por palabras de qué es. */
export function searchUnpublishedCatalog(d: SiteData, topic: string): SiteUnpublished[] {
  // "gana", "cobra", "salario" y "dieta" preguntan todas por el sueldo: el catálogo dice "sueldos" o "cobra".
  const words = searchWords(topic).map((w) => (/^(gana|cobra|salari|sueldo|dieta|remune)/.test(w) ? "pay" : w));
  if (!words.length) return [];
  // Con tres palabras o más, tienen que coincidir dos: una sola común ("municipio") traería la mitad del catálogo.
  const need = words.length >= 3 ? 2 : 1;
  // Una palabra en el título cuenta doble: "sueldo del gobernador" es la nómina, no una página que menciona al Gobierno.
  const split = (text: string) => normalize(text).split(" ");
  const has = (tokens: string[], w: string) =>
    w === "pay" ? tokens.some((t) => /^(sueldo|cobra|dieta|salari)/.test(t)) : tokens.some((t) => t.startsWith(w));
  const scored = d.unpublished
    .map((u) => {
      const title = split(u.what);
      const rest = split(`${u.detail} ${u.agency}`);
      const hits = words.filter((w) => has(title, w) || has(rest, w)).length;
      const score = words.reduce((sum, w) => sum + (has(title, w) ? 2 : has(rest, w) ? 1 : 0), 0);
      return { u, hits, score };
    })
    .filter((x) => x.hits >= need);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored
    .filter((x) => x.score === best)
    .slice(0, 2)
    .map((x) => x.u);
}

export const SITE_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "find_site_page",
      description:
        "La sección del sitio que tiene un tema, con sus cifras principales ya formateadas: deuda, recaudación, coparticipación, empleo público, población, leyes, partidos, universidades, señales en las compras, lo que no se publica, pedir información pública, descargar los datos, etc. Usala cuando la pregunta es sobre datos públicos de Mendoza y no hay una herramienta más específica.",
      parameters: {
        type: "object",
        properties: { section: { type: "string", enum: [...SECTION_IDS] } },
        required: ["section"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_purchases",
      description:
        "Compras de la Provincia: los proveedores que más le vendieron (query vacía), un proveedor por nombre, o lo que compró un organismo y a quién (kind agency). Devuelve montos ya formateados y el período.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre del proveedor o del organismo, o vacío para los que más vendieron." },
          kind: { type: "string", enum: ["supplier", "agency"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_people",
      description:
        "Autoridades: gobernador, vicegobernadora, ministros, intendentes y legisladores provinciales y nacionales por Mendoza, por nombre, cargo, organismo o municipio. Trae partido, mandato, el sueldo si se publica y la última declaración jurada. Si no hay persona, busca el organismo del Ejecutivo con quién lo conduce y cuánta gente trabaja ahí.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre o cargo, por ejemplo «ministro de salud», «Cornejo» o «senadores»." },
          municipality: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_municipality",
      description:
        "Ficha de un municipio: intendente, población, planta de personal, coparticipación por habitante, presupuesto y cuánto publica en su sitio.",
      parameters: {
        type: "object",
        properties: { municipality: { type: "string", description: "Uno de los 18 municipios de Mendoza." } },
        required: ["municipality"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_laws",
      description: "Leyes provinciales publicadas en el Boletín Oficial: las últimas (query vacía), por número o por palabras del tema.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
] as const;
