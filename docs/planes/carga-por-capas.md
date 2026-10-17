# Plan: carga por capas

Objetivo: que cada página muestre rápido lo que la persona vino a buscar, sobre todo desde un celular con mala señal, y que nada se mueva mientras termina de cargar. La regla (capas 1, 2 y 3, skeletons, precarga) está en [Velocidad de carga](../procesos/web.md#velocidad-de-carga).

Fecha: 17/10/2026. Estado: etapa 1 hecha; las demás, sin empezar.

## Por qué

PostHog (*Web vitals*, 10 al 17 de octubre) mostraba un LCP de 5,35 s y un CLS de 0,77, pero en **P99**: con 8 a 104 mediciones de LCP por día, P99 es la peor visita del día. En **P75**, que es el criterio de Google, el LCP estaba entre 0,8 y 1,7 s y el CLS entre 0,001 y 0,004: bien. El CLS de 0,77 era una sola visita (`/coparticipacion` en escritorio, con CLS 1,0).

Igual, mirando las visitas lentas aparecían problemas reales:

- **Celular con FCP = LCP de 3 a 16 s** en la portada, `/municipios/san-rafael`, `/leyes/9557` y `/proveedores`.
- **CLS de 0,12 a 1,0 en escritorio** en la portada, `/coparticipacion`, `/datos/hacienda-deuda-stock` y fichas de funcionarios.

## Qué encontramos (`bun run medir`, antes de la etapa 1)

| Problema | Dónde | Efecto |
|---|---|---|
| La sección «Fuentes» estaba **arriba** y aparecía tarde, empujando toda la ficha | `/proveedores/<slug>`, `/organismos/<slug>`, `/funcionarios/<cargo>` | CLS 0,98 en celular y 0,53 en escritorio (proveedor), 0,22 (organismo) |
| La ficha del proveedor se pedía **dos veces**: la ruta la cargaba y el componente la volvía a pedir mostrando «Cargando proveedor…» | `/proveedores/<slug>` | El contenido aparecía de golpe y empujaba el footer |
| **`index.json` completo (111 KB, 23 KB comprimido) en todas las páginas**, solo para la fecha del footer y las «Fuentes» | Layout y `FuentesOficiales` | Un pedido pesado en cada visita y el footer que crecía al llegar la fecha |
| La portada esperaba `index.json` para **dos números** del encabezado | `/` | 23 KB de la capa 1 que no hacían falta |
| `meta.json` (239 KB, 45 KB comprimido) en cada página de detalle **solo para el título**, que ya viene en el HTML | Toda ficha | Un pedido pesado sin uso en la primera visita |
| El tema y el mapa se pedían **uno detrás del otro** | `/coparticipacion`, `/poblacion` | Un viaje de red de más |
| La tabla de `/datos` mostraba «Cargando…» y después crecía | `/datos/<fuente>` | CLS 0,16 en escritorio |
| El JavaScript de la página y sus JSON se descubrían **recién cuando corría `main.js`** | Todas | LCP de 3 a 4 s en celular con red lenta |

## Etapas

### 1. Arreglos y la base de las capas (hecha)

- `fuentes.json` (4 KB comprimido) reemplaza a `index.json` en el footer, la portada y «Fuentes».
- «Fuentes» al final de las fichas de proveedor, organismo y cargo (regla 10 de diseño), con un skeleton de una fila por fuente mientras carga.
- `Proveedor` recibe la ficha que ya cargó la ruta (`initial`).
- `meta.json` solo al navegar dentro del sitio.
- Tema y mapa en paralelo en `/coparticipacion` y `/poblacion`.
- `Skeleton` y `SkeletonText` en `@mt/ui`. Lo usan la tabla de `/datos`, «Fuentes» y la sección «Lo que el Estado no publica» de la portada, que pasó a capa 3 (`<Await>`).
- Cada HTML precarga el JavaScript de su página y los JSON de su capa 1 (`scripts/preload.ts`).
- `bun run medir` para medir antes y después.

Resultado en local (celular con red lenta, varias corridas): **CLS 0 en todas las páginas medidas** (antes, 0,98 en proveedor, 0,22 en organismo y 0,16 en `/datos`). LCP: `/deuda` de 2,8 a 2,2–2,6 s, `/poblacion` de 3,4 a 2,6–2,9 s, `/empleo-publico` de 3,3 a 2,5–3,0 s y `/municipios` de 4,2 a 3,3–3,6 s.

**Pendiente de esta etapa:** volver a mirar PostHog en P75 una semana después de publicar (alrededor del 25/10/2026), por página y dispositivo.

### 2. Archivos chicos para páginas de un solo elemento (sin empezar)

Hoy varias fichas bajan la lista completa para mostrar un elemento:

| Página | Baja | Comprimido | Propuesta |
|---|---|---|---|
| `/municipios/<slug>` | `municipios.json` (los 18) + `leyes.json` (todas) | 39 KB + 18 KB | `municipios/<slug>.json` con su municipio y sus leyes ya filtradas; el mapa, capa 2 |
| `/funcionarios/<cargo>/<persona>` | `funcionarios.json` (todas las personas) | 13 KB (139 KB sin comprimir) | `funcionarios/<cargo>/<persona>.json`; el resto del cargo, capa 2 |
| `/proveedores` | `proveedores.json` (todos) | 59 KB | Los primeros 50 en la capa 1; el resto al buscar o al bajar |

Cada cambio de estos va con su `routePreload` en `scripts/preload.ts`.

### 3. Capas 2 y 3 en el resto de las páginas (sin empezar)

Revisar página por página qué es capa 1 y qué no, con `bun run medir` antes y después. Candidatos:

- **Portada:** el mapa de «Tu departamento» a capa 2, con un skeleton del alto medido (el SVG depende del ancho: medir en 375, 768 y 1280 px).
- **Ley:** las leyes relacionadas y las personas que la firmaron.
- **Organismo de gobierno:** el histórico y las designaciones.

### 4. Menos JavaScript antes del contenido (sin empezar)

El LCP del celular que queda (2–3,5 s en páginas con gráficos) es el tiempo de bajar y correr el JavaScript: el contenido prerenderizado se pinta enseguida (FCP de 0,4 s), pero React lo reemplaza por la versión con gráficos y ese es el elemento más grande.

- **Recharts pesa 96 KB comprimido** (`CartesianChart`). Las chispas de la portada y los gráficos de columnas podrían ser SVG propios, y Recharts quedaría solo para los gráficos interactivos.
- **Que el HTML prerenderizado tenga el mismo esqueleto que la página**, con los mismos tamaños, para que el elemento más grande sea el del HTML y no el que llega después.

### 5. Caché de los datos (sin decidir)

Los JSON se sirven con `max-age=0, must-revalidate`: cada visita pregunta si cambiaron (un 304 sin cuerpo, pero un viaje de red por archivo). Con nombres con hash (`temas/deuda.<hash>.json`) se podrían cachear para siempre. El costo es que el build escribe los nombres en el JavaScript y cambia el flujo de `build-data`. Decidir cuando la etapa 1 esté medida en producción.
