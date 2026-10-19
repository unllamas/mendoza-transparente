/**
 * Release notes grouped by Conventional Commits type, in Spanish.
 *
 * Usage (from the repo root):
 *   bun scripts/release-notes.ts --from origin/main --to origin/dev   body for the dev → main PR
 *   bun scripts/release-notes.ts --release [--from <ref>] [--to origin/main] [--out notes.md]
 *     daily GitHub release, one per day: tagged with the Mendoza date of the last commit, it covers
 *     from the last release of an earlier day (or that day's first commit) to --to. If that day's
 *     release already exists, the notes replace it. Writes `tag`, `title` and `skip` to
 *     $GITHUB_OUTPUT when it runs in GitHub Actions.
 *
 * Documented in docs/procesos/ramas-y-releases.md#releases-de-github-uno-por-día.
 */

import { appendFileSync, writeFileSync } from "node:fs";

const TIME_ZONE = "America/Argentina/Mendoza";
const TAG_PATTERN = /^\d{4}-\d{2}-\d{2}(\.\d+)?$/;

export type Commit = { sha: string; subject: string; body: string };

const SCOPE_LABELS: Record<string, string> = {
  web: "Sitio",
  panel: "Panel",
  ui: "Interfaz",
  core: "Núcleo",
  scrapers: "Fuentes",
  participation: "Participación",
  data: "Datos",
  docs: "Docs",
  skills: "Skills",
  scripts: "Scripts",
  ci: "CI",
};

const GROUPS = ["Nuevo", "Datos y fuentes", "Arreglos", "Documentación", "Mantenimiento", "Otros cambios"] as const;
type Group = (typeof GROUPS)[number];

const CONVENTIONAL = /^(feat|fix|docs|refactor|perf|test|build|ci|style|chore|revert)(?:\(([\w-]+)\))?(!)?: (.+)$/;
const AUTO_DATA = /actualizaci[oó]n autom[aá]tica \(([^)]+)\)/i;
const PR_SUFFIX = /\s*\(#(\d+)\)$/;
/** Tells Cloudflare Pages not to build that push (docs/procesos/web.md#publicar); it never goes into the notes. */
const CF_SKIP = /\s*\[cf-pages-skip\]/gi;

function classify(type: string, scope: string | undefined): Group {
  if (scope === "data" || scope === "scrapers") return "Datos y fuentes";
  if (type === "feat") return "Nuevo";
  if (type === "fix") return "Arreglos";
  if (type === "docs" || scope === "docs" || scope === "skills") return "Documentación";
  return "Mantenimiento";
}

export function buildNotes(commits: Commit[], changedData: string[] = []): string {
  const groups = new Map<Group, string[]>(GROUPS.map((g) => [g, []]));
  const autoSources = new Map<string, number>();
  const breaking: string[] = [];
  let autoCount = 0;

  for (const { subject: raw, body } of commits) {
    const subject = raw.replace(CF_SKIP, "");
    const auto = subject.match(AUTO_DATA);
    if (auto) {
      autoCount++;
      for (const source of auto[1].split(/[,\s]+/).filter(Boolean)) autoSources.set(source, (autoSources.get(source) ?? 0) + 1);
      continue;
    }
    const pr = subject.match(PR_SUFFIX)?.[1];
    const clean = subject.replace(PR_SUFFIX, "");
    const link = pr ? ` (#${pr})` : "";
    const cc = clean.match(CONVENTIONAL);
    if (!cc) {
      groups.get("Otros cambios")?.push(`- ${clean}${link}`);
      continue;
    }
    const [, type, scope, bang, description] = cc;
    if (type === "chore" && (scope === "release" || /^back merge/i.test(description))) continue;
    const label = scope ? `**${SCOPE_LABELS[scope] ?? scope}** · ` : "";
    groups.get(classify(type, scope))?.push(`- ${label}${description}${link}`);
    const footer = body.match(/^BREAKING[ -]CHANGE: (.+)$/m)?.[1];
    if (bang || footer) breaking.push(`- ${description}${link}${footer ? `: ${footer}` : ""}`);
  }

  const sections: string[] = [];
  if (breaking.length) sections.push(`### Cambios que rompen un contrato\n\n${breaking.join("\n")}`);
  for (const group of GROUPS) {
    const lines = groups.get(group) ?? [];
    if (group === "Datos y fuentes") {
      if (autoCount) {
        const sources = [...autoSources].map(([s, n]) => (n > 1 ? `\`${s}\` (${n})` : `\`${s}\``)).join(", ");
        lines.push(`- ${autoCount === 1 ? "1 actualización automática" : `${autoCount} actualizaciones automáticas`}: ${sources}`);
      }
      if (changedData.length) lines.push(`- Datos publicados que cambiaron: ${changedData.map((d) => `\`${d}\``).join(", ")}`);
    }
    if (lines.length) sections.push(`### ${group}\n\n${lines.join("\n")}`);
  }
  return sections.length ? sections.join("\n\n") : "Sin cambios.";
}

function git(...args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString().trim()}`);
  return proc.stdout.toString().trim();
}

function readCommits(range: string): Commit[] {
  const raw = git("log", "--no-merges", "--reverse", "--format=%H%x1f%s%x1f%b%x1e", range);
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body = ""] = entry.split("\x1f");
      return { sha, subject, body };
    });
}

// Published datasets touched in the range: data/processed/<id> and data/curado/<file>.
function readChangedData(from: string, to: string): string[] {
  const files = git("diff", "--name-only", from, to, "--", "data/processed", "data/curado").split("\n").filter(Boolean);
  const ids = files.map((f) => {
    const [, kind, name] = f.split("/");
    return kind === "curado" ? `curado/${name.replace(/\.\w+$/, "")}` : name.replace(/\.\w+$/, "");
  });
  return [...new Set(ids)].sort();
}

// Pull request numbers of the dev → main merges in the range.
function readPublications(range: string): string[] {
  const subjects = git("log", "--first-parent", "--merges", "--reverse", "--format=%s", range).split("\n");
  return subjects.map((s) => s.match(/^Merge pull request #(\d+) from \S+\/dev$/)?.[1]).filter((n): n is string => Boolean(n));
}

function mendozaDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

// The day a release belongs to: when its last commit reached main, in Mendoza time. A run that
// GitHub delays past midnight still lands on the right day.
function releaseDate(to: string): string {
  return mendozaDate(new Date(Number(git("log", "-1", "--format=%ct", to)) * 1000));
}

// Last release of an earlier day. Today's own release (and the old `.2` ones) are rebuilt, not stacked.
export function previousReleaseTag(tags: string[], date: string): string | undefined {
  return tags.find((t) => TAG_PATTERN.test(t) && t.slice(0, 10) < date);
}

// Last commit before that day's midnight in Mendoza, so the first release covers the whole day.
function startOfDay(date: string, to: string): string | undefined {
  const midnight = new Date(`${date}T00:00:00-03:00`).toISOString();
  return git("rev-list", "-1", "--first-parent", `--before=${midnight}`, to) || undefined;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args: string[]) {
  const release = args.includes("--release");
  const to = flag(args, "--to") ?? "HEAD";
  const date = releaseDate(to);
  const tags = git("tag", "--merged", to, "--sort=-creatordate").split("\n");
  const from = flag(args, "--from") || (release ? (previousReleaseTag(tags, date) ?? startOfDay(date, to)) : "origin/main");
  if (!from) throw new Error("No hay un release anterior ni commits antes de hoy: pasar --from <ref>.");
  const range = `${from}..${to}`;
  const commits = readCommits(range);
  let notes = buildNotes(commits, readChangedData(from, to));

  if (!release) {
    console.log(notes);
    return;
  }

  const output = process.env.GITHUB_OUTPUT;
  if (!commits.length) {
    console.log(`Sin cambios desde ${from}: no hay release.`);
    if (output) appendFileSync(output, "skip=true\n");
    return;
  }

  const tag = date;
  const title = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", dateStyle: "long" }).format(new Date(`${date}T12:00:00Z`));
  const publications = readPublications(range);
  const intro = publications.length
    ? `Llegó a mendoza-transparente.com en ${publications.length === 1 ? "1 publicación" : `${publications.length} publicaciones`}: ${publications.map((n) => `#${n}`).join(", ")}.`
    : "Sin publicaciones de `dev`: solo datos o arreglos urgentes en producción.";
  const repo = process.env.GITHUB_REPOSITORY;
  const compare = repo && TAG_PATTERN.test(from) ? `\n\n**Todos los cambios:** https://github.com/${repo}/compare/${from}...${tag}` : "";
  notes = `${intro}\n\n${notes}${compare}\n`;

  const out = flag(args, "--out");
  if (out) writeFileSync(out, notes);
  else console.log(notes);
  if (output) appendFileSync(output, `skip=false\ntag=${tag}\ntitle=${title}\n`);
}

if (import.meta.main) main(process.argv.slice(2));
