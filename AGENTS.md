# Mendoza Transparente: guía para agentes

Este archivo es la guía única para cualquier agente (Claude Code, Codex, Cursor…). `CLAUDE.md` solo lo importa.

Proyecto cívico: recopilar los datos públicos de Mendoza, normalizarlos y publicarlos curados de cara a las elecciones de 2027. Ver `README.md` y `docs/relevamiento-fuentes.md`.

**Los procesos internos están documentados en `docs/procesos/`** (agregar una fuente, actualización de datos, reglas de `data/`, la web, diseño, metodología y trabajo con agentes). Leer el que corresponda antes de empezar. **Todo proceso nuevo o cambio en uno existente se documenta ahí en el mismo commit.**

## Idioma (regla sin excepciones)

| Qué | Idioma | Ejemplos |
|---|---|---|
| **Todo el código**: variables, funciones, tipos, componentes, nombres de archivo y carpeta, ids de eventos, comentarios en el código | **Inglés** | `buildMunicipalStaff`, `list-search.tsx`, `purchase.flag.toggle` |
| **Toda la documentación**: `docs/`, `README`, `AGENTS.md`, skills, mensajes de commit | **Español** | `docs/procesos/web.md` |
| **Lo que ve la gente**: textos de la web, rutas públicas, nombres de eventos en PostHog | **Español** | `/leyes`, "Lo que no se publica" |
| **Contratos públicos de datos**: columnas de los CSV publicados | Español, `snake_case` | `fecha_corte`, `tipo_personal` |

El código viejo en español se pasa al inglés cuando se toca. Las columnas de los CSV no se renombran sin un plan de migración, porque otros pueden depender de ellas.

## Skills: qué cargar según la tarea

Las skills del proyecto (`.claude/skills/<nombre>/SKILL.md`) son la puerta de entrada a cada proceso: dicen cuándo se usan y traen la checklist; el detalle vive en `docs/procesos/`. **Cargar la que corresponda antes de empezar**, y más de una si la tarea cruza procesos. Un agente que no carga skills lee el mismo `SKILL.md` como archivo.

| Si vas a… | Skill |
|---|---|
| Escribir o cambiar código, en cualquier parte | `codigo` |
| Crear un archivo, un paquete o una app; mover código; agregar una dependencia | `arquitectura` |
| Crear o retocar una pantalla, un componente, un gráfico o un texto visible | `diseno` |
| Resolver un pedido de mejora o arreglo sobre algo existente (una nota de Agentation, una captura, "esto se ve mal") | `mejoras` |
| Revisar un cambio de interfaz antes de commitear, o lo que entregó un subagente | `revisar-interfaz` |
| Probar un componente con datos extremos (nombres largos, listas vacías, sin foto) | `estresar-interfaz` |
| Agregar un botón, un link, un formulario o una interacción; tocar PostHog | `analitica` |
| Crear o tocar un scraper; relevar o procesar una fuente | `datos-y-fuentes` |
| Escribir un texto que interpreta datos, calcular una cifra o una señal, editar `data/curado` | `contenido-y-metodologia` |
| Crear una página o un tipo de entidad; títulos, rutas, buscador o previsualizaciones | `seo-y-geo` |
| Publicar o tocar Cloudflare, D1 o PostHog; diagnosticar el sitio en vivo | `produccion` |
| Lanzar un subagente o integrar lo que devolvió | `delegar-en-agentes` |

**Proceso nuevo = documento en `docs/procesos/` + skill (o sección en una existente) + fila en esta tabla, en el mismo commit.**

## Pedidos de mejora

Cuando alguien pide mejorar o arreglar algo, lo describe como lo siente ("no se entiende", "se corta"), no con la regla. El agente ubica el lugar exacto, traduce el pedido a la regla de `docs/procesos/diseno.md` que está en juego y, si el pedido trae una regla que no estaba escrita, la escribe en el mismo commit. Proceso completo: skill `mejoras` y `docs/procesos/mejoras-de-interfaz.md`. Para señalar en pantalla, `bun run dev` muestra la barra de Agentation, y sus notas se copian al chat o llegan solas al agente por el MCP de `.mcp.json` (con `VITE_AGENTATION_ENDPOINT` en `apps/web/.env.local`).

## Orquestación

- La sesión principal orquesta. Las tareas acotadas (un scraper, un parser, una verificación) van a subagentes en Sonnet, en paralelo y sobre archivos distintos.
- Cada subagente trabaja solo en los archivos de su fuente: `packages/scrapers/src/sources/<id>.ts` y `data/*/<id>/`. Si necesita tocar `packages/core/` o agregar dependencias, lo propone en vez de hacerlo (varios agentes en paralelo pisarían `bun.lock`).
- Los subagentes no commitean. La sesión principal revisa y commitea.

## Convenciones de datos

- Descargar siempre con `fetchAndArchive()` o `get()` + `archive()` de `@mt/core`: manda el User-Agent de navegador (sin él, los sitios del gobierno devuelven 403), archiva en `data/raw/<id>/<YYYY-MM-DD>/` y registra cada descarga en `manifest.jsonl` con su sha256.
- `data/raw/` es de solo agregar: nunca editar ni borrar un archivo crudo.
- Los archivos de más de 1 MB se guardan con gzip. GitHub rechaza archivos de más de 100 MB: si algo supera unos 50 MB comprimido, avisar antes de commitear.
- Los datos normalizados van en `data/processed/<id>/` como CSV UTF-8, con columnas en snake_case. Los montos van en pesos nominales; la conversión a valores reales se hace en el análisis.
- Cada scraper es idempotente: correrlo dos veces seguidas no duplica nada.
- Ser amable con los servidores: hacer los pedidos en secuencia, con pausas, y nunca en paralelo masivo contra un mismo dominio.

## Código

- **Idioma:** variables, funciones, tipos, nombres de archivo y todo el código, en inglés. La documentación (`docs/`, README, este archivo) va en español, igual que el texto visible en la web y las rutas públicas (`/leyes`, `/municipios`). Parte del código viejo todavía está en español: lo que se toque, se pasa al inglés. Las columnas de los CSV publicados son un contrato público: no se renombran sin un plan de migración.
- Monorepo con Bun workspaces y Turborepo, en TypeScript estricto. Bun ejecuta TS directo, sin build.
- Un scraper por fuente en `packages/scrapers/src/sources/<id>.ts`, que exporta `async function run(args: string[])`. Se corre con `bun run scrape <id>`.
- Dependencias ya disponibles en `@mt/scrapers`: `cheerio` (HTML), `xlsx` (SheetJS, para XLS y XLSX), `unpdf` (texto de PDF), `fflate` (ZIP) y `stream-json` (JSON grandes en streaming).
- CSV con `writeProcessed()` y `readProcessed()`, y municipios con `normalizeMunicipio()`, todos de `@mt/core`.
- Verificar tipos con `bunx tsc --noEmit` dentro del paquete.
- Interfaz: los componentes base y los tokens están en `packages/ui` (`@mt/ui`, configuración de shadcn). Solo Tailwind, sin CSS propio. Ver la skill `diseno`.
- Al terminar una fuente, actualizar su `estado` en `sources.yaml`. Lo hace la sesión principal.

## Verificación

- Tipos: `bun run typecheck`.
- Web: `bun run verificar` (sin scroll horizontal en ningún ancho, consola limpia y un solo scroll con el menú móvil abierto). Obligatorio antes de dar por terminado un cambio de interfaz.
- Actualización manual de datos (respaldo de GitHub Actions): `bun run actualizar`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
