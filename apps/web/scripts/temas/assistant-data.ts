/**
 * Lo que Aco puede responder sobre el sitio (/data/asistente.json): una copia liviana de los archivos que las páginas
 * ya leen, con cada valor formateado como lo muestran las páginas. La Function la lee de los archivos estáticos, así
 * que siempre coincide con el deploy. Contrato y herramientas: packages/assistant/src/site-data.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Fact, formatCount, formatMoney, type SiteData, type SiteSection } from "@mt/assistant/site-data";

// biome-ignore lint/suspicious/noExplicitAny: los archivos de temas se leen de vuelta como JSON plano
type Json = any;

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const day = (iso: string) => iso.split("-").reverse().join("/");
const percent = (n: number) => `${Math.round(n)} %`;
const quarter = (period: string) => period.replace(/^(\d{4})-T(\d)$/, "$2.º trimestre de $1");

function read(dir: string, file: string): Json {
  const p = join(dir, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

/**
 * De quién es el sueldo que figura en /no-publicado, por grupo: el del Ejecutivo (la nómina con sueldos), el de los
 * legisladores provinciales y el de los intendentes. Los legisladores nacionales publican el suyo, así que llevan el monto.
 */
const PAY_UNPUBLISHED: Record<string, string> = {
  ejecutivo: "nomina-sueldos",
  diputados_provincial: "dieta-legisladores",
  senado_provincial: "dieta-legisladores",
  intendentes: "sueldos-autoridades-municipales",
};

function unpublishedPay(group: string, catalog: Json[]) {
  const item = catalog.find((u) => u.id === PAY_UNPUBLISHED[group]);
  return item ? { payUnpublished: { what: item.titulo, agency: item.organismo } } : {};
}

export function buildAssistantData(temas: string): SiteData {
  const suppliersRaw: Json[] = read(temas, "proveedores.json") ?? [];
  const purchasingRaw: Json[] = read(temas, "organismos.json") ?? [];
  const governmentRaw: Json[] = read(temas, "gobierno.json") ?? [];
  const people: Json[] = read(temas, "funcionarios.json")?.personas ?? [];
  const municipalities: Json[] = read(temas, "municipios.json") ?? [];
  const laws: Json[] = read(temas, "leyes.json") ?? [];
  const unpublished: Json[] = read(temas, "no-publicado.json") ?? [];
  const debt = read(temas, "deuda.json");
  const jobs = read(temas, "empleo.json");
  const taxes = read(temas, "recaudacion.json");
  const sharing = read(temas, "coparticipacion.json");
  const population = read(temas, "poblacion.json");

  const years = suppliersRaw
    .flatMap((s) => [s.primera, s.ultima])
    .filter(Boolean)
    .sort();
  const purchasesPeriod = years.length ? `${years[0].slice(0, 4)} a ${years.at(-1).slice(0, 4)}` : "";

  const sections: SiteSection[] = [
    {
      id: "proveedores",
      title: "Proveedores",
      path: "/proveedores",
      action: "Ver proveedores",
      what: "A quién le compra la Provincia y cuánto, proveedor por proveedor.",
      facts: [{ label: "Proveedores", value: formatCount(suppliersRaw.length) }],
      note: `Compras de ${purchasesPeriod}.`,
    },
    {
      id: "organismos",
      title: "Organismos que compran",
      path: "/organismos",
      action: "Ver organismos",
      what: "Cuánto compra cada organismo de la Provincia, cuánto por contratación directa y a quién.",
      facts: [{ label: "Organismos", value: formatCount(purchasingRaw.length) }],
      note: `Compras de ${purchasesPeriod}.`,
    },
    {
      id: "senales",
      title: "Señales en las compras",
      path: "/senales",
      action: "Ver las señales",
      what: "Compras que conviene mirar de cerca (una sola oferta, contratación directa, proveedor nuevo). Son señales, no acusaciones.",
      facts: [],
    },
    {
      id: "funcionarios",
      title: "Autoridades",
      path: "/funcionarios",
      action: "Ver autoridades",
      what: "Gobernador, ministros, intendentes y legisladores, con su partido, su mandato y su declaración jurada.",
      facts: [{ label: "Personas", value: formatCount(people.length) }],
    },
    {
      id: "gobierno",
      title: "El Gobierno por dentro",
      path: "/gobierno",
      action: "Ver el Gobierno",
      what: "Cómo está armado el Ejecutivo: cada ministerio, quién lo conduce y cuánta gente trabaja ahí.",
      facts: [],
    },
    {
      id: "empleo-publico",
      title: "Empleo público",
      path: "/empleo-publico",
      action: "Ver el empleo",
      what: "Cuántos empleados tiene la administración provincial, comparada con las otras provincias.",
      facts: jobs
        ? [
            { label: "Planta ocupada", value: formatCount(jobs.plantaMendoza), detail: `Cargos, ${jobs.anio}` },
            { label: "Cada mil habitantes", value: jobs.cadaMilMendoza.toLocaleString("es-AR", { maximumFractionDigits: 1 }) },
            { label: "Puesto entre 24 (de menos a más)", value: `${jobs.posicion}.º` },
          ]
        : [],
    },
    {
      id: "municipios",
      title: "Municipios",
      path: "/municipios",
      action: "Ver los municipios",
      what: "Los 18 municipios: intendente, población, personal, presupuesto, coparticipación y qué publica cada uno.",
      facts: [],
    },
    {
      id: "deuda",
      title: "Deuda de la Provincia",
      path: "/deuda",
      action: "Ver la deuda",
      what: "Cuánto debe la Provincia, a quién, en qué moneda y cómo cambió con cada gobierno.",
      facts: debt
        ? [
            { label: "Deuda consolidada", value: formatMoney(debt.totalUsd * 1e6, "USD"), detail: `Al ${day(debt.corte)}` },
            { label: "Por habitante", value: `US$ ${formatCount(debt.porHabitanteUsd)}` },
          ]
        : [],
    },
    {
      id: "recaudacion",
      title: "Recaudación",
      path: "/recaudacion",
      action: "Ver la recaudación",
      what: "Cuánto recauda la Provincia con sus impuestos (Ingresos Brutos, Inmobiliario, Automotor, Sellos) y cuánto le manda la Nación.",
      facts: taxes
        ? [
            { label: "Recaudado", value: formatMoney(taxes.total.actual), detail: `De ${taxes.periodo} de ${taxes.anio}` },
            ...taxes.porImpuesto
              .filter((t: Json) => t.id === "ingresos_brutos")
              .map((t: Json) => ({ label: t.nombre, value: formatMoney(t.actual) })),
            { label: "Por habitante", value: formatMoney(taxes.perCapita) },
          ]
        : [],
      ...(taxes ? { note: `En pesos de ${taxes.referencia}.` } : {}),
    },
    {
      id: "coparticipacion",
      title: "Coparticipación a los municipios",
      path: "/coparticipacion",
      action: "Ver los montos",
      what: "Cuánta plata reparte la Provincia a cada municipio y cuánto le toca a cada uno por habitante.",
      facts: sharing
        ? [{ label: "Repartido a los municipios", value: formatMoney(sharing.totalReal), detail: `En ${sharing.anioCompleto}` }]
        : [],
      ...(sharing ? { note: `En pesos de ${sharing.referencia}.` } : {}),
    },
    {
      id: "poblacion",
      title: "Población",
      path: "/poblacion",
      action: "Ver la población",
      what: "Cuánta gente vive en Mendoza y en cada departamento, según los censos y las proyecciones.",
      facts: population?.actual
        ? [{ label: "Población", value: formatCount(population.actual), detail: `Proyección ${population.anioActual}` }]
        : [],
    },
    {
      id: "leyes",
      title: "Leyes",
      path: "/leyes",
      action: "Ver las leyes",
      what: "Las leyes provinciales publicadas en el Boletín Oficial, explicadas en pocas palabras.",
      facts: [{ label: "Leyes", value: formatCount(laws.length) }],
    },
    {
      id: "partidos",
      title: "Partidos",
      path: "/partidos",
      action: "Ver los partidos",
      what: "Los partidos y frentes de Mendoza, quiénes los representan y cuántos cargos tienen.",
      facts: [],
    },
    {
      id: "universidades",
      title: "Universidades",
      path: "/universidades",
      action: "Ver universidades",
      what: "Cuánta plata reciben las universidades nacionales en Mendoza, cuántos estudiantes tienen y cuántos se reciben.",
      facts: [],
    },
    {
      id: "no-publicado",
      title: "Lo que no se publica",
      path: "/no-publicado",
      action: "Ver lo que falta",
      what: "Los datos que el Estado debería publicar y no publica, con la ley que lo pide.",
      facts: [{ label: "Datos que faltan", value: formatCount(unpublished.length) }],
    },
    {
      id: "pedir",
      title: "Pedir información pública",
      path: "/pedir",
      action: "Armar el pedido",
      what: "Arma el pedido de acceso a la información pública (Ley 9070) para la Provincia o un municipio, listo para mandar.",
      facts: [],
    },
    {
      id: "datos",
      title: "Fuentes y datos",
      path: "/fuentes",
      action: "Ver los datos",
      what: "Todas las fuentes oficiales que usamos y los datos para descargar en CSV.",
      facts: [],
    },
    {
      id: "tramites",
      title: "Abrir un comercio",
      path: "/tramites/abrir-un-comercio",
      action: "Ver el trámite",
      what: "Los pasos para abrir un comercio en Mendoza y cuánto cobra cada municipio.",
      facts: [],
    },
  ];

  const purchasing = purchasingRaw.map((a) => ({
    name: a.nombre,
    slug: a.slug,
    total: formatMoney(a.total),
    amount: a.total,
    purchases: a.procesos,
    direct: percent(a.pctDirecta),
    singleOffer: percent(a.pctUnaOferta),
    ...(a.proveedorPrincipal ? { mainSupplier: `${a.proveedorPrincipal.nombre} (${percent(a.proveedorPrincipal.pct)})` } : {}),
  }));
  const government = governmentRaw
    .filter((a) => a.head || a.staff)
    .map((a) => ({
      name: a.name,
      slug: a.slug,
      ...(a.staff ? { staff: `${formatCount(a.staff)} personas`, ...(a.staffPeriod ? { staffPeriod: quarter(a.staffPeriod) } : {}) } : {}),
      ...(a.head ? { head: `${a.head.name}, ${a.head.role}` } : {}),
      govPath: `/gobierno/${a.slug}`,
    }));

  return {
    generatedAt: new Date().toISOString(),
    purchasesPeriod,
    sections,
    suppliers: suppliersRaw.map((s) => ({
      name: s.nombre,
      slug: s.slug,
      total: formatMoney(s.total),
      amount: s.total,
      purchases: s.procesos,
      first: s.primera ?? "",
      last: s.ultima ?? "",
      ...(s.actividad ? { activity: String(s.actividad).slice(0, 60) } : {}),
    })),
    agencies: [...purchasing, ...government],
    people: people.map((p) => {
      const pay = (p.remuneracion ?? []) as { monto: number; periodo: string }[];
      const latest = pay
        .map((r) => r.periodo)
        .sort()
        .at(-1);
      const total = pay.filter((r) => r.periodo === latest).reduce((sum, r) => sum + r.monto, 0);
      const [y, m] = (latest ?? "").split("-");
      return {
        name: p.nombre,
        role: p.cargo,
        agency: p.organismo ?? "",
        ...(p.party?.name || p.partido ? { party: p.party?.name ?? p.partido } : {}),
        ...(p.mandatoDesde ? { term: p.mandatoHasta ? `${p.mandatoDesde}–${p.mandatoHasta}` : `desde ${p.mandatoDesde}` } : {}),
        municipalities: (p.municipalities ?? []).map((x: Json) => x.name),
        ...(latest && total
          ? { pay: { value: `${formatMoney(total)} brutos`, period: `${MONTHS[Number(m) - 1]} de ${y}` } }
          : unpublishedPay(p.grupo, unpublished)),
        ...(p.ddjj?.totalBienes ? { assets: { year: String(p.ddjj.periodo), value: `${formatMoney(p.ddjj.totalBienes)} en bienes` } } : {}),
        path: `/funcionarios/${p.role}/${p.slug}`,
      };
    }),
    municipalities: municipalities.map((m) => {
      const facts: Fact[] = [];
      if (m.poblacion?.actual) facts.push({ label: "Población", value: formatCount(m.poblacion.actual) });
      if (m.staff)
        facts.push({
          label: "Personal",
          value: `${formatCount(m.staff.positions)} cargos`,
          detail: `${m.staff.perThousand.toLocaleString("es-AR", { maximumFractionDigits: 1 })} cada mil habitantes, ${m.staff.quarter}`,
        });
      if (m.coparticipacion)
        facts.push({
          label: "Coparticipación por habitante",
          value: formatMoney(m.coparticipacion.perCapita),
          detail: `${m.coparticipacion.anio}, puesto ${m.coparticipacion.puesto} de 18`,
        });
      if (m.budget)
        facts.push({
          label: `Presupuesto ${m.budget.year}`,
          value: formatMoney(m.budget.current),
          ...(m.budget.partial ? { detail: `Gastado ${formatMoney(m.budget.accrued)} a ${m.budget.cutoff}` } : {}),
        });
      if (m.transparency?.items?.length)
        facts.push({
          label: "Qué publica en su sitio",
          value: `${m.transparency.published} de ${m.transparency.items.length} datos clave`,
        });
      return {
        name: m.nombre,
        slug: m.slug,
        ...(m.intendente
          ? {
              mayor: { label: "Intendente", value: m.intendente.nombre, ...(m.intendente.partido ? { detail: m.intendente.partido } : {}) },
            }
          : {}),
        facts,
        ...(m.coparticipacion?.referencia
          ? { note: `Coparticipación en pesos de ${m.coparticipacion.referencia}; presupuesto en pesos de cada año.` }
          : {}),
      };
    }),
    laws: laws.map((l) => ({ number: l.numero, title: l.titulo, topic: l.tema ?? "", published: l.publicada ?? l.fecha ?? "" })),
    unpublished: unpublished.map((u) => ({ what: u.titulo, agency: u.organismo, detail: String(u.que_es ?? "").slice(0, 200) })),
  };
}
