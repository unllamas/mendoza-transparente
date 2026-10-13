---
name: diseno
description: Principios de diseño, UI y UX de Mendoza Transparente. Cubre color celeste y azul de la bandera, una sola forma por tipo de elemento, acción visible sin hover, 44 px para tocar, una línea, cara de cada persona, hojas modales, avisos, gráficos, mobile first, detalles del celular (campos de 16 px), textos de la interfaz, accesibilidad, movimiento y lo que no hacemos. Cargar antes de crear o retocar cualquier pantalla, componente, gráfico o texto visible, y al revisar capturas.
---

# Diseño de Mendoza Transparente

Fuente completa: `docs/procesos/diseno.md`. Público: cualquier persona de Mendoza, sobre todo desde el celular, que **no lee**: escanea.

## Sistema de diseño

Los componentes base y los tokens están en `packages/ui` (`@mt/ui`). **La base es BoardUI** (React Aria, en `src/components/{base,application,foundations}/`) y se está migrando: lo nuevo se arma con BoardUI y lo que se toca se pasa. Se agrega con `BOARDUI_TELEMETRY_DISABLED=1 npx -y boardui@latest add <x>` desde `packages/ui`, nunca con `init`. De BoardUI: `Button` e `IconButton` (44 px por defecto; `buttonClassName()` para un `Link`), `Input`, `Textarea`, `Select`/`SelectItem`, `SegmentedControl`, `Chip`, `StatusDot` y `Avatar`, con íconos de `@remixicon/react`. Propios armados con BoardUI y React Aria: `Sheet`, `Dialog`, `Popover`, `Alert`, `StatTile`, `Section`, `PageHeader`, `PersonAvatar`, `SearchInput` y `Segmented`. Para estilizar otro elemento: `buttonClassName`, `tileVariants`, `cardVariants`, `listVariants` y `listRowVariants`. Clases con `cx()` (`@mt/ui/lib/cx`); sin Radix ni `cva`.

- **Solo Tailwind:** no se escribe CSS propio. Los tokens del sitio viven en `packages/ui/src/styles/mt.css`, encima de los de BoardUI (`theme.css`, que no se edita).
- **Tema claro por defecto;** el oscuro (`.dark`) solo si la persona lo elige en el footer. Nunca `dark:` a mano.
- **Antes de armar un botón, una etiqueta, una tarjeta o un campo a mano,** usar el componente del paquete. Si falta uno, se agrega al paquete, no a la página.
- **Lo que alguien querría compartir va en la URL** (pestañas, búsquedas, hojas abiertas): `useUrlOption` y `useUrlText` de `apps/web/src/url-state.ts`, nunca `useState`.

## Reglas que no se negocian

1. **Color:** el celeste y azul de la bandera argentina (escala `accent`: 400 es el celeste oficial #74ACDF, 600 la marca; `text-text-link`, `highlight`) son la identidad en todo, incluidos gráficos y mapa. Nada de rojos ni bordós como acento. Los avisos van en ámbar (`Alert`). Los íconos decorativos van en gris.
2. **Una sola forma por tipo:** controles y campos con `rounded-2lg`, borde y fondo de superficie (los campos igual que el botón secundario); tarjetas informativas y accionables con la misma superficie (`tileVariants`/`cardVariants`, `rounded-xl`); listas en un solo bloque con filas divididas (`listVariants`/`listRowVariants`), nunca una tarjeta por fila; etiquetas con `Chip`. Redondo solo caras y puntos. Lo accionable se distingue por la flecha o el link visibles, no por el borde.
3. **La acción se ve antes del hover:** en el celular no hay hover.
   - Toda fila que lleva a otra página tiene la flecha en `text-text-link` siempre.
   - En listas de navegación, el nombre del destino también va en `text-text-link`.
   - Los CTA principales van en `Button` primary (relleno azul, liso).
4. **44 px mínimos** (`min-h-11`) para tocar filas y botones; **botones de solo ícono, cuadrados de 44 × 44** (`IconButton` de `@mt/ui/components/base/buttons/icon-button`); **encabezados de 48 a 60 px** (`h-14`).
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

## Celular, accesibilidad y movimiento (detalle en `diseno.md`)

- **Campos de 16 px en el celular** (`max-sm:text-base`, ya en los campos de `@mt/ui`): con menos, iOS agranda la página. Nunca bloquear el zoom.
- **Teclado correcto** (`type`, `inputMode`, `enterKeyHint`) y **respuesta al tocar** (`active:`).
- **Elementos nativos:** `<button>` para acciones, `<a>`/`Link` para navegar; nunca `<div onClick>`. Foco visible siempre; Escape cierra; todo se hace con teclado.
- **Nombre accesible** en todo lo que se toca; el color nunca va solo; contraste 4,5:1 en texto.
- **Movimiento mínimo:** 200 ms o menos, `motion-safe:` para desplazamientos y escalas, propiedades con nombre (nunca `transition-all`) y nunca como única señal.

## Lo que no hacemos

Tarjetas dentro de tarjetas, etiquetitas sobre los títulos, secciones numeradas, gradientes y brillos, íconos en cuadraditos de colores, botones genéricos («Saber más») y títulos vagos. Parecen plantilla y le quitan seriedad al dato.

## Textos

- **Lenguaje simple** y oraciones cortas. Nada de jerga sin explicar; si hace falta un término, va al glosario (`src/glossary.ts`).
- **Neutralidad:** señales, no acusaciones (ver la skill `contenido-y-metodologia`).
- **Concordancia:** cuidar singular y plural ("1 dato", "2 datos") y género sin barras: "Senado de Mendoza" en lugar de "Senador/a".
- **Fechas** en formato corto ("9 oct 2026") y montos en pesos de hoy cuando se comparan años.
- **Interfaz:** un nombre por cosa en todo el sitio; botones que empiezan con verbo; links que dicen adónde llevan (nunca "acá" ni "ver más" sueltos); errores que dicen cómo seguir, sin "¡Ups!"; pantallas vacías que orientan y ofrecen el paso siguiente.

## Gráficos

- **Cuál usar:** evolución → línea (`LineChart`) o columnas por año (`ColumnChart`); ranking → `BarList`; mapa → `MapaMendoza` (cuantiles) o `MunicipalityLocator` (un departamento resaltado).
- **Bandas de gestiones de gobierno:** `GOBIERNOS` (`src/gobiernos.ts`).
- **Paleta:** está validada (skill `dataviz` del entorno). No inventar colores.

## Cómo revisar una pantalla

1. Captura en 375 px y en 1280 px, en modo oscuro (`playwright-core`, ver `scripts/verificar-web.ts`).
2. Recorrer la lista de arriba, sobre todo una línea, acción visible, caras y 44 px.
3. Si muestra datos que cambian (nombres, montos, listas): skill `estresar-interfaz`.
4. Cambio grande o de un subagente: skill `revisar-interfaz`.
5. `bun run verificar` antes de commitear.

Pedidos de mejora sobre algo existente: skill `mejoras`.
