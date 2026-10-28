/**
 * The agent loop: the model reads the conversation, calls tools over our data and writes a short text. The blocks
 * the widget draws (steps, fee, questions, "no se publica") are built here from the tool results, never from the
 * model's words, so every link and figure on screen is ours.
 */

import { INSTRUCTIONS } from "./instructions.ts";
import type { Knowledge } from "./knowledge.ts";
import { type AssistantEnv, type Completion, complete, type Fetcher, type WireMessage } from "./providers.ts";
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
import type { AssistantReply, Block, ChatMessage, Gap, Progress } from "./types.ts";

/** Model calls per answer: enough to ask for the procedure and the fee, and to stop a loop from burning tokens. */
const MAX_STEPS = 4;

const formatPesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

interface Collected {
  procedure?: ProcedureResult;
  fee?: FeeResult;
  unpublished?: UnpublishedResult;
  ask?: { field: "municipality" | "activity"; options?: { id: string; label: string; words?: string[] }[]; question: string };
  gaps: Gap[];
  /** From the conversation: the last municipality the person named, and whether they asked about money. */
  context: { municipality: string | null; asksFee: boolean };
}

/** Free text from the tools, cut short and normalized before it is saved as a gap. */
const gapValue = (text: string) => normalize(text).slice(0, 40);

function addGap(c: Collected, gap: Gap) {
  if (!gap.value || c.gaps.some((g) => g.kind === gap.kind && g.municipality === gap.municipality && g.value === gap.value)) return;
  c.gaps.push(gap);
}

/** The options for "¿qué vas a vender?": for the fee, only what we have there; for the steps, any common activity. */
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

function runTool(k: Knowledge, name: string, rawArgs: string, collected: Collected): unknown {
  let args: Record<string, string> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Argumentos inválidos" };
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
      // The fee shows only when the person asked about money: otherwise the model does not even get the amounts.
      if (!collected.context.asksFee) return { error: "La persona no preguntó por la tasa: no la busques ni la menciones." };
      const f = findTradeFee(k, args);
      collected.fee = f;
      const municipality = findMunicipality(f.municipality) ?? undefined;
      if (f.status === "not_surveyed" && municipality) addGap(collected, { kind: "municipio", municipality, value: "tasa-de-comercio" });
      if (f.status === "unknown_activity" && f.asked) addGap(collected, { kind: "rubro", municipality, value: gapValue(f.asked) });
      return f;
    }
    case "search_unpublished":
      collected.unpublished = searchUnpublished(k, args);
      return collected.unpublished;
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

/** The fee card, from what find_trade_fee returned. Null unless there is an amount to show. */
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

/** Blocks for the widget, from what the tools returned. */
export function buildBlocks(k: Knowledge, c: Collected): Block[] {
  if (c.ask)
    return c.ask.field === "municipality" ? [{ type: "ask_municipality" }] : [{ type: "ask_activity", options: c.ask.options ?? [] }];
  const blocks: Block[] = [];
  const p = c.procedure;
  if (p) {
    const steps = p.covered ? p.steps : p.general_steps;
    // A question only about the fee does not need the national and provincial steps of a municipality we lack.
    const onlyFee = !p.covered && c.fee && c.context.asksFee;
    if (steps?.length && !onlyFee) {
      const title = k.flows.find((f) => f.id === p.flow)?.title;
      blocks.push({
        type: "steps",
        flow: p.flow,
        municipality: p.municipality,
        steps: steps.map((s) => ({ level: s.level, title: s.title, detail: s.detail, href: s.href, agency: s.agency })),
        verified: p.verified ?? "",
        // For the PDF folder: what the procedure is called, the activity picked and what is not published.
        ...(title ? { title } : {}),
        ...(p.covered && p.activity ? { activity: p.activity.name } : {}),
        ...(p.covered && p.unpublished?.length ? { unpublished: p.unpublished } : {}),
      });
    }
  }
  if (c.fee && c.context.asksFee) {
    const card = feeCard(c.fee);
    if (card) blocks.push(card);
    // An activity we do not have there: offer the ones we do, so the person is not left without a way forward.
    if (c.fee.status === "unknown_activity" && c.fee.available?.length) {
      blocks.push({
        type: "ask_activity",
        options: c.fee.available.map((a) => ({ id: a.id, label: a.name, words: k.activities.find((x) => x.id === a.id)?.words })),
      });
    }
  }
  // One "ask for it" per agency, and only the ones that matter here: without a municipality, the provincial and
  // national agencies; with one, also that municipality. The same item repeated across recorridos showed up once per
  // municipality before.
  const where = c.context.municipality;
  const agencies = new Set<string>();
  for (const u of c.unpublished?.matches ?? []) {
    const own = u.municipality;
    const municipal = /^Municipalidad/i.test(u.agency);
    if (municipal && (!where || own !== where)) continue;
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
  if (blocks.some((b) => b.type === "unpublished")) return "unpublished";
  return text ? "answer" : "no_answer";
}

/** Facts for the text when the model's own words are missing (it only called tools). */
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
  /** What people asked that we do not have yet (a municipality, an activity, a procedure), to save for later. */
  onGap?: (gap: Gap) => void;
  /** For logs and tests: which provider answered each call. */
  onCompletion?: (c: Completion) => void;
  /** What Aco is doing right now, for the widget: reading the question, running a tool or writing the answer. */
  onStatus?: (status: Progress) => void;
}

export async function runAgent(k: Knowledge, env: AssistantEnv, history: ChatMessage[], opts: RunOptions = {}): Promise<AssistantReply> {
  const messages: WireMessage[] = [
    { role: "system", content: INSTRUCTIONS },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const said = history.filter((m) => m.role === "user").map((m) => m.content);
  const collected: Collected = {
    gaps: [],
    context: {
      municipality:
        said
          .map((t) => findMunicipality(t))
          .filter(Boolean)
          .at(-1) ?? null,
      asksFee: asksAboutFee(said),
    },
  };
  let text = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    // Last step: no tools, so the model has to write.
    const last = step === MAX_STEPS - 1;
    opts.onStatus?.(step === 0 ? { phase: "thinking" } : last ? { phase: "writing" } : { phase: "thinking" });
    const c = await complete(env, { messages, tools: last ? [] : TOOL_DEFINITIONS }, opts.fetcher, last ? "answer" : "tools");
    opts.onCompletion?.(c);
    if (!c.toolCalls.length) {
      text = (c.content ?? "").trim();
      // With a writing model of its own, the text after the tools is rewritten by it. Still within MAX_STEPS calls:
      // this only happens before the last step.
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
      const result = runTool(k, call.function.name, call.function.arguments, collected);
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
