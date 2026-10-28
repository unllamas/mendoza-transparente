# Trámites y tributos

Cómo se cargan los trámites (qué hay que hacer) y las tasas e impuestos (cuánto cuesta) que usa el asistente y, más adelante, las páginas `/tramites` y `/municipios/<municipio>/tasas`. Plan: [Guía de trámites, impuestos y tasas](../planes/guia-de-tramites.md).

## Tasas e impuestos: fuente `tributos`

- **De dónde salen:** del Boletín Oficial, que publica la Ley Impositiva de cada año y las ordenanzas tarifarias y códigos tributarios de los municipios, casi siempre como anexo en PDF. El relevamiento de cada municipio está en `docs/relevamiento-fuentes.md` (2.12).
- **Cómo se corre:** `bun run scrape tributos`. Baja el detalle, el PDF y sus anexos de cada norma de la lista `NORMAS` de `packages/scrapers/src/sources/tributos.ts`. Guarda el texto página por página en `data/processed/tributos/textos/<norma_id>.txt` y lista las normas en `documentos.csv`.
- **Sumar un municipio:**
  1. Agregar su norma a `NORMAS`, con el `norma_id` de `boletin-oficial/normas.csv`.
  2. Escribir el lector de su anexo en `packages/scrapers/src/tributos/readers/<municipio>.ts`, como el de Godoy Cruz: cada municipio tiene su formato. Cada fila dice su `unidad` (pesos, UT o UTM).
  3. Probarlo sin tocar `data/`: `bun run tributos:probar packages/scrapers/src/tributos/readers/<municipio>.ts` (cuántos rubros lee y los montos de almacén, kiosco, ropa, rotisería y carnicería).
  4. Validar los montos contra el PDF y registrarlo en `readers/index.ts`. Varios subagentes pueden escribir lectores en paralelo, uno por archivo; el registro lo hace la sesión principal.
- **Normas que no salen en el Boletín** (General Alvear: la tarifaria está solo en el sitio municipal): la norma lleva un `url` con el PDF del sitio oficial y un `norma_id` propio (`general-alvear-2026`) en lugar del id del Boletín. `bun run scrape tributos` lo baja con `fetchOrReuse` (queda en `data/raw/tributos/`), sin detalle ni anexos del Boletín, y `fecha_boletin` queda vacía en `documentos.csv`. El resto es igual: lector, prueba y registro.
- **Anexos escaneados** (Luján de Cuyo, Maipú): no tienen texto, así que no hay lector. Los montos de los rubros del recorrido se leen a mano de la imagen y se cargan en `tasa_comercio.manual` del catálogo, con la página.
- **Anexos con el texto por columnas** (Rivadavia): el PDF tiene texto, pero sale con los nombres juntos y después los códigos y montos. El lector declara `layout: "rows"` y el scraper arma el texto por filas (`pdfRows` en `packages/scrapers/src/lib/pdf.ts`, junta lo que está a la misma altura).
- **Reglas:**
  - Los montos se copian tal como se publicaron, aunque parezcan un error; el error se avisa en el diccionario.
  - Si el municipio fija las tasas en Unidades Tributarias, hace falta además el decreto que fija su valor.
- **Archivos pesados:** el anexo de la Ley Impositiva 2026 pesa 52 MB comprimido y está en el repo como excepción aprobada (ver `datos-y-archivo.md`). Antes de commitear otro crudo de más de 50 MB, preguntar.

## Trámites: `data/curado/tramites.yaml`

Cada entrada es un **recorrido** (por ejemplo `abrir-un-comercio`) en un municipio, con los pasos de Nación, Provincia y municipio en orden.

1. **Relevar** solo en sitios oficiales y con `bun run crudo`, nunca con `curl`. Anotar la URL de cada paso, sus requisitos, si es en línea o presencial, el costo y el plazo. Lo que el organismo no publica va en `no_publica`, no se completa con suposiciones.
2. **Cargar** el recorrido con `verificado: <fecha>`. Los pasos que dependen del rubro llevan `cuando: alimentos`; el resto, `cuando: siempre` (el asistente no conoce otras condiciones: un paso opcional se aclara en su `detalle`). Los rubros apuntan al código del anexo de la tarifaria, tal como lo devuelve su lector (ver «Rubros de cada municipio», abajo).
3. **La tasa de comercio** va en `tasa_comercio`:
   - `periodo` (`mes`, `bimestre`, `año`, o vacío si la ordenanza no lo dice);
   - `unidad` (`pesos`, `UT`, `UTM`) y, si no es pesos, `valor_unidad` con su fuente en `norma_unidad`;
   - `norma`, `url` y una `nota` con lo que cambia la lectura (quién asigna la categoría, adicionales);
   - `manual`, solo para anexos escaneados: `rubro` (el id del rubro del recorrido), `min`, `max` y `pagina`, en la unidad de la tasa;
   - `disponible: false` cuando lo publicado no alcanza para calcular un monto (San Rafael): el asistente lo dice en vez de inventar.
4. **Regenerar el conocimiento del asistente:** `bun run asistente:datos`.
5. **Revisar el texto** con la skill `contenido-y-metodologia`: neutral, corto, sin adjetivos.
6. **Volver a verificar** cada recorrido al menos una vez por año, cuando sale la tarifaria nueva, y actualizar `verificado`.

**Rubros comunes:** `data/curado/rubros.yaml` es la lista de rubros como los dice la gente. Los cuatro primeros se ven a la vista y el resto se busca en una hoja. Las `palabras` son sinónimos («quiosco», «golosinas» y «maxikiosco» son el kiosco), que el asistente reconoce como palabras enteras: «pan» no está dentro de «pantalones». Después de editarla, `bun run asistente:datos`.

**Rubros de cada municipio (la tasa):** cada recorrido lista en `rubros` los rubros comunes que tienen tasa en su tarifaria, **mapeados a mano**. El asistente no busca por palabras en el anexo, porque mezcla cosas sin relación («veterinaria» encontraba un sex shop). Cada rubro lleva:
- `codigo` y `nombre_ordenanza`, tal cual figuran en el anexo. Hace falta el nombre porque algunos anexos repiten un código para actividades distintas (Guaymallén tiene unos 78).
- `variantes`, opcional: otras actividades del mismo anexo que puede ser alguien con ese rubro y que pagan distinto (kiosco: QUIOSCO INTERIOR, MAXI KIOSCO y QUIOSCOS VIA PUBLICA). El asistente las muestra por separado, cada una con su monto, y no elige por la persona.
- `nombre` y `alimentos` solo si cambian respecto de `rubros.yaml`.

El criterio: el código que corresponde a un comercio minorista con local propio, no mayorista, fábrica, venta a consignación ni puesto en la vía pública, salvo que el rubro sea eso. Si el anexo no tiene nada razonable, el rubro no se carga: vale más un «todavía no lo tenemos» que un monto de otra actividad. Lo que la gente pide y no está queda en la tabla `assistant_gaps` (ver [Asistente](asistente.md#faltantes)), y de ahí sale qué sumar. En los anexos escaneados, solo hay tasa para los rubros de `tasa_comercio.manual`, que lleva el `ejercicio` de los montos.

Hoy está relevado `abrir-un-comercio` en Godoy Cruz y en los trece municipios de las tandas 1 y 2 (estado en `docs/planes/guia-de-tramites.md#plan-por-municipio`). Para otro municipio, el asistente da solo los pasos de Nación y Provincia y avisa que falta relevar los municipales.

## Páginas

Las páginas salen de los mismos archivos que usa el asistente (`data/curado/tramites.yaml`, `data/curado/rubros.yaml` y `data/processed/tributos/`); nada se escribe a mano en la web. El build (`apps/web/scripts/temas/procedures.ts`, llamado desde `build-data.ts`) genera los JSON de `public/data/temas/` y `scripts/paginas.ts` registra cada ruta con su título, descripción, JSON-LD (`GovernmentService`, `BreadcrumbList` y `FAQPage`) y HTML prerenderizado.

| Ruta | Qué muestra | Cuándo existe |
|---|---|---|
| `/tramites/abrir-un-comercio` | Los pasos de Nación y Provincia (iguales en todos lados), lo que no publican y la comparación entre municipios: pasos propios, si se inicia en línea, si tenemos la tasa de comercio y desde cuándo | Siempre |
| `/municipios/<slug>/tramites/abrir-un-comercio` | Pasos, costos, régimen de promoción y «lo que el municipio no publica» | Todo municipio con recorrido en `tramites.yaml` |
| `/municipios/<slug>/tasas` | Derecho de comercio por rubro (buscador, categorías en una hoja), período, unidad y valor, y la ordenanza con su link | Solo si el anexo de la tarifaria está leído en `rubros_comercio.csv` (hoy Godoy Cruz, Capital, Las Heras, Guaymallén, General Alvear y Rivadavia) |

**Regla de páginas puerta:** una página de municipio se genera solo si tiene algo propio que decir. Los municipios con pocos rubros cargados a mano (Luján de Cuyo, Maipú, San Martín, Tunuyán, Lavalle, Junín y Tupungato) y San Rafael (la fórmula publicada no permite dar un monto) no tienen `/tasas`: sus montos, o el aviso de que no se pueden calcular, van en su página de trámite. Nunca se generan páginas iguales cambiando el nombre.

**Reglas de contenido**
- Cada paso lleva su fuente oficial y la fecha de `verificado` de su recorrido. Los pasos de Nación y Provincia llevan la fecha más reciente entre los recorridos.
- Lo que el organismo no publica sale de `no_publica` y se dice «<organismo> no publica …». Lo de la ATM va en la guía de la provincia; lo del municipio, en su página.
- Los montos en UT o UTM se muestran en pesos con el `valor_unidad` del recorrido y, al lado, en la unidad de la ordenanza. Si el período está vacío, la página dice que la ordenanza no aclara si el monto es mensual o anual.
- «Se inicia en línea» se deduce del texto del paso de habilitación (`en línea`, `Ciudadanía Digital`, `digital`; `presencial`, `en persona`, `con turno`) y de un `no_publica` que mencione «línea». Cuando el texto no dice nada, la página lo dice así («La ficha no dice cómo se inicia»). Si el dato se vuelve importante, conviene un campo propio en el recorrido.

**Para sumar un municipio:** cargar el recorrido (ver arriba) y, si su anexo se puede leer, la tarifaria en `tributos`. Con `bun run dev` o el build las páginas aparecen solas, enlazadas desde la página del municipio y desde la guía.

**Analítica:** `municipality.procedure.open`, `municipality.fees.open`, `procedure.municipality.open` y `procedure.fees.open` (clics en las tarjetas) y la hoja de cada rubro (`sheet.open` con `municipality.fees.item`). Los links a las fuentes oficiales se miden solos (`link.outbound`). Medir con PostHog y Search Console a las dos semanas de publicar.
