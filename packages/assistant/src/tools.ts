/**
 * The assistant's tools: plain functions over the knowledge (knowledge.json). Each result carries its source,
 * so the agent can only show what our data says. `TOOL_DEFINITIONS` describes them to the model.
 */

import type { FeeTable, Flow, FlowActivity, Knowledge } from "./knowledge.ts";
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

/** Whether `text` says `phrase` as whole words, allowing a plural ("kioscos" says "kiosco"; "pantalones" does not say "pan"). */
export function mentions(text: string, phrase: string): boolean {
  const t = ` ${normalize(text)} `;
  const p = normalize(phrase);
  return !!p && [p, `${p}s`, `${p}es`].some((v) => t.includes(` ${v} `));
}

/** Words that ask about the money: the fee card only shows when the person asked for it. */
const FEE_WORDS =
  /\b(tasa|tasas|cobra|cobran|cuesta|cuestan|cuanto sale|pago|pagar|paga|pagan|pagaria|costo|costos|precio|monto|derecho de comercio|tributo|impuesto)\b/;
export const asksAboutFee = (texts: string[]) => texts.some((t) => FEE_WORDS.test(normalize(t)));

export interface ProcedureResult {
  covered: boolean;
  /** False when we do not have that procedure at all (only "abrir-un-comercio" for now). */
  known: boolean;
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
  /** When the procedure is not known: the ones we have. */
  procedures?: { flow: string; title: string }[];
  note?: string;
}

/** A common activity (data/curado/rubros.yaml) by id, name or synonym, said as whole words. */
export function findCommonActivity(k: Knowledge, text: string | undefined) {
  if (!text) return null;
  const t = normalize(text);
  return (
    k.activities.find((a) => normalize(a.id) === t || normalize(a.name) === t) ??
    k.activities.find((a) => [a.name, ...a.words].some((w) => mentions(t, w))) ??
    null
  );
}

/**
 * The flow's activity the person means: by its own name first, then through the common list and its synonyms
 * ("quiosco", "golosinas" and "maxikiosco" are all the kiosk). Null when the municipality does not have it.
 */
export function resolveActivity(k: Knowledge, flow: Flow | undefined, text: string | undefined): FlowActivity | null {
  if (!flow || !text) return null;
  const t = normalize(text);
  const own = flow.activities.find((a) => normalize(a.id) === t || normalize(a.name) === t || mentions(t, a.name));
  if (own) return own;
  const common = findCommonActivity(k, text);
  return (common && flow.activities.find((a) => a.id === common.id)) ?? null;
}

/** What the person wants to sell, for the steps: any common activity works (they only change the food steps). */
export function activityOptions(k: Knowledge, flow?: Flow) {
  const seen = new Set<string>();
  const options: { id: string; label: string; words?: string[] }[] = [];
  for (const a of flow?.activities ?? []) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    options.push({ id: a.id, label: a.name, words: k.activities.find((c) => c.id === a.id)?.words });
  }
  for (const a of k.activities) if (!seen.has(a.id)) options.push({ id: a.id, label: a.name, words: a.words });
  return options;
}

const KNOWN_FLOWS = (k: Knowledge) => [...new Map(k.flows.map((f) => [f.id, { flow: f.id, title: f.title }])).values()];

export function getProcedure(k: Knowledge, args: { flow?: string; municipality?: string; activity?: string }): ProcedureResult {
  const flowId = args.flow || "abrir-un-comercio";
  const municipality = findMunicipality(args.municipality ?? "") ?? args.municipality ?? "";
  if (!k.flows.some((f) => f.id === flowId)) {
    return {
      covered: false,
      known: false,
      flow: flowId,
      municipality,
      procedures: KNOWN_FLOWS(k),
      note: "Todavía no tenemos ese trámite. Queda anotado para sumarlo.",
    };
  }
  const flow = k.flows.find((f) => f.id === flowId && f.municipality === municipality);
  if (!flow) {
    const any = k.flows.find((f) => f.id === flowId);
    return {
      covered: false,
      known: true,
      flow: flowId,
      municipality,
      general_steps: any?.steps.filter((s) => s.level !== "municipio") ?? [],
      note: `Todavía no relevamos los pasos municipales de ${municipality || "ese municipio"}; queda anotado. Los de Nación y Provincia son iguales en todos lados.`,
    };
  }
  const own = resolveActivity(k, flow, args.activity);
  const common = own ? null : findCommonActivity(k, args.activity);
  const activity = own ?? (common ? { id: common.id, name: common.name, food: common.food } : null);
  const steps = flow.steps.filter((s) => s.when === "siempre" || (s.when === "alimentos" && (activity ? activity.food : true)));
  return {
    covered: true,
    known: true,
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

/**
 * - `found`: `matches[0]` is the activity, the rest are the variants the ordinance tells apart.
 * - `ask_activity`: no activity yet; `available` lists the ones we have for that municipality.
 * - `unknown_activity`: that activity is not in the municipality's list (saved as a gap); `available` lists the others.
 * - `not_surveyed`: we have not read that municipality's tarifaria (saved as a gap).
 * - `not_computable`: the published rules do not allow an amount (San Rafael).
 */
export type FeeStatus = "found" | "ask_activity" | "unknown_activity" | "not_surveyed" | "not_computable";

export interface FeeResult {
  status: FeeStatus;
  municipality: string;
  found: boolean;
  /** The activity matched, as people say it. */
  activity?: { id: string; name: string };
  /** What the person asked for, when it is not in the list. */
  asked?: string;
  year?: number;
  /** "mes", "bimestre", "año", or "" when the ordinance does not say. Amounts are per this period. */
  period?: string;
  rule?: string;
  href?: string;
  /** Always in pesos (amounts in tax units are already converted). */
  matches: FeeMatch[];
  /** The activities with a fee in this municipality, to choose from. */
  available?: { id: string; name: string }[];
  /** How to read the amounts (unit value, manual reading, categories) or why there are none. */
  note?: string;
}

/** The flow of a municipality that carries the trade fee settings. */
const feeFlow = (k: Knowledge, municipality: string) => k.flows.find((f) => f.municipality === municipality && f.fee);

const latestTable = (k: Knowledge, municipality: string) =>
  k.fees.filter((t) => t.municipality === municipality).sort((a, b) => b.year - a.year)[0];

/**
 * The annex row of a code. Some annexes repeat a code under different names (Guaymallén's 472120 is a grocery and also
 * spices): the curated name picks one; without it, the one that names the activity.
 */
function rowsFor(table: FeeTable, code: string, activityName: string, printedName?: string) {
  const rows = table.rows.filter((r) => r[0] === code);
  if (printedName) return rows.filter((r) => r[1] === printedName).slice(0, 1);
  if (rows.length < 2) return rows;
  const named = rows.filter((r) => normalize(r[1]).includes(normalize(activityName).split(" ")[0]!));
  return (named.length ? named : rows).slice(0, 1);
}

/** The activities of the municipality that have a fee we can show: an amount typed by hand or a code in the annex. */
export function feeActivities(k: Knowledge, municipality: string): FlowActivity[] {
  const flow = feeFlow(k, municipality);
  if (!flow?.fee?.available) return [];
  const table = latestTable(k, municipality);
  return flow.activities.filter(
    (a) =>
      flow.fee!.manual.some((m) => m.activity === a.id) ||
      (!!a.code && !!table?.rows.some((r) => r[0] === a.code && (!a.codeName || r[1] === a.codeName))),
  );
}

/**
 * Trade fee of an activity, in pesos. Only the activities curated for each municipality (data/curado/tramites.yaml):
 * a word search over the annex mixes unrelated things ("veterinaria" also found a sex shop), so an activity that is
 * not in the list is reported and saved, never guessed.
 */
export function findTradeFee(k: Knowledge, args: { municipality?: string; activity?: string }): FeeResult {
  const municipality = findMunicipality(args.municipality ?? "") ?? args.municipality ?? "";
  const flow = feeFlow(k, municipality);
  const config = flow?.fee;
  if (!flow || !config) {
    return {
      status: "not_surveyed",
      municipality,
      found: false,
      matches: [],
      note: `Todavía no leímos la ordenanza tarifaria de ${municipality || "ese municipio"}. Queda anotado para sumarla.`,
    };
  }
  if (!config.available) {
    return { status: "not_computable", municipality, found: false, matches: [], ...(config.note ? { note: config.note } : {}) };
  }
  const available = feeActivities(k, municipality).map((a) => ({ id: a.id, name: a.name }));
  const asked = (args.activity ?? "").trim();
  if (!asked) return { status: "ask_activity", municipality, found: false, matches: [], available };
  const activity = resolveActivity(k, flow, asked);
  if (!activity || !available.some((a) => a.id === activity.id)) {
    return {
      status: "unknown_activity",
      municipality,
      found: false,
      asked,
      matches: [],
      available,
      note: `Todavía no tenemos la tasa de ese rubro en ${municipality}. Queda anotado para sumarla.`,
    };
  }

  const rate = config.unit !== "pesos" ? (config.unitValue ?? 0) : 1;
  const unitNote =
    config.unit !== "pesos" && config.unitValue
      ? `Montos en ${config.unit} pasados a pesos con ${config.unit} = $ ${config.unitValue}${config.unitRule ? ` (${config.unitRule})` : ""}.`
      : undefined;
  const base = {
    municipality,
    activity: { id: activity.id, name: activity.name },
    available,
    ...(config.period !== undefined ? { period: config.period } : {}),
  };

  const manual = config.manual.find((m) => m.activity === activity.id);
  if (manual) {
    const page = manual.page ? `Leído a mano de la página ${manual.page} del anexo escaneado.` : "Leído a mano del anexo escaneado.";
    return {
      ...base,
      status: "found",
      found: true,
      ...(config.year ? { year: config.year } : {}),
      ...(config.rule ? { rule: config.rule } : {}),
      ...(config.href ? { href: config.href } : {}),
      matches: [{ code: activity.code, activity: activity.name, min: manual.min * rate, max: manual.max * rate }],
      note: [config.note, unitNote, page].filter(Boolean).join(" "),
    };
  }

  const table = latestTable(k, municipality)!;
  const matches = [{ code: activity.code, name: activity.codeName }, ...activity.variants]
    .flatMap((v) => rowsFor(table, v.code, activity.name, v.name))
    .map(([code, name, min, max]) => ({ code, activity: name, min: min * rate, max: max * rate }));
  const note = [config.note, unitNote].filter(Boolean).join(" ");
  return {
    ...base,
    status: "found",
    found: true,
    year: table.year,
    rule: config.rule ?? table.rule,
    href: config.href ?? table.href,
    matches,
    ...(note ? { note } : {}),
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
      description:
        "Derecho de comercio (tasa municipal) de un rubro según la ordenanza tarifaria del municipio. Usala solo si la persona pregunta cuánto cobra, cuesta o se paga. Devuelve `status`: found (los montos se muestran en pantalla, con las variantes que la ordenanza separa), ask_activity (falta el rubro: preguntalo), unknown_activity (ese rubro no está en la lista del municipio), not_surveyed (no leímos la tarifaria de ese municipio) o not_computable (no se puede dar un monto).",
      parameters: {
        type: "object",
        properties: {
          municipality: { type: "string" },
          activity: {
            type: "string",
            description: "El rubro con las palabras de la persona (kiosco, golosinas, ropa…). Vacío si todavía no lo dijo.",
          },
        },
        required: ["municipality"],
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
        "Pregunta a la persona un dato que falta para responder: el municipio o el rubro. La web muestra las opciones (para la tasa, solo los rubros que tenemos en ese municipio); no las escribas en el texto. Termina el turno.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["municipality", "activity"] },
          question: { type: "string", description: "La pregunta, en una oración corta." },
          municipality: { type: "string", description: "Al preguntar el rubro, el municipio ya elegido." },
        },
        required: ["field", "question"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["function"]["name"];
