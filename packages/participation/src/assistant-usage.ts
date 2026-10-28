/**
 * Consumo del asistente (Aco) para el panel: cuánto gasta, en qué modelos, cuánto fallan los proveedores y cuánto tarda.
 * Lee `assistant_answers` y `assistant_calls` (migración 0007), que guardan modelo, tokens, costo y tiempo, sin texto.
 * Documentado en docs/procesos/asistente.md#consumo.
 *
 * El costo es el que informó el proveedor (OpenRouter lo manda en cada respuesta). Cuando no lo informó (el AI Gateway
 * no lo hace), se estima con los tokens y el precio público del modelo en el catálogo de OpenRouter; esas cifras se
 * marcan como estimadas. Un modelo sin precio público queda sin costo, y se cuentan sus llamadas.
 */

import type { Db } from "./db.ts";

/** Precio en USD por token, por id de modelo («anthropic/claude-haiku-5.5»). */
export type ModelPrices = Record<string, { prompt: number; completion: number }>;

export const USAGE_DAYS = 30;

export interface UsageTotals {
  answers: number;
  failedAnswers: number;
  calls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** Parte del costo que se estimó con los precios públicos, en vez de informarla el proveedor. */
  estimatedUsd: number;
  /** Llamadas con tokens pero sin costo informado ni precio público: su gasto no está en `costUsd`. */
  unpricedCalls: number;
  avgAnswerMs: number;
}

export interface UsageByModel {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  estimatedUsd: number;
  avgMs: number;
}

export interface UsageByProvider {
  provider: string;
  calls: number;
  failed: number;
  /** Los motivos de las fallas («http_429», «timeout»…), de más a menos. */
  failures: { status: string; n: number }[];
  avgMs: number;
}

export interface AssistantUsage {
  since: string;
  /** Uso real del widget en los últimos 30 días. */
  totals: UsageTotals;
  /** Gasto del widget desde el primer día del mes. */
  monthUsd: number;
  /** Lo que gastaron las evals en el mismo período (no está en `totals`). */
  evals: { answers: number; costUsd: number };
  byModel: UsageByModel[];
  byProvider: UsageByProvider[];
  byTask: { task: "tools" | "answer"; calls: number; costUsd: number }[];
  byDay: { day: string; answers: number; failed: number; costUsd: number }[];
  byOutcome: { key: string; n: number }[];
}

interface CallGroup {
  day: string;
  source: string;
  model: string;
  provider: string;
  task: "tools" | "answer";
  status: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  reportedUsd: number;
  unpricedPrompt: number;
  unpricedCompletion: number;
  unpricedCalls: number;
  ms: number;
}

interface AnswerGroup {
  day: string;
  source: string;
  ok: number;
  outcome: string;
  answers: number;
  ms: number;
}

/** Costo de un grupo de llamadas: lo informado más lo estimado con el precio público, si lo hay. */
function costOf(g: CallGroup, prices: ModelPrices) {
  const price = prices[g.model];
  const estimated = price ? g.unpricedPrompt * price.prompt + g.unpricedCompletion * price.completion : 0;
  return { total: g.reportedUsd + estimated, estimated, unpriced: price ? 0 : g.unpricedCalls };
}

const add = <K extends string>(map: Map<K, number>, key: K, n: number) => map.set(key, (map.get(key) ?? 0) + n);

export async function assistantUsage(db: Db, now: Date, prices: ModelPrices = {}): Promise<AssistantUsage> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const windowStart = new Date(Math.min(now.getTime() - USAGE_DAYS * 86_400_000, monthStart.getTime()));
  const since = windowStart.toISOString();
  const month = monthStart.toISOString().slice(0, 10);
  const recentFrom = new Date(now.getTime() - USAGE_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [calls, answers] = await Promise.all([
    db
      .prepare(
        `SELECT substr(a.created_at, 1, 10) AS day, a.source AS source, c.model AS model, c.provider AS provider, c.task AS task,
           c.status AS status, COUNT(*) AS calls, COALESCE(SUM(c.prompt_tokens), 0) AS promptTokens,
           COALESCE(SUM(c.completion_tokens), 0) AS completionTokens, COALESCE(SUM(c.cost_usd), 0) AS reportedUsd,
           COALESCE(SUM(CASE WHEN c.cost_usd IS NULL THEN c.prompt_tokens END), 0) AS unpricedPrompt,
           COALESCE(SUM(CASE WHEN c.cost_usd IS NULL THEN c.completion_tokens END), 0) AS unpricedCompletion,
           SUM(c.cost_usd IS NULL AND (c.prompt_tokens > 0 OR c.completion_tokens > 0)) AS unpricedCalls,
           COALESCE(SUM(c.ms), 0) AS ms
         FROM assistant_calls c JOIN assistant_answers a ON a.id = c.answer_id
         WHERE c.created_at >= ? GROUP BY 1, 2, 3, 4, 5, 6`,
      )
      .bind(since)
      .all<CallGroup>(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, source, ok, COALESCE(outcome, '') AS outcome, COUNT(*) AS answers,
           COALESCE(SUM(ms), 0) AS ms
         FROM assistant_answers WHERE created_at >= ? GROUP BY 1, 2, 3, 4`,
      )
      .bind(since)
      .all<AnswerGroup>(),
  ]);

  const totals: UsageTotals = {
    answers: 0,
    failedAnswers: 0,
    calls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    estimatedUsd: 0,
    unpricedCalls: 0,
    avgAnswerMs: 0,
  };
  let monthUsd = 0;
  const evals = { answers: 0, costUsd: 0 };
  const models = new Map<string, UsageByModel & { ms: number }>();
  const providers = new Map<string, { calls: number; failed: number; ms: number; failures: Map<string, number> }>();
  const taskCost = new Map<"tools" | "answer", number>();
  const taskCalls = new Map<"tools" | "answer", number>();
  const dayCost = new Map<string, number>();
  const dayAnswers = new Map<string, number>();
  const dayFailed = new Map<string, number>();
  const outcomes = new Map<string, number>();

  for (const g of calls.results) {
    const cost = costOf(g, prices);
    if (g.source === "evals") {
      if (g.day >= recentFrom) evals.costUsd += cost.total;
      continue;
    }
    if (g.day >= month) monthUsd += cost.total;
    if (g.day < recentFrom) continue;
    const ok = g.status === "ok";
    totals.calls += g.calls;
    if (!ok) totals.failedCalls += g.calls;
    totals.promptTokens += g.promptTokens;
    totals.completionTokens += g.completionTokens;
    totals.costUsd += cost.total;
    totals.estimatedUsd += cost.estimated;
    totals.unpricedCalls += cost.unpriced;

    const m = models.get(g.model) ?? {
      model: g.model,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      estimatedUsd: 0,
      avgMs: 0,
      ms: 0,
    };
    if (ok) {
      m.calls += g.calls;
      m.ms += g.ms;
    }
    m.promptTokens += g.promptTokens;
    m.completionTokens += g.completionTokens;
    m.costUsd += cost.total;
    m.estimatedUsd += cost.estimated;
    models.set(g.model, m);

    const p = providers.get(g.provider) ?? { calls: 0, failed: 0, ms: 0, failures: new Map<string, number>() };
    p.calls += g.calls;
    p.ms += g.ms;
    if (!ok) {
      p.failed += g.calls;
      add(p.failures, g.status, g.calls);
    }
    providers.set(g.provider, p);

    add(taskCalls, g.task, g.calls);
    add(taskCost, g.task, cost.total);
    add(dayCost, g.day, cost.total);
  }

  let answerMs = 0;
  for (const a of answers.results) {
    if (a.day < recentFrom) continue;
    if (a.source === "evals") {
      evals.answers += a.answers;
      continue;
    }
    totals.answers += a.answers;
    answerMs += a.ms;
    add(dayAnswers, a.day, a.answers);
    if (a.ok) add(outcomes, a.outcome, a.answers);
    else {
      totals.failedAnswers += a.answers;
      add(dayFailed, a.day, a.answers);
    }
  }
  totals.avgAnswerMs = totals.answers ? Math.round(answerMs / totals.answers) : 0;

  const days = [...new Set([...dayAnswers.keys(), ...dayCost.keys()])].sort().reverse();
  return {
    since: `${recentFrom}T00:00:00.000Z`,
    totals,
    monthUsd,
    evals,
    byModel: [...models.values()]
      .map(({ ms, ...m }) => ({ ...m, avgMs: m.calls ? Math.round(ms / m.calls) : 0 }))
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    byProvider: [...providers.entries()]
      .map(([provider, p]) => ({
        provider,
        calls: p.calls,
        failed: p.failed,
        failures: [...p.failures.entries()].map(([status, n]) => ({ status, n })).sort((a, b) => b.n - a.n),
        avgMs: p.calls ? Math.round(p.ms / p.calls) : 0,
      }))
      .sort((a, b) => b.calls - a.calls),
    byTask: (["tools", "answer"] as const)
      .filter((t) => taskCalls.has(t))
      .map((task) => ({ task, calls: taskCalls.get(task) ?? 0, costUsd: taskCost.get(task) ?? 0 })),
    byDay: days.map((day) => ({
      day,
      answers: dayAnswers.get(day) ?? 0,
      failed: dayFailed.get(day) ?? 0,
      costUsd: dayCost.get(day) ?? 0,
    })),
    byOutcome: [...outcomes.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
  };
}

/**
 * Precios públicos de los modelos, del catálogo de OpenRouter (sin clave). Devuelve {} si no responde: el panel muestra
 * igual lo informado y avisa cuántas llamadas quedaron sin precio.
 */
export type PriceFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function loadModelPrices(fetcher: PriceFetcher = fetch): Promise<ModelPrices> {
  try {
    const res = await fetcher("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    const body = (await res.json()) as { data?: { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }[] };
    const prices: ModelPrices = {};
    for (const m of body.data ?? []) {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      if (typeof m.id === "string" && Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0)
        prices[m.id] = { prompt, completion };
    }
    return prices;
  } catch {
    return {};
  }
}
