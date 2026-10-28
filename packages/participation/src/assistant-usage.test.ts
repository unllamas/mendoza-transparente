import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { assistantUsage, loadModelPrices } from "./assistant-usage.ts";
import type { Db } from "./db.ts";
import { localDb } from "./local-db.ts";
import { handlePanel } from "./panel-api.ts";

let db: Db;
beforeEach(() => {
  db = localDb(new Database(":memory:") as never);
});

const NOW = new Date("2026-10-28T12:00:00Z");

const answer = (id: string, at: string, opts: { source?: string; ok?: number; outcome?: string | null; ms?: number } = {}) =>
  db
    .prepare("INSERT INTO assistant_answers (id, created_at, source, ok, outcome, calls, ms) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, at, opts.source ?? "web", opts.ok ?? 1, opts.outcome ?? "steps", 1, opts.ms ?? 2000)
    .run();
const call = (
  answerId: string,
  at: string,
  c: {
    model?: string;
    provider?: string;
    task?: string;
    status?: string;
    prompt?: number | null;
    completion?: number | null;
    cost?: number | null;
    ms?: number;
  },
) =>
  db
    .prepare(
      `INSERT INTO assistant_calls (answer_id, created_at, task, provider, model, status, prompt_tokens, completion_tokens, cost_usd, ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      answerId,
      at,
      c.task ?? "tools",
      c.provider ?? "gateway",
      c.model ?? "anthropic/claude-haiku-5.5",
      c.status ?? "ok",
      c.prompt === undefined ? 1000 : c.prompt,
      c.completion === undefined ? 100 : c.completion,
      c.cost ?? null,
      c.ms ?? 900,
    )
    .run();

describe("assistant usage", () => {
  test("adds reported cost and estimates the rest with public prices", async () => {
    await answer("a", "2026-10-27T10:00:00Z");
    await call("a", "2026-10-27T10:00:00Z", {
      provider: "gateway",
      status: "http_429",
      prompt: null,
      completion: null,
      ms: 100,
    });
    await call("a", "2026-10-27T10:00:00Z", { provider: "openrouter", cost: 0.002 });
    await answer("b", "2026-10-26T10:00:00Z", { outcome: "fee" });
    await call("b", "2026-10-26T10:00:00Z", { provider: "gateway", task: "answer" });
    await answer("c", "2026-10-26T11:00:00Z", { ok: 0, outcome: null });

    const prices = { "anthropic/claude-haiku-5.5": { prompt: 0.000001, completion: 0.000005 } };
    const u = await assistantUsage(db, NOW, prices);
    expect(u.totals.answers).toBe(3);
    expect(u.totals.failedAnswers).toBe(1);
    expect(u.totals.calls).toBe(3);
    expect(u.totals.failedCalls).toBe(1);
    // 0.002 informado + (1000 × 0.000001 + 100 × 0.000005) estimado.
    expect(u.totals.costUsd).toBeCloseTo(0.0035);
    expect(u.totals.estimatedUsd).toBeCloseTo(0.0015);
    expect(u.totals.unpricedCalls).toBe(0);
    expect(u.monthUsd).toBeCloseTo(0.0035);
    expect(u.byModel).toEqual([
      expect.objectContaining({ model: "anthropic/claude-haiku-5.5", calls: 2, promptTokens: 2000, costUsd: expect.closeTo(0.0035) }),
    ]);
    const gateway = u.byProvider.find((p) => p.provider === "gateway");
    expect(gateway).toMatchObject({ calls: 2, failed: 1, failures: [{ status: "http_429", n: 1 }] });
    expect(u.byTask.map((t) => t.task)).toEqual(["tools", "answer"]);
    expect(u.byOutcome).toEqual([
      { key: "fee", n: 1 },
      { key: "steps", n: 1 },
    ]);
    expect(u.byDay.map((d) => d.day)).toEqual(["2026-10-27", "2026-10-26"]);
  });

  test("keeps the evals apart, counts calls with no price and leaves out old rows", async () => {
    await answer("e", "2026-10-27T10:00:00Z", { source: "evals" });
    await call("e", "2026-10-27T10:00:00Z", { cost: 0.01 });
    await answer("w", "2026-10-27T10:00:00Z");
    await call("w", "2026-10-27T10:00:00Z", { model: "someone/unknown-model" });
    await answer("old", "2026-08-01T10:00:00Z");
    await call("old", "2026-08-01T10:00:00Z", { cost: 5 });

    const u = await assistantUsage(db, NOW, {});
    expect(u.evals).toEqual({ answers: 1, costUsd: 0.01 });
    expect(u.totals.answers).toBe(1);
    expect(u.totals.costUsd).toBe(0);
    expect(u.totals.unpricedCalls).toBe(1);
    expect(u.monthUsd).toBe(0);
  });

  test("the panel serves it, and a price list that fails does not break it", async () => {
    await answer("a", "2026-10-27T10:00:00Z");
    await call("a", "2026-10-27T10:00:00Z", { cost: 0.002 });
    const res = await handlePanel(
      new Request("https://panel.example.com/api/panel/assistant/usage"),
      db,
      { email: "equipo@example.com" },
      {
        modelPrices: () => Promise.reject(new Error("sin red")),
      },
    );
    if (!res) throw new Error("el panel no respondió");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { totals: { answers: number } }).totals.answers).toBe(1);
  });

  test("reads public prices from the catalog and ignores what does not parse", async () => {
    const body = {
      data: [
        { id: "anthropic/claude-haiku-5.5", pricing: { prompt: "0.000001", completion: "0.000005" } },
        { id: "broken", pricing: { prompt: "gratis" } },
      ],
    };
    const prices = await loadModelPrices(async () => new Response(JSON.stringify(body)));
    expect(prices).toEqual({ "anthropic/claude-haiku-5.5": { prompt: 0.000001, completion: 0.000005 } });
    expect(await loadModelPrices(async () => new Response("", { status: 500 }))).toEqual({});
    expect(await loadModelPrices(async () => Promise.reject(new Error("x")))).toEqual({});
  });
});
