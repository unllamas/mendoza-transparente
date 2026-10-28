import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { procedureForModel } from "./agent.ts";
import { handleAssistant } from "./http.ts";
import type { Knowledge } from "./knowledge.ts";
import { issuePass } from "./pass.ts";
import { type Attempt, complete } from "./providers.ts";
import { type Limits, limitsForHost, PRODUCTION_LIMITS, type QuotaDb, takeQuota } from "./quota.ts";
import { getProcedure } from "./tools.ts";

/** D1 sobre SQLite en memoria, con la migración real: así se prueba el SQL que corre en producción. */
function sqliteDb(): QuotaDb & { db: Database } {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(import.meta.dirname, "../../participation/migrations/0008_limites_del_asistente.sql"), "utf8"));
  return {
    db,
    prepare: (sql) => ({
      bind: (...values) => ({
        run: async () => db.prepare(sql).run(...(values as never[])),
        all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
      }),
    }),
  };
}

/** El conocimiento ya armado, el mismo que usa la función. */
const k = JSON.parse(readFileSync(join(import.meta.dirname, "knowledge.json"), "utf8")) as Knowledge;

const SMALL: Limits = { name: "production", perIpWindow: 3, perIpDay: 5, perSiteDay: 8, perPass: 2 };
const NOW = Date.parse("2026-10-28T15:00:00Z");

describe("límites de uso", () => {
  test("producción solo en el dominio propio; las direcciones pages.dev de producción no atienden a Aco", () => {
    expect(limitsForHost("mendoza-transparente.com")?.name).toBe("production");
    expect(limitsForHost("dev.mendoza-transparente.pages.dev")?.name).toBe("preview");
    expect(limitsForHost("localhost:8788")?.name).toBe("preview");
    expect(limitsForHost("mendoza-transparente.pages.dev")).toBeNull();
    expect(limitsForHost("3f2a1b.mendoza-transparente.pages.dev")).toBeNull();
    expect(limitsForHost("www.mendoza-transparente.com")).toBeNull();
    expect(limitsForHost("mendoza-transparente.com", "500")?.perSiteDay).toBe(500);
    expect(limitsForHost("mendoza-transparente.com", "nada")?.perSiteDay).toBe(PRODUCTION_LIMITS.perSiteDay);
  });

  test("corta la ráfaga por IP y vuelve a dejar pasar en la ventana siguiente", async () => {
    const q = sqliteDb();
    const who = { ipHash: "a" };
    for (let i = 0; i < 3; i++) expect(await takeQuota(q, SMALL, who, NOW)).toBeNull();
    expect(await takeQuota(q, SMALL, who, NOW)).toBe("burst");
    // Otra IP no se ve afectada.
    expect(await takeQuota(q, SMALL, { ipHash: "b" }, NOW)).toBeNull();
    expect(await takeQuota(q, SMALL, who, NOW + 11 * 60_000)).toBeNull();
  });

  test("un corte no escribe: insistir no suma", async () => {
    const q = sqliteDb();
    for (let i = 0; i < 3; i++) await takeQuota(q, SMALL, { ipHash: "a" }, NOW);
    for (let i = 0; i < 10; i++) await takeQuota(q, SMALL, { ipHash: "a" }, NOW);
    const site = q.db.query("SELECT count FROM assistant_quota WHERE bucket LIKE '%:site:%'").get() as { count: number };
    expect(site.count).toBe(3);
  });

  test("tope diario por IP, por conversación y del sitio", async () => {
    const q = sqliteDb();
    let t = NOW;
    const step = () => (t += 11 * 60_000);
    for (let i = 0; i < 5; i++) expect(await takeQuota(q, SMALL, { ipHash: "a" }, step())).toBeNull();
    expect(await takeQuota(q, SMALL, { ipHash: "a" }, step())).toBe("ip_day");

    expect(await takeQuota(q, SMALL, { ipHash: "c", passId: "p1" }, t)).toBeNull();
    expect(await takeQuota(q, SMALL, { ipHash: "c", passId: "p1" }, t)).toBeNull();
    expect(await takeQuota(q, SMALL, { ipHash: "c", passId: "p1" }, t)).toBe("session");

    expect(await takeQuota(q, SMALL, { ipHash: "d" }, t)).toBeNull();
    expect(await takeQuota(q, SMALL, { ipHash: "e" }, t)).toBe("site_day");
    // Al otro día (en Mendoza) se renueva, y la primera respuesta borra los contadores vencidos.
    const tomorrow = Date.parse("2026-10-29T04:00:00Z");
    expect(await takeQuota(q, SMALL, { ipHash: "a" }, tomorrow)).toBeNull();
    const old = q.db.query("SELECT count(*) n FROM assistant_quota WHERE bucket LIKE '%2026-10-28%'").get() as { n: number };
    expect(old.n).toBe(0);
  });

  test("sin la tabla, Aco sigue respondiendo y queda el log", async () => {
    const logs: string[] = [];
    const broken: QuotaDb = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("no such table");
          },
          all: async () => {
            throw new Error("no such table");
          },
        }),
      }),
    };
    expect(await takeQuota(broken, SMALL, { ipHash: "a" }, NOW, (m) => logs.push(m))).toBeNull();
    expect(logs[0]).toContain("no se pudo contar el uso");
  });
});

describe("límites en la API", () => {
  const KEYS = { OPENROUTER_API_KEY: "or-secret" };
  const reply = () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "Hola." } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  const post = (body: unknown, host = "mendoza-transparente.com") =>
    new Request(`https://${host}/api/asistente`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const messages = [{ role: "user", content: "hola" }];

  test("un host bloqueado muestra a Aco apagado y no llama al modelo", async () => {
    let calls = 0;
    const deps = {
      knowledge: k,
      env: KEYS,
      fetcher: async () => {
        calls++;
        return reply();
      },
      quota: { db: sqliteDb(), limits: null, ip: "1.1.1.1" },
    };
    const status = await handleAssistant(new Request("https://mendoza-transparente.pages.dev/api/asistente"), deps);
    expect(await status?.json()).toEqual({ enabled: false });
    expect((await handleAssistant(post({ messages }, "mendoza-transparente.pages.dev"), deps))?.status).toBe(403);
    expect(calls).toBe(0);
  });

  test("pasado el tope responde 429 con el límite y sin llamar al modelo", async () => {
    let calls = 0;
    const deps = {
      knowledge: k,
      env: KEYS,
      fetcher: async () => {
        calls++;
        return reply();
      },
      quota: { db: sqliteDb(), limits: SMALL, ip: "1.1.1.1", ipSalt: "sal" },
    };
    for (let i = 0; i < 3; i++) expect((await handleAssistant(post({ messages }), deps))?.status).toBe(200);
    const res = await handleAssistant(post({ messages }), deps);
    expect(res?.status).toBe(429);
    expect(await res?.json()).toEqual({ error: "Demasiadas preguntas seguidas", limit: "burst" });
    expect(calls).toBe(3);
  });

  test("una conversación que llega a su tope pide Turnstile de nuevo", async () => {
    const deps = {
      knowledge: k,
      env: { ...KEYS, ASSISTANT_TURNSTILE: "on" },
      fetcher: async () => reply(),
      passKey: "clave",
      verifyHuman: async (t: string) => t === "ok",
      quota: { db: sqliteDb(), limits: { ...SMALL, perIpWindow: 50, perIpDay: 50, perSiteDay: 50 }, ip: "1.1.1.1" },
    };
    const pass = await issuePass("clave");
    expect((await handleAssistant(post({ messages, pass }), deps))?.status).toBe(200);
    expect((await handleAssistant(post({ messages, pass }), deps))?.status).toBe(200);
    const third = await handleAssistant(post({ messages, pass }), deps);
    expect(third?.status).toBe(403);
    expect(await third?.json()).toEqual({ error: "Falta la verificación", challenge: true });
    // Con Turnstile de nuevo, sigue con un pase nuevo.
    const fresh = await handleAssistant(post({ messages, turnstile: "ok" }), deps);
    expect(((await fresh?.json()) as { pass?: string } | undefined)?.pass).toBeString();
  });
});

describe("lo que vuelve al modelo", () => {
  test("get_procedure sin links ni lista de rubros, con los pasos y lo que no se publica", () => {
    const p = getProcedure(k, { flow: "abrir-un-comercio", municipality: "Capital" });
    const m = procedureForModel(p);
    const text = JSON.stringify(m);
    expect(text).not.toContain("https://");
    expect(m.activities_count).toBe(p.activities?.length);
    expect(m.steps?.map((s) => s.title)).toEqual(p.steps?.map((s) => s.title));
    expect(m.unpublished).toEqual(p.unpublished);
    expect(text.length).toBeLessThan(JSON.stringify(p).length * 0.7);
  });
});

describe("lo que se manda a cada proveedor", () => {
  const body = (url: string, init: RequestInit) => ({ url, body: JSON.parse(String(init.body)) });
  const ok = (usage: object) => Response.json({ choices: [{ message: { content: "Hola." } }], usage });

  test("a OpenRouter: prefijo en caché y esfuerzo bajo; sin temperature", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const attempts: Attempt[] = [];
    await complete(
      { OPENROUTER_API_KEY: "or" },
      {
        messages: [
          { role: "system", content: "Instrucciones" },
          { role: "user", content: "hola" },
        ],
        tools: [],
      },
      async (url, init) => {
        sent.push(body(url, init));
        return ok({
          prompt_tokens: 2000,
          completion_tokens: 90,
          prompt_tokens_details: { cached_tokens: 1950 },
          completion_tokens_details: { reasoning_tokens: 40 },
        });
      },
      "tools",
      (a) => attempts.push(a),
    );
    const b = sent[0]?.body as { messages: { role: string; content: unknown }[]; reasoning?: unknown; temperature?: unknown };
    expect(b.messages[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: "Instrucciones", cache_control: { type: "ephemeral" } }],
    });
    expect(b.messages[1]).toEqual({ role: "user", content: "hola" });
    expect(b.reasoning).toEqual({ effort: "low" });
    expect(b.temperature).toBeUndefined();
    expect(attempts[0]).toMatchObject({ promptTokens: 2000, cachedTokens: 1950, reasoningTokens: 40 });
  });

  test("al AI Gateway: el cuerpo de siempre, sin campos que no documenta", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    await complete(
      { AI_GATEWAY_API_KEY: "gw" },
      {
        messages: [
          { role: "system", content: "Instrucciones" },
          { role: "user", content: "hola" },
        ],
        tools: [],
      },
      async (url, init) => {
        sent.push(body(url, init));
        return ok({ prompt_tokens: 10, completion_tokens: 2 });
      },
    );
    const b = sent[0]?.body as { messages: unknown[]; reasoning?: unknown };
    expect(b.messages[0]).toEqual({ role: "system", content: "Instrucciones" });
    expect(b.reasoning).toBeUndefined();
  });
});
