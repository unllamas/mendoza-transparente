/**
 * Corre las evals contra el modelo real, de una de dos formas:
 *
 *   bun run asistente:evals --url https://dev.mendoza-transparente.pages.dev
 *     Manda cada caso a POST /api/asistente de una vista previa, que usa las claves guardadas como secretos de Pages.
 *     Nadie necesita las claves en su máquina. Solo dev tiene vista previa: correrlas antes de mergear y otra vez en dev.
 *     Se identifican con `x-mt-source: evals`, así su consumo queda aparte del uso real en el panel.
 *
 *   bun --env-file=.env.asistente run asistente:evals
 *     Corre el agente en la máquina. .env.asistente (en la raíz, en .gitignore) tiene AI_GATEWAY_API_KEY y/o
 *     OPENROUTER_API_KEY, y opcionalmente ASSISTANT_MODEL.
 *
 * `--solo <texto>` corre solo los casos cuyo nombre contiene el texto. Cada caso cuesta una conversación (unos pocos
 * centavos de dólar, como mucho, con el modelo por defecto).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, NEVER } from "../evals/cases.ts";
import { runAgent } from "../src/agent.ts";
import type { Knowledge } from "../src/knowledge.ts";
import { configuredProviders } from "../src/providers.ts";
import type { AssistantReply, ChatMessage } from "../src/types.ts";

// El sitio permite 10 pedidos cada 10 segundos por IP, y un caso puede reintentarse una vez: quedarse bien abajo.
const PAUSE_MS = 2_500;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = argValue("--url")?.replace(/\/+$/, "");
const only = argValue("--solo")?.toLowerCase();
const cases = only ? CASES.filter((c) => c.name.toLowerCase().includes(only)) : CASES;

type Ask = (messages: ChatMessage[]) => Promise<{ reply: AssistantReply; source: string }>;

function remote(base: string): Ask {
  return async (messages) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base}/api/asistente`, {
        method: "POST",
        // Así su consumo queda separado del uso real en el panel.
        headers: { "content-type": "application/json", "x-mt-source": "evals" },
        body: JSON.stringify({ messages }),
      });
      if (res.status === 429 && attempt === 0) {
        await Bun.sleep(10_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { reply: (await res.json()) as AssistantReply, source: new URL(base).host };
    }
  };
}

function local(): Ask {
  const env = {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ASSISTANT_PROVIDERS: process.env.ASSISTANT_PROVIDERS,
    ASSISTANT_MODEL: process.env.ASSISTANT_MODEL,
  };
  if (!configuredProviders(env).length) {
    console.error(
      "Faltan las claves. Corré contra una vista previa (bun run asistente:evals --url <url>) o con bun --env-file=.env.asistente.",
    );
    process.exit(1);
  }
  const knowledge = JSON.parse(readFileSync(join(import.meta.dir, "..", "src", "knowledge.json"), "utf8")) as Knowledge;
  return async (messages) => {
    let source = "";
    const reply = await runAgent(knowledge, env, messages, { onCompletion: (x) => (source = `${x.provider} ${x.model}`) });
    return { reply, source };
  };
}

const ask = url ? remote(url) : local();
let failed = 0;
for (const [i, c] of cases.entries()) {
  if (url && i > 0) await Bun.sleep(PAUSE_MS);
  const problems: string[] = [];
  try {
    const { reply, source } = await ask(c.messages);
    if (!c.outcome.includes(reply.outcome)) problems.push(`outcome ${reply.outcome}, se esperaba ${c.outcome.join(" o ")}`);
    for (const b of c.blocks ?? []) if (!reply.blocks.some((x) => x.type === b)) problems.push(`falta el bloque ${b}`);
    for (const b of c.noBlocks ?? []) if (reply.blocks.some((x) => x.type === b)) problems.push(`sobra el bloque ${b}`);
    for (const r of c.says ?? []) if (!r.test(reply.text)) problems.push(`no dice ${r}`);
    for (const r of [...NEVER, ...(c.neverSays ?? [])]) if (r.test(reply.text)) problems.push(`dice ${r}`);
    if (reply.text.length > 300) problems.push(`${reply.text.length} caracteres (el máximo es un tuit, 280)`);
    console.log(
      `${problems.length ? "✗" : "✓"} ${c.name} (${source})${problems.length ? `\n    ${problems.join("\n    ")}\n    «${reply.text}»` : ""}`,
    );
  } catch (err) {
    problems.push((err as Error).message);
    console.log(`✗ ${c.name}: ${(err as Error).message}`);
  }
  if (problems.length) failed++;
}
console.log(`\n${cases.length - failed}/${cases.length} casos bien.`);
process.exit(failed ? 1 : 0);
