/**
 * PreToolUse hook: blocks any tool call that would print the local credential files (.env.cloudflare,
 * .env.posthog) into the conversation. Loading them into the shell (`. ./.env.cloudflare`) is allowed;
 * displaying them (cat, grep, sed, Read…) is not. Documented in docs/procesos/trabajo-con-agentes.md.
 *
 * Claude Code passes the tool call as JSON on stdin; exit code 2 blocks it and shows stderr to the agent.
 */

const SECRET_FILES = /\.env\.(cloudflare|posthog)\b/;
// Commands that would show the file's content. Sourcing (`.` / `source`), `ls`, `wc` and `test` are fine.
const DISPLAY =
  /\b(cat|less|more|head|tail|bat|nl|xxd|od|strings|grep|rg|sed|awk|perl|python3?|node|cut|sort|uniq|diff|cp|scp|curl\s+.*-d\s*@)\b/;

const input = (await Bun.stdin.json()) as { tool_name?: string; tool_input?: Record<string, unknown> };
const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

let blocked = false;
if (tool === "Read" || tool === "Edit" || tool === "Write") {
  blocked = SECRET_FILES.test(String(args.file_path ?? ""));
} else if (tool === "Grep") {
  blocked = SECRET_FILES.test(String(args.path ?? "")) || SECRET_FILES.test(String(args.glob ?? ""));
} else if (tool === "Bash") {
  const command = String(args.command ?? "");
  // Look at each piece of a pipeline or command list on its own.
  blocked = command.split(/\|\||&&|;|\|/).some((part) => SECRET_FILES.test(part) && DISPLAY.test(part));
}

if (blocked) {
  console.error(
    "Bloqueado: .env.cloudflare y .env.posthog tienen credenciales y no se muestran. " +
      "Cargalos en el shell con `set -a && . ./.env.cloudflare && set +a` y usá las variables; " +
      "para verificarlos, contá caracteres sin imprimirlos (skill `produccion`).",
  );
  process.exit(2);
}
