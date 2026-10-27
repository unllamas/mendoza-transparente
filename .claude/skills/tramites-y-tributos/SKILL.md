---
name: tramites-y-tributos
description: Cómo se cargan los trámites (data/curado/tramites.yaml) y las tasas e impuestos (fuente tributos: Ley Impositiva y ordenanzas tarifarias del Boletín Oficial) que usan el asistente y las páginas de trámites. Cargar al relevar un trámite o un municipio, al sumar una tarifaria o al tocar packages/scrapers/src/sources/tributos.ts.
---

# Trámites y tributos

Fuente completa: `docs/procesos/tramites-y-tributos.md`. Cargar también `datos-y-fuentes` y `contenido-y-metodologia`.

## Tasas (fuente `tributos`)

1. Buscar la norma en `data/processed/boletin-oficial/normas.csv` (sumario con «TARIFARIA» o «IMPOSITIVA») y sumarla a `NORMAS`.
2. `bun run scrape tributos`: baja el PDF con sus anexos y deja el texto en `data/processed/tributos/textos/`.
3. Escribir el lector de su anexo en `ACTIVITY_TABLES`, uno por municipio. Validar contra el PDF y copiar los montos tal como se publicaron.
4. Crudos de más de 50 MB: avisar antes de commitear.

## Trámites (`data/curado/tramites.yaml`)

1. Relevar solo sitios oficiales, con `bun run crudo`. Cada paso lleva su URL; lo que no se publica va a `no_publica`.
2. Cargar el recorrido con `verificado: <fecha>` y los pasos condicionales con `cuando`.
3. `bun run asistente:datos` para que lo vea el asistente.
4. Volver a verificar una vez por año, con la tarifaria nueva.

Varios municipios en paralelo: un subagente por municipio (skill `delegar-en-agentes`), cada uno con su lector y su relevamiento en `tmp/agentes/`.
