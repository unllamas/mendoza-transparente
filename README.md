# Mendoza Transparente

Datos públicos de la provincia de Mendoza y sus 18 municipios, recopilados, normalizados y explicados para la ciudadanía.

El Estado provincial publica mucha información: presupuesto, deuda, compras, Boletín Oficial, declaraciones juradas, coparticipación. Pero está dispersa en decenas de sitios, muchas veces en PDF, desactualizada o difícil de comparar. Este proyecto la junta, la guarda, la ordena y la muestra de forma clara, con la fuente original siempre a mano.

## Principios

- **Cada número tiene fuente.** Todo dato publicado enlaza al archivo original del que sale, con la fecha en que se descargó.
- **Nada se pierde.** Los archivos originales se archivan tal cual se descargaron, aunque el organismo después los borre o los modifique.
- **La misma vara para todos.** Se usa la misma metodología para todas las gestiones y partidos.
- **Señales, no acusaciones.** Las anomalías se presentan como preguntas que merecen explicación, no como conclusiones.
- **Abierto.** El código y los datos son públicos.

## Estructura

```
docs/                 relevamiento de fuentes y documentación
sources.yaml          catálogo de fuentes (id, organismo, url, formato, estado)
mt/                   librería común (descarga, archivado, utilidades)
scrapers/<id>.py      un recolector por fuente
data/raw/<id>/        archivos originales, por fecha de descarga, más un manifest.jsonl
data/processed/<id>/  datos normalizados (CSV) listos para analizar
analysis/             análisis y cruces entre fuentes
```

## Uso

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python -m scrapers.<id>
```

## Licencia

Código: MIT. Datos procesados: CC BY 4.0. Los datos originales pertenecen a sus organismos de origen.
