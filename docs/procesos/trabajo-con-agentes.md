# Trabajo con agentes

El proyecto se construye con Claude Code. La sesión principal orquesta y delega las tareas acotadas en subagentes que trabajan en paralelo.

## Roles

- **Sesión principal (Opus)**: decide, diseña, integra, revisa todo lo que entregan los subagentes y hace los commits.
- **Subagentes (Sonnet)**: tareas acotadas y largas: un scraper, un relevamiento, un diccionario de datos, una búsqueda de fotos. Corren en paralelo y en segundo plano. Configurado en `~/.claude/settings.json` con `CLAUDE_CODE_SUBAGENT_MODEL`.

## Harness: skills, hooks y permisos

El repo trae la configuración de Claude Code en `.claude/`. Funciona cuando Claude Code se abre en la carpeta del repo:

- **`skills/<nombre>/SKILL.md`:** una skill por proceso: `codigo`, `diseno`, `analitica`, `datos-y-fuentes`, `contenido-y-metodologia`, `seo-y-geo`, `produccion` y `delegar-en-agentes`.
  - Cada una tiene una descripción que dice cuándo cargarla y una checklist corta.
  - El detalle sigue en `docs/procesos/`. Si algo cambia, se actualizan los dos en el mismo commit.
  - El índice de qué cargar según la tarea está en `CLAUDE.md`.
- **`hooks/protect-secrets.ts`:** se ejecuta antes de cada comando o lectura de archivos y bloquea cualquier intento de mostrar `.env.cloudflare` o `.env.posthog` (`cat`, `grep`, `Read`…). Cargarlos en el shell sí se permite.
- **`settings.json`:**
  - Activa el hook.
  - Permite sin preguntar los comandos de verificación (`typecheck`, `verificar`, `data`, `git status`/`diff`/`log`).
  - Niega leer los archivos de credenciales.

**Sumar un proceso:**
1. Escribir su documento en `docs/procesos/`.
2. Crear la skill: `.claude/skills/<nombre>/SKILL.md`, con `name`, una `description` que diga cuándo cargarla, y la checklist.
3. Agregarla a la tabla de `CLAUDE.md`.

Todo en el mismo commit.

## Reglas para delegar

Cada pedido a un subagente incluye:

1. Qué leer primero: `CLAUDE.md`, la skill del proceso (`.claude/skills/…`) y, si es una fuente, `packages/core/src/*.ts` y la sección del relevamiento.
2. El objetivo concreto y el formato de salida (archivos, columnas, ids).
3. Qué archivos le pertenecen (solo los de su fuente) y qué **no** tocar: `sources.yaml`, `packages/core`, `package.json`, otras fuentes. Varios agentes editando `bun.lock` a la vez se pisan; las dependencias las instala la sesión principal antes de lanzarlos.
4. **Nunca hacer commit**: lo hace la sesión principal después de revisar.
5. Qué verificar antes de terminar (conteos, totales, escalas, que corra dos veces sin duplicar).
6. Un reporte final breve: archivos, cobertura, problemas y datos dudosos.

## Revisión de lo que entregan

- Correr y mirar los CSV: conteos, totales contra el original, escalas.
- Revisar los casos que el agente marcó como dudosos (por ejemplo, la adjudicación de $54.137 M que resultó ser real, o el intendente de Rivadavia que no coincidía entre fuentes).
- Tipos (`bunx tsc --noEmit`) y, si toca la web, `bun run verificar`.
- Un commit por entrega, con un mensaje que explique qué datos trae.

## Cosas que aprendimos

- Los subagentes no ven la conversación: el pedido tiene que ser autocontenido.
- Pedir siempre que verifiquen contra el documento original y que reporten lo dudoso en vez de resolverlo en silencio.
- Las decisiones de diseño y producto las toma la sesión principal; los subagentes ejecutan.
