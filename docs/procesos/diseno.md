# Diseño

Reglas de interfaz que salieron de revisar el sitio con ojos de ciudadano común. Aplicarlas desde el primer intento en cada pantalla nueva.

## Sistema de diseño (`packages/ui`)

Los componentes base y los tokens viven en el paquete `@mt/ui`. Lo usa la web y lo pueden usar otros proyectos del monorepo (por ejemplo, uno de votación).

**La base es [BoardUI](https://www.boardui.com)** (MIT): componentes en React Aria, Tailwind v4 y tokens semánticos, copiados como código fuente dentro del paquete. Estamos en plena migración: los componentes propios de abajo se van reemplazando por los de BoardUI (`packages/ui/src/components/{base,application,foundations}/`) y, cuando una pantalla se toca, se pasa a los nuevos.

- **Cómo se agrega un componente de BoardUI:** desde `packages/ui`, con la telemetría del CLI apagada:
  ```bash
  cd packages/ui
  BOARDUI_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 npx -y boardui@latest add <componente>
  ```
  `packages/ui/boardui.json` hace que los archivos caigan en `src/` y que los imports queden como `@mt/ui/...`. Las dependencias se agregan solas con Bun. **No correr `boardui init`**: escribe un `AGENTS.md` y reglas de Cursor que chocan con `CLAUDE.md` y las skills. Después de agregar: `bunx biome check --write packages/ui`, adaptar lo que no cumpla las reglas de esta página (sobre todo los 44 px y los textos en inglés) y verificar.
- **Lo que no es de Next:** si un componente importa `next/link`, se cambia por el `Link` de `react-aria-components`; la web lo conecta con TanStack Router en `apps/web/src/components/ui-providers.tsx`.
- **Textos de BoardUI en inglés:** casi todos llegan por props (pasarlos en español). Los pocos que vienen adentro se traducen en `UiProviders` (`TemplateCopyProvider`).
- **Solo Tailwind.** Los estilos están en `packages/ui/src/styles/`:
  - `globals.css`, `theme.css` y `typography.css` son de BoardUI (los escribe el CLI): no se editan a mano.
  - `mt.css` es la capa del sitio, encima de BoardUI: la escala `accent` celeste y azul, las fuentes del sistema, los tokens propios con nombres al estilo de BoardUI (`text-text-link`, `border-border-link`, `highlight`, `warning-foreground`/`-background`/`-border`, `chart-grid`, `chart-axis`, `map-0` a `map-4`), el botón principal liso y la base mínima. Es lo que importa la app desde `apps/web/src/styles.css`, que no agrega estilos.
- **Tema claro por defecto.** Un sitio de transparencia se lee de día: el oscuro solo se activa si la persona lo elige con el `ThemeToggle` del footer, debajo de la descripción del proyecto. Va en `size="compact"`: se ve chico (riel de 36 px) para no competir con el contenido, pero cada botón conserva su zona de toque de 44 px. Así se achica cualquier control secundario: se reduce lo que se ve, nunca la zona de toque. Se guarda en `localStorage` (`boardui:theme`) y un script en `apps/web/index.html` lo aplica antes de pintar, sin parpadeo. El oscuro es la clase `.dark` en `<html>`; los tokens cambian solos, nunca se escribe `dark:` a mano.
- **Piezas:**
  - `cx()` (`@mt/ui/lib/cx`, de BoardUI) junta clases, resuelve conflictos de Tailwind y entiende la tipografía compuesta de BoardUI (`text-body-medium`, `text-title-3-semibold`…). No hay `cva` ni Radix: las variantes son objetos de clases (`sortCx`) y las piezas interactivas son de React Aria.
  - Íconos: `@remixicon/react` (los de BoardUI), en todo el sitio.
- **Componentes:**

| Componente | Para qué |
|---|---|
| **BoardUI** | |
| `Button` (`base/buttons/button`) | Variantes `primary` (relleno azul, la acción principal), `secondary` (celeste claro con texto azul, el resto de las acciones), `ghost` y `danger`. Tamaño `large` (44 px) por defecto; `medium`, `small` y `xs` solo en superficies densas de escritorio. Íconos por prop (`leadingIcon={RiArrowLeftLine}`). Para un `Link` del router o un `<a>`: `className={buttonClassName({ variant: "secondary" })}`. |
| `IconButton` (`base/buttons/icon-button`) | Solo ícono: 44 × 44 por defecto, `icon` y `aria-label` obligatorios. |
| `Input`, `Textarea` (`base/input`, `base/textarea`) | Campos de React Aria con su etiqueta (`label`), ayuda (`hint`) y validación nativa (`isRequired`, `maxLength`). 44 px por defecto. `onChange` recibe el texto, no el evento. Para una fecha: `TextField` + `Label` + `InputBase type="date"` (el selector del celular). |
| `Select`, `SelectItem` (`base/select`) | Lista de opciones de React Aria (`value`/`onChange` con el `id` de cada `SelectItem`, o `name` + `defaultValue` en un formulario). Disparador y filas de 44 px. Con `label` visible arriba, o `aria-labelledby` si la etiqueta va al costado. |
| `SegmentedControl` (`base/segmented-control`) | Opciones excluyentes. `Segmented` (`@mt/ui/components/segmented`) lo arma desde una lista de opciones y lo hace desplazable en el celular. |
| `SearchSelect` (`@mt/ui/components/search-select`) | Elegir entre muchas opciones de nombre largo (más de 10, como los datos que no se publican): se escribe para filtrar, sin importar los acentos. En la compu es un autocompletado tan ancho como el campo; en el celular abre una hoja a pantalla completa con el buscador arriba, para leer los nombres enteros. Las opciones pueden ir en grupos (`group`). |
| `ChoiceTiles` (`@mt/ui/components/choice-tiles`) | Pocas opciones que abren cosas distintas (los formularios de `/participar`), todas a la vista: ícono, nombre y una línea, en dos columnas desde tablet. Se acomodan en filas en vez de desplazarse. |
| `SearchInput` | `Input` de BoardUI con lupa, para filtrar listas. |
| `Chip` (`base/badges/chip`) | Etiquetas de una línea, no clickeables (esquinas `rounded-md`, sin borde). Colores de BoardUI más `brand` (celeste claro) y `warning` (ámbar, siempre con ícono). |
| `StatusDot` (`base/badges/status-dot`) | Punto de estado; `StatusBadge` lo acompaña con su texto (nunca el color solo). |
| `Avatar` (`base/avatar`) | Foto redonda o iniciales; si la foto no carga, muestra las iniciales. `PersonAvatar` lo usa para toda persona. |
| **Propios, armados con BoardUI** | |
| `listVariants()` / `listRowVariants()` (`card`) | Lista larga: un bloque con filas divididas de 44 px. Si alguna fila se toca, la lista entera se levanta (blanca con sombra); si no, queda plana sobre el gris. La fila accionable se tiñe de celeste al pasar el mouse. |
| `tileVariants()` / `cardVariants()` (`card`) | El mismo radio (`rounded-xl`) para el bloque informativo (tamaños `sm`, `default`, `lg`), plano sobre el gris con un borde fino, y la tarjeta accionable, blanca con sombra, que al pasar el mouse marca el borde en azul y sube la sombra. Un bloque que flota sobre otro contenido (la lectura de un gráfico) usa `tileVariants({ floating: true })`. Se aplican al elemento que corresponda (`<li>`, `<details>`, un `Link`). |
| `Sheet` | Hoja modal (React Aria `Modal` + `Dialog`): foco adentro, Escape, la X y tocar afuera cierran. Con dos apiladas se muestra solo la de arriba; al cerrarla vuelve la de abajo. |
| `Popover` | Nota flotante (React Aria `DialogTrigger` + `Popover`): `PopoverTrigger` es el botón (abierto, lleva `aria-expanded`) y `PopoverContent` la nota, que se reacomoda sola para no salirse de la pantalla. |
| `Dialog` | Ventana a pantalla completa o centrada (React Aria): el buscador y el menú del celular. Foco adentro, Escape cierra. Para enfocar un campo al abrir, se enfoca desde un efecto del contenido. |
| `Alert` | Aviso `warning` (ámbar) o `note`, con íconos Remix. |
| `Skeleton`, `SkeletonText` (`skeleton`) | El lugar de un bloque que todavía no llegó: un bloque gris con el alto que se le pasa, o una línea con el alto de la línea del texto que reemplaza, con la barra de la línea de base a la altura de las mayúsculas (donde caen las letras). Ocupa su lugar desde el principio pero se ve recién a los 150 ms, así una respuesta rápida no parpadea. Pulsa solo con `motion-safe`. Se usa en las capas 2 y 3 de datos ([Velocidad de carga](web.md#velocidad-de-carga)), con el alto real medido en 375 y 1280 px. Nunca un «Cargando…» suelto que después empuja la página. |
| `StatTile`, `Section`, `PageHeader`, `PersonAvatar`, `SearchInput`, `Segmented` | Cifra con etiqueta, bloque con título (con su `id`: el título es el link a esa sección), encabezado de página, cara de una persona, buscador de listas y selector de opciones. |

- **Nada a mano.** Un botón, un bloque, una tarjeta, una etiqueta o un campo no se arman con clases sueltas: se usa el componente o sus clases (`buttonClassName`, `tileVariants`, `cardVariants`). Si falta una variante, se agrega al paquete. Las únicas excepciones son el campo del buscador (va sin borde dentro de su barra) y el campo trampa contra spam de Participar.
- **Sin código muerto:** `noUnusedLocals` está activado en la web y en el paquete, así que `bunx tsc --noEmit` falla con imports o variables sin usar.
- **Lo propio de la web** (analítica y links del router) va en `apps/web/src/components/`: `TrackedSheet` y `TrackedSegmented` (envían eventos), `ListSearch` (buscador de listas, con evento) y `Breadcrumbs` (usa el router).
- **Componentes nuevos:** si sirven para más de una pantalla, van al paquete. Primero se busca en BoardUI (`npx boardui@latest list`); si no está, se arma en el paquete con React Aria y los tokens de BoardUI.

## Color

- **El celeste y azul de la bandera argentina son la identidad**: dominan todo el sitio, también gráficos, mapa, minigráficos, puntos y favicon. Es un sitio sobre el Estado argentino y sobre transparencia: el celeste es nacional y se asocia a confianza y claridad (el rojo, a alarma). Nada de otros colores de acento.
  - `accent-400` (#74ACDF) es el celeste oficial de la bandera: va en lo resaltado en oscuro, en el favicon y en las imágenes para compartir.
  - `accent-600` (#1F6DB5) es el azul de la marca: links, botón principal y lo resaltado en claro (5,4:1 sobre blanco). En oscuro, los links pasan a `accent-300`.
- Lo **accionable se distingue por lo que muestra**, no por otro color: botón relleno (`Button` primary), link (`text-text-link`, subrayado al pasar el mouse), flechas › y ↗ en azul.
- **Íconos decorativos en gris** (`text-foreground-icon-secondary`). Íconos de `@remixicon/react`, variantes `Line`.
- **Texto:** `text-text-primary`, `text-text-secondary` y `text-text-tertiary` (los dos últimos, un paso más oscuros que en BoardUI para pasar AA). Tipografía con la escala compuesta de BoardUI, que junta tamaño, peso e interlineado: `text-caption-1-regular`, `text-body-medium`, `text-headline-regular`, `text-title-3-semibold`, `text-display-4-semibold`… Nunca `text-sm font-medium` sueltos.
- Colores de estado (verde, amarillo, rojo) siempre con texto o ícono al lado: el color nunca va solo.
- Tokens del sitio en `packages/ui/src/styles/mt.css`, con valores separados para claro (`:root`) y oscuro (`.dark`). La escala `accent-50` a `accent-950` es celeste y azul (400 es el celeste de la bandera, 600 la marca) y re-tiñe todos los componentes de BoardUI. La rampa del mapa (`--map-0` a `--map-4`) está validada en ambos modos: un tono, pasos visibles y contraste con el fondo.

## Forma

- **Una sola forma por tipo de cosa:**
  - **Controles** (botones, botones de ícono, campos, selects, selectores de opciones, filtros): esquinas `rounded-2lg` (10 px), 44 px. Nada de botones redondos ni casi cuadrados sueltos: los filtros también son `Button`/`buttonClassName` (primary el elegido, secondary el resto).
  - **Campos** (`Input`, `Textarea`): blancos con borde, con anillo azul al enfocar. El `Select` se ve como un botón secundario (celeste), porque se toca para elegir.
  - **Fondo de la página y de lo que se toca** (estilo Mercado Libre): la página es un gris muy tenue (`background-full`, #F3F4F6) y el encabezado, blanco. Las hojas (`Sheet`) usan los mismos fondos: encabezado blanco y cuerpo gris, porque sobre blanco las tarjetas y filas que se tocan no se distinguen de lo que solo informa. Hay tres looks, y se distinguen sin pensar:
    - **Acciones** (botón secundario, botón de ícono, `Select`, filtros): fondo celeste claro y texto azul oscuro (`bg-background-action`, `text-text-action`, 6,2:1), sin borde. Toda acción se ve azul, no solo el botón principal.
    - **Lo elegido** (la opción activa de un `Segmented`, la tarjeta elegida de `ChoiceTiles`) va en celeste con texto azul, y lo demás queda blanco o apagado. Nunca blanco sobre blanco: no se distingue cuál está activa.
    - **Qué control usar para elegir:** hasta 4 opciones cortas, `Segmented`; opciones que abren formularios o pantallas distintas, o nombres largos que en el `Segmented` obligarían a desplazarse, `ChoiceTiles`; muchas opciones largas, `SearchSelect`; el resto, `Select`. El menú de un `Select` nunca es más angosto que su campo.
    - **Filtros de una página, en una barra que no cambia de forma:** cuando una página se filtra por varias cosas (año, tipo, lugar, fecha, cargo), todos los filtros van juntos en una grilla de `Select` (o `SearchSelect` para el lugar), en una sola fila en la compu, y están siempre, en el mismo lugar, para cualquier año o lugar elegido. Lo que no aplica no desaparece: se muestra deshabilitado (con una sola opción, o con «—» mientras no aplica) y la línea de abajo dice por qué, con el ícono de aviso en ámbar («En 2026 no hubo elecciones provinciales»). La explicación de abajo tiene un alto mínimo, para que lo que sigue no salte al cambiar un filtro. Que un control aparezca y desaparezca según el dato mueve la página y la gente pierde dónde estaba. Ejemplo: `FilterBar` en `apps/votacion`.
    - **Lo que se toca y lleva a otro lado** (tarjetas, filas de listas): blanco (`bg-background-interactive`) con sombra (`shadow-card`) y sin borde; la flecha o el nombre en azul, siempre.
    - **Lo que solo informa** (cifras, bloques, filas sin acción): plano sobre el gris, sin fondo propio, con un borde fino. Nunca blanco con sombra: los datos de PostHog (octubre de 2026) mostraron que la gente toca las tarjetas de cifras cuando parecen tarjetas.
  - **Tarjetas y bloques:** el mismo radio (`rounded-xl`): `tileVariants()` para lo informativo y `cardVariants()` para lo accionable.
  - **Listas** (personas, organismos, procesos, leyes): un solo bloque con las filas divididas, `listVariants()` en la lista y `listRowVariants()` en cada fila (44 px, fondo interactivo y flecha visible si lleva a otro lado; `{ interactive: false }` en la superficie si es solo información). Nunca una tarjeta por fila: `cardVariants()` es para tarjetas sueltas en grilla. Vale también para unos pocos links dentro de un bloque informativo (los grupos de «Todo lo que hay», «Quién le compra»): van en `listVariants()` dentro del `tileVariants()`, nunca como texto azul suelto con un hover gris propio, porque sobre el gris no se distinguen de un texto. En una fila de lista, el ícono y la flecha van centrados en vertical con el texto, aunque tenga dos líneas: nunca `items-start` con `mt-0.5` (el ícono queda colgado arriba). Ícono y flecha, de 20 px (`size-5`). Arriba solo se alinean en las tarjetas de una grilla, que tienen todas la misma altura.
  - **Etiquetas no clickeables:** `Chip`, `rounded-md`. Redondo solo lo que es redondo: caras (`Avatar`), puntos de estado y marcas de gráficos.
  - **Mezcla de lo que se toca y lo que no en una misma fila** (por ejemplo, los firmantes de una ley: unos tienen ficha y otros no): todos con la misma altura, la misma cara y el mismo texto; solo cambia el fondo (botón secundario si lleva a algún lado, sin fondo si no). Nunca un `Chip` chico al lado de un botón de 44 px: la fila salta al cortar de línea.
- **Lo accionable se ve antes del hover** (en el celular no hay hover): las filas que llevan a otra página tienen la flecha en el color de link (`text-text-link`) siempre. En listas de navegación, como "Todo lo que hay", el nombre del destino también va en ese color.
- **Tamaño mínimo para tocar: 44 px de alto** (`min-h-11`) en filas y botones.
- **Botones de solo ícono: cuadrados de 44 × 44 px**, con `IconButton` (`@mt/ui/components/base/buttons/icon-button`), que exige un nombre accesible (`aria-label`). Llevan fondo celeste claro e ícono azul (estilo secundario) para que se vean como botón antes del hover; un ícono suelto no se reconoce como botón.
- **La acción de la página va en columna, a la derecha del encabezado**, alineada con la primera línea (`PageHeader action`): nunca en una fila propia debajo de la bajada, que empuja el contenido para abajo. Es un botón de solo ícono con un `Tooltip` (`@mt/ui/components/base/tooltip/tooltip`) que nombra la acción al pasar el mouse o llegar con el teclado; en el celular no hay hover, así que el ícono tiene que ser el de siempre para esa acción (compartir: `RiShareForwardLine`). Lo mismo en el encabezado de una hoja (la de «Pedir este dato»).
- **Encabezados de 48 a 60 px de alto:** el del sitio, el de las hojas y el del buscador miden 56 px (`h-14`).
- `bun run verificar` controla las tres medidas en todas las páginas y en todos los anchos.
- **Nada se corta en dos líneas**: cifras, títulos de tarjetas, fechas y montos. La unidad va aparte y en chico («$ 965.709» + «millones»).
- **Nada que invite a deslizar y no responda** (PostHog registra «deslizamientos muertos»: gestos horizontales que no hicieron nada). Cuatro causas, cuatro reglas: (1) un gráfico de columnas se recorre con el dedo, no solo con toque: `ColumnChart` y `ChangeChart` leen `onTouchMove` y dejan `touch-pan-y`, así el scroll vertical sigue funcionando; (2) una tabla que scrollea de costado lleva `scroll-hint-x` (sombra en el borde con contenido, desaparece al llegar al final); (3) la línea secundaria de una fila (cargo · partido, estado · detalle) no se corta con «…» en el celular: se acomoda en hasta dos líneas (`line-clamp-2`), porque un texto cortado invita a deslizarlo para leer el resto. Solo el nombre principal se corta en una línea; (4) lo que no es interactivo no se dibuja como si lo fuera.
- **Nunca scroll horizontal**, en ningún ancho. Hay una red de seguridad global (`overflow-x: clip`), pero la causa se corrige igual.
- **Las barras de scroll van pegadas al borde derecho**, sin hueco entre la barra y el contenedor. El estilo es global (finas, sin carril, en `packages/ui/src/styles/mt.css`): no se estilan barras por componente ni se agrega `padding` a la derecha de un contenedor que scrollea.
- **Mobile first**: menú hamburguesa por debajo de 1024 px, pestañas desplazables, hojas a pantalla completa en celular.
- **El link para atrás va pegado al encabezado que presenta.** En el celular, «‹ Municipios» ya mide 44 px de alto: si además lleva el `gap` de la página (8 a 12), queda un hueco entre el link y el tema del título. Se usa `WithBreadcrumbs` (`apps/web/src/components/breadcrumbs.tsx`) envolviendo el `PageHeader` o el `<header>` propio: sin espacio extra en el celular y 8 px en escritorio. Nunca `Breadcrumbs` suelto como hijo de la columna de la página.
- **Una sola línea arriba del título.** El último elemento de la ruta es la página actual, no se toca y repetía el tema que iba debajo ("San Rafael" y "◎ Municipio"). Por eso la ruta termina en la página actual con su ícono (`current={{ label, icon }}`) y el `PageHeader` va sin `icon` ni `topic`: «Inicio › Municipios › ◎ San Rafael», «Inicio › Leyes › ⚖ Ley 9736 · Ambiente y agua». Si el tema traía un dato que el título no dice (el tema de la ley, el CUIT), va en ese último elemento. En el celular se ven el padre y la página actual («Municipios › ◎ San Rafael»), con el padre de 44 px de alto. Las páginas sin ruta siguen con el tema arriba del título.

## Celular

La mayoría entra desde el teléfono. Estos detalles separan «una página web en el celular» de algo cómodo:

- **Campos de formulario con letra de 16 px** en el celular (`max-sm:text-base`, ya incluido en `Input`, `Textarea` y `SearchInput` de BoardUI). Con menos, iOS agranda la página al tocar el campo y no la vuelve a achicar. Nunca se arregla bloqueando el zoom (`maximum-scale=1` o `user-scalable=no`): es un problema de accesibilidad. `bun run verificar` lo controla.
- **Teclado correcto:** `type="email"`, `type="tel"`, `inputMode="numeric"` para números y `enterKeyHint="search"` en los buscadores.
- **El hover no existe en el celular.** En Tailwind 4, `hover:` ya se aplica solo en dispositivos con mouse. Por eso nada importante puede depender del hover (ver Forma).
- **Respuesta al tocar:** lo que se toca cambia algo en el momento (`active:`), no recién al soltar.
- **Una hoja se abre desde el contenedor que tapa, nunca desde la fila que la dispara.** Dentro de un panel propio (el de Aco), la hoja la dibuja el panel y la fila solo le avisa que la abra. Si la dibuja la fila (un `absolute inset-0` dentro de un elemento `relative`), se posiciona contra esa fila: queda angosta, flotando en medio del contenido y cortada. Pasó con el formulario del 👎 de Aco.
- **Las hojas y los menús contienen su scroll** (`overscroll-contain`): al llegar al final no se mueve la página de atrás. La `Sheet` y el menú móvil ya lo hacen.
- **Si una hoja existe para que la persona haga algo (copiar, presentar, enviar), la acción va fija abajo y se ve sin scrollear en un celular de 375×667**, no al final del contenido: arriba, lo mínimo para entender qué se pide (título y una frase); el «por qué importa» y el respaldo, debajo. Dos botones de 44 px en una fila, de una línea cada uno (`sticky -bottom-4 -mx-4 -mb-4` dentro del cuerpo de la `Sheet`, que tiene `p-4`). Ejemplo: «Pedir este dato» en `/no-publicado` (en 7 días nadie completó el pedido: los botones quedaban 217 px debajo del borde de la pantalla).
- **Alto de pantalla con `dvh`**, no con `vh`: en el celular, `100vh` incluye la barra del navegador y deja botones tapados.
- **Probar en un teléfono de verdad** cuando el cambio toca teclado, zoom o gestos: la emulación de Chrome no los reproduce. Con `bunx vite --host`, se abre desde el celular con la IP de la computadora.

## Contenido

- **La gente no lee**: primero una lista corta, una fila por ítem; el detalle se abre en una **hoja modal** a la derecha con el fondo oscurecido. Nunca un panel al costado de la tabla.
- **Si un texto ocupa dos líneas, que queden parejas.** Nunca una palabra sola en la última («Cada persona, con su / partido»): los títulos y las cifras van con `text-balance`, los párrafos con `text-pretty`, y en las imágenes que se dibujan (las de compartir) el texto se corta con `wrap()`, que reparte las palabras. Mejor aún si entra en una línea: el título se acorta antes que dejarlo en dos.
- **Lo informativo antes que lo crudo**: tarjetas y gráficos arriba, tablas abajo. Los datos crudos van en páginas internas; la portada busca el impacto.
- **Una tarjeta, una cifra y una frase.** Lo que se lee primero es el dato, no la explicación: la cifra grande y una sola oración corta que la completa («68 %» + «de las compras se hicieron sin licitación»). El matiz, el «por qué importa», la metodología y los casos van adentro, en la hoja que abre la tarjeta. Lo mismo en las filas de una lista: el título y una sola línea de contexto (en los casos de compras, solo el organismo que compró), con el monto a la derecha y la fecha debajo del monto. En la portada, cada pregunta se responde con una cifra en negrita y unas pocas palabras («**US$ 775 M** de deuda, US$ 378 por persona»), no con una descripción de lo que hay en la página. Los avisos (`Alert`) llevan un título con el dato y una oración. La frase dice el hecho, sin adjetivos: el impacto lo da el número. Ejemplos: `/senales` y la portada.
- **Tarjetas de un mismo tipo, agrupadas por la pregunta que responden** («Cuánta competencia hay», «Cuánto se paga», «A quién se le compra»), cada grupo con su `Section`. Nunca una grilla larga con una etiqueta de tema repetida arriba de cada tarjeta («COMPRAS», «COMPRAS»…): se ve desordenada y la etiqueta no dice nada. Lo que limita al resto de la página (por ejemplo, que la fuente dejó de publicar hace meses) va primero y solo, como `Alert` con la acción para pedirlo a mano. Ejemplo: `/senales`.
- **El dato del año en curso.** Las cifras del principio de una página (las tarjetas de arriba) son del año en el que estamos: lo recaudado en lo que va del año contra los mismos meses del anterior, el presupuesto de este año y lo ejecutado hasta la fecha de corte. Un dato de años anteriores nunca va en primera plana. Si la fuente está atrasada (un anuario que sale dos años después, un organismo que dejó de publicar), lo viejo se muestra más abajo, después de un aviso que dice de qué año es, por qué y cómo pedirlo al día (`StaleDataAlert`, `src/components/stale-data-alert.tsx`, con el link al pedido de `/no-publicado`). Si el pedido no existe, se suma a `data/curado/no-publicado.yaml` en el mismo cambio. Para un dato mensual, el aviso aparece cuando pasan más de 3 meses sin uno nuevo. Ejemplos: `/recaudacion` y `/universidades/uncuyo`.
- **Históricos de 8 años como máximo.** Una serie más larga diluye lo que pasa ahora: un gráfico de evolución muestra los últimos 8 años (el último, el año en curso o el último completo). Para que el año en curso entre en la comparación aunque no haya terminado, se comparan los mismos meses de cada año («ene–sep de cada año»). La serie completa queda en `/datos/<fuente>`, con el link en «Cómo lo calculamos».
- **Términos difíciles, explicados donde aparecen.** Una palabra que alguien de afuera del tema no entiende y de la que depende la página («dedicación exclusiva», «devengado», «Ingresos Brutos», «presupuesto prorrogado») va con `Term` (`src/components/glossary-term.tsx`): subrayado punteado y, al tocarla, su definición del glosario (`src/glossary.ts`, la misma de `/como-leer`) en una nota flotante que se abre sin hover. No es un diccionario de todas las palabras: solo los conceptos de los que se está hablando. La definición se escribe una vez, en el glosario, en lenguaje simple y sin jerga.
- **Cada sección tiene su link.** Todo título de bloque (h2) lleva un `id` y es un link a `#id` con el ícono de link visible, para mostrarle a alguien un dato puntual de una página larga (la coparticipación de San Rafael, no todo el municipio). `Section` lo pide; los títulos armados aparte usan `SectionTitle`. Detalle en `web.md`, «Link a cada sección».
- **Fuentes siempre visibles, siempre al final**: cada página termina con la sección «Fuentes» (`FuentesOficiales`, `#fuentes`), nunca arriba ni a mitad de página. Es poca la gente que la abre, pero es lo que permite comprobar que lo que mostramos es correcto, así que está en todas y en el mismo lugar. Una fila por organismo, sin repetir «Fuente:» en cada una: el nombre del organismo, «Sitio oficial», «Copia del <fecha>» y, cuando existe, «archive.org». Nada más: ni párrafos sueltos «Fuente: …» debajo de una tabla o un gráfico, ni otros links en esa sección.
- **Toda persona lleva su cara.** Donde se nombre a alguien (buscador, listas, fichas, organismos, designaciones, firmas de las leyes) va `PersonAvatar` (`@mt/ui/components/avatar`) con su foto oficial, o con sus iniciales mientras no la tengamos.
  - Las fotos salen solo de sitios oficiales (`bun run scrape fotos`).
  - Las personas sin página de funcionario se identifican como `etica-<official_id>` en `data/processed/fotos/fotos.csv`.
  - Faltar una foto es un pendiente a resolver, no un estado aceptable.
  - **Partido en la cara.** A quien ocupa un cargo electo, `PersonAvatar` le suma con `party` una insignia chica abajo a la derecha con su partido, frente o bloque: el logo oficial o, mientras no esté, un círculo lleno con el color oficial del partido (`PartyAvatar`; campo `color` de `partidos.yaml` o, si no está, `colores-partidos.yaml`), para que se distinga de un vistazo sin leer. **Nunca letras:** unas siglas o iniciales sueltas en un círculo de 16 px no dicen nada y se confunden con las iniciales de la persona; el nombre del partido ya está escrito en la fila. Por eso es la única excepción a la paleta celeste, y solo dentro de ese círculo. Sin logo ni color oficial, el círculo queda gris neutro, vacío. Si la fuente no dice el partido de alguien electo, `partyMissing` dibuja la insignia vacía con borde punteado. Los cargos designados (ministros, Fiscal de Estado) no llevan insignia: el cargo no tiene partido. Solo desde 40 px (abajo de eso no se lee) y siempre con el nombre del partido escrito en la fila, porque la insignia es decorativa. La insignia no es un link: la fila ya lo es y un círculo de 16 px no llega a 44 px. El link al partido va en el campo «Bloque» o «Partido o frente» de la ficha. Criterios de qué partido se muestra: `metodologia.md`, «Partidos, frentes y bloques».
- Todo lo navegable dentro de una hoja lleva flecha › en `text-text-link` y se resalta al pasar el mouse. La flecha alcanza: sin un texto de ayuda («Tocá una para…») que suma una línea más.
- Castellano rioplatense llano. Títulos como preguntas cuando ayuda («¿Cuánto debe Mendoza?»).
- **Un control automático responde primero con una oración** (votación, «¿Cierran los números?»): «Se contaron todas las mesas», «Cambiaron algunos votos, como es normal, y ninguno cambió quién ganó. El cambio más grande: …». Cómo se revisó y la lista de casos van al abrirlo, cada caso como «antes → después» con la diferencia y su peso en porcentaje, nunca una pared de oraciones iguales. Los términos que asustan sin contexto (votos recurridos que «pasan a cero») llevan su explicación al lado.

## Avisos

- **Varias alertas sobre lo mismo** (un proceso de compra con desvío, una sola oferta y contratación directa): **etiquetas ámbar compactas** arriba. Al tocar una se abre su explicación como nota flotante, sin empujar el contenido (`Flags` en `src/components/purchase-detail.tsx`). Se cierra al tocar afuera o con Escape. No apilar cajas de aviso: generan scroll y nadie las lee.
- **Montos grandes:** en millones con la palabra entera ("$ 1.673 millones"), nunca "M" ni "mil M". En las tarjetas destacadas, la unidad va aparte y en chico (`Amount` en `src/components/purchase-detail.tsx`). Los desvíos van en porcentaje ("+526.069 % sobre lo estimado").
- **Lo que define el caso va con protagonismo,** no al fondo. Por ejemplo, con una sola oferta adjudicada, la sección dice "Ganó sin competencia" y destaca al ganador con su monto.

Componente `Alert` (`@mt/ui/components/alert`) para lo que hay que leer sí o sí. Dos variantes:

| Variante | Cuándo | Ejemplos |
|---|---|---|
| `warning` (ámbar, ⚠) | Un problema o una señal | «Por qué importa» en datos no publicados y en señales; sueldo no publicado; fuentes oficiales que no coinciden; proceso con una sola oferta; empresa que ganó antes de cumplir un año |
| `note` (neutra, ⓘ) | Una aclaración de método para leer bien un número | La deuda en pesos baja con la devaluación; por qué los municipios chicos reciben más por habitante; salto entre proyecciones de población; límites de las declaraciones juradas; montos sin ajustar por inflación |

El ámbar es un color de estado, como el verde y el rojo: va siempre con ícono y título, y no reemplaza al azul de la marca. No abusar: un aviso por bloque como máximo, y solo si cambia cómo se interpreta el dato.

## Gráficos

- **Con Recharts, como los gráficos de BoardUI** (`apps/web/src/charts/`): `LineChart` es un área con línea y `ColumnChart` son barras, con ejes sin línea, grilla horizontal suave, cursor punteado y la lectura del punto activo en una tarjeta (`tileVariants`) que se abre al tocar. `BarList` (ranking) y `Sparkline` quedan en HTML y SVG, porque Recharts no les suma nada y pesa: el código de Recharts (~96 KB comprimidos) solo lo bajan las páginas con gráficos. El mapa es propio.
- **Colores solo con tokens:** la serie en `highlight`, lo secundario en un paso más claro de `accent`, la grilla en `chart-grid` y los ejes en `chart-axis`. El relleno bajo la línea es plano y tenue, sin degradé. Sin animación si la persona pidió menos movimiento (`use-reduced-motion.ts`).
- **Elegir la forma por lo que se quiere leer**: evolución en el tiempo → línea (series largas) o columnas (montos por año, `ColumnChart`, con los años vacíos visibles); cuánto subió o bajó algo en cada período → columnas desde una línea en cero (`ChangeChart`), con el signo escrito en la lectura («+940 cargos»), porque la dirección de la barra no alcanza; ranking o composición → barras horizontales (`BarList`). **En una composición (partes de un total, con su porcentaje), la barra llena es el total** (`total` de `BarList`): cada barra mide su porcentaje y el texto lo dice; sin `total`, las barras se miden contra la más grande y solo sirven para un ranking. Aunque se muestren solo las primeras (las 10 disciplinas con más estudiantes, de 28), si son partes de un mismo total van con `total` y su porcentaje: si no, la más grande queda llena, parece el 100 % y las demás parecen «la mitad»; comparar dos montos (estimado contra adjudicado) → dos barras en la misma escala con la diferencia en porcentaje.
- Una sola serie por gráfico de línea; el eje Y sin unidad (va en el título) y el eje X con etiquetas espaciadas según el ancho.
- Franjas por gobernador, neutras, en las series temporales; comparación por mandato con el dato inicial y final.
- Mapas con escala por cuantiles (cada tono agrupa una cantidad parecida de departamentos) y más = más intenso en ambos modos.
- **Dos fuerzas que compiten (votación): el color de cada una.** Las dos fuerzas que encabezan la provincia en esa elección y ese cargo se pintan con **su color oficial**, el de su logo en la boleta oficial o en su sitio (`data/curado/colores-partidos.yaml`, con la URL de donde salió; sin fuente oficial no hay color). La gente reconoce a cada fuerza por su color, y uno inventado confunde. Las demás fuerzas van con su color oficial si lo tienen, y en gris (`chart-axis`) si no; en el mapa de la provincia, cualquier otra fuerza que gane un departamento va en gris. El color sigue a la fuerza en toda la página: si la segunda gana un departamento, ese departamento lleva su color. Más claro, menos votos para quien ganó (mezcla con el fondo en cuatro pasos). Si los dos colores se parecen, la segunda fuerza lleva rayas blancas en el mapa y en las barras. Si una fuerza no tiene color oficial cargado, se usa el azul (`map-3`) o el naranja (`map-alt-3`) de la paleta validada y la leyenda dice «sin color oficial». Siempre con el nombre escrito al lado (leyenda y etiquetas), nunca el color solo. En las PASO, la fuerza es el frente: sus listas internas se suman. Junto al nombre de cada fuerza va su marca (`PartyMark`): el logo del partido si lo tiene; si es un frente de `data/curado/frentes.yaml`, los logos (o las siglas sobre su color) de sus partidos superpuestos en el orden del nombre; si no, un punto con su color. Es la única excepción a «nada de rojos»: el color es el de la fuerza, no un acento del sitio.
- **Cada tramo de una barra de partes dice qué es** (votación: el mano a mano con todas las fuerzas): al pasar el mouse o llegar con el teclado, un tooltip con el logo o el color, el nombre, el porcentaje y los votos; al tocar, la hoja de esa fuerza. Una línea debajo de la barra lo explica («Cada tramo de la barra es una fuerza…»), porque en el celular no hay hover. Una barra de colores sin rótulo no se entiende.
- **Elecciones provinciales y municipales nunca en la misma vista.** Los cargos municipales son una elección distinta en cada municipio, con sus propias listas: se elige primero el municipio y se muestran solo sus listas y sus dos fuerzas principales. Nunca se suman municipios entre sí ni se pintan con las fuerzas que encabezan la provincia.
- **El departamento que se mira (bajo el mouse, con el foco del teclado o elegido) se marca con su color y los demás se apagan** a gris (`chart-grid`), nunca con un borde grueso ni bajando la opacidad: el borde se corta en las costuras del dibujo y queda tapado por los vecinos.
- **El mapa y su detalle se reparten el ancho por mitades** (`lg:grid-cols-2`): con el detalle en una columna fija y angosta, los montos de las tarjetas se cortan.
- **Dos gráficos chicos seguidos van en dos columnas en desktop** (`grid items-start gap-8 lg:grid-cols-2`, uno debajo del otro en el celular): un `ColumnChart` de pocos años o un `ChangeChart` a todo el ancho estiran las columnas y obligan a bajar para comparar. Cada uno lleva su `h3` para que las lecturas queden a la misma altura, y si en una página falta uno, el otro ocupa la fila entera (`only:col-span-full`). Lo que necesita el ancho (una línea con las bandas de gestiones, el mapa) sigue a todo el ancho.
- **La ficha de una entidad va en dos columnas en desktop** (proveedor, organismo, municipio; `EntityColumns` de `apps/web/src/components/entity-columns.tsx`): a la izquierda el encabezado con el nombre, quién es y sus cifras (datos, tarjetas, intendente), fija al bajar (`lg:sticky lg:top-20`), y a la derecha los gráficos y las listas, que son lo que se recorre. El encabezado va dentro de la columna fija para que el nombre no se pierda al bajar. Columnas por mitades (`lg:grid-cols-2 lg:items-start`); en el celular y en la hoja lateral, una sola columna en el mismo orden. La columna fija tiene que entrar en la pantalla de una notebook (unos 700 px): si crece, lo que sobra (un gráfico por año, el mapa) va arriba de la columna de la derecha. Dentro de una columna, las tarjetas van de a dos y los gráficos uno debajo del otro.
- **El borde entre departamentos se ve igual en el mapa y en el recuadro ampliado** (mismo grosor en pantalla, con `vectorEffect="non-scaling-stroke"`): si en el ampliado se afina, los departamentos con tonos parecidos se funden en una sola mancha.
- **Tocar un departamento en un mapa que no es de un tema lleva a la página del municipio** (`/municipios/<slug>`), no a la página del tema.
- **El dato de un departamento se lee en un tooltip** arriba de él al pasar el mouse o al llegar con el teclado, no en una tarjeta fija debajo del mapa que queda vacía hasta que se interactúa. En el celular no hay hover: tocar abre el detalle o la página del municipio, así que nada se pierde.
- Montos en valores reales (pesos de hoy) y por habitante cuando se comparan años o lugares.

## Textos de la interfaz

Complementa a Contenido: cómo se escriben los botones, los errores y las pantallas vacías.

- **Un nombre por cosa.** Si en un lugar es «proceso de compra», no es «licitación» en otro. Antes de escribir, buscar cómo se llama en el resto del sitio y en el glosario.
- **Los botones empiezan con un verbo:** «Ver la ley», «Enviar pedido», «Descargar CSV». Nunca «OK» ni «Aceptar».
- **Los links dicen adónde llevan** y se entienden fuera de contexto: «Ver todos los proveedores», nunca «acá» ni «ver más» sueltos. Si hay varios «Ver más» en la misma página, cada uno dice de qué.
- **Los botones de solo ícono nombran la acción**, no el dibujo: `label="Cerrar"`, no «X» ni «ícono de cruz».
- **Los errores dicen cómo seguir** y van al lado de lo que falló: «No pudimos enviar el pedido. Revisá la conexión y probá de nuevo», no «Algo salió mal». Sin «¡Ups!» ni signos de exclamación.
- **Pantallas vacías que orientan:** qué es este lugar y qué se puede hacer. Con un filtro: «No hay leyes que digan "riego". Borrar la búsqueda». Si el vacío es que el Estado no publica el dato, se dice así y se enlaza a `/no-publicado`.
- **El ejemplo del campo es un ejemplo,** no una instrucción: `nombre@correo.com`, no «Ingrese su correo». La instrucción va en la ayuda (`hint`) del campo.
- **Sin «por favor» ni «exitosamente»** en mensajes de rutina: «Pedido enviado».
- **Un aviso al lado de lo que se tocó:** al copiar, un tilde en el mismo botón; no una notificación lejos.

## Accesibilidad

Es un sitio público: tiene que funcionar con teclado, con lector de pantalla y con la letra agrandada. La referencia es WCAG 2.2, nivel AA.

- **Elementos nativos primero:** `<button>` para acciones y `<a href>` (o `Link`) para navegar. Nunca `<div onClick>`. Un link de verdad se puede abrir en otra pestaña.
- **Foco visible.** El estilo global (`:focus-visible` con el color de link) no se apaga: `outline-none` solo si el elemento tiene otro indicador visible, como el borde de color de los campos.
- **Todo se puede hacer con teclado:** Tab para moverse, Enter o Espacio para activar, Escape para cerrar hojas, menús y notas. Sin `tabIndex` positivos.
- **Nombre accesible en todo lo que se toca:** `IconButton` lo exige (`label`); los gráficos y el mapa llevan `aria-label` con lo que muestran.
- **El color nunca va solo** (también en Color): un estado lleva ícono o texto.
- **Contraste:** 4,5:1 para texto y 3:1 para bordes de controles y marcas de gráficos, en claro y en oscuro. Se mide contra el fondo real, no contra el blanco: el texto terciario (`text-text-tertiary`, #666) da 5,2:1 sobre el gris de la página y el azul de los links, 4,9:1. Antes de oscurecer el fondo de la página o aclarar un gris de texto, se recalcula.
- **Imágenes:** `PersonAvatar` usa `alt=""` porque el nombre siempre está escrito al lado; si una foto aparece sin el nombre, el `alt` es el nombre. Las imágenes decorativas, `alt=""`.
- **Encabezados en orden** (un `h1` por página, después `h2`…) y un solo `<main>`.
- **Zoom y letra grande:** la página tiene que aguantar la letra al 200 % y un ancho de 320 px sin scroll horizontal (`verificar` controla el ancho). Los contenedores de texto usan `min-h-*`, no `h-*` fijo.
- **Cambios que aparecen solos** (cantidad de resultados de un buscador): `role="status"` para que el lector de pantalla los anuncie.

## Fotos de paisaje

Para las páginas que piden un poco más de carácter (municipios, participar), un paisaje de Mendoza en puntos de colores: cada punto toma el color de la foto que tiene debajo.

- **La portada lleva una ilustración, no una foto:** `apps/web/public/fondos/portada.webp` (cordillera, viñedos y un dique), de fondo en todo el hero. Una máscara la funde con la página abajo y un velo suave del color de la página (`from-background-full/85`, radial) queda detrás del título, para que el texto se lea aunque caiga sobre las montañas. En oscuro va la versión de noche (`portada-noche.webp`, con luna): las dos se eligen con el token `--hero-image` de `mt.css`, como fondo CSS, así el navegador baja solo la del tema activo. Si se cambia una, se cambian las dos con el mismo encuadre. Es propia del sitio, así que no lleva botón de autoría ni «Proponé tu foto». Se guardan a 1280 px en WebP (40 a 60 KB): es lo primero que se pinta.

- **Componentes:** `DotImage` (`@mt/ui/components/dot-image`) es el efecto, en CSS puro: una máscara de puntos repetida sobre la imagen, sin JavaScript ni dependencias, así que sale en el HTML prerenderizado. `LandscapePhoto` (`apps/web/src/components/landscape-photo.tsx`) lo usa con una foto del registro y dos botones sobre la foto, abajo a la izquierda: el de autoría (ícono de información, abre el crédito al tocar) y «Proponé tu foto». Se usa `LandscapePhoto` con su `id` y una altura: `<LandscapePhoto id="cordon-del-plata" className="h-52 sm:h-80" />`. Va al tope de la página y ocupa el ancho del contenido hasta los bordes; con `flush={false}` queda donde se la pone.
- **Una foto decorativa no corre el contenido:** en un hero, el texto y las acciones se centran en toda la pantalla (entre el header y el borde de abajo), y la foto va de fondo, detrás. Si la foto ocupa su propio lugar, el contenido se centra solo en lo que queda arriba y se ve corrido hacia el header.
- **El crédito no ocupa una fila:** el crédito y la propuesta de foto van como botones sobre la imagen, nunca como una línea de texto debajo, que suma una fila y se mezcla con el título que sigue.
- **Registro:** `apps/web/src/photos.ts`, con título, autor, licencia, link y `focus` (qué parte queda a la vista al recortar). Los archivos van en `apps/web/public/fotos/<id>.jpg`.
- **Municipios:** cada uno tiene su paisaje, con el slug como `id` (`municipalityPhoto`), arriba de su página. El que todavía no tiene uno bueno con licencia libre (Guaymallén, Junín y Rivadavia) muestra el del sitio, `DEFAULT_PHOTO`, hasta que llegue una propuesta.
- **Páginas hermanas, la misma franja:** si las páginas de una sección llevan paisaje, su índice también (con el del sitio), con la misma altura y en el mismo lugar. Así ir de `/municipios` a un municipio no mueve nada: el título queda en el mismo píxel. Las alturas compartidas van en una constante (`LANDSCAPE_HEIGHT` en `municipios.tsx`).
- **Imágenes para compartir:** no usan estos paisajes: todas llevan la ilustración de la portada, como el hero (ver [Web](web.md)).
- **Solo fotos con licencia libre** (CC0, CC BY, CC BY-SA o dominio público), y siempre con su crédito a un toque: título, autor, licencia y link a la página de la foto, en el botón de autoría. Nunca fotos sacadas de sitios de turismo o de diarios.
- **Agregar una:** se busca en [Wikimedia Commons](https://commons.wikimedia.org) (horizontal, que se reconozca Mendoza: cordillera, viñedos, diques, ciudad) y se corre `bun scripts/photo.ts "<archivo de Commons>" <id>` desde `apps/web`. Baja una copia de 500 px (los puntos no necesitan más; pesa entre 30 y 50 KB) e imprime la entrada para `photos.ts` con el autor y la licencia. Antes de usarla, verificar que sea de Mendoza: muchas fotos de «los Andes» son de Santiago de Chile.
- **Fotos propuestas por la gente:** llegan desde Participar («Proponer una foto», `?tipo=foto`) como `feedback` con `kind = 'otro'` y `page = 'foto'` (ver [Participación](participacion.md)). Lo más simple es que la persona la suba a Commons con licencia CC BY-SA; si manda otro link, se le pide permiso por correo antes de publicarla.
- **Es decorativa:** `alt=""` y nada de texto encima, salvo los dos botones. La imagen no recibe clics (`pointer-events-none`), así nunca tapa lo que tiene al lado. El fundido hacia el fondo es una máscara, no un gradiente de color, y funciona igual en claro y en oscuro.

## Movimiento

El sitio casi no tiene animaciones, y está bien así: la gente viene a leer datos.

- **Solo cuando explica algo** (una hoja que entra, una nota que se abre). Lo que se hace muchas veces (pasar por filas, cambiar de pestaña, escribir) no se anima o dura 150 ms como mucho.
- **Rápido:** 200 ms o menos en interacciones. **Proporcionado:** una ventana entra desde ~0,95 de tamaño con opacidad, nunca desde 0; un botón al apretarse baja a 0,96, no a 0,8.
- **Respetar «reducir movimiento»:** desplazamientos y escalas con `motion-safe:`; con la preferencia activa, como mucho un cambio de opacidad.
- **Nombrar lo que cambia:** `transition-colors`, `transition-opacity`, `transition-transform`; nunca `transition-all`.
- **El movimiento nunca es la única señal:** además cambia un color, un ícono o un texto.
- **Una sola cosa titila en todo el sitio:** el punto amarillo de «Para mirar de cerca» en el menú (`StatusDot` con `blinking`), que marca la sección viva. Es un parpadeo lento de opacidad, se apaga con «reducir movimiento» y no se suma a otros lugares: si todo titila, nada llama la atención.

## Mascotas

Las mascotas viven en `packages/mascots` (`@mt/mascots`). La primera es **Aco**, un cóndor andino, la guía de trámites. Son ilustraciones en PNG con fondo transparente y un manifiesto JSON; sumar algo es agregar archivos, no tocar el componente.

Se usan con `<Mascot mascot="aco" pose="wave" size={120} />` y `<MascotAvatar mascot="aco" size={40} />` (`@mt/mascots/mascot`). Siempre con tamaño fijo (no mueve la página); `decorative` si al lado ya hay un texto que dice lo mismo; `priority` solo sobre el pliegue.

**Cuándo usar cada pose de Aco**

| Pose | Cuándo |
|---|---|
| `idle` (parado) | Reposo y avatar |
| `wave` (saluda) | Bienvenida |
| `thinking` (piensa) | Mientras busca en las fuentes |
| `point` (explica) | Cuando muestra pasos o datos |
| `celebrate` (festeja) | Después de un 👍, 1,5 s y solo con `motion-safe` |
| `shy` (apenado) | Errores y datos que no se publican |

**Sumar una pose o un estilo.** Pasar el dibujo a WebP al 80 % (`sharp`, ya en el paquete) y ponerlo en `packages/mascots/mascots/<id>/<estilo>/originales/<pose>.webp` (fondo liso claro, sombra suave permitida; así un original pesa unos 25 KB en vez de 1,5 MB), declararlo en `mascot.json` (`label`, `alt`, `use`) y correr `bun run mascotas`: genera `apps/web/public/mascotas/<id>/<estilo>/<pose>-<tamaño>.png` (se commitea). Un estilo nuevo es otra entrada en `styles`, con su propia carpeta de originales.

**Sumar una mascota.** Carpeta `packages/mascots/mascots/<id>/` con su `mascot.json` y los originales, el `import` en `src/manifest.ts` y `bun run mascotas`. Los tipos de pose salen del manifiesto, así que un nombre mal escrito no compila.

`bun run mascotas --check` verifica que cada pose del manifiesto tenga su original y sus archivos generados (y que pesen poco: 512 px menos de 150 KB, 96 px menos de 20 KB). El recorte es el mismo para todas las poses de un estilo, para que Aco no cambie de tamaño al cambiar de pose. `avatar.crop` es el cuadrado, en píxeles del original, que encuadra la cabeza y el collar.

- **La esquina inferior derecha es del asistente.** Ahí va el botón flotante de Aco en todas las páginas, así que ningún otro botón fijo o pegado al borde inferior de la pantalla va en esa esquina (por eso los botones de las fotos de paisaje van a la izquierda). El botón va invertido respecto del tema (oscuro en claro, claro en oscuro, con los tokens `background-inverse` y `text-inverse`) para destacarse sobre cualquier fondo, la ilustración de la portada incluida; el panel del chat, en cambio, sigue el tema, porque es una superficie para leer y no tiene que competir con la página.

## Lo que no hacemos

Cosas típicas de las interfaces armadas con IA o con plantillas. Hacen que el sitio parezca genérico y le quitan seriedad:

- Tarjetas dentro de tarjetas.
- Etiquetitas o «chips» encima de los títulos, y secciones numeradas («01 / Deuda»).
- Gradientes, brillos, vidrio esmerilado y sombras grandes con bordes finos.
- Pilas de íconos en cuadraditos de colores, uno por tarjeta.
- Todas las tarjetas con el mismo peso: lo que define el caso va con protagonismo (ver Avisos).
- Botones genéricos («Saber más», «Comenzar») y títulos vagos («Transparencia para todos»). El título dice qué dato hay: «¿Cuánto debe Mendoza?».
- Animaciones de «pensando» o de carga decorativas.
- Colores fuera de la paleta (ver Color), incluidos los rojos y bordós como acento.

Más sobre cómo se piden, se revisan y se estresan los cambios: [Mejoras de interfaz](mejoras-de-interfaz.md).
