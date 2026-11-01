# Mendoza Transparente: guía para agentes

Este archivo es la guía única para cualquier agente (Claude Code, Codex, Cursor…). `CLAUDE.md` solo lo importa.

Proyecto cívico: recopilar los datos públicos de Mendoza, normalizarlos y publicarlos curados. Ver `README.md` y `docs/relevamiento-fuentes.md`.

**Los procesos internos están documentados en `docs/procesos/`** (agregar una fuente, actualización de datos, reglas de `data/`, la web, diseño, metodología y trabajo con agentes). Leer el que corresponda antes de empezar. **Todo proceso nuevo o cambio en uno existente se documenta ahí en el mismo commit.** Lo que todavía es una idea o un proyecto en curso va en `docs/planes/` (la hoja de ruta) y pasa a `docs/procesos/` cuando queda funcionando.

## Idioma (regla sin excepciones)

| Qué | Idioma | Ejemplos |
|---|---|---|
| **Todo el código**: variables, funciones, tipos, propiedades, componentes, nombres de archivo y carpeta, ids de eventos | **Inglés** | `buildMunicipalStaff`, `list-search.tsx`, `purchase.flag.toggle` |
| **Los comentarios del código**: cabeceras de archivo, JSDoc, explicaciones de cómo se usa algo o por qué está así | **Español** | `/** Proveedores del modelo: se prueban en orden… */` |
| **Toda la documentación**: `docs/`, `README`, `AGENTS.md`, skills, descripción de los commits | **Español** | `docs/procesos/web.md` |
| **Tipo y ámbito de los commits** ([Conventional Commits](docs/procesos/ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr)) | **Inglés** | `feat(web): botón «Compartir»` |
| **Lo que ve la gente**: textos de la web, rutas públicas, nombres de eventos en PostHog | **Español** | `/leyes`, "Lo que no se publica" |
| **Contratos públicos de datos**: columnas de los CSV publicados | Español, `snake_case` | `fecha_corte`, `tipo_personal` |

Los comentarios son documentación: los lee el equipo, que trabaja en español, para entender cómo se usa el sistema. Adentro de un comentario, los nombres del código se escriben tal cual (`fetchOrReuse()`, `AI_GATEWAY_API_KEY`).

No se hace un repaso de todo lo existente. **Lo que se toca, se acomoda en ese mismo cambio:** los nombres viejos en español se pasan al inglés, y los comentarios en inglés del archivo que se edita se traducen al español. Las columnas de los CSV no se renombran sin un plan de migración, porque otros pueden depender de ellas.

## Skills: qué cargar según la tarea

Las skills del proyecto (`.claude/skills/<nombre>/SKILL.md`) son la puerta de entrada a cada proceso: dicen cuándo se usan y traen la checklist; el detalle vive en `docs/procesos/`. **Cargar la que corresponda antes de empezar**, y más de una si la tarea cruza procesos. Un agente que no carga skills lee el mismo `SKILL.md` como archivo.

| Si vas a… | Skill |
|---|---|
| Escribir o cambiar código, en cualquier parte | `codigo` |
| Crear un archivo, un paquete o una app; mover código; agregar una dependencia | `arquitectura` |
| Crear o retocar una pantalla, un componente, un gráfico o un texto visible | `diseno` |
| Decidir un cambio a partir de cómo se usa el sitio («qué es lo que más se usa», «por qué no lo tocan») | `analitica`, después `vista-previa` |
| Resolver un pedido de mejora o arreglo sobre algo existente (una nota de Agentation, una captura, "esto se ve mal") | `mejoras` |
| Ver cómo quedaría una pantalla o un componente antes de tocar el código real («quiero verlo antes», comparar opciones, reordenar una página) | `vista-previa` |
| Revisar un cambio de interfaz antes de commitear, o lo que entregó un subagente | `revisar-interfaz` |
| Probar un componente con datos extremos (nombres largos, listas vacías, sin foto) | `estresar-interfaz` |
| Agregar un botón, un link, un formulario o una interacción; tocar PostHog | `analitica` |
| Crear o tocar un scraper; relevar o procesar una fuente | `datos-y-fuentes` |
| Revisar qué publica cada municipio (`data/curado/transparencia-municipal.yaml`) | `contenido-y-metodologia` |
| Escribir un texto que interpreta datos, calcular una cifra o una señal, editar `data/curado` | `contenido-y-metodologia` |
| Crear una página o un tipo de entidad; títulos, rutas, buscador o previsualizaciones | `seo-y-geo` |
| Publicar o tocar Cloudflare, D1 o PostHog; diagnosticar el sitio en vivo | `produccion` |
| Tocar el panel interno (`apps/panel`), el registro público (`/api/registro`), la API de participación o el acceso del equipo | `panel` |
| Encontrar un problema de seguridad en un sitio del Estado (datos de la gente expuestos, un sitio hackeado) | `panel` y `docs/procesos/seguridad.md` |
| Relevar un trámite, sumar la tarifaria de un municipio o tocar la fuente `tributos` | `tramites-y-tributos` |
| Hacer un video o una pieza para redes que muestra el sitio en uso | `piezas-sociales` |
| Armar las novedades de la semana, un changelog de lo que se sumó al sitio, o tocar `/novedades` | `novedades` |
| Tocar el asistente Aco (`packages/assistant`, `/api/asistente`, su widget, instrucciones, modelo o claves) | `asistente` |
| Lanzar un subagente o integrar lo que devolvió | `delegar-en-agentes` |
| Crear una rama, commitear, pushear o abrir un PR (incluido el de publicación `dev → main`), tocar los releases de GitHub o hacer un hotfix | `ramas-y-releases` |

**Proceso nuevo = documento en `docs/procesos/` + skill (o sección en una existente) + fila en esta tabla, en el mismo commit.**

## Seguridad y legalidad (regla sin excepciones)

Solo se usa lo que el Estado publica. Nunca buscar fallas, pasar un login o un captcha, ni descargar o guardar datos personales expuestos por error. Si aparece un problema de seguridad: parar, cargarlo en el panel con `bun run hallazgo` (JSON por la entrada estándar, sin copiar los datos) y avisarle a la persona con el código `S-…`, para que lo reporte al organismo, a CERT.ar y, si hay datos personales, a la AAIP. Nunca se escribe en el repositorio, en commits, PR o issues. Proceso completo: `docs/procesos/seguridad.md`.

## Pedidos de mejora

Cuando alguien pide mejorar o arreglar algo, lo describe como lo siente ("no se entiende", "se corta"), no con la regla. El agente ubica el lugar exacto, traduce el pedido a la regla de `docs/procesos/diseno.md` que está en juego y, si el pedido trae una regla que no estaba escrita, la escribe en el mismo commit. Proceso completo: skill `mejoras` y `docs/procesos/mejoras-de-interfaz.md`. Para señalar en pantalla, `bun run dev` muestra la barra de Agentation, y sus notas se copian al chat o llegan solas al agente por el MCP de `.mcp.json` (con `VITE_AGENTATION_ENDPOINT` en `apps/web/.env.local`).

## Orquestación

- La sesión principal orquesta. Las tareas acotadas (un scraper, un parser, una verificación) van a subagentes en Sonnet, en paralelo y sobre archivos distintos.
- Cada subagente trabaja solo en los archivos de su fuente: `packages/scrapers/src/sources/<id>.ts` y `data/*/<id>/`. Si necesita tocar `packages/core/` o agregar dependencias, lo propone en vez de hacerlo (varios agentes en paralelo pisarían `bun.lock`).
- **Cuidar el contexto:** una página, un PDF o una planilla se miran con `bun run crudo <url|fuente/archivo>` (busca primero en `data/raw/` y en un caché compartido, y devuelve una vista compacta), nunca con `curl` ni enteros. De los documentos largos se lee la sección que hace falta: `bun run seccion <documento> "<título>"`. El reporte de un subagente entra en una pantalla y los relevamientos van a `tmp/agentes/<tarea>.md`. Las orquestaciones largas se parten en sesiones por etapa. Ver `docs/procesos/trabajo-con-agentes.md#cuidar-el-contexto`.
- Los subagentes no commitean. La sesión principal revisa, commitea y **cierra cada tarea con push y PR a `dev` sin esperar que se lo pidan**.
- **Ningún agente mergea un PR, ni a `dev` ni a `main`, salvo que el usuario se lo pida explícitamente** para ese PR. Sin ese pedido, el agente deja el PR abierto con la CI en verde y avisa con el link.
- Nada se pushea directo a `main`, tampoco los datos: lo nuevo va en una rama que sale de `dev`, con PR a `dev`, y llega a producción en una publicación (PR `dev → main`). Los releases de GitHub se crean solos, uno por día. Ver la skill `ramas-y-releases`.

## Costo cero

El proyecto no tiene financiación y vive en planes gratis (Cloudflare, GitHub Actions, PostHog). Toda propuesta que suma consumo (una CI, un workflow, una función, un servicio) dice cuánto gasta y de qué cupo antes de hacerse. Ver `docs/procesos/arquitectura.md#costo-cero`.

## Convenciones de datos

- Descargar siempre con `fetchAndArchive()` o `get()` + `archive()` de `@mt/core`: manda el User-Agent de navegador (sin él, los sitios del gobierno devuelven 403), archiva en `data/raw/<id>/<YYYY-MM-DD>/` y registra cada descarga en `manifest.jsonl` con su sha256.
- `data/raw/` es de solo agregar: nunca editar ni borrar un archivo crudo.
- Los archivos de más de 1 MB se guardan con gzip. GitHub rechaza archivos de más de 100 MB: si algo supera unos 50 MB comprimido, avisar antes de commitear.
- Los datos normalizados van en `data/processed/<id>/` como CSV UTF-8, con columnas en snake_case. Los montos van en pesos nominales; la conversión a valores reales se hace en el análisis.
- Cada scraper es idempotente: correrlo dos veces seguidas no duplica nada.
- Ser amable con los servidores: hacer los pedidos en secuencia, con pausas, y nunca en paralelo masivo contra un mismo dominio.

## Código

- **Idioma:** variables, funciones, tipos, propiedades y nombres de archivo, en inglés. Los comentarios que explican el código, en español, igual que la documentación (`docs/`, README, este archivo), el texto visible en la web y las rutas públicas (`/leyes`, `/municipios`). Lo viejo se acomoda cuando se toca: los nombres en español pasan al inglés y los comentarios en inglés del archivo que se edita pasan al español. Las columnas de los CSV publicados son un contrato público: no se renombran sin un plan de migración.
- Monorepo con Bun workspaces y Turborepo, en TypeScript estricto. Bun ejecuta TS directo, sin build.
- Un scraper por fuente en `packages/scrapers/src/sources/<id>.ts`, que exporta `async function run(args: string[])`. Se corre con `bun run scrape <id>`.
- Dependencias ya disponibles en `@mt/scrapers`: `cheerio` (HTML), `xlsx` (SheetJS, para XLS y XLSX), `unpdf` (texto de PDF), `fflate` (ZIP) y `stream-json` (JSON grandes en streaming).
- CSV con `writeProcessed()` y `readProcessed()`, y municipios con `normalizeMunicipio()`, todos de `@mt/core`.
- Antes de escribir una función auxiliar en un scraper, usar las que ya existen: `sleep`, `collapseSpaces`, `parseArNumber`, `finiteNumber` y `fetchOrReuse()` (devuelve lo archivado o lo descarga una vez) de `@mt/core`, y `pdfText` y `pdfPages` de `packages/scrapers/src/lib/pdf.ts`.
- Verificar tipos con `bunx tsc --noEmit` dentro del paquete.
- Interfaz: los componentes base y los tokens están en `packages/ui` (`@mt/ui`), con BoardUI (React Aria) como base y tema claro por defecto. Solo Tailwind, sin CSS propio. Ver la skill `diseno`.
- Al terminar una fuente, actualizar su `estado` en `sources.yaml`. Lo hace la sesión principal.

## Verificación

- Tipos: `bun run typecheck`.
- Web: `bun run verificar` (sin scroll horizontal en ningún ancho, consola limpia y un solo scroll con el menú móvil abierto). Obligatorio antes de dar por terminado un cambio de interfaz.
- Velocidad: `bun run medir` (LCP, FCP y CLS de las páginas clave sobre el build, en celular y escritorio). Correrlo cuando un cambio toca cómo carga una página. Ver `docs/procesos/web.md#velocidad-de-carga`.
- Actualización manual de datos: `bun run actualizar`, todos los lunes desde Argentina (Boletín Oficial, Ética Pública y Senado no se actualizan en la nube).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
