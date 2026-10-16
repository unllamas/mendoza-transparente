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
| `Button` (`base/buttons/button`) | Variantes `primary` (relleno azul, la acción principal), `secondary` (borde, el resto de las acciones), `ghost` y `danger`. Tamaño `large` (44 px) por defecto; `medium`, `small` y `xs` solo en superficies densas de escritorio. Íconos por prop (`leadingIcon={RiArrowLeftLine}`). Para un `Link` del router o un `<a>`: `className={buttonClassName({ variant: "secondary" })}`. |
| `IconButton` (`base/buttons/icon-button`) | Solo ícono: 44 × 44 por defecto, `icon` y `aria-label` obligatorios. |
| `Input`, `Textarea` (`base/input`, `base/textarea`) | Campos de React Aria con su etiqueta (`label`), ayuda (`hint`) y validación nativa (`isRequired`, `maxLength`). 44 px por defecto. `onChange` recibe el texto, no el evento. Para una fecha: `TextField` + `Label` + `InputBase type="date"` (el selector del celular). |
| `Select`, `SelectItem` (`base/select`) | Lista de opciones de React Aria (`value`/`onChange` con el `id` de cada `SelectItem`, o `name` + `defaultValue` en un formulario). Disparador y filas de 44 px. Con `label` visible arriba, o `aria-labelledby` si la etiqueta va al costado. |
| `SegmentedControl` (`base/segmented-control`) | Opciones excluyentes. `Segmented` (`@mt/ui/components/segmented`) lo arma desde una lista de opciones y lo hace desplazable en el celular. |
| `SearchInput` | `Input` de BoardUI con lupa, para filtrar listas. |
| `Chip` (`base/badges/chip`) | Etiquetas de una línea, no clickeables (esquinas `rounded-md`, sin borde). Colores de BoardUI más `brand` (celeste claro) y `warning` (ámbar, siempre con ícono). |
| `StatusDot` (`base/badges/status-dot`) | Punto de estado; `StatusBadge` lo acompaña con su texto (nunca el color solo). |
| `Avatar` (`base/avatar`) | Foto redonda o iniciales; si la foto no carga, muestra las iniciales. `PersonAvatar` lo usa para toda persona. |
| **Propios, armados con BoardUI** | |
| `listVariants()` / `listRowVariants()` (`card`) | Lista larga: un bloque con la misma superficie y filas divididas de 44 px; la fila accionable se marca al pasar el mouse. |
| `tileVariants()` / `cardVariants()` (`card`) | La misma superficie (borde, fondo, sombra suave, `rounded-xl`) para el bloque informativo (tamaños `sm`, `default`, `lg`) y la tarjeta accionable, que además marca el borde en azul al pasar el mouse. Se aplican al elemento que corresponda (`<li>`, `<details>`, un `Link`). |
| `Sheet` | Hoja modal (React Aria `Modal` + `Dialog`): foco adentro, Escape, la X y tocar afuera cierran. Con dos apiladas se muestra solo la de arriba; al cerrarla vuelve la de abajo. |
| `Popover` | Nota flotante (React Aria `DialogTrigger` + `Popover`): `PopoverTrigger` es el botón (abierto, lleva `aria-expanded`) y `PopoverContent` la nota, que se reacomoda sola para no salirse de la pantalla. |
| `Dialog` | Ventana a pantalla completa o centrada (React Aria): el buscador y el menú del celular. Foco adentro, Escape cierra. Para enfocar un campo al abrir, se enfoca desde un efecto del contenido. |
| `Alert` | Aviso `warning` (ámbar) o `note`, con íconos Remix. |
| `StatTile`, `Section`, `PageHeader`, `PersonAvatar`, `SearchInput`, `Segmented` | Cifra con etiqueta, bloque con título, encabezado de página, cara de una persona, buscador de listas y selector de opciones. |

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
  - **Controles** (botones, botones de ícono, campos, selects, selectores de opciones, filtros): esquinas `rounded-2lg` (10 px), borde y fondo de superficie, 44 px. Nada de botones redondos ni casi cuadrados sueltos: los filtros también son `Button`/`buttonClassName` (primary el elegido, secondary el resto).
  - **Campos** (`Input`, `Textarea`, `Select`): el mismo marco que el botón secundario (borde + fondo), con anillo azul al enfocar. Ninguno va solo con fondo gris.
  - **Fondo de lo que se toca:** botones secundarios, botones de ícono, campos, selects, selectores de opciones, tarjetas y filas clickeables van sobre `bg-background-interactive`, un gris entre el fondo y el borde (#F2F2F2 en claro, #2C2C2C en oscuro), que al pasar el mouse sube a `-interactive-hover`. Lo informativo (bloques, filas sin acción, hojas) va en `bg-background-surface`, que es exactamente el color del fondo en los dos modos (blanco y #121212): solo lo que se toca se despega del fondo. Así se lee sin pensar dónde hay que hacer clic.
  - **Tarjetas y bloques:** la misma forma (borde, sombra suave, `rounded-xl`): `tileVariants()` en la superficie para lo informativo y `cardVariants()` en el fondo interactivo para lo accionable.
  - **Listas** (personas, organismos, procesos, leyes): un solo bloque con las filas divididas, `listVariants()` en la lista y `listRowVariants()` en cada fila (44 px, fondo interactivo y flecha visible si lleva a otro lado; `{ interactive: false }` en la superficie si es solo información). Nunca una tarjeta por fila: `cardVariants()` es para tarjetas sueltas en grilla.
  - **Etiquetas no clickeables:** `Chip`, `rounded-md`. Redondo solo lo que es redondo: caras (`Avatar`), puntos de estado y marcas de gráficos.
  - **Mezcla de lo que se toca y lo que no en una misma fila** (por ejemplo, los firmantes de una ley: unos tienen ficha y otros no): todos con la misma altura, la misma cara y el mismo texto; solo cambia el fondo (botón secundario si lleva a algún lado, sin fondo si no). Nunca un `Chip` chico al lado de un botón de 44 px: la fila salta al cortar de línea.
- **Lo accionable se ve antes del hover** (en el celular no hay hover): las filas que llevan a otra página tienen la flecha en el color de link (`text-text-link`) siempre. En listas de navegación, como "Todo lo que hay", el nombre del destino también va en ese color.
- **Tamaño mínimo para tocar: 44 px de alto** (`min-h-11`) en filas y botones.
- **Botones de solo ícono: cuadrados de 44 × 44 px**, con `IconButton` (`@mt/ui/components/base/buttons/icon-button`), que exige un nombre accesible (`aria-label`). Llevan borde y fondo gris (estilo secundario) para que se vean como botón antes del hover; un ícono suelto no se reconoce como botón.
- **Encabezados de 48 a 60 px de alto:** el del sitio, el de las hojas y el del buscador miden 56 px (`h-14`).
- `bun run verificar` controla las tres medidas en todas las páginas y en todos los anchos.
- **Nada se corta en dos líneas**: cifras, títulos de tarjetas, fechas y montos. La unidad va aparte y en chico («$ 965.709» + «millones»).
- **Nunca scroll horizontal**, en ningún ancho. Hay una red de seguridad global (`overflow-x: clip`), pero la causa se corrige igual.
- **Las barras de scroll van pegadas al borde derecho**, sin hueco entre la barra y el contenedor. El estilo es global (finas, sin carril, en `packages/ui/src/styles/mt.css`): no se estilan barras por componente ni se agrega `padding` a la derecha de un contenedor que scrollea.
- **Mobile first**: menú hamburguesa por debajo de 1024 px, pestañas desplazables, hojas a pantalla completa en celular.
- **El link para atrás va pegado al encabezado que presenta.** En el celular, «‹ Municipios» ya mide 44 px de alto: si además lleva el `gap` de la página (8 a 12), queda un hueco entre el link y el tema del título. Se usa `WithBreadcrumbs` (`apps/web/src/components/breadcrumbs.tsx`) envolviendo el `PageHeader` o el `<header>` propio: sin espacio extra en el celular y 8 px en escritorio. Nunca `Breadcrumbs` suelto como hijo de la columna de la página.

## Celular

La mayoría entra desde el teléfono. Estos detalles separan «una página web en el celular» de algo cómodo:

- **Campos de formulario con letra de 16 px** en el celular (`max-sm:text-base`, ya incluido en `Input`, `Textarea` y `SearchInput` de BoardUI). Con menos, iOS agranda la página al tocar el campo y no la vuelve a achicar. Nunca se arregla bloqueando el zoom (`maximum-scale=1` o `user-scalable=no`): es un problema de accesibilidad. `bun run verificar` lo controla.
- **Teclado correcto:** `type="email"`, `type="tel"`, `inputMode="numeric"` para números y `enterKeyHint="search"` en los buscadores.
- **El hover no existe en el celular.** En Tailwind 4, `hover:` ya se aplica solo en dispositivos con mouse. Por eso nada importante puede depender del hover (ver Forma).
- **Respuesta al tocar:** lo que se toca cambia algo en el momento (`active:`), no recién al soltar.
- **Las hojas y los menús contienen su scroll** (`overscroll-contain`): al llegar al final no se mueve la página de atrás. La `Sheet` y el menú móvil ya lo hacen.
- **Alto de pantalla con `dvh`**, no con `vh`: en el celular, `100vh` incluye la barra del navegador y deja botones tapados.
- **Probar en un teléfono de verdad** cuando el cambio toca teclado, zoom o gestos: la emulación de Chrome no los reproduce. Con `bunx vite --host`, se abre desde el celular con la IP de la computadora.

## Contenido

- **La gente no lee**: primero una lista corta, una fila por ítem; el detalle se abre en una **hoja modal** a la derecha con el fondo oscurecido. Nunca un panel al costado de la tabla.
- **Lo informativo antes que lo crudo**: tarjetas y gráficos arriba, tablas abajo. Los datos crudos van en páginas internas; la portada busca el impacto.
- **Fuentes siempre visibles**: cada página y cada cifra enlazan al sitio oficial y a la copia archivada.
- **Toda persona lleva su cara.** Donde se nombre a alguien (buscador, listas, fichas, organismos, designaciones, firmas de las leyes) va `PersonAvatar` (`@mt/ui/components/avatar`) con su foto oficial, o con sus iniciales mientras no la tengamos.
  - Las fotos salen solo de sitios oficiales (`bun run scrape fotos`).
  - Las personas sin página de funcionario se identifican como `etica-<official_id>` en `data/processed/fotos/fotos.csv`.
  - Faltar una foto es un pendiente a resolver, no un estado aceptable.
- Todo lo navegable dentro de una hoja lleva flecha ›, se resalta al pasar el mouse y tiene un texto de ayuda («Tocá una para ver el proceso completo»).
- Castellano rioplatense llano. Títulos como preguntas cuando ayuda («¿Cuánto debe Mendoza?»).

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
- **Elegir la forma por lo que se quiere leer**: evolución en el tiempo → línea (series largas) o columnas (montos por año, `ColumnChart`, con los años vacíos visibles); ranking o composición → barras horizontales (`BarList`); comparar dos montos (estimado contra adjudicado) → dos barras en la misma escala con la diferencia en porcentaje.
- Una sola serie por gráfico de línea; el eje Y sin unidad (va en el título) y el eje X con etiquetas espaciadas según el ancho.
- Franjas por gobernador, neutras, en las series temporales; comparación por mandato con el dato inicial y final.
- Mapas con escala por cuantiles (cada tono agrupa una cantidad parecida de departamentos) y más = más intenso en ambos modos.
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
- **Contraste:** 4,5:1 para texto y 3:1 para bordes de controles y marcas de gráficos, en claro y en oscuro.
- **Imágenes:** `PersonAvatar` usa `alt=""` porque el nombre siempre está escrito al lado; si una foto aparece sin el nombre, el `alt` es el nombre. Las imágenes decorativas, `alt=""`.
- **Encabezados en orden** (un `h1` por página, después `h2`…) y un solo `<main>`.
- **Zoom y letra grande:** la página tiene que aguantar la letra al 200 % y un ancho de 320 px sin scroll horizontal (`verificar` controla el ancho). Los contenedores de texto usan `min-h-*`, no `h-*` fijo.
- **Cambios que aparecen solos** (cantidad de resultados de un buscador): `role="status"` para que el lector de pantalla los anuncie.

## Fotos de paisaje

Para las páginas que piden un poco más de carácter (la portada), un paisaje de Mendoza en puntos de colores: cada punto toma el color de la foto que tiene debajo.

- **Componentes:** `DotImage` (`@mt/ui/components/dot-image`) es el efecto, en CSS puro: una máscara de puntos repetida sobre la imagen, sin JavaScript ni dependencias, así que sale en el HTML prerenderizado. `LandscapePhoto` (`apps/web/src/components/landscape-photo.tsx`) lo usa con una foto del registro, el crédito y el link «Proponé tu foto». Se usa `LandscapePhoto` con su `id` y una altura: `<LandscapePhoto id="cordon-del-plata" className="h-52 sm:h-80" />`. Va al tope de la página y ocupa el ancho del contenido hasta los bordes.
- **Registro:** `apps/web/src/photos.ts`, con título, autor, licencia, link y `focus` (qué parte queda a la vista al recortar). Los archivos van en `apps/web/public/fotos/<id>.jpg`.
- **Municipios:** cada uno tiene su paisaje, con el slug como `id` (`municipalityPhoto`), arriba de su página y de fondo en su imagen para compartir. El que todavía no tiene uno bueno con licencia libre (Guaymallén, Junín y Rivadavia) muestra el del sitio, `DEFAULT_PHOTO`, hasta que llegue una propuesta.
- **Páginas hermanas, la misma franja:** si las páginas de una sección llevan paisaje, su índice también (con el del sitio), con la misma altura y en el mismo lugar, y el crédito va siempre en una línea. Así ir de `/municipios` a un municipio no mueve nada: el título queda en el mismo píxel. Las alturas compartidas van en una constante (`LANDSCAPE_HEIGHT` en `municipios.tsx`).
- **Imágenes para compartir:** todas llevan el paisaje de su página en puntos, tenue detrás del texto (ver [Web](web.md)).
- **Solo fotos con licencia libre** (CC0, CC BY, CC BY-SA o dominio público), y siempre con su crédito visible: título, autor, licencia y link a la página de la foto. Nunca fotos sacadas de sitios de turismo o de diarios.
- **Agregar una:** se busca en [Wikimedia Commons](https://commons.wikimedia.org) (horizontal, que se reconozca Mendoza: cordillera, viñedos, diques, ciudad) y se corre `bun scripts/photo.ts "<archivo de Commons>" <id>` desde `apps/web`. Baja una copia de 500 px (los puntos no necesitan más; pesa entre 30 y 50 KB) e imprime la entrada para `photos.ts` con el autor y la licencia. Antes de usarla, verificar que sea de Mendoza: muchas fotos de «los Andes» son de Santiago de Chile.
- **Fotos propuestas por la gente:** llegan desde Participar («Proponer una foto», `?tipo=foto`) como `feedback` con `kind = 'otro'` y `page = 'foto'` (ver [Participación](participacion.md)). Lo más simple es que la persona la suba a Commons con licencia CC BY-SA; si manda otro link, se le pide permiso por correo antes de publicarla.
- **Es decorativa:** `alt=""` y nada de texto encima. El fundido hacia el fondo es una máscara, no un gradiente de color, y funciona igual en claro y en oscuro.

## Movimiento

El sitio casi no tiene animaciones, y está bien así: la gente viene a leer datos.

- **Solo cuando explica algo** (una hoja que entra, una nota que se abre). Lo que se hace muchas veces (pasar por filas, cambiar de pestaña, escribir) no se anima o dura 150 ms como mucho.
- **Rápido:** 200 ms o menos en interacciones. **Proporcionado:** una ventana entra desde ~0,95 de tamaño con opacidad, nunca desde 0; un botón al apretarse baja a 0,96, no a 0,8.
- **Respetar «reducir movimiento»:** desplazamientos y escalas con `motion-safe:`; con la preferencia activa, como mucho un cambio de opacidad.
- **Nombrar lo que cambia:** `transition-colors`, `transition-opacity`, `transition-transform`; nunca `transition-all`.
- **El movimiento nunca es la única señal:** además cambia un color, un ícono o un texto.

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
