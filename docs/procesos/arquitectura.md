# Arquitectura del repositorio

Cómo está organizado el código, qué reglas se controlan solas y con qué herramientas. Se inspira en [bulletproof-react](https://github.com/alan2207/bulletproof-react), adaptado a un monorepo con Bun, Turborepo y TanStack.

## Idioma

Todo el código va en inglés y toda la documentación en español. La tabla completa está en `AGENTS.md`.

## El monorepo

| Carpeta | Qué es |
|---|---|
| `apps/web` | El sitio (Vite + React + TanStack Router), con sus scripts de build de datos y SEO y la función de la API pública (`functions/`) |
| `apps/panel` | El panel interno del equipo (Vite + React), detrás de Cloudflare Access. Ver `panel.md` |
| `packages/ui` (`@mt/ui`) | Design system: tokens, componentes y hooks genéricos. No conoce el router, la analítica ni los datos del sitio |
| `packages/core` (`@mt/core`) | Utilidades de datos compartidas por los scrapers: archivo, CSV, municipios |
| `packages/participation` (`@mt/participation`) | API de participación y del panel, consultas a la base, migraciones de D1 y login. Lo usan `apps/web` y `apps/panel` |
| `packages/scrapers` (`@mt/scrapers`) | Un scraper por fuente (`src/sources/`) las capas compartidas que leen los anexos de Responsabilidad Fiscal de cualquier formato (`src/lrf/`), utilidades de lectura (`src/lib/`) y `bun run crudo` (`src/inspect.ts`) |

## Dentro de `apps/web/src`

| Carpeta | Qué va |
|---|---|
| `pages/` | Solo las páginas de cada ruta |
| `features/<feature>/` | Lo propio de una feature: `api/`, `components/`, `hooks/`, `utils/` (solo las que hagan falta) |
| `components/` | Componentes compartidos de la web (layout, buscador, hojas, los que usan analítica o router) |
| `charts/` | Gráficos |
| raíz | Lógica sin interfaz: `lib.ts`, `url-state.ts`, `analytics.ts`, `types.ts` |

**Imports absolutos:** dentro de `src`, todo lo que no es del mismo directorio se importa con `@/` (`@/components/breadcrumbs.tsx`), así un archivo se puede mover sin romper imports. Los archivos se importan directo, sin barrels (`index.ts` que reexportan), que empeoran el tree shaking. El panel interno (`apps/panel`) es chico y usa imports relativos, porque `dependency-cruiser` resuelve `@/` con la configuración del sitio.

## Reglas que se controlan solas

**Formato y lint: Biome** (`biome.json`).
- Formato: 2 espacios, comillas dobles, 140 columnas, imports ordenados.
- Lint: reglas recomendadas, más nombres de archivo en kebab-case.
- Reglas apagadas a propósito (con el motivo en `biome.json`): asignación dentro de expresiones (el bucle `while ((m = re.exec()))`), índice como `key` en listas estáticas, roles ARIA en gráficos y selectores, y el retorno en callbacks de `forEach`.
- Una excepción puntual va con `// biome-ignore <regla>: <motivo>` en la línea anterior, nunca sin motivo.

**Arquitectura: dependency-cruiser** (`.dependency-cruiser.cjs`). El código fluye en una dirección: paquetes → lógica compartida → componentes → páginas.

| Regla | Qué prohíbe |
|---|---|
| `no-circular` | Dependencias circulares |
| `packages-are-independent` | Que un paquete importe algo de una app |
| `ui-is-generic` | Que `@mt/ui` importe el router, PostHog o los paquetes de datos |
| `pages-do-not-import-pages` | Que una página importe otra (lo compartido va a `features/` o `components/`) |
| `components-do-not-import-pages` | Que un componente o un gráfico importe una página |
| `logic-has-no-ui` | Que la lógica sin interfaz importe componentes o páginas |
| `build-scripts-do-not-import-ui` | Que los scripts de build importen componentes |
| `panel-is-not-the-site` / `site-does-not-import-the-panel` | Que el sitio y el panel interno se importen entre sí (lo compartido va en `@mt/participation` o `@mt/ui`) |
| `browser-code-does-not-open-databases` | Que el código del navegador o de las funciones importe la base local de desarrollo (`local-db.ts`) |

**Tipos:** TypeScript estricto con `noUncheckedIndexedAccess` y, en la web y en `@mt/ui`, `noUnusedLocals` (sin código muerto).

## Costo cero

El proyecto no tiene financiación: todo corre en planes gratis. Por eso cada propuesta que suma consumo dice cuánto gasta y de qué cupo, antes de hacerla: una CI nueva, un workflow programado, una función, una base, un servicio externo o una dependencia que necesita un servidor.

| Servicio | Lo que cuesta | Qué lo gasta |
|---|---|---|
| Cloudflare Pages | 500 builds por mes, 20.000 archivos por deploy, 100.000 pedidos a funciones por día; lo estático es gratis y sin límite | Cada push a `main`, a `dev` y a cada rama; las funciones de `/api/*` |
| Cloudflare D1 | 5 millones de filas leídas y 100.000 escritas por día | Participación |
| GitHub Actions | Gratis en un repo público, pero cada job tarda y ocupa cola | CI, actualización de datos, releases, back merge |
| PostHog | Plan gratis por eventos | Cada evento de `analytics.ts` |

**Cómo se decide:**

1. Lo que puede ser estático, se genera en el build y se sirve estático (gratis), no en una función.
2. Un commit automático que no cambia el sitio no dispara un build (`[CF-Pages-Skip]`).
3. Una CI nueva corre solo cuando cambian los archivos que controla (`paths:`), no en cada push.
4. Un servicio pago o con prueba gratis que vence no se suma sin acordarlo antes.

Detalle del consumo de Cloudflare y los próximos pasos en `docs/planes/consumo-de-cloudflare.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `bun run lint` | Biome y las reglas de arquitectura |
| `bun run lint:arch` | Solo las reglas de arquitectura |
| `bun run format` | Formatea y aplica los arreglos seguros de Biome |
| `bun run typecheck` | Tipos de todos los paquetes |
| `bun test` | Pruebas (`*.test.ts`) |
| `bun run verificar` | Verificación visual de la web (ver `web.md`) |
| `bun run hooks` | Instala los hooks de git (una vez por clon) |

**Antes de cada commit** (lefthook, `lefthook.yml`): Biome sobre los archivos del commit, reglas de arquitectura y tipos; y al escribir el mensaje, commitlint (`commitlint.config.mjs`), que pide [Conventional Commits](ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr). **En cada PR y en cada push a `dev` o `main`** (`.github/workflows/ci.yml`): todo lo anterior, las pruebas, el build de la web y la verificación visual; y en cada PR, además, el título (`.github/workflows/titulo-del-pr.yml`).
