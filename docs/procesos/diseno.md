# Diseño

Reglas de interfaz que salieron de revisar el sitio con ojos de ciudadano común. Aplicarlas desde el primer intento en cada pantalla nueva.

## Color

- **El borravino Malbec es la identidad**: domina todo el sitio, también gráficos, mapa, minigráficos, puntos y favicon. Nada de azules ni de otros colores de acento.
- Lo **accionable se distingue por la forma**, no por otro color: botón relleno (`bg-brand`), link (`text-link`, subrayado al pasar el mouse), borde en tarjetas, flechas › y ↗.
- **Íconos decorativos en gris** (`text-ink-muted`). Íconos de `lucide-react`.
- Colores de estado (verde, amarillo, rojo) siempre con texto o ícono al lado: el color nunca va solo.
- Tokens en `apps/web/src/styles.css`, con valores separados para modo claro y oscuro. La rampa del mapa (`--map-0` a `--map-4`) está validada en ambos modos: un tono, pasos visibles y contraste con el fondo.

## Forma

- **Borde = clickeable.** Las tarjetas informativas llevan solo fondo (`bg-tile`).
- **Nada se corta en dos líneas**: cifras, títulos de tarjetas, fechas y montos. La unidad va aparte y en chico («$ 965.709» + «millones»). Montos grandes en «mil M».
- **Nunca scroll horizontal**, en ningún ancho. Hay una red de seguridad global (`overflow-x: clip`), pero la causa se corrige igual.
- **Mobile first**: menú hamburguesa por debajo de 1024 px, pestañas desplazables, hojas a pantalla completa en celular.

## Contenido

- **La gente no lee**: primero una lista corta, una fila por ítem; el detalle se abre en una **hoja modal** a la derecha con el fondo oscurecido. Nunca un panel al costado de la tabla.
- **Lo informativo antes que lo crudo**: tarjetas y gráficos arriba, tablas abajo. Los datos crudos van en páginas internas; la portada busca el impacto.
- **Fuentes siempre visibles**: cada página y cada cifra enlazan al sitio oficial y a la copia archivada.
- Todo lo navegable dentro de una hoja lleva flecha ›, se resalta al pasar el mouse y tiene un texto de ayuda («Tocá una para ver el proceso completo»).
- Castellano rioplatense llano. Títulos como preguntas cuando ayuda («¿Cuánto debe Mendoza?»).

## Gráficos

- Una sola serie por gráfico de línea; el eje Y sin unidad (va en el título) y el eje X con etiquetas espaciadas según el ancho.
- Franjas por gobernador, neutras, en las series temporales; comparación por mandato con el dato inicial y final.
- Mapas con escala por cuantiles (cada tono agrupa una cantidad parecida de departamentos) y más = más intenso en ambos modos.
- Montos en valores reales (pesos de hoy) y por habitante cuando se comparan años o lugares.
