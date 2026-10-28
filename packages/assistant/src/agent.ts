/**
 * El bucle del agente: el modelo lee la conversación, llama a herramientas sobre nuestros datos y escribe un texto
 * corto. Los bloques que dibuja el widget (pasos, tasa, preguntas, "no se publica") se arman acá con los resultados
 * de las herramientas, nunca con las palabras del modelo, así que cada enlace y cada cifra en pantalla es nuestra.
 */

import { INSTRUCTIONS } from "./instructions.ts";
import type { Knowledge } from "./knowledge.ts";
import { type AssistantEnv, type Completion, complete, type Fetcher, type WireMessage } from "./providers.ts";
import {
  findSitePage,
  getMunicipality,
  SITE_TOOL_DEFINITIONS,
  type SiteData,
  searchLaws,
  searchPeople,
  searchPurchases,
  searchUnpublishedCatalog,
} from "./site-data.ts";
import {
  activityOptions,
  asksAboutFee,
  type FeeResult,
  feeActivities,
  findMunicipality,
  findTradeFee,
  getProcedure,
  listProcedures,
  normalize,
  type ProcedureResult,
  searchUnpublished,
  TOOL_DEFINITIONS,
  type UnpublishedResult,
} from "./tools.ts";
import type { AssistantReply, Block, ChatMessage, DataCard, Gap, Progress } from "./types.ts";

/** Llamadas al modelo por respuesta: alcanzan para pedir el trámite y la tasa, y evitan que un bucle gaste tokens. */
const MAX_STEPS = 4;

/** Tarjetas con datos del sitio por respuesta: una o dos contestan; más es una página, y para eso está el enlace. */
const MAX_CARDS = 2;

/** Las herramientas de Aco: las de trámites y las de lo que publica el sitio. */
const ALL_TOOLS = [...TOOL_DEFINITIONS, ...SITE_TOOL_DEFINITIONS];
const SITE_TOOLS = new Set<string>(SITE_TOOL_DEFINITIONS.map((t) => t.function.name));

const formatPesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

interface Collected {
  procedure?: ProcedureResult;
  fee?: FeeResult;
  unpublished?: UnpublishedResult;
  /** Datos del sitio para mostrar (proveedores, autoridades, un municipio…), armados por las herramientas. */
  cards: DataCard[];
  ask?: { field: "municipality" | "activity"; options?: { id: string; label: string; words?: string[] }[]; question: string };
  gaps: Gap[];
  /** De la conversación: el último municipio que nombró la persona y si preguntó por plata. */
  context: { municipality: string | null; asksFee: boolean; asksPay: boolean };
}

/** Palabras que preguntan cuánto gana alguien: entonces un sueldo que no se publica se muestra como "no se publica". */
const PAY_WORDS = /\b(gana|ganan|cobra|cobran|sueldo|sueldos|salario|salarios|dieta|dietas|remuneracion)\b/;
const asksAboutPay = (texts: string[]) => texts.some((t) => PAY_WORDS.test(normalize(t)));

/** Texto libre de las herramientas, acortado y normalizado antes de guardarlo como faltante. */
const gapValue = (text: string) => normalize(text).slice(0, 40);

function addGap(c: Collected, gap: Gap) {
  if (!gap.value || c.gaps.some((g) => g.kind === gap.kind && g.municipality === gap.municipality && g.value === gap.value)) return;
  c.gaps.push(gap);
}

/** Las opciones de "¿qué vas a vender?": para la tasa, solo lo que tenemos ahí; para los pasos, cualquier actividad común. */
function askActivity(k: Knowledge, municipality: string, c: Collected) {
  const flow = k.flows.find((f) => f.municipality === municipality && f.id === (c.procedure?.flow ?? "abrir-un-comercio"));
  if (!flow) return { error: "No hace falta el rubro: ese municipio no está relevado. Decilo y respondé con lo que hay." };
  if (!c.context.asksFee) return { options: activityOptions(k, flow) };
  if (!flow.fee?.available) return { error: "No hace falta el rubro: en ese municipio no se puede dar un monto. Decí por qué." };
  const options = feeActivities(k, municipality).map((a) => ({
    id: a.id,
    label: a.name,
    ...(k.activities.find((x) => x.id === a.id)?.words ? { words: k.activities.find((x) => x.id === a.id)!.words } : {}),
  }));
  return { options };
}

function addCard(c: Collected, card: DataCard | undefined) {
  if (card && c.cards.length < MAX_CARDS && !c.cards.some((x) => x.title === card.title && x.link.href === card.link.href))
    c.cards.push(card);
}

/** Herramientas sobre los datos del sitio: la tarjeta va a la pantalla, los mismos hechos (sin ella) al modelo. */
function runSiteTool(d: SiteData, name: string, args: Record<string, string>, c: Collected): unknown {
  const withoutCard = <T extends { card?: DataCard }>(r: T) => {
    addCard(c, r.card);
    const { card: _, ...rest } = r;
    return rest;
  };
  switch (name) {
    case "find_site_page":
      return withoutCard(findSitePage(d, args));
    case "search_purchases":
      return withoutCard(searchPurchases(d, args));
    case "search_people": {
      const r = searchPeople(d, args);
      // Preguntó cuánto gana alguien y no se publica: decir quién no lo publica, con "Pedir el dato".
      if (c.context.asksPay) {
        const missing = r.people.find((p) => p.payUnpublished)?.payUnpublished;
        if (missing) c.unpublished = { matches: [...(c.unpublished?.matches ?? []), { ...missing, municipality: "" }] };
      }
      return withoutCard(r);
    }
    case "get_municipality":
      return withoutCard(getMunicipality(d, args));
    case "search_laws":
      return withoutCard(searchLaws(d, args));
    default:
      return { error: `No existe la herramienta ${name}` };
  }
}

async function runTool(
  k: Knowledge,
  site: (() => Promise<SiteData | null>) | undefined,
  name: string,
  rawArgs: string,
  collected: Collected,
): Promise<unknown> {
  let args: Record<string, string> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Argumentos inválidos" };
  }
  if (SITE_TOOLS.has(name)) {
    const d = await site?.();
    if (!d) return { error: "Los datos del sitio no están disponibles ahora. Decilo y ofrecé el link a la sección." };
    return runSiteTool(d, name, args, collected);
  }
  switch (name) {
    case "list_procedures":
      return listProcedures(k);
    case "get_procedure": {
      const p = getProcedure(k, args);
      collected.procedure = p;
      const municipality = findMunicipality(p.municipality) ?? undefined;
      if (!p.known) addGap(collected, { kind: "tramite", municipality, value: gapValue(p.flow) });
      else if (!p.covered && municipality) addGap(collected, { kind: "municipio", municipality, value: p.flow });
      return p;
    }
    case "find_trade_fee": {
      // La tasa se muestra solo cuando la persona preguntó por plata: si no, el modelo ni recibe los montos.
      if (!collected.context.asksFee) return { error: "La persona no preguntó por la tasa: no la busques ni la menciones." };
      const f = findTradeFee(k, args);
      collected.fee = f;
      const municipality = findMunicipality(f.municipality) ?? undefined;
      if (f.status === "not_surveyed" && municipality) addGap(collected, { kind: "municipio", municipality, value: "tasa-de-comercio" });
      if (f.status === "unknown_activity" && f.asked) addGap(collected, { kind: "rubro", municipality, value: gapValue(f.asked) });
      return f;
    }
    case "search_unpublished": {
      // Los faltantes propios de los trámites y el catálogo del sitio de lo que el Estado no publica (/no-publicado).
      const own = searchUnpublished(k, args).matches;
      const d = await site?.();
      const catalog = d ? searchUnpublishedCatalog(d, args.topic ?? "").map((u) => ({ ...u, municipality: "" })) : [];
      collected.unpublished = { matches: [...own, ...catalog] };
      return collected.unpublished;
    }
    case "ask_user": {
      if (args.field !== "activity") {
        collected.ask = { field: "municipality", question: String(args.question ?? "") };
        return { ok: true };
      }
      const municipality =
        findMunicipality(args.municipality ?? "") ??
        findMunicipality(collected.fee?.municipality ?? "") ??
        findMunicipality(collected.procedure?.municipality ?? "") ??
        collected.context.municipality;
      if (!municipality) return { error: "Primero preguntá el municipio." };
      const r = askActivity(k, municipality, collected);
      if ("error" in r) return r;
      collected.ask = { field: "activity", options: r.options, question: String(args.question ?? "") };
      return { ok: true };
    }
    default:
      return { error: `No existe la herramienta ${name}` };
  }
}

/** La tarjeta de la tasa, a partir de lo que devolvió find_trade_fee. Null si no hay un monto para mostrar. */
function feeCard(f: FeeResult): Block | null {
  if (f.status !== "found" || !f.activity || !f.matches.length) return null;
  return {
    type: "fee",
    fee: {
      municipality: f.municipality,
      activity: f.activity.name,
      lines: f.matches.map((m) => ({ name: m.activity, min: m.min, max: m.max })),
      period: f.period ?? "",
      ...(f.year ? { year: f.year } : {}),
      ...(f.note ? { note: f.note } : {}),
      source: { label: f.rule ?? "Ordenanza tarifaria", href: f.href ?? "" },
    },
  };
}

/** Bloques para el widget, a partir de lo que devolvieron las herramientas. */
export function buildBlocks(k: Knowledge, c: Collected): Block[] {
  if (c.ask)
    return c.ask.field === "municipality" ? [{ type: "ask_municipality" }] : [{ type: "ask_activity", options: c.ask.options ?? [] }];
  const blocks: Block[] = [];
  const p = c.procedure;
  if (p) {
    const steps = p.covered ? p.steps : p.general_steps;
    // Una pregunta solo por la tasa no necesita los pasos nacionales y provinciales de un municipio que no tenemos.
    const onlyFee = !p.covered && c.fee && c.context.asksFee;
    if (steps?.length && !onlyFee) {
      const title = k.flows.find((f) => f.id === p.flow)?.title;
      blocks.push({
        type: "steps",
        flow: p.flow,
        municipality: p.municipality,
        steps: steps.map((s) => ({ level: s.level, title: s.title, detail: s.detail, href: s.href, agency: s.agency })),
        verified: p.verified ?? "",
        // Para la carpeta en PDF: cómo se llama el trámite, la actividad elegida y lo que no se publica.
        ...(title ? { title } : {}),
        ...(p.covered && p.activity ? { activity: p.activity.name } : {}),
        ...(p.covered && p.unpublished?.length ? { unpublished: p.unpublished } : {}),
      });
    }
  }
  if (c.fee && c.context.asksFee) {
    const card = feeCard(c.fee);
    if (card) blocks.push(card);
    // Una actividad que no tenemos ahí: ofrecer las que sí, para que la persona no se quede sin camino.
    if (c.fee.status === "unknown_activity" && c.fee.available?.length) {
      blocks.push({
        type: "ask_activity",
        options: c.fee.available.map((a) => ({ id: a.id, label: a.name, words: k.activities.find((x) => x.id === a.id)?.words })),
      });
    }
  }
  for (const card of c.cards) blocks.push({ type: "data", card });
  // Un "Pedir el dato" por organismo, y solo los que importan acá: sin municipio, los organismos provinciales y
  // nacionales; con uno, también ese municipio. Antes, el mismo ítem repetido en varios recorridos aparecía una vez por
  // municipio.
  const where = c.context.municipality;
  const agencies = new Set<string>();
  for (const u of c.unpublished?.matches ?? []) {
    const own = u.municipality;
    const municipal = /^Municipalidad/i.test(u.agency);
    if (municipal && own && (!where || own !== where)) continue;
    if (agencies.has(u.agency) || agencies.size >= 2) continue;
    agencies.add(u.agency);
    blocks.push({ type: "unpublished", what: u.what, agency: u.agency });
  }
  return blocks;
}

function outcomeOf(text: string, blocks: Block[], c: Collected): AssistantReply["outcome"] {
  if (c.ask || blocks.some((b) => b.type === "ask_activity" || b.type === "ask_municipality")) return "ask";
  if (blocks.some((b) => b.type === "fee")) return "fee";
  if (blocks.some((b) => b.type === "steps")) return "steps";
  if (blocks.some((b) => b.type === "data")) return "data";
  if (blocks.some((b) => b.type === "unpublished")) return "unpublished";
  return text ? "answer" : "no_answer";
}

/** Hechos para el texto cuando faltan las palabras propias del modelo (solo llamó a herramientas). */
function fallbackText(c: Collected): string {
  if (c.ask) return c.ask.question;
  const f = c.fee;
  if (f && c.context.asksFee) {
    if (f.status === "found" && f.matches[0]) {
      const m = f.matches[0];
      return `En ${f.municipality}, el derecho de comercio de ${f.activity?.name.toLowerCase()} va de ${formatPesos(m.min)} a ${formatPesos(m.max)}${f.period ? ` por ${f.period}` : ""} según la categoría.`;
    }
    if (f.status === "unknown_activity") return `${f.note ?? ""} Estos son los rubros que tenemos en ${f.municipality}.`.trim();
    return f.note ?? "";
  }
  const p = c.procedure;
  if (p && !p.covered) return p.note ?? "";
  if (p?.covered) return `Estos son los pasos para ${p.flow.replaceAll("-", " ")} en ${p.municipality}.`;
  return "";
}

export interface RunOptions {
  fetcher?: Fetcher;
  /** Lo que la gente preguntó y todavía no tenemos (un municipio, una actividad, un trámite), para guardarlo para después. */
  onGap?: (gap: Gap) => void;
  /** Para logs y tests: qué proveedor respondió cada llamada. */
  onCompletion?: (c: Completion) => void;
  /** Lo que Aco está haciendo ahora, para el widget: leer la pregunta, ejecutar una herramienta o escribir la respuesta. */
  onStatus?: (status: Progress) => void;
  /** Lo que publica el sitio (/data/asistente.json), cargado solo cuando una herramienta lo necesita. */
  siteData?: () => Promise<SiteData | null>;
}

export async function runAgent(k: Knowledge, env: AssistantEnv, history: ChatMessage[], opts: RunOptions = {}): Promise<AssistantReply> {
  const messages: WireMessage[] = [
    { role: "system", content: INSTRUCTIONS },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const said = history.filter((m) => m.role === "user").map((m) => m.content);
  const collected: Collected = {
    gaps: [],
    cards: [],
    context: {
      municipality:
        said
          .map((t) => findMunicipality(t))
          .filter(Boolean)
          .at(-1) ?? null,
      asksFee: asksAboutFee(said),
      asksPay: asksAboutPay(said),
    },
  };
  let text = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    // Último paso: sin herramientas, así que el modelo tiene que escribir.
    const last = step === MAX_STEPS - 1;
    opts.onStatus?.(step === 0 ? { phase: "thinking" } : last ? { phase: "writing" } : { phase: "thinking" });
    const c = await complete(env, { messages, tools: last ? [] : ALL_TOOLS }, opts.fetcher, last ? "answer" : "tools");
    opts.onCompletion?.(c);
    if (!c.toolCalls.length) {
      text = (c.content ?? "").trim();
      // Con un modelo de redacción propio, el texto posterior a las herramientas lo reescribe ese modelo. Sigue dentro de
      // MAX_STEPS llamadas: esto solo pasa antes del último paso.
      if (env.ASSISTANT_MODEL_ANSWER && step > 0 && !last) {
        opts.onStatus?.({ phase: "writing" });
        const answer = await complete(env, { messages, tools: [] }, opts.fetcher, "answer");
        opts.onCompletion?.(answer);
        text = (answer.content ?? "").trim() || text;
      }
      break;
    }
    messages.push({ role: "assistant", content: c.content, tool_calls: c.toolCalls });
    for (const call of c.toolCalls) {
      opts.onStatus?.({ phase: "tool", tool: call.function.name });
      const result = await runTool(k, opts.siteData, call.function.name, call.function.arguments, collected);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    if (collected.ask) break;
  }
  if (collected.ask) text = collected.ask.question || text;
  if (!text) text = fallbackText(collected);
  const blocks = buildBlocks(k, collected);
  for (const gap of collected.gaps) opts.onGap?.(gap);
  const p = collected.procedure;
  const municipality = p?.municipality || collected.fee?.municipality;
  return {
    text,
    blocks,
    outcome: outcomeOf(text, blocks, collected),
    ...(p ? { flow: p.flow } : {}),
    ...(municipality ? { municipality } : {}),
  };
}
