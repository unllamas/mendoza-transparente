/**
 * Novedades semanales (/novedades): lee data/curado/novedades/<lunes>.yaml, las valida y las ordena de la más nueva
 * a la más vieja. Las que tienen `borrador: true` (las que arma `bun run novedades`) no se publican hasta que alguien
 * las reescribe y saca esa línea. Proceso: docs/procesos/novedades.md.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { WeeklyUpdate } from "../../src/types.ts";

interface UpdateFile {
  borrador?: boolean;
  titulo?: string;
  bajada?: string;
  cambios?: string;
  novedades?: { titulo?: string; texto?: string; link?: { texto?: string; ruta?: string } }[];
}

const WEEK = /^(\d{4}-\d{2}-\d{2})\.yaml$/;

export function buildUpdates(dir: string): WeeklyUpdate[] {
  if (!existsSync(dir)) return [];
  const updates: WeeklyUpdate[] = [];
  for (const file of readdirSync(dir)) {
    const week = file.match(WEEK)?.[1];
    if (!week) continue;
    const raw = parseYaml(readFileSync(join(dir, file), "utf8")) as UpdateFile | null;
    if (!raw || raw.borrador) continue;
    const where = `data/curado/novedades/${file}`;
    // Un lunes de verdad: es la URL de la semana y lo que la ordena.
    if (new Date(`${week}T12:00:00Z`).getUTCDay() !== 1) throw new Error(`${where}: ${week} no es un lunes`);
    if (!raw.titulo || !raw.bajada || !raw.novedades?.length) throw new Error(`${where}: faltan titulo, bajada o novedades`);
    updates.push({
      week,
      title: raw.titulo,
      summary: raw.bajada,
      changesUrl: raw.cambios ?? "https://github.com/unllamas/mendoza-transparente/releases",
      items: raw.novedades.map((n, i) => {
        if (!n.titulo || !n.texto) throw new Error(`${where}: la novedad ${i + 1} no tiene titulo o texto`);
        if (n.link && (!n.link.texto || !n.link.ruta?.startsWith("/")))
          throw new Error(`${where}: el link de «${n.titulo}» necesita texto y una ruta que empiece con /`);
        return { title: n.titulo, text: n.texto, ...(n.link ? { link: { label: n.link.texto!, to: n.link.ruta! } } : {}) };
      }),
    });
  }
  return updates.sort((a, b) => b.week.localeCompare(a.week));
}
