/**
 * `bun run seccion`: lee una sola sección de un documento en vez del archivo entero.
 *
 *   bun run seccion diseno                       índice de docs/procesos/diseno.md (títulos, línea y tamaño)
 *   bun run seccion diseno "una sola línea"      la sección cuyo título contiene ese texto (sin importar tildes)
 *   bun run seccion web#velocidad-de-carga       la sección del ancla, como en los links de los documentos
 *   bun run seccion docs/relevamiento-fuentes.md "Boletín"
 *
 * Los documentos de procesos más largos pasan los 30 KB y casi nunca hace falta leerlos completos.
 * Ver docs/procesos/trabajo-con-agentes.md#cuidar-el-contexto.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

interface Heading {
  level: number;
  title: string;
  line: number;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Ancla de un título como la arma GitHub: minúsculas, sin puntuación y espacios como guiones. */
export const anchorOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

function resolveDoc(name: string): string | null {
  const candidates = [name, join("docs/procesos", `${name}.md`), join("docs", `${name}.md`), join(".claude/skills", name, "SKILL.md")];
  return candidates.map((c) => join(ROOT, c)).find((p) => existsSync(p) && p.endsWith(".md")) ?? null;
}

export function headingsOf(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (l.startsWith("```")) fence = !fence;
    const m = !fence && l.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (m) out.push({ level: m[1]!.length, title: m[2]!, line: i });
  });
  return out;
}

/** Hasta dónde llega la sección que empieza en `h`: el siguiente título del mismo nivel o más alto. */
function sectionEnd(h: Heading, headings: Heading[], total: number): number {
  return headings.find((o) => o.line > h.line && o.level <= h.level)?.line ?? total;
}

export function index(lines: string[]): string {
  const headings = headingsOf(lines);
  const size = (h: Heading) =>
    lines
      .slice(h.line, sectionEnd(h, headings, lines.length))
      .join("\n")
      .length.toLocaleString("es-AR");
  return headings
    .filter((h) => h.level >= 2 && h.level <= 3)
    .map((h) => `${"  ".repeat(h.level - 2)}${h.title}  (línea ${h.line + 1}, ${size(h)} caracteres)`)
    .join("\n");
}

export function section(lines: string[], query: string, byAnchor: boolean): string {
  const headings = headingsOf(lines);
  const matches = byAnchor
    ? headings.filter((h) => anchorOf(h.title) === query.toLowerCase())
    : headings.filter((h) => fold(h.title).includes(fold(query)));
  if (!matches.length) return `Ninguna sección coincide con «${query}». Índice:\n${index(lines)}`;
  if (matches.length > 1 && !matches.some((h) => fold(h.title) === fold(query))) {
    return `Varias secciones coinciden con «${query}»; usar un título más preciso:\n${matches.map((h) => `- ${h.title} (línea ${h.line + 1})`).join("\n")}`;
  }
  const h = matches.find((m) => fold(m.title) === fold(query)) ?? matches[0]!;
  return lines
    .slice(h.line, sectionEnd(h, headings, lines.length))
    .join("\n")
    .trimEnd();
}

if (import.meta.main) {
  const [target = "", ...rest] = process.argv.slice(2);
  const [name = "", anchor] = target.split("#");
  const path = resolveDoc(name);
  if (!path) {
    console.log(
      "Uso: bun run seccion <documento>[#ancla] [título]\nDocumento: nombre en docs/procesos (diseno, web…), en docs/, una skill o una ruta.",
    );
    process.exit(1);
  }
  const lines = readFileSync(path, "utf8").split("\n");
  const query = rest.join(" ");
  const rel = path.slice(ROOT.length + 1);
  if (anchor) console.log(section(lines, anchor, true));
  else if (query) console.log(section(lines, query, false));
  else
    console.log(
      `${rel}: ${lines.join("\n").length.toLocaleString("es-AR")} caracteres. Leer una sección: bun run seccion ${name} "<título>"\n\n${index(lines)}`,
    );
}
