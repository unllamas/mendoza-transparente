# Trabajo con agentes

El proyecto se construye con Claude Code. La guía para agentes es `AGENTS.md`, el formato común que leen Codex, Cursor y otros agentes; `CLAUDE.md` solo tiene `@AGENTS.md`, que lo importa, porque Claude Code lee ese nombre. Las reglas se editan siempre en `AGENTS.md`. La sesión principal orquesta y delega las tareas acotadas en subagentes que trabajan en paralelo.

## Roles

- **Sesión principal (Opus)**: decide, diseña, integra, revisa todo lo que entregan los subagentes y hace los commits, en una rama que sale de `dev` (ver [Ramas y releases](ramas-y-releases.md)). **Toda tarea termina con commit, push y PR a `dev`, sin esperar un pedido aparte**: lo que queda sin commitear en un worktree se pierde. **El PR no lo mergea el agente salvo que el usuario se lo pida explícitamente**; si no, lo revisa y lo mergea una persona del equipo. Los cambios que llegan después en la misma conversación van a la misma rama y al mismo PR.
- **Subagentes (Sonnet)**: tareas acotadas y largas: un scraper, un relevamiento, un diccionario de datos, una búsqueda de fotos. Corren en paralelo y en segundo plano. Configurado en `~/.claude/settings.json` con `CLAUDE_CODE_SUBAGENT_MODEL`.

## Harness: skills, hooks y permisos

El repo trae la configuración de Claude Code en `.claude/`. Funciona cuando Claude Code se abre en la carpeta del repo:

- **`skills/<nombre>/SKILL.md`:** una skill por proceso: `codigo`, `arquitectura`, `diseno`, `mejoras`, `vista-previa`, `revisar-interfaz`, `estresar-interfaz`, `analitica`, `datos-y-fuentes`, `contenido-y-metodologia`, `seo-y-geo`, `produccion`, `panel`, `delegar-en-agentes` y `ramas-y-releases`.
  - Cada una tiene una descripción que dice cuándo cargarla y una checklist corta.
  - El detalle sigue en `docs/procesos/`. Si algo cambia, se actualizan los dos en el mismo commit.
  - El índice de qué cargar según la tarea está en `AGENTS.md`.
- **`hooks/protect-secrets.ts`:** se ejecuta antes de cada comando o lectura de archivos y bloquea cualquier intento de mostrar `.env.cloudflare` o `.env.posthog` (`cat`, `grep`, `Read`…). Cargarlos en el shell sí se permite.
- **`.mcp.json`** (en la raíz): servidor MCP de Agentation, para que las notas que se marcan en la pantalla lleguen al agente. Ver [Mejoras de interfaz](mejoras-de-interfaz.md).
- **`settings.json`:**
  - Activa el hook.
  - Permite sin preguntar los comandos de verificación (`typecheck`, `verificar`, `data`, `git status`/`diff`/`log`).
  - Niega leer los archivos de credenciales.

**Sumar un proceso:**
1. Escribir su documento en `docs/procesos/`.
2. Crear la skill: `.claude/skills/<nombre>/SKILL.md`, con `name`, una `description` que diga cuándo cargarla, y la checklist.
3. Agregarla a la tabla de `AGENTS.md`.

Todo en el mismo commit.

## Reglas para delegar

Cada pedido a un subagente incluye:

1. Qué leer primero: `AGENTS.md`, la skill del proceso (`.claude/skills/…`) y, si es una fuente, `packages/core/src/*.ts` y la sección del relevamiento.
2. El objetivo concreto y el formato de salida (archivos, columnas, ids).
3. Qué archivos le pertenecen (solo los de su fuente) y qué **no** tocar: `sources.yaml`, `packages/core`, `package.json`, otras fuentes. Varios agentes editando `bun.lock` a la vez se pisan; las dependencias las instala la sesión principal antes de lanzarlos.
4. **Nunca hacer commit**: lo hace la sesión principal después de revisar.
5. Qué verificar antes de terminar (conteos, totales, escalas, que corra dos veces sin duplicar).
6. Un reporte final breve: archivos, cobertura, problemas y datos dudosos.

## Revisión de lo que entregan

- Correr y mirar los CSV: conteos, totales contra el original, escalas.
- Revisar los casos que el agente marcó como dudosos (por ejemplo, la adjudicación de $54.137 M que resultó ser real, o el intendente de Rivadavia que no coincidía entre fuentes).
- Tipos (`bunx tsc --noEmit`) y, si toca la web, `bun run verificar`.
- Un commit por entrega, con un mensaje en [Conventional Commits](ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr) que explique qué datos trae.

## Cosas que aprendimos

- Los subagentes no ven la conversación: el pedido tiene que ser autocontenido.
- Pedir siempre que verifiquen contra el documento original y que reporten lo dudoso en vez de resolverlo en silencio.
- Las decisiones de diseño y producto las toma la sesión principal; los subagentes ejecutan.
- **El turno no termina esperando una CI.** Varias veces la sesión cerró con «espero a que termine la CI» y la persona tuvo que preguntar «¿y?». La CI y el despliegue se siguen en segundo plano hasta el final, y la tarea llega hasta donde se pidió (ver [Hasta dónde llevar cada pedido](ramas-y-releases.md#hasta-dónde-llevar-cada-pedido)).
- **La captura muestra un lugar, el pedido es de todos.** Un arreglo de interfaz se busca en todas las páginas que tienen el mismo patrón (ver [Mejoras de interfaz](mejoras-de-interfaz.md#2-entender-el-pedido-para-el-agente)).
- **Cada propuesta dice cuánto gasta.** El proyecto no tiene financiación: una CI nueva, una función o un servicio se evalúa contra los planes gratis (ver [Costo cero](arquitectura.md#costo-cero)).
