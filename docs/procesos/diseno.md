# Diseño

Reglas de interfaz que salieron de revisar el sitio con ojos de ciudadano común. Aplicarlas desde el primer intento en cada pantalla nueva.

## Sistema de diseño (`packages/ui`)

Los componentes base y los tokens viven en el paquete `@mt/ui`, armado con la configuración de shadcn para monorepos (`packages/ui/components.json`). Lo usa la web y lo pueden usar otros proyectos del monorepo (por ejemplo, uno de votación).

- **Solo Tailwind.** No se escribe CSS propio. El único archivo de estilos es `packages/ui/src/styles/globals.css`, con los tokens (variables de color en claro y oscuro, mapeadas con `@theme`) y una base mínima en `@layer base` hecha con `@apply`. La app lo importa desde `apps/web/src/styles.css` y no agrega estilos.
- **Piezas:**
  - `cn()` (`@mt/ui/lib/utils`) junta clases y resuelve conflictos de Tailwind.
  - Las variantes se definen con `cva`.
  - `asChild` (Radix Slot) aplica el estilo a un `Link` del router o a un `<a>`.
- **Componentes:**

| Componente | Para qué |
|---|---|
| `Button` | Variantes `primary` (relleno de marca, la acción principal), `secondary` (borde y fondo gris), `ghost` (dentro de otro control) y `link`. Tamaños de 44 px. |
| `IconButton` | Solo ícono: 44 × 44, estilo secundario, `label` obligatorio. |
| `Badge` | Etiquetas de una línea: `neutral`, `brand`, `warning`. Sin borde (no son clickeables). |
| `Tile` / `CardLink` | Bloque informativo (solo fondo) y tarjeta clickeable (borde, se marca en hover). |
| `Sheet` | Hoja modal (Radix Dialog): foco adentro, Escape y la X cierran. Con dos apiladas se muestra solo la de arriba; al cerrarla vuelve la de abajo. |
| `Popover` | Nota flotante (Radix Popover) que se reacomoda sola para no salirse de la pantalla. |
| `Alert` | Aviso `warning` o `note`. |
| `Segmented`, `SearchInput`, `StatTile`, `Section`, `PageHeader`, `PersonAvatar` | Selector de opciones, buscador, cifra con etiqueta, bloque con título, encabezado de página y cara de una persona. |

- **Lo propio de la web** (analítica y links del router) queda en `apps/web/src/pages/components.tsx`: `Sheet` y `Segmented` que envían eventos, `Buscador`, `Migas` y `EstadoBadge`.
- **Componentes nuevos:** si sirven para más de una pantalla, van al paquete. Se pueden sumar de shadcn con `bunx shadcn@latest add <componente>` desde `packages/ui`, y después se adaptan a los tokens y a las reglas de esta página.

## Color

- **El borravino Malbec es la identidad**: domina todo el sitio, también gráficos, mapa, minigráficos, puntos y favicon. Nada de azules ni de otros colores de acento.
- Lo **accionable se distingue por la forma**, no por otro color: botón relleno (`bg-brand`), link (`text-link`, subrayado al pasar el mouse), borde en tarjetas, flechas › y ↗.
- **Íconos decorativos en gris** (`text-ink-muted`). Íconos de `lucide-react`.
- Colores de estado (verde, amarillo, rojo) siempre con texto o ícono al lado: el color nunca va solo.
- Tokens en `packages/ui/src/styles/globals.css`, con valores separados para modo claro y oscuro. La rampa del mapa (`--map-0` a `--map-4`) está validada en ambos modos: un tono, pasos visibles y contraste con el fondo.

## Forma

- **Borde = clickeable.** Las tarjetas informativas llevan solo fondo (`bg-tile`).
- **Lo accionable se ve antes del hover** (en el celular no hay hover): las filas que llevan a otra página tienen la flecha en el color de link (`text-link`) siempre. En listas de navegación, como "Todo lo que hay", el nombre del destino también va en ese color.
- **Tamaño mínimo para tocar: 44 px de alto** (`min-h-11`) en filas y botones.
- **Botones de solo ícono: cuadrados de 44 × 44 px**, con `IconButton` (`@mt/ui/components/icon-button`), que exige un nombre accesible (`label`). Llevan borde y fondo gris (estilo secundario) para que se vean como botón antes del hover; un ícono suelto no se reconoce como botón.
- **Encabezados de 48 a 60 px de alto:** el del sitio, el de las hojas y el del buscador miden 56 px (`h-14`).
- `bun run verificar` controla las tres medidas en todas las páginas y en todos los anchos.
- **Nada se corta en dos líneas**: cifras, títulos de tarjetas, fechas y montos. La unidad va aparte y en chico («$ 965.709» + «millones»).
- **Nunca scroll horizontal**, en ningún ancho. Hay una red de seguridad global (`overflow-x: clip`), pero la causa se corrige igual.
- **Mobile first**: menú hamburguesa por debajo de 1024 px, pestañas desplazables, hojas a pantalla completa en celular.

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

- **Varias alertas sobre lo mismo** (un proceso de compra con desvío, una sola oferta y contratación directa): **etiquetas ámbar compactas** arriba. Al tocar una se abre su explicación como nota flotante, sin empujar el contenido (`Flags` en `detalle.tsx`). Se cierra al tocar afuera o con Escape. No apilar cajas de aviso: generan scroll y nadie las lee.
- **Montos grandes:** en millones con la palabra entera ("$ 1.673 millones"), nunca "M" ni "mil M". En las tarjetas destacadas, la unidad va aparte y en chico (`Amount` en `detalle.tsx`). Los desvíos van en porcentaje ("+526.069 % sobre lo estimado").
- **Lo que define el caso va con protagonismo,** no al fondo. Por ejemplo, con una sola oferta adjudicada, la sección dice "Ganó sin competencia" y destaca al ganador con su monto.

Componente `Alert` (`@mt/ui/components/alert`) para lo que hay que leer sí o sí. Dos variantes:

| Variante | Cuándo | Ejemplos |
|---|---|---|
| `warning` (ámbar, ⚠) | Un problema o una señal | «Por qué importa» en datos no publicados y en señales; sueldo no publicado; fuentes oficiales que no coinciden; proceso con una sola oferta; empresa que ganó antes de cumplir un año |
| `note` (neutra, ⓘ) | Una aclaración de método para leer bien un número | La deuda en pesos baja con la devaluación; por qué los municipios chicos reciben más por habitante; salto entre proyecciones de población; límites de las declaraciones juradas; montos sin ajustar por inflación |

El ámbar es un color de estado, como el verde y el rojo: va siempre con ícono y título, y no reemplaza al borravino de la marca. No abusar: un aviso por bloque como máximo, y solo si cambia cómo se interpreta el dato.

## Gráficos

- **Elegir la forma por lo que se quiere leer**: evolución en el tiempo → línea (series largas) o columnas (montos por año, `ColumnChart`, con los años vacíos visibles); ranking o composición → barras horizontales (`BarList`); comparar dos montos (estimado contra adjudicado) → dos barras en la misma escala con la diferencia en porcentaje.
- Una sola serie por gráfico de línea; el eje Y sin unidad (va en el título) y el eje X con etiquetas espaciadas según el ancho.
- Franjas por gobernador, neutras, en las series temporales; comparación por mandato con el dato inicial y final.
- Mapas con escala por cuantiles (cada tono agrupa una cantidad parecida de departamentos) y más = más intenso en ambos modos.
- Montos en valores reales (pesos de hoy) y por habitante cuando se comparan años o lugares.
