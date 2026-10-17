---
name: codigo
description: Convenciones de código de Mendoza Transparente. Cubre idioma (código en inglés, documentación en español), estructura del monorepo, dónde va cada cosa, cómo verificar y cómo commitear. Cargar al empezar cualquier cambio de código, en scrapers, apps/web o scripts, antes de escribir la primera línea.
---

# Código en Mendoza Transparente

## Idioma

- **En inglés:** el código. Variables, funciones, tipos, nombres de archivos de código, ids de eventos y comentarios técnicos breves.
- **En español:** la documentación (`docs/`, README, `AGENTS.md`, skills), los textos que ve la gente, las rutas públicas (`/leyes`, `/municipios`) y la descripción de los commits (el tipo y el ámbito de Conventional Commits van en inglés).
- **Columnas de CSV publicados:** snake_case en español. Son un contrato público y **no se renombran** sin un plan de migración.
- **Código viejo en español:** lo que se toca, se pasa al inglés, sin refactors masivos de pasada.

## Dónde va cada cosa

| Qué | Dónde |
|---|---|
| Descarga y archivo de una fuente | `packages/scrapers/src/sources/<id>.ts` (ver la skill `datos-y-fuentes`) |
| Utilidades compartidas (fetch, archivo, CSV, municipios) | `packages/core/src/` |
| Cálculos que arman los datos de la web | `apps/web/scripts/temas/*.ts`, llamados desde `apps/web/scripts/build-data.ts` |
| Registro de páginas, SEO y JSON-LD | `apps/web/scripts/paginas.ts` y `scripts/seo.ts` (ver la skill `seo-y-geo`) |
| Páginas y componentes | Solo páginas de ruta en `apps/web/src/pages/`; componentes de la web en `src/components/`; gráficos en `src/charts/`; lo genérico en `packages/ui` (`@mt/ui`) |
| Tipos de los datos de la web | `apps/web/src/types.ts` |
| Contenido editorial | `data/curado/*.yaml` (ver la skill `contenido-y-metodologia`) |
| API de participación y panel | `packages/participation` (lógica, consultas, migraciones), `apps/web/functions/api/` y `apps/panel/functions/api/` (Cloudflare), `vite.config.ts` de cada app (desarrollo) |
| Analítica | `apps/web/src/analytics.ts` y `src/analytics-catalog.ts` (ver la skill `analitica`) |

## Cómo trabajar

1. **Copia de trabajo:** `~/Documents/Testing/mendoza-transparente`. Otras copias son temporales.
2. **Reutilizar antes de crear:**
   - Para mostrar personas: `PersonAvatar`.
   - Para montos por año: `ColumnChart`.
   - Para elementos visuales: los de `@mt/ui` (`Alert`, `StatTile`, `Section`, `Sheet`…) y, con router o analítica, `Breadcrumbs`, `TrackedSheet`, `TrackedSegmented` y `ListSearch` de `src/components/`.
   - Para comparar personas entre fuentes: `samePerson` (en `scripts/temas/gobierno.ts` y `entidades.ts`).
   - Para URLs: `slug` y `ROLES` (`src/slug.ts`).
3. **Datos derivados:** se calculan en `build-data`, nunca en el navegador. La web lee JSON chico ya armado.
4. **Si cambia algo de un proceso,** se actualiza su documento en `docs/procesos/` en el mismo commit.

## Verificar antes de dar algo por terminado

```bash
cd apps/web && bunx tsc --noEmit      # tipos
bun run data                          # que el build de datos corra
bun run verificar                     # (desde la raíz) sin scroll horizontal y consola limpia, 6 anchos
```

- Cambios de interfaz: además, captura con `playwright-core` en 375 px y 1280 px, mirada por vos antes de entregar.
- `bun test` y `wrangler` piden permiso; `bun dev`, `bun build` y `turbo` no se usan (se corre `bunx vite` o los scripts directamente).

## Commits

- **Formato:** Conventional Commits, `<tipo>(<ámbito>): <descripción en español>`, por ejemplo `feat(web): …` o `fix(scrapers): …`. Tipos, ámbitos y ejemplos en la skill `ramas-y-releases`. El hook `commit-msg` rechaza lo que no cumple.
- **Contenido:** un commit por entrega, con un cuerpo en español que explique qué cambia y por qué, y la línea `Co-Authored-By` que indique el sistema.
- **Qué agregar:** solo los archivos de la tarea, con `git add <rutas>` y nunca `git add -A`, porque puede haber trabajo de un agente en curso.
- **Dónde:** en una rama que sale de `dev`, con PR a `dev`. Nunca directo a `main`, que publica el sitio en cada push (ver la skill `ramas-y-releases`).
- **Secretos:** `.env.cloudflare`, `.env.posthog` y cualquier token nunca se commitean ni se imprimen. Ya están en `.gitignore`, y un hook bloquea leerlos.
