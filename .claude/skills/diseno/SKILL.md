---
name: diseno
description: Principios de diseño, UI y UX de Mendoza Transparente. Cubre color celeste y azul de la bandera, una sola forma por tipo de elemento, acción visible sin hover, 44 px para tocar, una línea, cara de cada persona, hojas modales, avisos, gráficos, mobile first, detalles del celular (campos de 16 px), textos de la interfaz, accesibilidad, movimiento y lo que no hacemos. Cargar antes de crear o retocar cualquier pantalla, componente, gráfico o texto visible, y al revisar capturas.
---

# Diseño de Mendoza Transparente

Fuente completa: `docs/procesos/diseno.md`, que pasa los 30 KB: se lee por secciones (`bun run seccion diseno` muestra el índice; `bun run seccion diseno "Gráficos"`, una sección). Público: cualquier persona de Mendoza, sobre todo desde el celular, que **no lee**: escanea.

## Sistema de diseño

Los componentes base y los tokens están en `packages/ui` (`@mt/ui`). **La base es BoardUI** (React Aria, en `src/components/{base,application,foundations}/`) y se está migrando: lo nuevo se arma con BoardUI y lo que se toca se pasa. Se agrega con `BOARDUI_TELEMETRY_DISABLED=1 npx -y boardui@latest add <x>` desde `packages/ui`, nunca con `init`. De BoardUI: `Button` e `IconButton` (44 px por defecto; `buttonClassName()` para un `Link`), `Input`, `Textarea`, `Select`/`SelectItem`, `SegmentedControl`, `Chip`, `StatusDot` y `Avatar`, con íconos de `@remixicon/react`. Propios armados con BoardUI y React Aria: `Sheet`, `Dialog`, `Popover`, `Alert`, `Skeleton`, `StatTile`, `Section`, `PageHeader`, `PersonAvatar`, `SearchInput`, `Segmented`, `ChoiceTiles` y `SearchSelect`. Para estilizar otro elemento: `buttonClassName`, `tileVariants`, `cardVariants`, `listVariants` y `listRowVariants`. Clases con `cx()` (`@mt/ui/lib/cx`); sin Radix ni `cva`.

- **Solo Tailwind:** no se escribe CSS propio. Los tokens del sitio viven en `packages/ui/src/styles/mt.css`, encima de los de BoardUI (`theme.css`, que no se edita).
- **Tema claro por defecto;** el oscuro (`.dark`) solo si la persona lo elige en el footer. Nunca `dark:` a mano.
- **Antes de armar un botón, una etiqueta, una tarjeta o un campo a mano,** usar el componente del paquete. Si falta uno, se agrega al paquete, no a la página.
- **Lo que alguien querría compartir va en la URL** (pestañas, búsquedas, hojas abiertas): `useUrlOption` y `useUrlText` de `apps/web/src/url-state.ts`, nunca `useState`.
- **Cada sección tiene su link:** todo h2 de bloque va con `Section id="leyes"` (o `SectionTitle` si el título se arma aparte); el título es el link a `#leyes` y lo copia. El id es corto, en español y sin años ni nombres que cambien.

## Reglas que no se negocian

1. **Color:** el celeste y azul de la bandera argentina (escala `accent`: 400 es el celeste oficial #74ACDF, 600 la marca; `text-text-link`, `highlight`) son la identidad en todo, incluidos gráficos y mapa. Nada de rojos ni bordós como acento. Los avisos van en ámbar (`Alert`). Los íconos decorativos van en gris.
2. **Una sola forma por tipo:** controles y campos con `rounded-2lg`; tarjetas con `rounded-xl` (`tileVariants`/`cardVariants`); listas en un solo bloque con filas divididas (`listVariants`/`listRowVariants`), nunca una tarjeta por fila; etiquetas con `Chip`. Redondo solo caras y puntos. Sobre la página gris tenue hay tres looks: **acciones** (botón secundario, de ícono, `Select`) en celeste claro con texto azul (`bg-background-action`, `text-text-action`); **lo que se toca y lleva a otro lado** (tarjetas, filas) blanco con sombra; **lo informativo** plano sobre el gris con borde fino, nunca blanco con sombra. Lo que se toca muestra su flecha o link antes del hover. Si en una misma fila se mezclan elementos que se tocan y que no (firmantes con y sin ficha), todos van a la misma altura y solo cambia el fondo. **Lo elegido** (pestaña activa, opción marcada) va en celeste con texto azul; nunca blanco sobre blanco. **Para elegir:** hasta 4 opciones cortas, `Segmented`; opciones que abren formularios distintos o de nombre largo, `ChoiceTiles` (se acomodan en filas, sin scroll lateral); muchas opciones largas, `SearchSelect` (autocompletado en la compu, hoja con buscador en el celular). **Filtros de una página** (año, lugar, cargo…): todos juntos en una barra de selects que no cambia de forma; lo que no aplica se muestra deshabilitado con un aviso que dice por qué, nunca desaparece.
3. **La acción se ve antes del hover:** en el celular no hay hover.
   - Toda fila que lleva a otra página tiene la flecha en `text-text-link` siempre.
   - En listas de navegación, el nombre del destino también va en `text-text-link`.
   - Los CTA principales van en `Button` primary (relleno azul, liso).
4. **44 px mínimos** (`min-h-11`) para tocar filas y botones; **botones de solo ícono, cuadrados de 44 × 44** (`IconButton` de `@mt/ui/components/base/buttons/icon-button`); **encabezados de 48 a 60 px** (`h-14`). La acción de la página (compartir) va en columna a la derecha del encabezado, solo ícono y con `Tooltip`, nunca en una fila propia.
5. **Una sola línea** para cifras, títulos de tarjetas, fechas y montos (`truncate`, `whitespace-nowrap`, `min-w-0`). La unidad va aparte y en chico ("$ 965.709" + "millones"). Lo que va en dos líneas, parejo (`text-balance`, `text-pretty`; en las imágenes, `wrap()`): nunca una palabra sola en la última.
6. **Nunca scroll horizontal**, en ningún ancho. Lo controla `bun run verificar`.
7. **Toda persona lleva su cara:** `PersonAvatar` (`@mt/ui`) con la foto oficial, o con iniciales mientras falte. Una foto faltante es un pendiente: se busca en sitios oficiales (`bun run scrape fotos`). A quien tiene un cargo electo se le suma la insignia del partido (`party`, o `partyMissing` si la fuente no lo dice); los designados, sin insignia. Solo desde 40 px y con el nombre del partido escrito en la fila.
8. **Mobile first:**
   - Menú a pantalla completa con su propia X.
   - Hojas modales (`Sheet`) en vez de paneles laterales.
   - Pestañas que se desplazan.
   - El buscador ocupa toda la pantalla.
9. **Una tarjeta, una cifra y una frase:** la cifra grande y una oración corta, sin adjetivos; el matiz, el porqué y los casos van en la hoja. En las filas, título y una línea de contexto, con el monto a la derecha y la fecha debajo. En la portada, cada pregunta se responde con una cifra en negrita y pocas palabras.
10. **Lo informativo antes que lo crudo:** primero tarjetas y gráficos, después las tablas. El detalle se abre en una hoja. Muchas tarjetas del mismo tipo se agrupan en secciones por la pregunta que responden, sin etiqueta de tema en cada una; lo que limita al resto (una fuente cortada) va primero, como aviso. Las tarjetas de arriba son del **año en curso**; lo viejo va más abajo, después de `StaleDataAlert` con el link al pedido. **Históricos de 8 años como máximo** (los mismos meses de cada año si el actual no terminó). **Términos difíciles** con `Term` (definición del glosario al tocar), solo los de los que depende la página.
11. **Fuentes al final** de cada página, en la sección «Fuentes» (`FuentesOficiales`): una fila por organismo con «Sitio oficial», «Copia del <fecha>» y, cuando existe, «archive.org». Sin «Fuente:» repetido ni párrafos de fuente sueltos en la página.
12. **El link para atrás, pegado al encabezado:** `WithBreadcrumbs` envolviendo el `PageHeader` (o el `<header>` propio), nunca `Breadcrumbs` suelto con el `gap` de la página. La ruta termina en la página actual con su ícono (`current={{ label, icon }}`) y el `PageHeader` va sin `topic`: una sola línea arriba del título.

## Celular, accesibilidad y movimiento (detalle en `diseno.md`)

- **Campos de 16 px en el celular** (`max-sm:text-base`, ya en los campos de `@mt/ui`): con menos, iOS agranda la página. Nunca bloquear el zoom.
- **Teclado correcto** (`type`, `inputMode`, `enterKeyHint`) y **respuesta al tocar** (`active:`).
- **Elementos nativos:** `<button>` para acciones, `<a>`/`Link` para navegar; nunca `<div onClick>`. Foco visible siempre; Escape cierra; todo se hace con teclado.
- **Nombre accesible** en todo lo que se toca; el color nunca va solo; contraste 4,5:1 en texto.
- **Lo que llega después guarda su lugar:** `Skeleton`/`SkeletonText` de `@mt/ui` con el alto real del bloque (medido en 375 y 1280 px), nunca un «Cargando…» que después empuja la página. Capas de datos en `docs/procesos/web.md#velocidad-de-carga`.
- **Movimiento mínimo:** 200 ms o menos, `motion-safe:` para desplazamientos y escalas, propiedades con nombre (nunca `transition-all`) y nunca como única señal.

## Fotos de paisaje

- Para darle carácter a una página (municipios, participar): `LandscapePhoto` con un `id` de `apps/web/src/photos.ts` (efecto `DotImage` de `@mt/ui`, CSS puro). Solo fotos con licencia libre y crédito visible; se suman con `bun scripts/photo.ts` desde `apps/web`. La portada usa una ilustración propia de fondo (`public/fondos/portada.webp`), con fundido abajo y un velo suave detrás del texto. Detalle en `diseno.md`, «Fotos de paisaje».

## Lo que no hacemos

Tarjetas dentro de tarjetas, etiquetitas sobre los títulos, secciones numeradas, gradientes y brillos, íconos en cuadraditos de colores, botones genéricos («Saber más») y títulos vagos. Parecen plantilla y le quitan seriedad al dato.

## Textos

- **Lenguaje simple** y oraciones cortas. Nada de jerga sin explicar; si hace falta un término, va al glosario (`src/glossary.ts`).
- **Neutralidad:** señales, no acusaciones (ver la skill `contenido-y-metodologia`).
- **Concordancia:** cuidar singular y plural ("1 dato", "2 datos") y género sin barras: "Senado de Mendoza" en lugar de "Senador/a".
- **Fechas** en formato corto ("9 oct 2026") y montos en pesos de hoy cuando se comparan años.
- **Interfaz:** un nombre por cosa en todo el sitio; botones que empiezan con verbo; links que dicen adónde llevan (nunca "acá" ni "ver más" sueltos); errores que dicen cómo seguir, sin "¡Ups!"; pantallas vacías que orientan y ofrecen el paso siguiente.

## Gráficos

- **Con Recharts, al estilo de BoardUI** (`src/charts/`), solo con tokens (`highlight`, `chart-grid`, `chart-axis`).
- **Cuál usar:** evolución → línea (`LineChart`) o columnas por año (`ColumnChart`); subas y bajas por período → `ChangeChart`; ranking → `BarList`; partes de un total → `BarList` con `total`, para que la barra mida su porcentaje (aunque se muestren solo las primeras: si no, la más grande parece el 100 %); mapa → `MapaMendoza` (cuantiles) o `MunicipalityLocator` (un departamento resaltado). El departamento que se mira (hover, foco o elegido) se marca con su color y los demás se apagan a gris, nunca con un borde grueso; el mapa y su detalle se reparten el ancho por mitades.
- **Dos gráficos chicos seguidos, en dos columnas en desktop** (`grid items-start gap-8 lg:grid-cols-2`), cada uno con su `h3`; si falta uno, el otro ocupa la fila (`only:col-span-full`). Una línea con bandas de gestiones o el mapa siguen a todo el ancho.
- **Ficha de una entidad (proveedor, organismo, municipio), en dos columnas en desktop** con `EntityColumns`: el encabezado con el nombre, quién es y sus cifras a la izquierda, fija (`lg:sticky lg:top-20`), para que el nombre no se pierda al bajar; gráficos y listas a la derecha. En el celular y en la hoja, una columna. La columna fija entra en unos 700 px de alto; lo que sobra va arriba a la derecha.
- **Bandas de gestiones de gobierno:** `GOBIERNOS` (`src/gobiernos.ts`).
- **Votación:** cada tramo de una barra de partes dice qué es (tooltip y hoja al tocar); provinciales y municipales nunca en la misma vista; un control automático responde primero con una oración.
- **Paleta:** está validada (skill `dataviz` del entorno). No inventar colores.

## Cómo revisar una pantalla

1. Captura en 375 px y en 1280 px, en modo oscuro (`playwright-core`, ver `scripts/verificar-web.ts`).
2. Recorrer la lista de arriba, sobre todo una línea, acción visible, caras y 44 px.
3. Si muestra datos que cambian (nombres, montos, listas): skill `estresar-interfaz`.
4. Cambio grande o de un subagente: skill `revisar-interfaz`.
5. `bun run verificar` antes de commitear.

Pedidos de mejora sobre algo existente: skill `mejoras`.
