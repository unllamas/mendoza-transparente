# Novedades semanales

`/novedades` cuenta, una vez por semana, qué se sumó al sitio, escrito para quien lo usa y no para el equipo. Los releases de GitHub siguen siendo diarios y técnicos ([Ramas y releases](ramas-y-releases.md)); las novedades salen de ellos, reescritas.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| El texto de cada semana | `data/curado/novedades/<lunes>.yaml` (el lunes en que empieza la semana: `2026-10-26.yaml`) |
| El borrador | `bun run novedades` (`scripts/weekly-update.ts`) |
| El JSON que lee la web | `temas/novedades.json`, de `apps/web/scripts/temas/updates.ts` |
| Las páginas | `/novedades` y `/novedades/<lunes>` (`apps/web/src/pages/updates.tsx`) |
| La imagen de cada semana | `/og/novedades-<lunes>.webp`, la misma que se comparte: la genera `scripts/seo.ts` en el build, con el diseño de todas las imágenes para compartir ([La web](web.md#seo-y-geo)) |
| El link | En el pie: «Novedades de cada semana» |

## Cada semana

1. **Armar el borrador** el viernes o el fin de semana, desde la raíz:
   ```bash
   bun run novedades                       # la semana en curso
   bun run novedades --semana 2026-10-26   # otra semana, por su lunes
   ```
   Toma los releases diarios de esa semana, se queda con los `feat` que ve la gente (deja afuera el panel, las piezas para redes, los procesos, la CI y votación mientras esté en construcción) y escribe el YAML con `borrador: true`. Un borrador no se publica. Si el archivo ya existe, no lo pisa (`--forzar` para hacerlo).
2. **Reescribirlo** en lenguaje llano (skill `diseno`, «Textos», y `contenido-y-metodologia`):
   - `titulo`: lo más importante de la semana, en una frase corta que entre en una línea de la imagen («Llegó Aco, el asistente de trámites»).
   - `bajada`: las novedades en una oración («Aco, trámites y tasas por municipio, y la carpeta del trámite en PDF.»).
   - `novedades`: de 3 a 5. Se juntan las que hablan de lo mismo y se sacan los ajustes internos. Cada una con un `titulo` que dice qué puede hacer la persona ahora («Pedí un dato que falta»), un `texto` de una o dos oraciones y, si hay una página donde se ve, un `link` con un texto que empieza con verbo («Ver los partidos») y la `ruta`.
   - Se borran los comentarios del borrador y la línea `borrador: true`.
3. **Mirarla** con `bun run data` y `bun run dev` en `/novedades/<lunes>` (la imagen solo existe después del build: en desarrollo queda el recuadro vacío). Para ver la imagen: `cd apps/web && bunx vite build && bun scripts/seo.ts` y abrir `dist/og/novedades-<lunes>.webp`.
4. **Publicarla** como cualquier cambio de contenido: rama desde `dev`, PR `docs(data): novedades de la semana del <lunes>` y la publicación a `main` ([Ramas y releases](ramas-y-releases.md)).

Una semana sin nada que la gente note no lleva entrada.

## Reglas

- **Lo que ve la gente, no cómo se hizo:** «Un buscador que encuentra por apellido», no «normalización de tokens en el índice».
- **Señales, no acusaciones,** como en el resto del sitio: una novedad sobre datos dice qué se puede mirar, no qué conclusión sacar.
- **El YAML se valida en el build:** el nombre tiene que ser un lunes y cada semana necesita `titulo`, `bajada` y al menos una novedad con `titulo` y `texto`; un `link` necesita `texto` y una `ruta` que empiece con `/`. Si falta algo, `bun run data` se corta y dice qué archivo.
- **La imagen se reconoce de un vistazo:** fecha arriba, el título y «N novedades» en grande. Por eso el título se escribe corto.
