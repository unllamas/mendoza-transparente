---
name: datos-y-fuentes
description: Cómo se suma o actualiza una fuente de datos públicos en Mendoza Transparente. Cubre scraper, archivo crudo con manifest, CSV con diccionario, sources.yaml, workflow de actualización, backfills del Boletín y qué hacer con lo que no se publica. Cargar al crear o tocar un scraper, al relevar una fuente nueva o al procesar datos.
---

# Datos y fuentes

Fuentes completas: `docs/procesos/agregar-una-fuente.md`, `datos-y-archivo.md` y `actualizacion-de-datos.md`. Relevamiento de lo que existe: `docs/relevamiento-fuentes.md`.

## Reglas de los datos

1. **Descargar** siempre con `fetchAndArchive()` o con `get()` + `archive()` de `@mt/core`. Así queda el User-Agent, el archivo en `data/raw/<id>/<fecha>/`, el `manifest.jsonl` con sha256 y el gzip para los archivos de más de 1 MB.
2. **`data/raw/` es de solo agregar:** nunca editar ni borrar un crudo.
3. **Procesados:** `data/processed/<id>/<tabla>.csv` con su `<tabla>.meta.json`, que es el diccionario: título, descripción y por cada columna etiqueta, tipo, unidad o moneda.
   - Montos en **pesos nominales**; los reales se calculan en la web.
   - Municipios normalizados con `normalizeMunicipio()`.
4. **Idempotente:** correr dos veces no duplica nada ni crea crudos nuevos si el contenido no cambió (`huella()` ignora el ruido del HTML).
5. **Sin paralelismo masivo** contra un mismo sitio. Ante errores 429, reintentos largos (ver `boletin-oficial.ts`).
6. **Validar** contra los totales impresos en el documento original. Anotar la cobertura (qué períodos faltan y por qué).
7. **Copias en archive.org:** cada crudo se sube solo a archive.org y su URL oficial se captura en la Wayback Machine (`bun run archivar`, job `archivo-externo`). Si el original de una fuente nueva trae datos personales que no archivamos, la fuente va a `WAYBACK_EXCLUDED` (`packages/scrapers/src/archive-org.ts`) en el mismo commit. Detalle en `datos-y-archivo.md`.

## Si aparece un problema de seguridad

Una carpeta abierta con datos de la gente, un sitio hackeado, un sistema que muestra lo que no debería: **parar**, no descargar nada más y no commitear ni subir a archive.org un crudo que lo traiga. El agente lo carga en el panel con `bun run hallazgo` (JSON por la entrada estándar, sin copiar los datos) y le pasa el código `S-…` a la persona, que lo reporta. Nunca buscar fallas, pasar un login o captcha, ni contarlo en el repositorio, un commit, un PR o un issue. Proceso completo: `docs/procesos/seguridad.md`.

## Pasos para una fuente nueva

1. **Relevar:** qué trae cada fuente candidata, cobertura y formato. Elegir la mejor y contar por qué. Las páginas y archivos se miran con `bun run crudo <url>` (busca primero en `data/raw/` y en el caché compartido, y muestra una vista compacta), no con `curl`.
2. **Scraper:** `packages/scrapers/src/sources/<id>.ts`, que exporta `run(args)`. Se corre con `bun run scrape <id>`. Antes de escribir una función auxiliar: `sleep`, `collapseSpaces`, `parseArNumber`, `finiteNumber` y `fetchOrReuse()` de `@mt/core`; `pdfText` y `pdfPages` de `src/lib/pdf.ts`.
3. **Catálogo:** su bloque en `sources.yaml`, con nombre, organismo, URL, descripción, frecuencia y estado.
4. **Actualización automática:** sumarla a `SEMANAL` o `MENSUAL` en `.github/workflows/actualizar-datos.yml` y a `TODAS` en `scripts/actualizar.ts`. Las fuentes derivadas (por ejemplo `designaciones`) corren en el job `commit`.
5. **Web:** cálculo en `apps/web/scripts/temas/`, tipo en `src/types.ts`, página o sección (skills `diseno` y `seo-y-geo`).
6. **Lo que no se encuentra** va a `data/curado/no-publicado.yaml` **en el mismo commit**, con categoría, organismo, marco legal, dónde se buscó y el texto del pedido.

## Fuentes que necesitan cuidado

- **Boletín Oficial y Senado:** rechazan conexiones de fuera de Argentina, así que en GitHub Actions van por `PROXY_AR`. El backfill liviano es `bun run scrape boletin-oficial --desde … --hasta … --solo-tipo=ley`; se puede cortar y retomar, y tarda horas.
- **Ética Pública:** `--refresh` vuelve a pedir todo. La versión pública de cada declaración no trae montos de cuentas ni de efectivo. De los ex funcionarios («mandato cumplido») con cargos jerárquicos se baja solo el detalle, que da `cargos.csv` (la historia de cada cargo con sus fechas): la corrida completa tarda cerca de una hora.
- **Junta Electoral (`junta-electoral`):** actas de proclamación de 2015 a 2023, escaneadas con texto. El parser corta si los conteos de bancas no cierran o aparece un partido desconocido; un partido nuevo se suma a mano después de mirarlo en el acta. No se archiva un acta que traiga DNI (la de Santa Rosa de 2017 quedó afuera por eso). Las actas de 1983 a 2014 están publicadas y todavía no se leen.
- **Anexos de Responsabilidad Fiscal de los municipios (`municipios-lrf`):** separados en capas (encontrar, leer, interpretar, clasificar). Para sumar un municipio alcanza con su buscador en `lrf/finders/<municipio>.ts`, probado con `bun packages/scrapers/src/lrf/try-finder.ts <archivo>` (no escribe en `data/`, así varios agentes trabajan en paralelo) y registrado en `FINDERS`; si aparece un código de partida nuevo, va a `lrf/classify.ts`. Nunca bajar los anexos 22 y 23, que traen deudores con nombre. Detalle en `docs/procesos/metodologia.md#presupuesto-y-gasto-de-cada-municipio`.
- **Equivalencias entre fuentes:** `data/curado/jurisdicciones.yaml` une nombres y códigos de organismos (`carácter-jurisdicción-unidad`).
- **Fotos:** solo de sitios oficiales y de la persona sola, nunca recortadas de fotos grupales. Las de quienes no son funcionarios con ficha usan el id `etica-<official_id>`.
