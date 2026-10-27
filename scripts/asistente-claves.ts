/**
 * Carga como secretos de Cloudflare Pages lo que configura al asistente (docs/procesos/asistente.md):
 *
 *   bun run asistente:claves                 vista previa (dev.mendoza-transparente.pages.dev)
 *   bun run asistente:claves --produccion    producción (mendoza-transparente.com)
 *
 * Pregunta uno por uno. Wrangler pide cada valor por la terminal sin mostrarlo, así no queda en el historial ni en
 * ningún archivo; respondiendo que no, se saltea. Las credenciales de Cloudflare salen de `wrangler login` o de
 * las variables del entorno (CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID): este script no lee archivos de claves.
 */

import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const env = process.argv.includes("--produccion") ? "production" : "preview";

const SECRETS = [
  { name: "AI_GATEWAY_API_KEY", what: "la clave de Vercel AI Gateway" },
  { name: "OPENROUTER_API_KEY", what: "la clave de OpenRouter" },
  { name: "ASSISTANT_MODEL", what: "el modelo (si no se carga: anthropic/claude-haiku-5.5)" },
  { name: "ASSISTANT_PROVIDERS", what: "el orden de los proveedores (si no se carga: gateway,openrouter)" },
  { name: "ASSISTANT_MODEL_TOOLS", what: "el modelo que elige las herramientas (si no se carga: ASSISTANT_MODEL)" },
  { name: "ASSISTANT_MODEL_ANSWER", what: "el modelo que redacta la respuesta (si no se carga: el de las herramientas)" },
  { name: "ASSISTANT_TURNSTILE", what: "«on» para pedir Turnstile una vez por conversación (solo en producción)" },
];

console.log(`Secretos del asistente para ${env === "production" ? "PRODUCCIÓN" : "la vista previa (dev)"}.`);
for (const s of SECRETS) {
  const answer = prompt(`¿Cargar ${s.what} (${s.name})? [s/N]`);
  if (!/^s/i.test(answer ?? "")) continue;
  const proc = Bun.spawn(["bunx", "wrangler@4", "pages", "secret", "put", s.name, "--project-name", "mendoza-transparente", "--env", env], {
    cwd: join(ROOT, "apps", "web"),
    stdio: ["inherit", "inherit", "inherit"],
  });
  if ((await proc.exited) !== 0) console.error(`No se pudo cargar ${s.name}.`);
}
console.log("Listo. Los secretos se leen en el próximo despliegue: un push a dev, o «Retry deployment» en el panel.");
