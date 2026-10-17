/**
 * Syncs PostHog with the code: Spanish descriptions for each event (src/analytics-catalog.ts) and the
 * "Uso de Mendoza Transparente" dashboard with its insights. Idempotent: run it again whenever the catalog
 * or the dashboard below changes, or when new events show up in PostHog.
 *
 * Uso (desde la raíz): bun run posthog-sync
 * Necesita .env.posthog en la raíz del repo (no se versiona): POSTHOG_PERSONAL_API_KEY y POSTHOG_PROJECT_ID.
 * Documentado en docs/procesos/analitica.md.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EVENT_CATALOG } from "../src/analytics-catalog.ts";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dir, "..", "..", "..", ".env.posthog"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = `https://us.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}`;
const H = { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" };

// biome-ignore lint/suspicious/noExplicitAny: PostHog API responses are untyped JSON.
async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: H });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body as T;
}

// ------------------------------------------------------------------ event descriptions

const defs = (await api<{ results: { id: string; name: string; description: string | null }[] }>("/event_definitions/?limit=500")).results;
const byName = new Map(defs.map((d) => [d.name, d]));
let described = 0;
let createdDefs = 0;
for (const e of EVENT_CATALOG) {
  const d = byName.get(e.event);
  // Definitions can be created before the first event arrives, so the catalog is complete from day one.
  if (!d) {
    await api("/event_definitions/", { method: "POST", body: JSON.stringify({ name: e.event, description: e.description, tags: e.tags }) });
    createdDefs++;
    continue;
  }
  if (d.description === e.description) continue;
  await api(`/event_definitions/${d.id}/`, { method: "PATCH", body: JSON.stringify({ description: e.description, tags: e.tags }) });
  described++;
}
const unknown = defs.map((d) => d.name).filter((n) => !EVENT_CATALOG.some((e) => e.event === n));
console.log(`Eventos: ${createdDefs} definiciones creadas, ${described} descripciones actualizadas.`);
if (unknown.length) console.log(`  Sin descripción en el catálogo (sumarlos a src/analytics-catalog.ts): ${unknown.join(", ")}`);

// ------------------------------------------------------------------ dashboard

const ev = (event: string, extra: Record<string, unknown> = {}) => ({ kind: "EventsNode", event, name: event, ...extra });
const last30 = { date_from: "-30d" };
const trends = (series: unknown[], extra: Record<string, unknown> = {}) => ({
  kind: "InsightVizNode",
  source: { kind: "TrendsQuery", series, interval: "day", dateRange: last30, filterTestAccounts: true, ...extra },
});
const ranking = (event: string, property: string, extra: Record<string, unknown> = {}) =>
  trends([ev(event)], {
    breakdownFilter: { breakdown: property, breakdown_type: "event", breakdown_limit: 15 },
    trendsFilter: { display: "ActionsBarValue" },
    ...extra,
  });

const DASHBOARD = {
  name: "Uso de Mendoza Transparente",
  description:
    "Cómo se usa el sitio: cuánta gente entra, qué mira, qué datos faltantes quiere pedir y cuántos pedidos al Estado se registran. Excluye el tráfico de pruebas (localhost). Se actualiza con bun run posthog-sync.",
};

const INSIGHTS: { name: string; description: string; query: unknown }[] = [
  {
    name: "Visitantes por día",
    description:
      "Personas distintas que entraron al sitio cada día. Como no usamos cookies, una misma persona que vuelve otro día cuenta de nuevo.",
    query: trends([ev("$pageview", { math: "dau" })]),
  },
  {
    name: "Páginas vistas por día",
    description: "Cantidad total de páginas vistas cada día.",
    query: trends([ev("$pageview")]),
  },
  {
    name: "Páginas más vistas",
    description: "Las 15 páginas con más visitas en los últimos 30 días.",
    query: ranking("$pageview", "$pathname"),
  },
  {
    name: "De dónde llega la gente",
    description: "Sitios desde los que llegan las visitas: buscadores, redes sociales, medios o acceso directo.",
    query: ranking("$pageview", "$referring_domain"),
  },
  {
    name: "Embudo: de un dato faltante al pedido registrado",
    description:
      "De quienes abren un dato en «Lo que no se publica», cuántos copian el pedido, van al formulario oficial y después registran su número de trámite. Ventana de 7 días.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        series: [
          ev("missing_data.request.open", { custom_name: "Abrió el pedido" }),
          ev("missing_data.request.copy", { custom_name: "Copió el pedido" }),
          ev("missing_data.request.official_form", { custom_name: "Fue al formulario oficial" }),
          ev("participation.request.success", { custom_name: "Registró su número de trámite" }),
        ],
        dateRange: last30,
        filterTestAccounts: true,
        funnelsFilter: { funnelWindowInterval: 7, funnelWindowIntervalUnit: "day", funnelVizType: "steps" },
      },
    },
  },
  {
    name: "Datos que más se quieren pedir",
    description: "Qué datos de «Lo que no se publica» abre más la gente para pedirlos.",
    query: ranking("missing_data.request.open", "item"),
  },
  {
    name: "Pedidos registrados y respuestas del Estado",
    description: "Pedidos de acceso a la información registrados en «Participá» y respuestas que la gente vuelve a contarnos, por semana.",
    query: trends(
      [
        ev("participation.request.success", { custom_name: "Pedidos registrados" }),
        ev("participation.answer.success", { custom_name: "Respuestas contadas" }),
      ],
      { interval: "week", dateRange: { date_from: "-90d" } },
    ),
  },
  {
    name: "Reportes de errores y sugerencias de datos",
    description: "Errores del sitio reportados y datos sugeridos por la gente, por semana.",
    query: trends(
      [
        ev("participation.bug.success", { custom_name: "Errores reportados" }),
        ev("participation.data_suggestion.success", { custom_name: "Datos sugeridos" }),
      ],
      { interval: "week", dateRange: { date_from: "-90d" } },
    ),
  },
  {
    name: "Qué busca la gente",
    description: "Las búsquedas más frecuentes en los buscadores del sitio (leyes, proveedores, funcionarios).",
    query: ranking("search.query", "query"),
  },
  {
    name: "Fuentes oficiales más consultadas",
    description: "Sitios oficiales que la gente abre desde Mendoza Transparente para verificar un dato.",
    query: ranking("link.outbound", "host"),
  },
  {
    name: "Datos abiertos descargados",
    description: "Archivos de datos (CSV, JSON) que más se descargan.",
    query: ranking("data.download", "file"),
  },
  {
    name: "Leyes: textos oficiales abiertos",
    description: "Leyes cuyo PDF oficial más se abre desde su página.",
    query: ranking("law.official_pdf.open", "law"),
  },
  {
    name: "Portada: preguntas más elegidas",
    description: "Cuál de las seis preguntas de «Empezá por una pregunta» toca más la gente. Sirve para ordenarlas.",
    query: ranking("home.question.open", "question"),
  },
  {
    name: "Búsquedas sin resultados",
    description: "Lo que la gente buscó y no encontró: la lista de contenido que falta.",
    query: ranking("search.no_results", "query"),
  },
  {
    name: "Qué abre la gente desde el buscador",
    description: "Tipo de página que la gente elige en el buscador (ley, funcionario, municipio, proveedor…).",
    query: ranking("search.select", "kind"),
  },
  {
    name: "Hojas de detalle más abiertas",
    description: "Qué detalles abre la gente: pedidos, procesos de compra, proveedores, filas de datos.",
    query: ranking("sheet.open", "sheet"),
  },
  {
    name: "Portada: qué usa la gente",
    description:
      "Cuántas veces se usa cada parte de la portada: preguntas, «¿Dónde vivís?», mapa de secciones, novedades, buscador y guía de lectura.",
    query: trends(
      [
        ev("home.question.open", { custom_name: "Preguntas" }),
        ev("home.department.select", { custom_name: "¿Dónde vivís?" }),
        ev("home.map.open", { custom_name: "Todo lo que hay" }),
        ev("home.news.open", { custom_name: "Novedades" }),
        ev("search.open", { custom_name: "Abrió el buscador" }),
        ev("home.reading_guide.open", { custom_name: "Guía de lectura" }),
      ],
      { trendsFilter: { display: "ActionsBarValue" } },
    ),
  },
  {
    name: "Menú: grupos que más se abren",
    description:
      "Qué grupos del menú abre o cierra la gente (Gobierno, Datos, Compras del Estado, Transparencia). Muestra por dónde busca.",
    query: ranking("nav.group.toggle", "group"),
  },
  {
    name: "Buscador: de abrirlo a elegir un resultado",
    description: "Por semana: cuántas veces se abre el buscador, se escribe una búsqueda, se elige un resultado y no se encuentra nada.",
    query: trends(
      [
        ev("search.open", { custom_name: "Abrió el buscador" }),
        ev("search.query", { custom_name: "Buscó" }),
        ev("search.select", { custom_name: "Eligió un resultado" }),
        ev("search.no_results", { custom_name: "Sin resultados" }),
      ],
      { interval: "week", dateRange: { date_from: "-90d" } },
    ),
  },
  {
    name: "Municipios más consultados",
    description: "Páginas de municipio con más visitas (incluye sus subpáginas, como el presupuesto).",
    query: ranking("$pageview", "$pathname", {
      properties: [{ key: "$pathname", operator: "icontains", value: "/municipios/", type: "event" }],
    }),
  },
  {
    name: "Municipios: qué se usa",
    description:
      "Cuántas veces se usa cada herramienta de las páginas de municipio: presupuesto, anexos originales, leyes, qué publica cada uno y sus fuentes.",
    query: trends(
      [
        ev("municipality.budget.open", { custom_name: "Abrió el presupuesto" }),
        ev("municipality.budget.year.change", { custom_name: "Cambió el año del presupuesto" }),
        ev("municipality.budget_source.open", { custom_name: "Abrió un anexo original" }),
        ev("municipality.law.open", { custom_name: "Abrió una ley" }),
        ev("municipality.transparency_item.open", { custom_name: "Abrió qué publica" }),
        ev("municipality.transparency_source.open", { custom_name: "Fue a la fuente" }),
        ev("municipality.transparency_request.open", { custom_name: "Fue a pedir el dato" }),
        ev("municipality.staff_source.open", { custom_name: "Abrió la fuente de personal" }),
      ],
      { trendsFilter: { display: "ActionsBarValue" } },
    ),
  },
  {
    name: "Errores del sitio por día",
    description: "Errores que le aparecieron a la gente mientras usaba el sitio. El detalle de cada uno está en Error tracking.",
    query: trends([ev("$exception")]),
  },
  {
    name: "Clics sin respuesta",
    description:
      "Páginas donde la gente toca algo que parece tocable y no pasa nada. Cada caso es un botón que falta o un texto que confunde.",
    query: ranking("$dead_click", "$pathname"),
  },
  {
    name: "Hasta dónde baja la gente en cada página",
    description:
      "Por página, en los últimos 30 días: qué parte del contenido llegó a verse (mediana), cuántos llegan al final, cuántos no scrollean y cuántos segundos se quedan. Poco contenido visto y pocos segundos en una página con tráfico es lo primero a mejorar.",
    // Scroll data rides on the next $pageview or the $pageleave, keyed by $prev_pageview_pathname,
    // so it needs SQL: a trends breakdown cannot combine both events by that property.
    query: {
      kind: "DataTableNode",
      source: {
        kind: "HogQLQuery",
        query: `SELECT
  properties.$prev_pageview_pathname AS pagina,
  count() AS vistas,
  round(median(toFloat(properties.$prev_pageview_max_content_percentage)) * 100) AS contenido_visto_pct,
  round(countIf(toFloat(properties.$prev_pageview_max_content_percentage) >= 0.9) / count() * 100) AS llegan_al_final_pct,
  round(countIf(toFloat(properties.$prev_pageview_max_scroll_percentage) = 0) / count() * 100) AS no_scrollean_pct,
  round(median(toFloat(properties.$prev_pageview_duration))) AS segundos
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('$pageview', '$pageleave')
  AND properties.$prev_pageview_pathname IS NOT NULL
  AND properties.$host = 'mendoza-transparente.com'
  AND NOT coalesce(properties.$virt_is_bot, false)
GROUP BY pagina
HAVING vistas >= 10
ORDER BY vistas DESC
LIMIT 50`,
      },
    },
  },
];

type Named = { id: number; name: string; deleted?: boolean };
const dashboards = (await api<{ results: Named[] }>("/dashboards/?limit=200")).results.filter((d) => !d.deleted);
let dashboard = dashboards.find((d) => d.name === DASHBOARD.name);
dashboard = dashboard
  ? await api<Named>(`/dashboards/${dashboard.id}/`, { method: "PATCH", body: JSON.stringify(DASHBOARD) })
  : await api<Named>("/dashboards/", { method: "POST", body: JSON.stringify(DASHBOARD) });

const insights = (await api<{ results: Named[] }>("/insights/?limit=500&saved=true")).results.filter((i) => !i.deleted);
let created = 0;
let updated = 0;
for (const i of INSIGHTS) {
  const existing = insights.find((x) => x.name === i.name);
  const body = JSON.stringify({ ...i, dashboards: [dashboard.id], saved: true });
  if (existing) {
    await api(`/insights/${existing.id}/`, { method: "PATCH", body });
    updated++;
  } else {
    await api("/insights/", { method: "POST", body });
    created++;
  }
}
console.log(`Tablero «${DASHBOARD.name}»: ${created} gráficos nuevos, ${updated} actualizados.`);
console.log(`https://us.posthog.com/project/${env.POSTHOG_PROJECT_ID}/dashboard/${dashboard.id}`);
