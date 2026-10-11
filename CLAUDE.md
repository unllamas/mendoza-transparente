# Mendoza Transparente: guía para agentes

Proyecto cívico: recopilar los datos públicos de Mendoza, normalizarlos y publicarlos curados de cara a las elecciones de 2027. Ver `README.md` y `docs/relevamiento-fuentes.md`.

## Orquestación

- La sesión principal orquesta. Las tareas acotadas (un scraper, un parser, una verificación) van a subagentes en Sonnet, en paralelo y sobre archivos distintos.
- Cada subagente trabaja solo en los archivos de su fuente: `scrapers/<id>.py` y `data/*/<id>/`. Si necesita tocar `mt/`, lo propone en vez de editarlo.
- Los subagentes no commitean. La sesión principal revisa y commitea.

## Convenciones de datos

- Descargar siempre con `mt.fetch.fetch()` o `mt.fetch.archive()`: manda el User-Agent de navegador (sin él, los sitios del gobierno devuelven 403), archiva en `data/raw/<id>/<YYYY-MM-DD>/` y registra cada descarga en `manifest.jsonl` con su sha256.
- `data/raw/` es de solo agregar: nunca editar ni borrar un archivo crudo.
- Los archivos de más de 1 MB se guardan con gzip. GitHub rechaza archivos de más de 100 MB: si algo supera unos 50 MB comprimido, avisar antes de commitear.
- Los datos normalizados van en `data/processed/<id>/` como CSV UTF-8, con columnas en snake_case. Los montos van en pesos nominales; la conversión a valores reales se hace en el análisis.
- Cada scraper es idempotente: correrlo dos veces seguidas no duplica nada.
- Ser amable con los servidores: hacer los pedidos en secuencia, con pausas, y nunca en paralelo masivo contra un mismo dominio.

## Código

- Python 3.11 o más nuevo. Dependencias en `pyproject.toml`.
- Un scraper por fuente en `scrapers/<id>.py`, ejecutable con `python -m scrapers.<id>`.
- Al terminar una fuente, actualizar su `estado` en `sources.yaml`.
