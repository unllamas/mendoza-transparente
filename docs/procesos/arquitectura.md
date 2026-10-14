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
| `packages/scrapers` (`@mt/scrapers`) | Un scraper por fuente |

## Dentro de `apps/web/src`

| Carpeta | Qué va |
|---|---|
| `pages/` | Solo las páginas de cada ruta |
| `features/<feature>/` | Lo propio de una feature: `api/`, `components/`, `hooks/`, `utils/` (solo las que hagan falta) |
| `components/` | Componentes compartidos de la web (layout, buscador, hojas, los que usan analítica o router) |
| `charts/` | Gráficos |
| raíz | Lógica sin interfaz: `lib.ts`, `url-state.ts`, `analytics.ts`, `types.ts` |

**Imports absolutos:** dentro de `src`, todo lo que no es del mismo directorio se importa con `@/` (`@/components/breadcrumbs.tsx`), así un archivo se puede mover sin romper imports. Los archivos se importan directo, sin barrels (`index.ts` que reexportan), que empeoran el tree shaking.

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

**Tipos:** TypeScript estricto con `noUncheckedIndexedAccess` y, en la web y en `@mt/ui`, `noUnusedLocals` (sin código muerto).

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

**Antes de cada commit** (lefthook, `lefthook.yml`): Biome sobre los archivos del commit, reglas de arquitectura y tipos. **En cada push** (`.github/workflows/ci.yml`): todo lo anterior, las pruebas, el build de la web y la verificación visual.
