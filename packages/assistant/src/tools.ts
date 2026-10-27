/**
 * The assistant's tools: plain functions over the knowledge (knowledge.json). Each result carries its source,
 * so the agent can only show what our data says. `TOOL_DEFINITIONS` describes them to the model.
 */

import type { Flow, Knowledge } from "./knowledge.ts";
import { MUNICIPALITIES } from "./types.ts";

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Canonical municipality name from what someone typed ("godoy cruz", "Ciudad de Mendoza"), or null. */
export function findMunicipality(text: string): string | null {
  const t = ` ${normalize(text)} `;
  if (/ (ciudad de mendoza|capital|mendoza capital) /.test(t)) return "Capital";
  for (const m of MUNICIPALITIES) if (t.includes(` ${normalize(m)} `)) return m;
  return null;
}

export interface ProcedureResult {
  covered: boolean;
  flow: string;
  municipality: string;
  /** Present when covered: the steps that apply to the activity. */
  steps?: Flow["steps"];
  activity?: { id: string; name: string } | null;
  activities?: { id: string; name: string }[];
  costs?: Flow["costs"];
  unpublished?: Flow["unpublished"];
  promotion?: Flow["promotion"];
  verified?: string;
  /** When the municipality is not surveyed yet: the national and provincial steps, which are the same everywhere. */
  general_steps?: Flow["steps"];
  note?: string;
}

function pickActivity(flow: Flow, activity: string | undefined) {
  if (!activity) return null;
  const a = normalize(activity);
  return flow.activities.find((x) => normalize(x.id) === a || normalize(x.name) === a || a.includes(normalize(x.name))) ?? null;
}

export function getProcedure(k: Knowledge, args: { flow?: string; municipality?: string; activity?: string }): ProcedureResult {
  const flowId = args.flow || "abrir-un-comercio";
  const municipality = findMunicipality(args.municipality ?? "") ?? args.municipality ?? "";
  const flow = k.flows.find((f) => f.id === flowId && f.municipality === municipality);
  if (!flow) {
    const any = k.flows.find((f) => f.id === flowId);
    return {
      covered: false,
      flow: flowId,
      municipality,
      general_steps: any?.steps.filter((s) => s.level !== "municipio") ?? [],
      note: `Todavía no relevamos los pasos municipales de ${municipality || "ese municipio"}. Los de Nación y Provincia son iguales en todos lados.`,
    };
  }
  const activity = pickActivity(flow, args.activity);
  const steps = flow.steps.filter((s) => s.when === "siempre" || (s.when === "alimentos" && (activity ? activity.food : true)));
  return {
    covered: true,
    flow: flow.id,
    municipality,
    steps,
    activity: activity ? { id: activity.id, name: activity.name } : null,
    activities: flow.activities.map((a) => ({ id: a.id, name: a.name })),
    costs: flow.costs,
    unpublished: flow.unpublished,
    ...(flow.promotion ? { promotion: flow.promotion } : {}),
    verified: flow.verified,
  };
}

export interface FeeMatch {
  code: string;
  activity: string;
  min: number;
  max: number;
}

export interface FeeResult {
  municipality: string;
  found: boolean;
  year?: number;
  rule?: string;
  href?: string;
  matches: FeeMatch[];
  note?: string;
}

/** Trade fee range for an activity: first by the catalog's activity code, then by words in the annex names. */
export function findTradeFee(k: Knowledge, args: { municipality?: string; activity?: string }): FeeResult {
  const municipality = findMunicipality(args.municipality ?? "") ?? args.municipality ?? "";
  const table = k.fees.filter((t) => t.municipality === municipality).sort((a, b) => b.year - a.year)[0];
  if (!table) {
    return {
      municipality,
      found: false,
      matches: [],
      note: `Todavía no leímos la ordenanza tarifaria de ${municipality || "ese municipio"}.`,
    };
  }
  const q = normalize(args.activity ?? "");
  const flowActivity = k.flows
    .filter((f) => f.municipality === municipality)
    .flatMap((f) => f.activities)
    .find((a) => q && (normalize(a.id) === q || normalize(a.name) === q || q.includes(normalize(a.name))));
  let rows = flowActivity ? table.rows.filter((r) => r[0] === flowActivity.code) : [];
  if (!rows.length && q) {
    const words = q.split(" ").filter((w) => w.length > 2);
    const stem = (w: string) => w.replace(/(es|s)$/, "");
    rows = table.rows
      .map((r) => ({ r, score: words.filter((w) => normalize(r[1]).includes(stem(w))).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.r[2] - b.r[2])
      .slice(0, 5)
      .map((x) => x.r);
  }
  return {
    municipality,
    found: rows.length > 0,
    year: table.year,
    rule: table.rule,
    href: table.href,
    matches: rows.map(([code, activity, min, max]) => ({ code, activity, min, max })),
    ...(rows.length ? {} : { note: "Ningún rubro del anexo coincide con esa actividad." }),
  };
}

export interface UnpublishedResult {
  matches: { what: string; agency: string; detail?: string; municipality: string }[];
}

/** What the State does not publish about a topic (catalog `no_publica`), so the agent can say so instead of guessing. */
export function searchUnpublished(k: Knowledge, args: { municipality?: string; topic?: string }): UnpublishedResult {
  const municipality = findMunicipality(args.municipality ?? "");
  const words = normalize(args.topic ?? "")
    .split(" ")
    .filter((w) => w.length > 3);
  const matches = k.flows
    .filter((f) => !municipality || f.municipality === municipality)
    .flatMap((f) => f.unpublished.map((u) => ({ ...u, municipality: f.municipality })))
    .filter((u) => words.some((w) => normalize(`${u.what} ${u.detail ?? ""}`).includes(w.slice(0, 5))));
  return { matches };
}

export function listProcedures(k: Knowledge) {
  return { procedures: k.flows.map((f) => ({ flow: f.id, title: f.title, municipality: f.municipality, verified: f.verified })) };
}

/** OpenAI-style tool definitions (both AI Gateway and OpenRouter accept them). */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_procedures",
      description: "Lista los recorridos de trámites que tenemos relevados, con su municipio y fecha de verificación.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_procedure",
      description:
        "Pasos oficiales de un recorrido (por ejemplo abrir-un-comercio) en un municipio, filtrados por rubro, con costos, lo que no se publica y la fecha de verificación. Si el municipio no está relevado, devuelve solo los pasos de Nación y Provincia.",
      parameters: {
        type: "object",
        properties: {
          flow: { type: "string", description: "Id del recorrido, por ejemplo abrir-un-comercio." },
          municipality: { type: "string", description: "Uno de los 18 municipios de Mendoza." },
          activity: { type: "string", description: "Rubro, si se sabe (almacén, kiosco, ropa…)." },
        },
        required: ["flow", "municipality"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_trade_fee",
      description: "Rango del derecho de comercio (tasa municipal) de un rubro según la ordenanza tarifaria del municipio.",
      parameters: {
        type: "object",
        properties: {
          municipality: { type: "string" },
          activity: { type: "string", description: "Rubro en palabras simples: almacén, ropa, rotisería, peluquería…" },
        },
        required: ["municipality", "activity"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_unpublished",
      description: "Busca si un dato (plazos, costos, requisitos) figura como no publicado por el organismo.",
      parameters: {
        type: "object",
        properties: { municipality: { type: "string" }, topic: { type: "string", description: "Qué se preguntó, en pocas palabras." } },
        required: ["topic"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Pregunta a la persona un dato que falta para responder: el municipio o el rubro. La web muestra las opciones; no las escribas en el texto. Termina el turno.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["municipality", "activity"] },
          question: { type: "string", description: "La pregunta, en una oración corta." },
        },
        required: ["field", "question"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["function"]["name"];
