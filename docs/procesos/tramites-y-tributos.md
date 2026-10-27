# Trámites y tributos

Cómo se cargan los trámites (qué hay que hacer) y las tasas e impuestos (cuánto cuesta) que usa el asistente y, más adelante, las páginas `/tramites` y `/municipios/<municipio>/tasas`. Plan: [Guía de trámites, impuestos y tasas](../planes/guia-de-tramites.md).

## Tasas e impuestos: fuente `tributos`

- **De dónde salen:** del Boletín Oficial, que publica la Ley Impositiva de cada año y las ordenanzas tarifarias y códigos tributarios de los municipios, casi siempre como anexo en PDF. El relevamiento de cada municipio está en `docs/relevamiento-fuentes.md` (2.12).
- **Cómo se corre:** `bun run scrape tributos`. Baja el detalle, el PDF y sus anexos de cada norma de la lista `NORMAS` de `packages/scrapers/src/sources/tributos.ts`. Guarda el texto página por página en `data/processed/tributos/textos/<norma_id>.txt` y lista las normas en `documentos.csv`.
- **Sumar un municipio:**
  1. Agregar su norma a `NORMAS`, con el `norma_id` de `boletin-oficial/normas.csv`.
  2. Escribir el lector de su anexo en `ACTIVITY_TABLES`, como el de Godoy Cruz: cada municipio tiene su formato.
  3. Validar los montos contra el PDF.
- **Reglas:**
  - Los montos se copian tal como se publicaron, aunque parezcan un error; el error se avisa en el diccionario.
  - Si el municipio fija las tasas en Unidades Tributarias, hace falta además el decreto que fija su valor.
- **Archivos pesados:** el anexo de la Ley Impositiva 2026 pesa 52 MB comprimido y está en el repo como excepción aprobada (ver `datos-y-archivo.md`). Antes de commitear otro crudo de más de 50 MB, preguntar.

## Trámites: `data/curado/tramites.yaml`

Cada entrada es un **recorrido** (por ejemplo `abrir-un-comercio`) en un municipio, con los pasos de Nación, Provincia y municipio en orden.

1. **Relevar** solo en sitios oficiales y con `bun run crudo`, nunca con `curl`. Anotar la URL de cada paso, sus requisitos, si es en línea o presencial, el costo y el plazo. Lo que el organismo no publica va en `no_publica`, no se completa con suposiciones.
2. **Cargar** el recorrido con `verificado: <fecha>`. Los pasos que dependen del rubro llevan `cuando: alimentos` (o la condición que corresponda). Los rubros apuntan al código del anexo de la tarifaria.
3. **Regenerar el conocimiento del asistente:** `bun run asistente:datos`.
4. **Revisar el texto** con la skill `contenido-y-metodologia`: neutral, corto, sin adjetivos.
5. **Volver a verificar** cada recorrido al menos una vez por año, cuando sale la tarifaria nueva, y actualizar `verificado`.

Hoy está relevado `abrir-un-comercio` en Godoy Cruz. Para otro municipio, el asistente da solo los pasos de Nación y Provincia y avisa que falta relevar los municipales.
