# Datos y archivo

Todo lo que el sitio muestra sale de `data/`. Estas reglas garantizan que cada número se pueda rastrear hasta su fuente.

## `data/raw/<fuente>/`: el archivo crudo

- Los archivos originales, **tal cual se descargaron**, en `data/raw/<fuente>/<AAAA-MM-DD>/`.
- `manifest.jsonl` registra cada descarga: archivo, URL, fecha, sha256, tamaño y si está comprimido.
- **Solo se agrega, nunca se edita ni se borra.** Si el contenido no cambió, no se guarda de nuevo. Si el mismo día se descarga una versión distinta, la nueva va con la hora en el nombre (`archivo.HHMMSS.html`): no pisa a la anterior.
- **Qué cuenta como cambio.** En archivos de datos (CSV, XLSX, PDF, JSON), cualquier byte distinto (sha256). En páginas HTML, solo lo que ve una persona: el texto visible, los links y las imágenes (`huella()` en `packages/core/src/fetch.ts`). Así no se guardan copias idénticas por tokens de seguridad, nonces, identificadores de rastreo, horas de caché o código antibots que cambian en cada visita. Si aparece un caso nuevo de este tipo (un link con la fecha del día, por ejemplo), se suma a `VOLATILES_EN_LINKS`. Para comprobarlo: correr el scraper dos veces seguidas; la segunda no debería agregar archivos.
- Los archivos de más de 1 MB se guardan con gzip. GitHub rechaza archivos de más de 100 MB: si algo supera unos 50 MB comprimido, no va al repo (se procesa desde `/tmp` y se archiva un extracto con la URL y el sha256 del original; ver el scraper `proveedores`).
- Excepción por privacidad: en Ética Pública se archiva el JSON **ya redactado** (sin DNI ni otros datos personales).

Esto permite que la web enlace a la «copia archivada» de cada fuente y que nada se pierda aunque el organismo borre o cambie un archivo.

## `data/processed/<fuente>/`: los datos normalizados

- CSV UTF-8, columnas en snake_case, una fila por observación.
- Montos en pesos **nominales**, con su escala real (pesos, no miles ni millones, salvo que la columna lo diga).
- Junto a cada CSV, su diccionario `<archivo>.meta.json` (formato en [`docs/diccionario-de-datos.md`](../diccionario-de-datos.md)).
- Se regeneran completos en cada corrida del scraper.

## Contenido curado

`data/curado/` tiene información editorial, revisada a mano:

| Archivo | Para qué |
|---|---|
| `no-publicado.yaml` | Datos que el Estado debería publicar y no publica, con organismo responsable, marco legal, dónde se buscó y el texto del pedido por Ley 9070. Tiene lugar para registrar los pedidos presentados y sus respuestas. Cada entrada lleva una `categoria` (personal, estructura, presupuesto, etc., definidas en `apps/web/src/no-publicado-categories.ts`); el build falla si falta o no existe. **Regla:** todo dato que se busca y no se encuentra publicado se registra acá, en el mismo commit en que se descubre. |
| `transparencia-municipal.yaml` | Qué publica cada municipio de las 9 cosas que le piden las leyes: estado, período del último dato, formato, link y dónde se buscó, con la fecha de verificación. El build falla si a un municipio le falta alguna de las 9. Criterios en [metodología](metodologia.md#transparencia-municipal). |
| `correcciones.yaml` | Correcciones a funcionarios cuando dos fuentes oficiales no coinciden (por ejemplo, el intendente que figura en el acta de proclamación y el que informa hoy el municipio). Cada corrección explica la diferencia, cita la fuente y lleva fecha de revisión. |

Reglas para editarlos: citar siempre la fuente oficial, no inferir lo que no está publicado y anotar la fecha de revisión.

## Catálogo: `sources.yaml`

Una entrada por fuente. La web lo usa para `/fuentes`, para la línea «Fuente: … · Ver en el sitio oficial · Copia archivada» y para el SEO de las páginas de datos.

## Tamaño del repo

El archivo crudo vive en git mientras sea manejable. El que más crece es el Boletín Oficial (unos 130 MB por año). Cuando el repo se vuelva pesado, se migra a una base de datos y a un almacenamiento de archivos; mientras tanto, git da historial y auditoría gratis.
