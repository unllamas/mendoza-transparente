/**
 * The agent loop: the model reads the conversation, calls tools over our data and writes a short text. The blocks
 * the widget draws (steps, fee, questions, "no se publica") are built here from the tool results, never from the
 * model's words, so every link and figure on screen is ours.
 */

import { INSTRUCTIONS } from "./instructions.ts";
import type { Knowledge } from "./knowledge.ts";
import { type AssistantEnv, type Completion, complete, type Fetcher, type WireMessage } from "./providers.ts";
import {
  type FeeResult,
  findTradeFee,
  getProcedure,
  listProcedures,
  type ProcedureResult,
  searchUnpublished,
  TOOL_DEFINITIONS,
  type UnpublishedResult,
} from "./tools.ts";
import type { AssistantReply, Block, ChatMessage } from "./types.ts";

/** Model calls per answer: enough to ask for the procedure and the fee, and to stop a loop from burning tokens. */
const MAX_STEPS = 4;

const formatPesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

interface Collected {
  procedure?: ProcedureResult;
  fee?: FeeResult;
  unpublished?: UnpublishedResult;
  ask?: { field: "municipality" | "activity"; question: string };
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
    case "get_procedure":
      collected.procedure = getProcedure(k, args);
      return collected.procedure;
    case "find_trade_fee":
      collected.fee = findTradeFee(k, args);
      return collected.fee;
    case "search_unpublished":
      collected.unpublished = searchUnpublished(k, args);
      return collected.unpublished;
    case "ask_user":
      collected.ask = { field: args.field === "activity" ? "activity" : "municipality", question: String(args.question ?? "") };
      return { ok: true };
    default:
      return { error: `No existe la herramienta ${name}` };
  }
}

/** How to read the fee, from the catalog (the provisional rate while the permit is pending, for example). */
const feeNote = (p: ProcedureResult) => p.costs?.find((c) => c.concept === "Derecho de comercio")?.detail;

/** Blocks for the widget, from what the tools returned. */
export function buildBlocks(c: Collected): Block[] {
  if (c.ask) {
    if (c.ask.field === "municipality") return [{ type: "ask_municipality" }];
    const options = c.procedure?.activities ?? [];
    return [{ type: "ask_activity", options: [...options.map((o) => ({ id: o.id, label: o.name })), { id: "otro", label: "Otro rubro" }] }];
  }
  const blocks: Block[] = [];
  const p = c.procedure;
  if (p) {
    const steps = p.covered ? p.steps : p.general_steps;
    if (steps?.length) {
      const match = c.fee?.found ? c.fee.matches[0] : undefined;
      blocks.push({
        type: "steps",
        flow: p.flow,
        municipality: p.municipality,
        steps: steps.map((s) => ({ level: s.level, title: s.title, detail: s.detail, href: s.href, agency: s.agency })),
        ...(match && c.fee
          ? {
              fee: {
                label: `Derecho de comercio (${match.activity.toLowerCase()})${c.fee.year ? `, ${c.fee.year}` : ""}${c.fee.period ? `, por ${c.fee.period}` : ""}`,
                min: match.min,
                max: match.max,
                ...([feeNote(p), c.fee.note].filter(Boolean).length ? { note: [feeNote(p), c.fee.note].filter(Boolean).join(" ") } : {}),
                source: { label: c.fee.rule ?? "Ordenanza tarifaria", href: c.fee.href ?? "" },
              },
            }
          : {}),
        verified: p.verified ?? "",
      });
    }
  }
  for (const u of c.unpublished?.matches ?? []) blocks.push({ type: "unpublished", what: u.what, agency: u.agency });
  return blocks;
}

function outcomeOf(text: string, blocks: Block[], c: Collected): AssistantReply["outcome"] {
  if (c.ask) return "ask";
  if (blocks.some((b) => b.type === "steps")) return "steps";
  if (blocks.some((b) => b.type === "unpublished")) return "unpublished";
  return text ? "answer" : "no_answer";
}

/** Facts for the text when the model's own words are missing (it only called tools). */
function fallbackText(c: Collected): string {
  if (c.ask) return c.ask.question;
  const p = c.procedure;
  if (p && !p.covered) return p.note ?? "";
  if (p?.covered) {
    const fee = c.fee?.found ? c.fee.matches[0] : undefined;
    const base = `Estos son los pasos para ${p.flow.replaceAll("-", " ")} en ${p.municipality}.`;
    return fee
      ? `${base} El derecho de comercio va de ${formatPesos(fee.min)} a ${formatPesos(fee.max)}${c.fee?.period ? ` por ${c.fee.period}` : ""} según la categoría.`
      : base;
  }
  return "";
}

export interface RunOptions {
  fetcher?: Fetcher;
  /** For logs and tests: which provider answered each call. */
  onCompletion?: (c: Completion) => void;
}

export async function runAgent(k: Knowledge, env: AssistantEnv, history: ChatMessage[], opts: RunOptions = {}): Promise<AssistantReply> {
  const messages: WireMessage[] = [
    { role: "system", content: INSTRUCTIONS },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const collected: Collected = {};
  let text = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    // Last step: no tools, so the model has to write.
    const tools = step === MAX_STEPS - 1 ? [] : TOOL_DEFINITIONS;
    const c = await complete(env, { messages, tools }, opts.fetcher);
    opts.onCompletion?.(c);
    if (!c.toolCalls.length) {
      text = (c.content ?? "").trim();
      break;
    }
    messages.push({ role: "assistant", content: c.content, tool_calls: c.toolCalls });
    for (const call of c.toolCalls) {
      const result = runTool(k, call.function.name, call.function.arguments, collected);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    if (collected.ask) break;
  }
  if (collected.ask) text = collected.ask.question || text;
  if (!text) text = fallbackText(collected);
  const blocks = buildBlocks(collected);
  const p = collected.procedure;
  return {
    text,
    blocks,
    outcome: outcomeOf(text, blocks, collected),
    ...(p ? { flow: p.flow } : {}),
    ...(p?.municipality ? { municipality: p.municipality } : {}),
  };
}
