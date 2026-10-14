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

## Pasos para una fuente nueva

1. **Relevar:** qué trae cada fuente candidata, cobertura y formato. Elegir la mejor y contar por qué.
2. **Scraper:** `packages/scrapers/src/sources/<id>.ts`, que exporta `run(args)`. Se corre con `bun run scrape <id>`.
3. **Catálogo:** su bloque en `sources.yaml`, con nombre, organismo, URL, descripción, frecuencia y estado.
4. **Actualización automática:** sumarla a `SEMANAL` o `MENSUAL` en `.github/workflows/actualizar-datos.yml` y a `TODAS` en `scripts/actualizar.ts`. Las fuentes derivadas (por ejemplo `designaciones`) corren en el job `commit`.
5. **Web:** cálculo en `apps/web/scripts/temas/`, tipo en `src/types.ts`, página o sección (skills `diseno` y `seo-y-geo`).
6. **Lo que no se encuentra** va a `data/curado/no-publicado.yaml` **en el mismo commit**, con categoría, organismo, marco legal, dónde se buscó y el texto del pedido.

## Fuentes que necesitan cuidado

- **Boletín Oficial y Senado:** rechazan conexiones de fuera de Argentina, así que en GitHub Actions van por `PROXY_AR`. El backfill liviano es `bun run scrape boletin-oficial --desde … --hasta … --solo-tipo=ley`; se puede cortar y retomar, y tarda horas.
- **Ética Pública:** `--refresh` vuelve a pedir todo. La versión pública de cada declaración no trae montos de cuentas ni de efectivo.
- **Equivalencias entre fuentes:** `data/curado/jurisdicciones.yaml` une nombres y códigos de organismos (`carácter-jurisdicción-unidad`).
- **Fotos:** solo de sitios oficiales y de la persona sola, nunca recortadas de fotos grupales. Las de quienes no son funcionarios con ficha usan el id `etica-<official_id>`.
