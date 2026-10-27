/**
 * Runs the evals against the real providers. Keys come from the environment, never from the repo:
 *
 *   bun --env-file=.env.asistente run asistente:evals
 *
 * .env.asistente (at the repo root, in .gitignore) holds AI_GATEWAY_API_KEY and/or OPENROUTER_API_KEY, and
 * optionally ASSISTANT_MODEL. Each case costs one conversation (a few cents at most with the default model).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, NEVER } from "../evals/cases.ts";
import { runAgent } from "../src/agent.ts";
import type { Knowledge } from "../src/knowledge.ts";
import { configuredProviders } from "../src/providers.ts";

const env = {
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  ASSISTANT_PROVIDERS: process.env.ASSISTANT_PROVIDERS,
  ASSISTANT_MODEL: process.env.ASSISTANT_MODEL,
};
if (!configuredProviders(env).length) {
  console.error("Faltan las claves: bun --env-file=.env.asistente run asistente:evals");
  process.exit(1);
}

const knowledge = JSON.parse(readFileSync(join(import.meta.dir, "..", "src", "knowledge.json"), "utf8")) as Knowledge;
let failed = 0;
for (const c of CASES) {
  const problems: string[] = [];
  let provider = "";
  try {
    const reply = await runAgent(knowledge, env, c.messages, { onCompletion: (x) => (provider = `${x.provider} ${x.model}`) });
    if (!c.outcome.includes(reply.outcome)) problems.push(`outcome ${reply.outcome}, se esperaba ${c.outcome.join(" o ")}`);
    for (const b of c.blocks ?? []) if (!reply.blocks.some((x) => x.type === b)) problems.push(`falta el bloque ${b}`);
    for (const b of c.noBlocks ?? []) if (reply.blocks.some((x) => x.type === b)) problems.push(`sobra el bloque ${b}`);
    for (const r of c.says ?? []) if (!r.test(reply.text)) problems.push(`no dice ${r}`);
    for (const r of [...NEVER, ...(c.neverSays ?? [])]) if (r.test(reply.text)) problems.push(`dice ${r}`);
    if (reply.text.split(/\s+/).length > 120) problems.push("más de 120 palabras");
    console.log(
      `${problems.length ? "✗" : "✓"} ${c.name} (${provider})${problems.length ? `\n    ${problems.join("\n    ")}\n    «${reply.text}»` : ""}`,
    );
  } catch (err) {
    problems.push((err as Error).message);
    console.log(`✗ ${c.name}: ${(err as Error).message}`);
  }
  if (problems.length) failed++;
}
console.log(`\n${CASES.length - failed}/${CASES.length} casos bien.`);
process.exit(failed ? 1 : 0);
