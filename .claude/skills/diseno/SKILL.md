---
name: diseno
description: Principios de diseño, UI y UX de Mendoza Transparente. Cubre color borravino, borde igual a clickeable, acción visible sin hover, 44 px para tocar, una línea, cara de cada persona, hojas modales, avisos, gráficos y mobile first. Cargar antes de crear o retocar cualquier pantalla, componente, gráfico o texto visible, y al revisar capturas.
---

# Diseño de Mendoza Transparente

Fuente completa: `docs/procesos/diseno.md`. Público: cualquier persona de Mendoza, sobre todo desde el celular, que **no lee**: escanea.

## Sistema de diseño

Los componentes base y los tokens están en `packages/ui` (`@mt/ui`, configuración de shadcn): `Button`, `IconButton`, `Badge`, `Tile`, `CardLink`, `Sheet`, `Dialog`, `Popover`, `Alert`, `Input`, `Textarea`, `Select`, `Field`, `Segmented`, `SearchInput`, `StatTile`, `Section`, `PageHeader` y `PersonAvatar`. Para estilizar otro elemento: `buttonVariants`, `tileVariants` y `cardVariants`.

- **Solo Tailwind:** no se escribe CSS propio. Los tokens viven en `packages/ui/src/styles/globals.css`.
- **Antes de armar un botón, una etiqueta, una tarjeta o un campo a mano,** usar el componente del paquete. Si falta uno, se agrega al paquete, no a la página.
- **Lo que alguien querría compartir va en la URL** (pestañas, búsquedas, hojas abiertas): `useUrlOption` y `useUrlText` de `apps/web/src/url-state.ts`, nunca `useState`.

## Reglas que no se negocian

1. **Color:** el borravino (`--brand`, `--link`, `--accent`) es la identidad en todo, incluidos gráficos y mapa. Nada de azules. Los avisos van en ámbar (`Alert`). Los íconos decorativos van en gris.
2. **Borde = clickeable.** Lo informativo lleva solo fondo (`bg-tile`).
3. **La acción se ve antes del hover:** en el celular no hay hover.
   - Toda fila que lleva a otra página tiene la flecha en `text-link` siempre.
   - En listas de navegación, el nombre del destino también va en `text-link`.
   - Los CTA principales van en botón relleno `bg-brand`.
4. **44 px mínimos** (`min-h-11`) para tocar filas y botones; **botones de solo ícono, cuadrados de 44 × 44** (`IconButton` de `@mt/ui`); **encabezados de 48 a 60 px** (`h-14`).
5. **Una sola línea** para cifras, títulos de tarjetas, fechas y montos (`truncate`, `whitespace-nowrap`, `min-w-0`). La unidad va aparte y en chico ("$ 965.709" + "millones").
6. **Nunca scroll horizontal**, en ningún ancho. Lo controla `bun run verificar`.
7. **Toda persona lleva su cara:** `PersonAvatar` (`@mt/ui`) con la foto oficial, o con iniciales mientras falte. Una foto faltante es un pendiente: se busca en sitios oficiales (`bun run scrape fotos`).
8. **Mobile first:**
   - Menú a pantalla completa con su propia X.
   - Hojas modales (`Sheet`) en vez de paneles laterales.
   - Pestañas que se desplazan.
   - El buscador ocupa toda la pantalla.
9. **Lo informativo antes que lo crudo:** primero tarjetas y gráficos, después las tablas. El detalle se abre en una hoja.
10. **Fuente visible** en cada página y cifra: el sitio oficial y la copia archivada (`FuentesOficiales`).

## Textos

- **Lenguaje simple** y oraciones cortas. Nada de jerga sin explicar; si hace falta un término, va al glosario (`src/glossary.ts`).
- **Neutralidad:** señales, no acusaciones (ver la skill `contenido-y-metodologia`).
- **Concordancia:** cuidar singular y plural ("1 dato", "2 datos") y género sin barras: "Senado de Mendoza" en lugar de "Senador/a".
- **Fechas** en formato corto ("9 oct 2026") y montos en pesos de hoy cuando se comparan años.

## Gráficos

- **Cuál usar:** evolución → línea (`LineChart`) o columnas por año (`ColumnChart`); ranking → `BarList`; mapa → `MapaMendoza` (cuantiles) o `MunicipalityLocator` (un departamento resaltado).
- **Bandas de gestiones de gobierno:** `GOBIERNOS` (`src/gobiernos.ts`).
- **Paleta:** está validada (skill `dataviz` del entorno). No inventar colores.

## Cómo revisar una pantalla

1. Captura en 375 px y en 1280 px, en modo oscuro (`playwright-core`, ver `scripts/verificar-web.ts`).
2. Recorrer la lista de arriba, sobre todo una línea, acción visible, caras y 44 px.
3. `bun run verificar` antes de commitear.
