/**
 * `bun run hallazgo`: loads a security finding into the panel from the command line, so an agent that runs
 * into one can record it without a person copying it by hand. Documented in docs/procesos/seguridad.md.
 *
 * The finding comes as JSON on stdin (never as arguments, never from a file in the repository):
 *
 *   bun run hallazgo <<'JSON'
 *   { "title": "…", "kind": "personal_data", "location": "https://…", "description": "…" }
 *   JSON
 *
 * It goes through the same validation as the panel, refuses text that looks like someone's data, skips what
 * is already open for the same address, and prints only the code. `--local` writes to the development
 * database instead of production. It never runs in CI: those logs are public.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Db } from "./db.ts";
import { openDevDb } from "./local-db.ts";
import { findingInput } from "./panel-api.ts";
import { privacyWarnings } from "./privacy.ts";
import { remoteD1 } from "./remote-d1.ts";
import { addFinding, openDuplicate } from "./security.ts";
import { audit } from "./store.ts";

const DATABASE_ID = "2ad5ebf5-df14-4843-b453-c9e8cb436ed5"; // apps/web/wrangler.toml

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** The main checkout: worktrees do not have the ignored `.env.cloudflare`, the main copy does. */
function repoRoots(): string[] {
  const here = join(import.meta.dir, "..", "..", "..");
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: here, encoding: "utf8" }).trim();
    return [here, dirname(common)];
  } catch {
    return [here];
  }
}

/** Reads KEY=VALUE lines without printing anything. */
function readEnvFile(): Record<string, string> {
  const file = repoRoots()
    .map((root) => join(root, ".env.cloudflare"))
    .find((f) => existsSync(f));
  if (!file) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1]!, m[2]!]),
  );
}

async function openDb(local: boolean): Promise<Db> {
  if (local) return openDevDb(join(repoRoots()[0]!, ".dev", "participation.sqlite"));
  const env = { ...readEnvFile(), ...process.env };
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN)
    return fail(
      "Faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN. Cargalos en el shell desde la copia que tiene .env.cloudflare (`set -a && . ./.env.cloudflare && set +a`) y volvé a correrlo.",
    );
  return remoteD1({ accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN, databaseId: DATABASE_ID });
}

/** Who loaded it, for the panel and the audit: the agent and the person whose machine ran it. */
function actor(): string {
  let email = "";
  try {
    email = execFileSync("git", ["config", "user.email"], { encoding: "utf8" }).trim();
  } catch {}
  return `agente${email ? ` (${email})` : ""}`;
}

if (process.env.CI || process.env.GITHUB_ACTIONS)
  fail("No se cargan hallazgos desde CI: sus logs son públicos. Lo carga quien lo encontró, en su máquina.");

const local = process.argv.includes("--local");
const raw = await Bun.stdin.text();
let body: Record<string, unknown>;
try {
  body = JSON.parse(raw) as Record<string, unknown>;
} catch {
  fail("El hallazgo va como JSON por la entrada estándar. Ver docs/procesos/seguridad.md.");
}
// An agent does not set the report: that is a person's step, from the panel.
for (const k of ["status", "reportedTo", "reportedOn", "reportReference", "fixedOn"]) delete body![k];

const input = findingInput(body!);
if (typeof input === "string") fail(input);
const f = input as Exclude<typeof input, string>;
if (!f.title || !f.kind || !f.description) fail("Faltan el título, el tipo o la descripción.");

// Naming the kind of data («nombres y DNI») is expected; an actual email, phone, CUIL or DNI number is not.
const warnings = privacyWarnings(`${f.title}\n${f.description}`.replace(/\b(dni|documentos?)\b/gi, ""));
if (warnings.length)
  fail(`El texto parece tener datos de alguien (${warnings.join(", ")}). Describí qué tipo de dato queda expuesto, sin copiarlo.`);

const db = await openDb(local);
const existing = await openDuplicate(db, f);
if (existing) {
  console.log(`Ya estaba cargado: ${existing}. No se agregó nada.`);
  process.exit(0);
}
const at = new Date().toISOString();
const who = actor();
const code = await addFinding(db, { ...f, title: f.title!, kind: f.kind!, description: f.description! }, who, at);
await audit(db, who, "security.create", code, { fields: Object.keys(f), source: "script" }, at);
console.log(`Cargado en el panel: ${code}${local ? " (base de desarrollo)" : ""}. Falta que una persona lo reporte.`);
