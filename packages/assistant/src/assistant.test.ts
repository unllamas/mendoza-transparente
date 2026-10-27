import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentKnowledge } from "../scripts/build-knowledge.ts";
import { runAgent } from "./agent.ts";
import { handleAssistant, sanitizeFeedback, sanitizeMessages } from "./http.ts";
import type { Knowledge } from "./knowledge.ts";
import { configuredProviders } from "./providers.ts";
import { findMunicipality, findTradeFee, getProcedure, searchUnpublished } from "./tools.ts";

const knowledgePath = join(import.meta.dir, "knowledge.json");
const k = JSON.parse(readFileSync(knowledgePath, "utf8")) as Knowledge;
const KEYS = { AI_GATEWAY_API_KEY: "gw-secret", OPENROUTER_API_KEY: "or-secret" };

/** Fake provider: answers each call with the next scripted message and records what it was sent. */
function fakeProvider(script: ({ tool: string; args: object } | { text: string } | { status: number })[]) {
  const calls: { url: string; body: { tools: unknown[] }; auth: string }[] = [];
  let i = 0;
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
    const next = script[i++];
    if (!next) throw new Error("sin guion");
    if ("status" in next) return new Response("boom", { status: next.status });
    const message =
      "tool" in next
        ? {
            content: null,
            tool_calls: [{ id: `c${i}`, type: "function", function: { name: next.tool, arguments: JSON.stringify(next.args) } }],
          }
        : { content: next.text };
    return Response.json({ choices: [{ message }] });
  };
  return { fetcher, calls };
}

describe("knowledge", () => {
  test("knowledge.json está al día con el catálogo y las tasas (si falla: bun run asistente:datos)", async () => {
    expect(readFileSync(knowledgePath, "utf8")).toBe(await currentKnowledge());
  });
  test("Godoy Cruz tiene recorrido y tasas", () => {
    expect(k.flows.some((f) => f.municipality === "Godoy Cruz")).toBe(true);
    expect(k.fees.find((t) => t.municipality === "Godoy Cruz")?.rows.length).toBe(566);
  });
});

describe("tools", () => {
  test("reconoce municipios escritos de cualquier forma", () => {
    expect(findMunicipality("en godoy cruz")).toBe("Godoy Cruz");
    expect(findMunicipality("Ciudad de Mendoza")).toBe("Capital");
    expect(findMunicipality("Lujan de Cuyo")).toBe("Luján de Cuyo");
    expect(findMunicipality("Córdoba")).toBeNull();
  });
  test("los pasos de alimentos solo aparecen para rubros de alimentos", () => {
    const ropa = getProcedure(k, { flow: "abrir-un-comercio", municipality: "Godoy Cruz", activity: "ropa" });
    const almacen = getProcedure(k, { flow: "abrir-un-comercio", municipality: "godoy cruz", activity: "Almacén" });
    expect(ropa.steps?.some((s) => s.when === "alimentos")).toBe(false);
    expect(almacen.steps?.some((s) => s.when === "alimentos")).toBe(true);
  });
  test("un municipio sin relevar devuelve solo Nación y Provincia", () => {
    const r = getProcedure(k, { flow: "abrir-un-comercio", municipality: "Tunuyán" });
    expect(r.covered).toBe(false);
    expect(r.general_steps?.every((s) => s.level !== "municipio")).toBe(true);
  });
  test("la tasa de un almacén sale del anexo de la ordenanza", () => {
    const r = findTradeFee(k, { municipality: "Godoy Cruz", activity: "almacén" });
    expect(r.matches[0]).toEqual({ code: "30003", activity: "ALMACENES Y DESPENSAS", min: 63335.5, max: 613867.18 });
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "carnicería" }).matches[0]?.code).toBe("30007");
    expect(findTradeFee(k, { municipality: "Tunuyán", activity: "almacén" }).found).toBe(false);
  });
  test("un rubro común fuera del menú del municipio se busca por sus sinónimos", () => {
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "verdulería" }).matches[0]?.code).toBe("30023");
    const p = getProcedure(k, { flow: "abrir-un-comercio", municipality: "Godoy Cruz", activity: "panadería" });
    expect(p.steps?.some((s) => s.when === "alimentos")).toBe(true);
  });
  test("pasa las unidades tributarias a pesos y dice el período", () => {
    const r = findTradeFee(k, { municipality: "Guaymallén", activity: "almacén" });
    expect(r.found).toBe(true);
    expect(r.period).toBe("bimestre");
    expect(r.matches[0]?.max).toBe(580 * 130);
    expect(r.matches[0]?.activity).toMatch(/ALMAC/i);
  });
  test("usa los montos leídos a mano cuando el anexo está escaneado", () => {
    const r = findTradeFee(k, { municipality: "Maipú", activity: "almacén" });
    expect(r.matches[0]).toMatchObject({ min: 8996.52, max: 14937.63 });
    expect(r.note).toContain("página 33");
    expect(findTradeFee(k, { municipality: "Luján de Cuyo", activity: "kiosco" }).matches[0]?.max).toBe(2500 * 235);
  });
  test("si el municipio no publica cómo calcularla, no inventa un monto", () => {
    const r = findTradeFee(k, { municipality: "San Rafael", activity: "almacén" });
    expect(r.found).toBe(false);
    expect(r.note).toMatch(/no se puede dar un monto/);
  });
  test("lo que no se publica se encuentra por tema", () => {
    expect(searchUnpublished(k, { municipality: "Godoy Cruz", topic: "cuánto tarda la habilitación" }).matches.length).toBeGreaterThan(0);
  });
});

describe("agent", () => {
  test("arma los pasos y la tasa desde las herramientas, no desde el texto del modelo", async () => {
    const { fetcher } = fakeProvider([
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "Godoy Cruz", activity: "almacen" } },
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "almacen" } },
      { text: "Son estos pasos. Mientras dura la habilitación la tasa es más cara." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un almacén en Godoy Cruz" }], { fetcher });
    expect(reply.outcome).toBe("steps");
    const steps = reply.blocks.find((b) => b.type === "steps");
    expect(steps?.type === "steps" && steps.fee?.min).toBe(63335.5);
    expect(steps?.type === "steps" && steps.steps.length).toBeGreaterThan(3);
    expect(reply.municipality).toBe("Godoy Cruz");
  });
  test("si falta el municipio, pregunta y termina el turno", async () => {
    const { fetcher, calls } = fakeProvider([{ tool: "ask_user", args: { field: "municipality", question: "¿En qué municipio?" } }]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un comercio" }], { fetcher });
    expect(reply).toMatchObject({ outcome: "ask", text: "¿En qué municipio?", blocks: [{ type: "ask_municipality" }] });
    expect(calls.length).toBe(1);
  });
  test("pregunta el rubro con la lista completa y sin la opción «Otro rubro»", async () => {
    const { fetcher } = fakeProvider([
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "Godoy Cruz" } },
      { tool: "ask_user", args: { field: "activity", question: "¿Qué vas a vender?" } },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un comercio en Godoy Cruz" }], { fetcher });
    const block = reply.blocks[0];
    expect(block?.type).toBe("ask_activity");
    const labels = block?.type === "ask_activity" ? block.options.map((o) => o.label) : [];
    expect(labels.slice(0, 2)).toEqual(["Almacén", "Kiosco"]);
    expect(labels).toContain("Verdulería");
    expect(labels).not.toContain("Otro rubro");
  });
  test("en un municipio sin relevar no pregunta el rubro", async () => {
    const { fetcher, calls } = fakeProvider([
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "General Alvear" } },
      { tool: "ask_user", args: { field: "activity", question: "¿Qué vas a vender?" } },
      { text: "Todavía no relevamos General Alvear; estos son los pasos de Nación y Provincia." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un negocio en Alvear" }], { fetcher });
    expect(reply.outcome).toBe("steps");
    expect(reply.blocks.some((b) => b.type === "ask_activity")).toBe(false);
    expect(calls.length).toBe(3);
  });
  test("si el primer proveedor falla, responde el segundo con su propia clave", async () => {
    const { fetcher, calls } = fakeProvider([{ status: 503 }, { text: "Hola" }]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "hola" }], { fetcher });
    expect(reply.text).toBe("Hola");
    expect(calls.map((c) => [new URL(c.url).hostname, c.auth])).toEqual([
      ["ai-gateway.vercel.sh", "Bearer gw-secret"],
      ["openrouter.ai", "Bearer or-secret"],
    ]);
  });
  test("corta el ciclo: el último paso va sin herramientas", async () => {
    const loop = { tool: "list_procedures", args: {} };
    const { fetcher, calls } = fakeProvider([loop, loop, loop, { text: "Listo" }]);
    await runAgent(k, KEYS, [{ role: "user", content: "hola" }], { fetcher });
    expect(calls.length).toBe(4);
    expect(calls[3]?.body.tools).toEqual([]);
  });
});

describe("http", () => {
  const req = (path: string, init?: RequestInit) => new Request(`https://x.test${path}`, init);
  const post = (path: string, body: unknown) =>
    req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  test("sin claves el asistente está apagado y no llama a nadie", async () => {
    const status = await handleAssistant(req("/api/asistente"), { knowledge: k, env: {} });
    expect(await status?.json()).toEqual({ enabled: false });
    const chat = await handleAssistant(post("/api/asistente", { messages: [{ role: "user", content: "hola" }] }), {
      knowledge: k,
      env: {},
    });
    expect(chat?.status).toBe(503);
    expect(configuredProviders({ OPENROUTER_API_KEY: "x" }).map((p) => p.id)).toEqual(["openrouter"]);
  });
  test("las claves nunca salen en la respuesta, ni cuando fallan los proveedores", async () => {
    const { fetcher } = fakeProvider([{ status: 500 }, { status: 500 }]);
    const logs: string[] = [];
    const res = await handleAssistant(post("/api/asistente", { messages: [{ role: "user", content: "hola" }] }), {
      knowledge: k,
      env: KEYS,
      fetcher,
      log: (m) => logs.push(m),
    });
    const text = await res?.text();
    expect(res?.status).toBe(502);
    for (const secret of Object.values(KEYS)) {
      expect(text).not.toContain(secret);
      expect(logs.join(" ")).not.toContain(secret);
    }
  });
  test("recorta la conversación y exige que termine con la persona", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(900) }));
    const m = sanitizeMessages({ messages: [...long, { role: "user", content: "fin" }] });
    expect(m?.length).toBe(12);
    expect(m?.every((x) => x.content.length <= 500)).toBe(true);
    expect(sanitizeMessages({ messages: [{ role: "system", content: "x" }] })).toBeNull();
    expect(sanitizeMessages({ messages: [{ role: "assistant", content: "x" }] })).toBeNull();
  });
  test("la opinión guarda solo lo previsto y la nota solo con 👎", () => {
    expect(sanitizeFeedback({ vote: "up", note: "mi DNI es…", reason: "dato" })).toEqual({ vote: "up" });
    expect(sanitizeFeedback({ vote: "down", reason: "dato", note: " falta un paso ", flow: "abrir-un-comercio" })).toEqual({
      vote: "down",
      reason: "dato",
      note: "falta un paso",
      flow: "abrir-un-comercio",
    });
    expect(sanitizeFeedback({ vote: "meh" })).toBeNull();
  });
  test("guarda la opinión en la base", async () => {
    const rows: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...v: unknown[]) => ({ run: async () => rows.push(v) }) }) };
    const res = await handleAssistant(post("/api/asistente/opinion", { vote: "down", reason: "falta" }), { knowledge: k, env: {}, db });
    expect(res?.status).toBe(201);
    expect(rows[0]?.slice(1, 3)).toEqual(["down", "falta"]);
  });
  test("otras rutas no son del asistente", async () => {
    expect(await handleAssistant(req("/api/pedidos"), { knowledge: k, env: {} })).toBeNull();
  });
});
