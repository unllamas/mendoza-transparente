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

## Copias fuera del repo: archive.org

El archivo crudo no puede depender de un solo lugar: si el organismo borra un documento, queda nuestra copia, pero si se cae el repositorio, se pierde todo junto. Por eso cada archivo queda en tres lugares, y los tres links se guardan:

| Qué | Dónde queda el link |
|---|---|
| El documento oficial | `url` en `manifest.jsonl` |
| Nuestra copia (el respaldo) | `path` en `manifest.jsonl`, en este repo |
| La copia en archive.org | `archive_url` en `data/raw/<fuente>/archive-org.jsonl` |

`archive-org.jsonl` es de solo agregar, como el manifest. Cada línea es una copia (`kind`):

- **`item`: nuestro archivo crudo**, tal cual está en el repo (con gzip si pesa más de 1 MB), en un ítem de archive.org por fuente y por mes de descarga: `mendoza-transparente-<fuente>-<AAAA-MM>`. Cada ítem lleva además el `manifest.jsonl` completo, así que se entiende sin el repo: de qué URL salió cada archivo, cuándo y su sha256. Sirve para todo, también para lo que no tiene una URL que se pueda abrir (los índices del Boletín Oficial) y para lo que el organismo ya borró.
- **`wayback`: una captura del documento en su URL oficial**, hecha por la Wayback Machine. Es la prueba más fuerte: un tercero independiente certifica que en esa fecha el Estado publicaba eso en ese sitio. Se captura solo la última versión de cada URL; si el documento cambia (otro sha256), se vuelve a capturar. Si archive.org ya tiene una captura de los últimos 30 días, devuelve esa. Si falla, se reintenta a los 30 días (queda la línea con `archive_url: null` y el `error`).

**Datos personales.** Lo que va al ítem ya está limpio por las reglas de arriba (Ética Pública redactada, nunca los anexos 22 y 23). Pero la Wayback Machine guarda el **original**, no nuestra versión limpia, así que las fuentes cuyos originales traen datos personales no se capturan nunca: Ética Pública (DNI), `municipios-lrf` (algunas planillas traen los anexos de deudores con nombre) y `proveedores` (el registro completo trae personas). La lista está en `WAYBACK_EXCLUDED` (`packages/scrapers/src/archive-org.ts`). **Al sumar una fuente cuyo original trae datos personales, se agrega ahí en el mismo commit.** Lo que se sube a archive.org es, en la práctica, irreversible: se puede pedir que lo oculten, pero ya pudo haberse copiado.

**Cómo corre.** El job `archivo-externo` de `.github/workflows/actualizar-datos.yml`, después de cada actualización, con los secretos `IA_ACCESS_KEY` e `IA_SECRET_KEY` (las claves S3 de la cuenta de archive.org, en https://archive.org/account/s3.php). Sin los secretos se saltea. A mano: `bun run archivar`, con las mismas variables en el entorno.

Para cargar o cambiar las claves: se pegan en `.env.archive-org`, en la raíz de la copia de trabajo (no se commitea), y se suben como secretos con `gh secret set -f .env.archive-org`. A mano: `bun --env-file=.env.archive-org run archivar`.

```bash
bun run archivar                      # todas las fuentes
bun run archivar boletin-oficial      # una fuente
bun run archivar --solo-items         # solo subir nuestras copias
bun run archivar --solo-wayback       # solo pedir capturas
bun run archivar --max-capturas=300 --max-minutos=150   # topes por corrida (son los valores por defecto)
```

- **Idempotente y retomable:** cada copia se anota apenas se hace, así que una corrida cortada por el tope de tiempo sigue donde quedó. La primera vez hay unos 8.000 archivos y unas 1.100 URLs para capturar: lleva varias corridas.
- **Amable con archive.org:** la Wayback Machine acepta 7 capturas por minuto por cuenta; se hacen de a una, con 9 segundos de pausa. Si avisa que se llegó al límite del día, se sigue en la próxima corrida.
- **En la web:** si una fuente ya tiene copias, `FuentesOficiales` y la hoja de cada dato muestran «Copia en archive.org», que abre la lista de sus ítems (`archiveOrg` en el índice, armado en `build-data.ts`).

### El repo entero, fuera de GitHub

Además de los archivos, el repositorio completo (código, datos e historial) tiene que vivir en otro lado. Se configura una vez, a mano:

- **Software Heritage** (https://archive.softwareheritage.org/save/): guarda repositorios públicos para siempre. Se pide guardar `https://github.com/unllamas/mendoza-transparente` y después se repite solo.
- **Un espejo** en Codeberg o GitLab que se actualice con cada push (la función de «mirror» de cualquiera de los dos).

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

Una entrada por fuente. La web lo usa para `/fuentes`, para la sección «Fuentes» del final de cada página (organismo · Sitio oficial · Copia del <fecha>) y para el SEO de las páginas de datos.

## Tamaño del repo

El archivo crudo vive en git mientras sea manejable (y su copia, en archive.org). El que más crece es el Boletín Oficial (unos 130 MB por año). Cuando el repo se vuelva pesado, se migra a una base de datos y a un almacenamiento de archivos; mientras tanto, git da historial y auditoría gratis.
