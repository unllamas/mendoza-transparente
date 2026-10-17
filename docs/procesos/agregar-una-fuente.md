# Agregar una fuente

De un dato público que existe en algún sitio oficial a una tabla legible en la web.

## 1. Relevar

Antes de escribir código:

- Confirmar que la fuente es **oficial** (organismo público) y anotar la URL exacta.
- Ver el **formato** (API, CSV, XLSX, PDF, HTML), la **frecuencia** de publicación y desde cuándo hay datos.
- Probar que responde desde un servidor en la nube: algunos sitios del Gobierno rechazan a GitHub (ver [Actualización de datos](actualizacion-de-datos.md#sitios-que-bloquean-a-la-nube)).
- Si el dato debería existir y no está publicado, va a [`data/curado/no-publicado.yaml`](datos-y-archivo.md#contenido-curado), no a un scraper.

El relevamiento inicial completo está en [`docs/relevamiento-fuentes.md`](../relevamiento-fuentes.md).

## 2. Escribir el scraper

Un archivo por fuente: `packages/scrapers/src/sources/<id>.ts`, que exporta `async function run(args: string[])`. El `id` es el nombre de la carpeta en `data/raw/<id>/` y `data/processed/<id>/`.

Reglas:

- Descargar siempre con `fetchAndArchive()` o `get()` + `archive()` de `@mt/core`: mandan User-Agent de navegador, reintentan y archivan el crudo con su sha256 (ver [Datos y archivo](datos-y-archivo.md)).
- Pedidos en secuencia y con pausa; nunca en paralelo contra un mismo sitio.
- **Idempotente**: correrlo dos veces seguidas no duplica nada.
- Si una parte de la fuente puede fallar sin invalidar el resto (por ejemplo, una de dos cámaras), conservar los datos anteriores de esa parte con `readProcessed()` y avisar con `console.log("::warning title=…::…")`.
- Datos personales: antes de archivar, quitar DNI, CUIL, domicilios, patentes, cuentas bancarias y nombres de familiares. Documentar en el comentario de cabecera qué se redacta.
- Escribir los CSV con `writeProcessed()`: UTF-8, columnas en snake_case, montos nominales (la conversión a valores reales se hace en la web).
- El comentario de cabecera explica la fuente, las URLs, las unidades y cualquier decisión (empalmes, escalas, excepciones).

Correrlo: `bun run scrape <id>`. Verificar tipos: `bunx tsc --noEmit` dentro de `packages/scrapers`.

## 3. Verificar los datos

Antes de dar la fuente por buena:

- Conteos esperados (por ejemplo, 48 diputados, 18 municipios).
- Totales contra el documento original (una suma anual, un total del informe).
- Escalas: miles contra millones es el error más común. Mirar órdenes de magnitud.
- Fechas: rango completo y sin meses faltantes.
- Leer a ojo algunas filas del CSV.

## 4. Diccionario de datos

Junto a cada CSV, un `<archivo>.meta.json` con título, descripción y cómo mostrar cada columna (etiqueta, tipo, moneda, escala, columnas ocultas, orden, traducción de códigos). Formato completo en [`docs/diccionario-de-datos.md`](../diccionario-de-datos.md). Sin diccionario, la web muestra la tabla cruda.

Opciones útiles: `agruparPor` y `grupoInicial` (tablas de las 24 provincias que arrancan en Mendoza) y `vista: "ultimo"` (tarjetas con el último dato en vez de la tabla).

## 5. Registrar la fuente

Agregar la entrada en `sources.yaml` (`id`, `nombre`, `organismo`, `url`, `descripcion` en lenguaje llano, `formato`, `frecuencia`, `dificultad`, `estado: activo`).

## 6. Sumarla a la actualización automática

En `.github/workflows/actualizar-datos.yml`, agregar el id a `SEMANAL` o `MENSUAL`, con sus argumentos si los necesita. Replicar lo mismo en `TODAS` y `ARGS` de `scripts/actualizar.ts`. Si el sitio bloquea a la nube, agregar su host a `HOSTS_CON_PROXY` en `packages/core/src/fetch.ts`.

## 7. Llevarla a la web

- **Solo tabla**: con el diccionario alcanza; aparece sola en `/fuentes` y en `/datos/<id>`.
- **Página temática**: ver [La web](web.md#sumar-una-pagina-tematica).

## 8. Commit

Un commit por fuente con el scraper, `data/raw/<id>`, `data/processed/<id>` (CSV y meta.json) y `sources.yaml`. El mensaje, en [Conventional Commits](ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr), dice qué datos trae y su cobertura: `feat(scrapers): <fuente> con <qué datos> (<cobertura>)`.
