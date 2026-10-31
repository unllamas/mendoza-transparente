/**
 * Borrador de las novedades de una semana (/novedades), a partir de lo que llegó a producción.
 *
 * Uso (desde la raíz):
 *   bun run novedades                        la semana en curso (la del lunes más reciente, en hora de Mendoza)
 *   bun run novedades --semana 2026-10-26    otra semana, por su lunes
 *   bun run novedades --forzar               pisa un borrador que ya existe
 *
 * Toma los releases diarios de esa semana (etiquetas 2026-10-26 … 2026-11-01), se queda con lo nuevo que ve la gente
 * (`feat` del sitio, la interfaz y los datos) y escribe data/curado/novedades/<lunes>.yaml con `borrador: true`.
 * El borrador no se publica: alguien lo reescribe en lenguaje llano y saca esa línea. Proceso: docs/procesos/novedades.md.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TIME_ZONE = "America/Argentina/Mendoza";
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const CONVENTIONAL = /^feat(?:\(([\w-]+)\))?!?: (.+?)(?:\s*\(#(\d+)\))?$/;
/** Ámbitos que la gente no ve en el sitio: el panel interno, las piezas para redes, los procesos, la CI y votación (en construcción). */
const INTERNAL_SCOPES = new Set(["panel", "social", "skills", "docs", "scripts", "ci", "release", "votacion"]);
const REPO = "https://github.com/unllamas/mendoza-transparente";

export type DraftItem = { title: string; pr?: string };

/** Los `feat` que ve la gente, en el orden en que llegaron, sin repetidos. */
export function draftItems(subjects: string[]): DraftItem[] {
  const items: DraftItem[] = [];
  for (const subject of subjects) {
    const m = subject.replace(/\s*\[cf-pages-skip\]/gi, "").match(CONVENTIONAL);
    if (!m || (m[1] && INTERNAL_SCOPES.has(m[1]))) continue;
    if (items.some((i) => i.title === m[2])) continue;
    items.push({ title: m[2]!, ...(m[3] ? { pr: m[3] } : {}) });
  }
  return items;
}

/** El lunes de la semana de `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const yamlText = (s: string) => JSON.stringify(s);

export function draftYaml(week: string, items: DraftItem[], changesUrl: string): string {
  const lines = [
    `# Borrador de las novedades de la semana del lunes ${week}, armado con \`bun run novedades\`.`,
    "# Reescribir en lenguaje llano (docs/procesos/novedades.md), dejar 3 a 5 novedades y sacar `borrador: true`.",
    "borrador: true",
    'titulo: ""',
    'bajada: ""',
    `cambios: ${changesUrl}`,
    "novedades:",
    ...items.flatMap((i) => [
      `  # ${i.title}${i.pr ? ` (${REPO}/pull/${i.pr})` : ""}`,
      `  - titulo: ${yamlText(i.title)}`,
      '    texto: ""',
      "    # link: { texto: Ver …, ruta: /… }",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

function git(...args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString().trim()}`);
  return proc.stdout.toString().trim();
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args: string[]) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  const week = mondayOf(flag(args, "--semana") ?? today);
  const sunday = addDays(week, 6);
  const out = join(import.meta.dir, "..", "data", "curado", "novedades", `${week}.yaml`);
  if (existsSync(out) && !args.includes("--forzar")) {
    console.log(`Ya existe ${out}: pasar --forzar para pisarlo.`);
    return;
  }

  git("fetch", "--quiet", "--tags", "origin");
  const tags = git("tag", "--list", "--sort=creatordate")
    .split("\n")
    .filter((t) => TAG.test(t));
  const before = tags.filter((t) => t < week).at(-1);
  const last = tags.filter((t) => t >= week && t <= sunday).at(-1);
  if (!before || !last) {
    console.log(`No hay releases en la semana del ${week}: no hay novedades para armar.`);
    return;
  }

  const subjects = git("log", "--no-merges", "--reverse", "--format=%s", `${before}..${last}`).split("\n");
  const items = draftItems(subjects);
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, draftYaml(week, items, `${REPO}/compare/${before}...${last}`));
  console.log(`Borrador en ${out}: ${items.length} novedades de ${before} a ${last}.`);
}

if (import.meta.main) main(process.argv.slice(2));
