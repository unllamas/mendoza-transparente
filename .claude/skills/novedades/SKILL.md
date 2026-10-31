---
name: novedades
description: Novedades semanales de Mendoza Transparente (/novedades): armar el borrador de la semana con `bun run novedades` a partir de los releases, reescribirlo en lenguaje llano en data/curado/novedades/<lunes>.yaml y publicarlo. Cubre el formato del YAML, qué entra y qué no, la imagen de cada semana y las páginas. Cargar cuando piden las novedades de la semana, un changelog o un posteo de lo que se sumó al sitio, o al tocar /novedades.
---

# Novedades semanales

Fuente completa: `docs/procesos/novedades.md`. Cargar también `diseno` (textos) y `contenido-y-metodologia`.

## Checklist

1. `bun run novedades` (o `--semana <lunes>`): escribe `data/curado/novedades/<lunes>.yaml` con `borrador: true` y los `feat` que ve la gente de los releases de esa semana.
2. Reescribir para quien usa el sitio:
   - `titulo` corto, que entre en una línea de la imagen.
   - `bajada` de una oración.
   - De 3 a 5 `novedades`, cada una con `titulo` (qué puede hacer la persona ahora), `texto` de una o dos oraciones y `link` (`texto` con verbo, `ruta` que empieza con `/`) si hay una página donde se ve.
3. Borrar los comentarios del borrador y la línea `borrador: true`.
4. `bun run data` (valida el YAML) y mirar `/novedades/<lunes>` con `bun run dev`. La imagen sale del build: `cd apps/web && bunx vite build && bun scripts/seo.ts`.
5. Rama desde `dev`, PR `docs(data): novedades de la semana del <lunes>` y publicación (skill `ramas-y-releases`).

## No

- Ajustes internos (panel, CI, procesos, refactors) ni jerga técnica.
- Una entrada para una semana sin nada que la gente note.
- Inventar lo que una novedad hace: cada texto se verifica en el sitio.
