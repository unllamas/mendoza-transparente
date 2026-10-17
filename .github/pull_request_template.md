<!--
Plantilla de PR (docs/procesos/ramas-y-releases.md). Vale para personas y agentes.
- Base: `dev` para todo lo nuevo; `main` solo para una publicación (desde `dev`) o un hotfix. Los releases de GitHub los crea solo el workflow «Release del día».
- Título en Conventional Commits, `<tipo>(<ámbito>): <descripción en español>` (por ejemplo `feat(web): …`, `fix(scrapers): …`, `chore(release): 2026-10-17`). Con squash es el commit que queda en `dev`, y la CI lo valida.
- Marcá [x] lo que revisaste y tachá con ~~…~~ lo que no aplica, diciendo por qué. No borres ítems.
- Un agente completa cada punto mirando el diff (`git diff origin/dev...HEAD`) y corriendo los comandos, no de memoria.
-->

## Qué cambia y por qué

<!-- En dos o tres líneas, para alguien que no vio la conversación. Link al issue o al pedido si hay. -->

## Revisión del propio cambio

**Alcance**
- [ ] El diff tiene solo lo de esta tarea: nada de otra rama, ni archivos sueltos, ni `bun.lock` sin una dependencia nueva.
- [ ] La rama sale de `dev` (o de `main` si es un hotfix) y el PR apunta a esa base. Un hotfix necesita confirmar después el back merge a `dev`; una publicación (`dev → main`) se mergea con merge commit.
- [ ] El título sigue Conventional Commits, y si rompe un contrato (una columna de un CSV publicado) lleva `!` y explica la migración.

**Documentación**
- [ ] Si cambia un proceso, está actualizado su documento en `docs/procesos/` y su skill en `.claude/skills/`.
- [ ] Si es un proceso nuevo: documento + skill + fila en la tabla de `AGENTS.md`.
- [ ] Si cambian comandos, scripts o rutas, los busqué en `docs/`, `.claude/skills/`, `AGENTS.md` y `README.md` y no quedó ninguna referencia vieja.

**Convenciones**
- [ ] Código en inglés; documentación, descripción de los commits y textos visibles en español.
- [ ] Ningún secreto ni `.env*` en el diff.

**Datos** (si toca `data/` o `packages/scrapers`)
- [ ] `data/raw/` solo suma archivos: no se editó ni se borró ninguno.
- [ ] No se renombró ninguna columna de un CSV publicado, y el diccionario está al día.
- [ ] `sources.yaml` refleja el `estado` de la fuente.

**Interfaz** (si toca `apps/web`, `apps/panel` o `packages/ui`)
- [ ] Revisé el cambio con la skill `revisar-interfaz` (veredicto abajo).
- [ ] Las interacciones nuevas tienen su evento en `apps/web/src/analytics-catalog.ts`.
- [ ] Capturas en 375 px y 1280 px adjuntas.

## Cómo se verificó

<!-- Cada comando que corriste y su resultado. Si no corriste uno, decí por qué. -->

| Comando | Resultado |
|---|---|
| `bun run lint` | |
| `bun run typecheck` | |
| `bun test` | |
| `bun run verificar` (si hay interfaz) | |
| Otro (scraper, `bun run data`…) | |

Probado en la vista previa de Cloudflare: <!-- link o "no aplica" -->

## Riesgos y pendientes

<!-- Qué podría romperse, qué quedó afuera y qué hay que mirar después de publicar. "Ninguno" también es una respuesta. -->
