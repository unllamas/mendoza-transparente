---
name: arquitectura
description: Dónde va cada cosa en el monorepo de Mendoza Transparente (apps, packages, pages, features, components, lib) y las reglas que se controlan solas (Biome, dependency-cruiser, tipos, hooks de git, CI). Cargar antes de crear un archivo, un paquete o una app, de mover código o de agregar una dependencia.
---

# Arquitectura

Fuente completa: `docs/procesos/arquitectura.md`.

## Antes de crear un archivo

1. **Idioma:** el código, en inglés (también nombres de archivo y comentarios); la documentación, en español.
2. **¿Es genérico** (no usa router, analítica ni datos del sitio)? Va a `packages/ui`.
3. **¿Es de una sola feature** (compras, funcionarios, leyes, participación…)? Va a `apps/web/src/features/<feature>/{api,components,hooks,utils}`.
4. **¿Lo comparten varias features** de la web? Va a `apps/web/src/components/`.
5. **¿Es del panel interno o de la API de participación?** El panel va en `apps/panel` (imports relativos, sin `@/`); la lógica y las consultas que comparte con el sitio, en `packages/participation`. Ver la skill `panel`.
6. **¿Es lógica sin interfaz?** Va a la raíz de `src` (`lib.ts`, `url-state.ts`…).
7. **`pages/`** solo tiene páginas de ruta: archivos cortos que arman componentes.
8. **Nombres de archivo en kebab-case.** Imports con `@/` y sin barrels.

## Antes de commitear

- `bun run lint` (Biome y arquitectura), `bun run typecheck` y, si tocaste cálculos, `bun test`.
- Los hooks de git lo corren solos (`bun run hooks` una vez por clon); el CI lo repite en cada push.
- **No silenciar reglas.** Si hace falta una excepción: `// biome-ignore <regla>: <motivo>`. Si una regla de arquitectura molesta, el código va en otro lugar.
