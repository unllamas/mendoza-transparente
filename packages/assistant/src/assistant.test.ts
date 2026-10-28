import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentKnowledge } from "../scripts/build-knowledge.ts";
import { runAgent } from "./agent.ts";
import { handleAssistant, sanitizeFeedback, sanitizeMessages } from "./http.ts";
import type { Knowledge } from "./knowledge.ts";
import { checkPass, issuePass, PASS_TTL_MS } from "./pass.ts";
import { configuredProviders, modelFor } from "./providers.ts";
import { asksAboutFee, feeActivities, findMunicipality, findTradeFee, getProcedure, searchUnpublished } from "./tools.ts";
import type { Gap } from "./types.ts";

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
    const r = getProcedure(k, { flow: "abrir-un-comercio", municipality: "La Paz" });
    expect(r.covered).toBe(false);
    expect(r.general_steps?.every((s) => s.level !== "municipio")).toBe(true);
  });
  test("la tasa de un almacén sale del anexo de la ordenanza", () => {
    const r = findTradeFee(k, { municipality: "Godoy Cruz", activity: "almacén" });
    expect(r.matches[0]).toEqual({ code: "30003", activity: "ALMACENES Y DESPENSAS", min: 63335.5, max: 613867.18 });
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "carnicería" }).matches[0]?.code).toBe("30007");
    expect(findTradeFee(k, { municipality: "La Paz", activity: "almacén" }).found).toBe(false);
  });
  test("el rubro se reconoce por sus sinónimos, como palabras enteras", () => {
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "verdulería" }).matches[0]?.code).toBe("30023");
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "golosinas" }).activity?.id).toBe("kiosco");
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "quiosco" }).activity?.id).toBe("kiosco");
    expect(findTradeFee(k, { municipality: "Guaymallén", activity: "maxikiosco" }).activity?.id).toBe("kiosco");
    // "pan" no está dentro de "pantalones"
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "pantalones" }).activity?.id).not.toBe("panaderia");
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
    expect(r.status).toBe("not_computable");
    expect(r.note).toMatch(/no se puede dar un monto/);
  });
  test("lo que la ordenanza separa se muestra por separado, cada uno con su monto", () => {
    const r = findTradeFee(k, { municipality: "Godoy Cruz", activity: "kiosco" });
    expect(r.matches.map((m) => m.activity)).toEqual(["QUIOSCO INTERIOR", "MAXI KIOSCO", "QUIOSCOS VIA PUBLICA"]);
    expect(r.matches[1]).toMatchObject({ min: 95003.25, max: 920800.77 });
  });
  test("un código repetido en el anexo toma la fila curada por su nombre", () => {
    const r = findTradeFee(k, { municipality: "Guaymallén", activity: "almacén" });
    expect(r.matches[0]?.activity).toBe("Despensa - Almacén - Mercadito");
  });
  test("solo ofrece los rubros con tasa en ese municipio; uno que no está se informa, no se adivina", () => {
    expect(feeActivities(k, "Maipú").map((a) => a.id)).toEqual(["almacen", "kiosco", "ropa", "rotiseria", "carniceria", "peluqueria"]);
    expect(feeActivities(k, "Godoy Cruz").length).toBe(31);
    const r = findTradeFee(k, { municipality: "Maipú", activity: "gimnasio" });
    expect(r).toMatchObject({ status: "unknown_activity", asked: "gimnasio", found: false, matches: [] });
    expect(r.available?.length).toBe(6);
    // Asked for in assistant_gaps and loaded afterwards: they now have their fee.
    expect(findTradeFee(k, { municipality: "Capital", activity: "bar" }).status).toBe("found");
    expect(findTradeFee(k, { municipality: "Godoy Cruz", activity: "cerveza artesanal" }).status).toBe("found");
  });
  test("sin rubro pide elegir; sin tarifaria lo dice", () => {
    expect(findTradeFee(k, { municipality: "Godoy Cruz" }).status).toBe("ask_activity");
    expect(findTradeFee(k, { municipality: "La Paz", activity: "kiosco" }).status).toBe("not_surveyed");
  });
  test("los montos cargados a mano llevan el año de la ordenanza", () => {
    expect(findTradeFee(k, { municipality: "Maipú", activity: "kiosco" }).year).toBe(2026);
    expect(findTradeFee(k, { municipality: "Luján de Cuyo", activity: "kiosco" }).year).toBe(2026);
  });
  test("un trámite que no tenemos se distingue de un municipio sin relevar", () => {
    expect(getProcedure(k, { flow: "sacar-licencia-de-conducir", municipality: "Godoy Cruz" })).toMatchObject({
      known: false,
      covered: false,
    });
    expect(getProcedure(k, { flow: "abrir-un-comercio", municipality: "La Paz" })).toMatchObject({ known: true, covered: false });
  });
  test("solo la plata activa la tasa", () => {
    expect(asksAboutFee(["¿cuánto cobra de tasa mi municipio?"])).toBe(true);
    expect(asksAboutFee(["¿Cuánto pago por un kiosco?"])).toBe(true);
    expect(asksAboutFee(["quiero abrir un kiosco en Maipú", "Kiosco"])).toBe(false);
    expect(asksAboutFee(["¿cuánto tarda la habilitación?"])).toBe(false);
  });
  test("lo que no se publica se encuentra por tema", () => {
    expect(searchUnpublished(k, { municipality: "Godoy Cruz", topic: "cuánto tarda la habilitación" }).matches.length).toBeGreaterThan(0);
  });
});

describe("agent", () => {
  test("arma los pasos desde las herramientas y no muestra la tasa si no la pidieron", async () => {
    const { fetcher, calls } = fakeProvider([
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "Godoy Cruz", activity: "almacen" } },
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "almacen" } },
      { text: "Son estos pasos." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un almacén en Godoy Cruz" }], { fetcher });
    expect(reply.outcome).toBe("steps");
    const steps = reply.blocks.find((b) => b.type === "steps");
    expect(steps?.type === "steps" && steps.steps.length).toBeGreaterThan(3);
    // What the PDF folder needs travels with the block.
    expect(steps?.type === "steps" && steps.title).toBeString();
    expect(steps?.type === "steps" && steps.activity).toBe("Almacén");
    expect(steps?.type === "steps" && steps.unpublished?.length).toBeGreaterThan(0);
    expect(reply.blocks.some((b) => b.type === "fee")).toBe(false);
    // The model does not even get the amounts.
    expect(JSON.stringify(calls[2]?.body)).not.toContain("63335");
    expect(reply.municipality).toBe("Godoy Cruz");
  });
  test("la tasa pedida llega en su propia tarjeta, con las variantes de la ordenanza", async () => {
    const { fetcher } = fakeProvider([
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "Kiosco" } },
      { text: "La ordenanza separa el quiosco del maxikiosco." },
    ]);
    const history = [
      { role: "user" as const, content: "¿cuánto cobra de tasa mi municipio?" },
      { role: "assistant" as const, content: "¿En qué municipio?" },
      { role: "user" as const, content: "Godoy Cruz" },
      { role: "assistant" as const, content: "¿Qué rubro?" },
      { role: "user" as const, content: "Kiosco" },
    ];
    const reply = await runAgent(k, KEYS, history, { fetcher });
    expect(reply.outcome).toBe("fee");
    expect(reply.municipality).toBe("Godoy Cruz");
    const card = reply.blocks.find((b) => b.type === "fee");
    expect(card?.type === "fee" && card.fee.activity).toBe("Kiosco");
    expect(card?.type === "fee" && card.fee.lines.map((l) => l.name)).toEqual(["QUIOSCO INTERIOR", "MAXI KIOSCO", "QUIOSCOS VIA PUBLICA"]);
    expect(reply.blocks.some((b) => b.type === "steps")).toBe(false);
  });
  test("al pedir el rubro para la tasa ofrece solo los del municipio, aunque el modelo no lo pase", async () => {
    const { fetcher } = fakeProvider([{ tool: "ask_user", args: { field: "activity", question: "¿Qué rubro?" } }]);
    const history = [
      { role: "user" as const, content: "¿cuánto cobra de tasa mi municipio?" },
      { role: "assistant" as const, content: "¿En qué municipio?" },
      { role: "user" as const, content: "Maipú" },
    ];
    const reply = await runAgent(k, KEYS, history, { fetcher });
    const block = reply.blocks[0];
    expect(block?.type === "ask_activity" && block.options.map((o) => o.id)).toEqual([
      "almacen",
      "kiosco",
      "ropa",
      "rotiseria",
      "carniceria",
      "peluqueria",
    ]);
  });
  test("un rubro que no tenemos se avisa, se ofrecen los que hay y se anota", async () => {
    const { fetcher } = fakeProvider([
      { tool: "find_trade_fee", args: { municipality: "Maipú", activity: "Gimnasio" } },
      { text: "Todavía no tenemos esa tasa en Maipú." },
    ]);
    const gaps: Gap[] = [];
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "¿Cuánto paga de tasa un gimnasio en Maipú?" }], {
      fetcher,
      onGap: (g) => gaps.push(g),
    });
    expect(reply.outcome).toBe("ask");
    expect(reply.blocks[0]?.type === "ask_activity" && reply.blocks[0].options.length).toBe(6);
    expect(gaps).toEqual([{ kind: "rubro", municipality: "Maipú", value: "gimnasio" }]);
  });
  test("la tasa de un municipio sin relevar: lo dice, lo anota y no muestra pasos que no pidieron", async () => {
    const { fetcher } = fakeProvider([
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "La Paz" } },
      { tool: "find_trade_fee", args: { municipality: "La Paz", activity: "kiosco" } },
      { text: "Todavía no leímos la tarifaria de La Paz." },
    ]);
    const gaps: Gap[] = [];
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "¿Cuánto cobra La Paz de tasa a un kiosco?" }], {
      fetcher,
      onGap: (g) => gaps.push(g),
    });
    expect(reply.blocks).toEqual([]);
    expect(gaps.map((g) => g.kind)).toEqual(["municipio", "municipio"]);
    expect(gaps.every((g) => g.municipality === "La Paz")).toBe(true);
  });
  test("un trámite que no tenemos se anota", async () => {
    const { fetcher } = fakeProvider([
      { tool: "get_procedure", args: { flow: "sacar-licencia-de-conducir", municipality: "Godoy Cruz" } },
      { text: "Todavía no tenemos ese trámite." },
    ]);
    const gaps: Gap[] = [];
    await runAgent(k, KEYS, [{ role: "user", content: "¿Cómo saco la licencia en Godoy Cruz?" }], { fetcher, onGap: (g) => gaps.push(g) });
    expect(gaps).toEqual([{ kind: "tramite", municipality: "Godoy Cruz", value: "sacar licencia de conducir" }]);
  });
  test("en San Rafael no pide el rubro para la tasa", async () => {
    const { fetcher, calls } = fakeProvider([
      { tool: "ask_user", args: { field: "activity", question: "¿Qué rubro?", municipality: "San Rafael" } },
      { text: "San Rafael no permite calcularla." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "¿Cuánto cobra de tasa San Rafael?" }], { fetcher });
    expect(reply.blocks.some((b) => b.type === "ask_activity")).toBe(false);
    expect(calls.length).toBe(2);
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
      { tool: "get_procedure", args: { flow: "abrir-un-comercio", municipality: "Malargüe" } },
      { tool: "ask_user", args: { field: "activity", question: "¿Qué vas a vender?" } },
      { text: "Todavía no relevamos Malargüe; estos son los pasos de Nación y Provincia." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "Quiero abrir un negocio en Malargüe" }], { fetcher });
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
  test("guarda lo que falta, y sin la tabla responde igual", async () => {
    const script = [{ tool: "find_trade_fee", args: { municipality: "La Paz", activity: "kiosco" } }, { text: "Todavía no." }];
    const body = { messages: [{ role: "user", content: "¿Cuánto cobra La Paz de tasa?" }] };
    const rows: unknown[][] = [];
    const db = { prepare: () => ({ bind: (...v: unknown[]) => ({ run: async () => rows.push(v) }) }) };
    const ok = await handleAssistant(post("/api/asistente", body), { knowledge: k, env: KEYS, db, fetcher: fakeProvider(script).fetcher });
    expect(ok?.status).toBe(200);
    expect(rows[0]?.slice(1)).toEqual(["municipio", "La Paz", "tasa-de-comercio"]);
    const broken = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("no such table");
          },
        }),
      }),
    };
    const res = await handleAssistant(post("/api/asistente", body), {
      knowledge: k,
      env: KEYS,
      db: broken,
      fetcher: fakeProvider(script).fetcher,
    });
    expect(res?.status).toBe(200);
  });
  test("otras rutas no son del asistente", async () => {
    expect(await handleAssistant(req("/api/pedidos"), { knowledge: k, env: {} })).toBeNull();
  });
});

describe("modelo por tarea", () => {
  test("cada tarea usa su modelo y cae en el general si no lo tiene", () => {
    expect(modelFor({}, "openrouter", "answer")).toBe("anthropic/claude-haiku-5.5");
    expect(modelFor({ ASSISTANT_MODEL: "m" }, "gateway", "tools")).toBe("m");
    expect(modelFor({ ASSISTANT_MODEL: "m", ASSISTANT_MODEL_ANSWER: "a" }, "gateway", "answer")).toBe("a");
    expect(modelFor({ ASSISTANT_MODEL: "m", ASSISTANT_MODEL_ANSWER: "a" }, "gateway", "tools")).toBe("m");
  });
  test("con modelo de redacción, el texto después de las herramientas lo escribe ese modelo", async () => {
    const { fetcher, calls } = fakeProvider([
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "Kiosco" } },
      { text: "borrador" },
      { text: "La ordenanza separa el quiosco del maxikiosco." },
    ]);
    const env = { ...KEYS, ASSISTANT_MODEL_TOOLS: "barato", ASSISTANT_MODEL_ANSWER: "mejor" };
    const reply = await runAgent(k, env, [{ role: "user", content: "¿Cuánto paga de tasa un kiosco en Godoy Cruz?" }], { fetcher });
    expect(reply.text).toBe("La ordenanza separa el quiosco del maxikiosco.");
    expect(calls.map((c) => (c.body as unknown as { model: string }).model)).toEqual(["barato", "barato", "mejor"]);
    expect(calls[2]?.body.tools).toEqual([]);
  });
  test("sin modelo de redacción no hay llamada de más", async () => {
    const { fetcher, calls } = fakeProvider([
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "Kiosco" } },
      { text: "Listo." },
    ]);
    await runAgent(k, KEYS, [{ role: "user", content: "¿Cuánto paga de tasa un kiosco en Godoy Cruz?" }], { fetcher });
    expect(calls).toHaveLength(2);
  });
});

describe("turnstile", () => {
  const post = (body: unknown) =>
    new Request("https://x.test/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const messages = [{ role: "user", content: "hola" }];
  const env = { ...KEYS, ASSISTANT_TURNSTILE: "on" };

  test("el pase vence a los 30 minutos y no se puede falsificar", async () => {
    const now = 1_000_000;
    const pass = await issuePass("clave", now);
    expect(await checkPass("clave", pass, now + 1000)).toBe(true);
    expect(await checkPass("otra", pass, now + 1000)).toBe(false);
    expect(await checkPass("clave", pass, now + PASS_TTL_MS + 1)).toBe(false);
    expect(await checkPass("clave", `${now + 5000}.${pass.split(".")[1]}`, now)).toBe(false);
    expect(await checkPass("clave", undefined, now)).toBe(false);
  });
  test("sin token no responde; con token responde y devuelve el pase, que sirve para el siguiente mensaje", async () => {
    const tokens: string[] = [];
    const deps = {
      knowledge: k,
      env,
      passKey: "clave",
      verifyHuman: async (t: string) => (tokens.push(t), t === "ok"),
    };
    const status = await handleAssistant(new Request("https://x.test/api/asistente"), deps);
    expect(await status?.json()).toEqual({ enabled: true, challenge: true });

    const denied = await handleAssistant(post({ messages }), { ...deps, fetcher: fakeProvider([]).fetcher });
    expect(denied?.status).toBe(403);
    expect(await denied?.json()).toEqual({ error: "Falta la verificación", challenge: true });

    const first = await handleAssistant(post({ messages, turnstile: "ok" }), {
      ...deps,
      fetcher: fakeProvider([{ text: "Hola." }]).fetcher,
    });
    const reply = (await first?.json()) as { text: string; pass?: string };
    expect(reply.text).toBe("Hola.");
    expect(reply.pass).toBeString();

    const second = await handleAssistant(post({ messages, pass: reply.pass }), {
      ...deps,
      fetcher: fakeProvider([{ text: "Otra." }]).fetcher,
    });
    expect(second?.status).toBe(200);
    expect(tokens).toEqual(["ok"]);
  });
  test("prendido sin el secreto, no deja pasar a nadie", async () => {
    const res = await handleAssistant(post({ messages, turnstile: "ok" }), { knowledge: k, env });
    expect(res?.status).toBe(503);
  });
  test("apagado, no pide nada y no devuelve pase", async () => {
    const res = await handleAssistant(post({ messages }), { knowledge: k, env: KEYS, fetcher: fakeProvider([{ text: "Hola." }]).fetcher });
    const body = (await res?.json()) as { pass?: string } | undefined;
    expect(body?.pass).toBeUndefined();
  });
});

describe("avance y pedidos de datos", () => {
  test("con Accept NDJSON manda el avance y después la respuesta", async () => {
    const { fetcher } = fakeProvider([
      { tool: "find_trade_fee", args: { municipality: "Godoy Cruz", activity: "Kiosco" } },
      { text: "La ordenanza separa el quiosco del maxikiosco." },
    ]);
    const req = new Request("https://x.test/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ messages: [{ role: "user", content: "¿Cuánto paga de tasa un kiosco en Godoy Cruz?" }] }),
    });
    const res = await handleAssistant(req, { knowledge: k, env: KEYS, fetcher });
    expect(res?.headers.get("content-type")).toContain("ndjson");
    const lines =
      (await res?.text())
        ?.trim()
        .split("\n")
        .map((l) => JSON.parse(l)) ?? [];
    expect(lines[0]).toEqual({ status: { phase: "thinking" } });
    expect(lines).toContainEqual({ status: { phase: "tool", tool: "find_trade_fee" } });
    expect(lines.at(-1)?.reply?.outcome).toBe("fee");
  });
  test("si fallan los proveedores, la última línea es el error, sin las claves", async () => {
    const { fetcher } = fakeProvider([{ status: 500 }, { status: 500 }]);
    const req = new Request("https://x.test/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hola" }] }),
    });
    const text = (await (await handleAssistant(req, { knowledge: k, env: KEYS, fetcher }))?.text()) ?? "";
    expect(JSON.parse(text.trim().split("\n").at(-1) ?? "{}")).toEqual({ error: "No pude responder ahora" });
    for (const secret of Object.values(KEYS)) expect(text).not.toContain(secret);
  });
  test("sin municipio, «pedir el dato» va una vez por organismo y nunca a municipios que no vienen al caso", async () => {
    const { fetcher } = fakeProvider([
      { tool: "search_unpublished", args: { topic: "ingresos brutos" } },
      { text: "No tenemos las alícuotas de Ingresos Brutos." },
    ]);
    const reply = await runAgent(k, KEYS, [{ role: "user", content: "¿Cuánto pago de Ingresos Brutos?" }], { fetcher });
    const agencies = reply.blocks.filter((b) => b.type === "unpublished").map((b) => (b.type === "unpublished" ? b.agency : ""));
    expect(new Set(agencies).size).toBe(agencies.length);
    expect(agencies.some((a) => /^Municipalidad/.test(a))).toBe(false);
  });
});
