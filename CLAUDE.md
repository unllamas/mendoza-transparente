# Mendoza Transparente: guía para agentes

Proyecto cívico: recopilar los datos públicos de Mendoza, normalizarlos y publicarlos curados de cara a las elecciones de 2027. Ver `README.md` y `docs/relevamiento-fuentes.md`.

## Orquestación

- La sesión principal orquesta. Las tareas acotadas (un scraper, un parser, una verificación) van a subagentes en Sonnet, en paralelo y sobre archivos distintos.
- Cada subagente trabaja solo en los archivos de su fuente: `packages/scrapers/src/sources/<id>.ts` y `data/*/<id>/`. Si necesita tocar `packages/core/` o agregar dependencias, lo propone en vez de hacerlo (varios agentes en paralelo pisarían `bun.lock`).
- Los subagentes no commitean. La sesión principal revisa y commitea.

## Convenciones de datos

- Descargar siempre con `fetchAndArchive()` o `get()` + `archive()` de `@mt/core`: manda el User-Agent de navegador (sin él, los sitios del gobierno devuelven 403), archiva en `data/raw/<id>/<YYYY-MM-DD>/` y registra cada descarga en `manifest.jsonl` con su sha256.
- `data/raw/` es de solo agregar: nunca editar ni borrar un archivo crudo.
- Los archivos de más de 1 MB se guardan con gzip. GitHub rechaza archivos de más de 100 MB: si algo supera unos 50 MB comprimido, avisar antes de commitear.
- Los datos normalizados van en `data/processed/<id>/` como CSV UTF-8, con columnas en snake_case. Los montos van en pesos nominales; la conversión a valores reales se hace en el análisis.
- Cada scraper es idempotente: correrlo dos veces seguidas no duplica nada.
- Ser amable con los servidores: hacer los pedidos en secuencia, con pausas, y nunca en paralelo masivo contra un mismo dominio.

## Código

- Monorepo con Bun workspaces y Turborepo, en TypeScript estricto. Bun ejecuta TS directo, sin build.
- Un scraper por fuente en `packages/scrapers/src/sources/<id>.ts`, que exporta `async function run(args: string[])`. Se corre con `bun run scrape <id>`.
- Dependencias ya disponibles en `@mt/scrapers`: `cheerio` (HTML), `xlsx` (SheetJS, para XLS y XLSX), `unpdf` (texto de PDF), `fflate` (ZIP) y `stream-json` (JSON grandes en streaming).
- CSV con `writeProcessed()` y municipios con `normalizeMunicipio()`, ambos de `@mt/core`.
- Verificar tipos con `bunx tsc --noEmit` dentro del paquete.
- Al terminar una fuente, actualizar su `estado` en `sources.yaml`. Lo hace la sesión principal.
