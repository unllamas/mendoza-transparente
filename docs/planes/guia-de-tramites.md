# Plan: guía de trámites, impuestos y tasas

Objetivo: que cualquier persona pueda saber **qué tiene que hacer, qué papeles necesita y cuánto le va a costar** un trámite ante el Estado en Mendoza (por ejemplo, abrir un comercio en Godoy Cruz), con cada paso atado a la norma o la página oficial de donde sale y a la fecha en que se verificó. Primero como páginas del sitio y después como un asistente que responde preguntas usando esos mismos datos.

Fecha: 26/10/2026, actualizado el 27/10/2026. Estado: el asistente funciona con Godoy Cruz (etapas 2, 4, 5 y 7, proceso en `docs/procesos/asistente.md`) y ya responde en la vista previa de `dev` con la clave de OpenRouter; la etapa 1 sigue en piloto; faltan las páginas (3) y la carpeta en PDF (6).

## Por qué

- Hoy la información está dispersa en tres niveles del Estado (Nación, Provincia y municipio), cada uno con su sitio, y muchas veces no se publica. Abrir un comercio, por ejemplo, pasa por ARCA (CUIT y monotributo), la ATM (Ingresos Brutos) y el municipio (uso de suelo, habilitación y, según el rubro, bromatología y bomberos).
- Las tasas municipales salen en la ordenanza tarifaria de cada año, que casi nadie lee y varios municipios solo publican en el Boletín Oficial. Ponerlas en una tabla permite responder «cuánto cobra mi municipio» y compararlos.
- Encaja con lo que ya hacemos: si un municipio no publica sus requisitos o su tarifaria, va a `data/curado/no-publicado.yaml`.

## Rutas

Las páginas de cada municipio cuelgan de `/municipios/<municipio>`, igual que el presupuesto (`/municipios/<municipio>/presupuesto/<año>`). Así suman al peso que ya tiene la página del municipio en los buscadores y se enlazan solas:

| Ruta | Qué muestra |
|---|---|
| `/municipios/<municipio>/tasas` | Lo que cobra el municipio en el año: derecho de comercio por rubro, tasas de servicios, obras y multas, con la ordenanza y su artículo |
| `/municipios/<municipio>/tramites/<tramite>` | Los pasos de un trámite en ese municipio, con requisitos, costo y ventanilla. Solo existe si el municipio tiene algo propio que decir (sus requisitos, su tasa, su régimen de promoción) |
| `/tramites/<tramite>` | La página de entrada del trámite para toda la provincia: los pasos de Nación y Provincia, que son iguales en todos lados, y la comparación entre municipios (cuánto cuesta y en cuáles se hace en línea) |

Las dos se necesitan: la búsqueda grande («habilitación comercial Mendoza», «ingresos brutos Mendoza») cae en `/tramites/<tramite>` y la chica («tasa de comercio Godoy Cruz 2026») en la del municipio. No se generan 18 páginas iguales cambiando el nombre del municipio: Google las trata como páginas puerta y castiga al sitio entero.

**Antes de diseñar las páginas**, medir el volumen de 10 a 15 búsquedas candidatas con Keyword Planner (gratis con una cuenta de Google Ads) o Google Trends, y mirar quién aparece hoy. Search Console solo muestra búsquedas donde ya aparecemos.

## Etapas

### 1. Impuestos y tasas (fuente `tributos`)

El relevamiento está en `docs/relevamiento-fuentes.md#212-impuestos-provinciales-y-tasas-municipales`: qué tarifaria tiene cada municipio y dónde está.

- **Hecho (piloto, 26/10/2026):** `bun run scrape tributos` baja del Boletín Oficial la norma, el PDF y sus anexos, guarda el texto página por página (`data/processed/tributos/textos/<norma_id>.txt`) y lista las normas en `documentos.csv`. Están:
  - la Ley Impositiva 2026 (Ley 9680, 175 páginas);
  - la tarifaria 2026 de Godoy Cruz (Ordenanza 7497);
  - el código tributario de Godoy Cruz (Ordenanza 7443).
- Del Anexo A de Godoy Cruz sale `rubros_comercio.csv`: el derecho de comercio de 566 rubros en sus 12 categorías.
- **Falta:**
  - Sumar las tarifarias del resto de los municipios. Cada anexo tiene su formato: un lector por municipio, como los buscadores de `municipios-lrf`.
  - Los decretos que actualizan la Unidad Tributaria Municipal, porque varios municipios fijan sus tasas en UTM y no en pesos.
  - Las alícuotas de Ingresos Brutos por actividad de la Ley Impositiva. El texto del Boletín se lee bien (el PDF de la ATM es un escaneo que rompe los códigos); hay que validarlas contra los XLSX de alícuotas de la DNAP.
  - Que la lista de normas salga sola del índice del Boletín (sumarios con «TARIFARIA» o «IMPOSITIVA») en vez de escribirla a mano.
  - Sumar `tributos` a la actualización automática.

### 2. Catálogo de trámites

- Un archivo curado con los trámites (`data/curado/tramites.yaml`, a definir), revisado a mano. Cada trámite lleva:
  - organismo y nivel del Estado;
  - requisitos y documentos;
  - si se hace en línea o presencial, y dónde;
  - costo, con la norma y el artículo que lo fijan;
  - plazo;
  - URL oficial y fecha de la última verificación.
- Los **recorridos** encadenan trámites, por ejemplo «abrir un comercio» = ARCA → ATM → municipio, con variantes según el rubro.
- **Piloto: abrir un comercio minorista en Godoy Cruz.** Relevado el 26/10/2026; el borrador quedó en `tmp/agentes/habilitacion-godoy-cruz.md`, fuera del repo, y pasa al archivo curado cuando se revise.
  - **Nación (ARCA):** CUIT y alta en el monotributo, en línea y gratis.
  - **Provincia (ATM):** el monotributista queda inscripto en Ingresos Brutos solo, por el Monotributo Unificado Mendoza (hasta 72 horas hábiles). El régimen general se tramita en Mis Trámites Online.
  - **Municipio:** la habilitación se inicia en el Centro de Atención Unificada (con turno) o por Ciudadanía Digital, y la firma es presencial. Antes van el uso de suelo (en línea) y la ficha ambiental; según el caso, el sistema contra incendios, la libreta sanitaria y el carnet de manipulación de alimentos. Hay un régimen de promoción para comercios nuevos (Ord. 7240/2022) que descuenta del 25 % al 100 % de las tasas hasta por dos años, según el empleo que se sume.
  - **Costo:** una nota municipal dice que habilitar no cuesta nada desde 2026. La tarifaria 2026 no fija un monto para pedir la habilitación, aunque podría caer en «solicitudes no establecidas» ($2.700, art. 48). Mientras dura el trámite se paga el derecho de comercio como tasa provisoria, un 50 % más cara (art. 20).
  - **Huecos:** ninguna fuente publica plazos. Las fichas oficiales están viejas (la de habilitación es de 2022 y la de incendios de 2018) y se contradicen en la ordenanza que citan. No hay ficha de prefactibilidad comercial ni de cartelería, y la guía de trámites nueva del municipio solo se ve con JavaScript.
- Lo que el organismo no publica va a `no-publicado.yaml`.

### 3. Páginas

- Las rutas de arriba, empezando por `/municipios/godoy-cruz/tasas` y `/tramites/abrir-un-comercio`.
- Cada página se registra en `apps/web/scripts/paginas.ts` con título, descripción y JSON-LD (`GovernmentService` y `FAQPage`). Se aplica la skill `seo-y-geo`.
- Se miden con PostHog y Search Console a las dos semanas.

### 4. Herramientas para agentes

- Funciones comunes en un paquete propio (`packages/agent-tools`, a crear) que leen los datos procesados y curados. Por ejemplo `search_procedures`, `get_procedure`, `get_municipal_fees`, `get_provincial_tax_rate`, más las del plan [Agentes sobre los datos](agentes-sobre-los-datos.md) (`query_source`, `list_unpublished`…).
- Cada resultado lleva fuente, URL oficial, fecha de corte y URL en el sitio. Una fila sin fuente no se devuelve.
- Las mismas funciones se exponen como servidor MCP (lo usan los asistentes de cada persona) y como herramientas del agente propio. No dependen de ningún framework, así que se puede cambiar el arnés sin reescribirlas.

### 5. Asistente propio

- **Arnés (decidido el 27/10/2026):** un ciclo propio y chico en `packages/assistant`, servido por la función de Pages que ya tiene el sitio (`/api/asistente`). Primero se pensó en [eve](https://github.com/vercel/eve), pero eve se despliega en Vercel: sumaba una segunda plataforma con sus propios secretos y su propio cupo. Las dos APIs de modelos aceptan el formato de OpenAI, así que alcanza con `fetch`, sin dependencias nuevas, y las claves quedan como secretos de Cloudflare junto a los demás. Si más adelante hacen falta agentes largos o aprobaciones humanas, las herramientas (funciones puras) se pueden llevar a eve sin reescribirlas.
- **Para que no se vaya por las ramas:**
  - pocas herramientas y acotadas, sin búsqueda libre en la web;
  - instrucciones cortas: citar siempre, decir «no se publica» y no opinar;
  - un tope de pasos por respuesta;
  - evals con preguntas de respuesta conocida y preguntas trampa, corridas antes de cada cambio.
- **Primero pregunta lo que falta** (municipio, rubro, si el local es propio o alquilado) y recién después arma la lista de pasos.
- **Proveedores de modelos:** Vercel AI Gateway y OpenRouter.
  - Los dos se configuran con su clave como secreto. Si el primero falla (error o demora), la consulta pasa al segundo.
  - El orden se cambia sin tocar el código.
- **Modelo configurable por tarea.** Un modelo barato para entender la pregunta y elegir herramientas, y uno mejor solo para redactar la respuesta final si hace falta. El modelo de cada tarea se elige por configuración, sin desplegar de nuevo.
- **Costo:**
  - Los tokens del modelo se pagan en cada consulta, con eve o sin él. Antes de abrirlo hay que fijar un tope de gasto mensual en los dos proveedores.
  - Hace falta Turnstile y un límite por IP.
  - Hay que decir de qué cupo sale el gasto (ver `docs/procesos/arquitectura.md#costo-cero`).
  - Verificar el cupo gratis de cada proveedor antes de decidir.
- El aviso de IA va una sola vez, debajo del campo para escribir: «Aco usa IA con datos oficiales y puede equivocarse. Confirmá en la ventanilla». Cada respuesta muestra sus fuentes a la vista.
- **Opinión sobre cada respuesta.** Debajo de cada respuesta va cuándo se dio y dos pulgares chicos, sin mensaje de agradecimiento.
  - El 👍 hace una animación corta.
  - El 👎 abre una hoja con tres motivos (un dato está mal, no respondió lo que pregunté, falta información o un paso) y una descripción opcional.
  - La descripción es texto libre y puede traer datos personales: no va a PostHog. Se guarda aparte, como los envíos del registro (`docs/procesos/panel.md`), y se revisa antes de usarla.
  - Cada voto es un evento de PostHog. Lleva el motivo, las herramientas que usó el agente y las filas y fuentes que citó, pero **no el texto de la pregunta**: alcanza para encontrar el dato equivocado sin guardar lo que escribió la persona.
  - Si hace falta ver la conversación entera para entender un error, se le pide permiso a la persona en ese momento, con un botón aparte.
  - Los 👎 por «un dato está mal» se revisan como una corrección (`data/curado/correcciones.yaml`). Los demás alimentan las evals: cada caso real que falló se suma como pregunta de prueba.

### 6. Carpeta del trámite en PDF

**Estado (27/10/2026):** la carpeta ya se baja desde la tarjeta de pasos de Aco (`apps/web/src/features/assistant/folder/`). Trae los pasos con su fuente y su fecha, una casilla para tachar cada paso y lo que no se publica. Falta la lista de papeles (hay que sumar un campo `papeles` a `tramites.yaml`), completar el formulario oficial y marcar lo que completó la IA.

Al final de cada recorrido, la persona baja un PDF con lo que tiene que llevar o subir:
- los pasos en orden, cada uno con su fuente y la fecha en que se verificó;
- la lista de papeles para tachar;
- **el formulario oficial completo con sus datos**, cuando el organismo publica uno. Godoy Cruz, por ejemplo, publica el formulario de habilitación en PDF.

Cómo se hace:
- **En el navegador, como la nota de `/pedir`** (`features/request-letter/utils/pdf.ts`, con pdf-lib). Los datos de la persona nunca pasan por un servidor ni se guardan.
- **El formulario oficial se completa, no se rehace.** Se usa el PDF del organismo, archivado con su fecha; si tiene campos, se llenan, y si no, se escribe encima en las posiciones de cada campo. Si el organismo cambia el formulario, el recorrido avisa que hay que revisarlo.
- **No subimos nada por la persona:** las plataformas oficiales (Ciudadanía Digital, Mis Trámites Online de la ATM, ARCA) piden su clave y muchos trámites, su firma en persona. El PDF le ahorra escribir y le dice qué llevar; el envío lo hace ella.
- Lo que el asistente completó con IA se marca, para que la persona lo revise antes de firmar.

### 7. Medición del asistente

Se guarda lo justo para saber si el asistente le sirve a la gente, sin datos personales y dentro de los planes gratis. **No se usa el módulo de análisis de IA de PostHog:** guarda la pregunta y la respuesta enteras, y consume cupo por cada llamada al modelo.

**Tres eventos de la web, nada más** (formato `área.elemento.acción`, cargados en `analytics-catalog.ts`):

| Evento | Cuándo | Propiedades |
|---|---|---|
| `assistant.launcher.open` | Alguien abre el chat | ninguna |
| `assistant.answer.show` | Aco termina una respuesta | `outcome` (`steps`, `unpublished`, `no_answer`), `flow` (`open_business`…), `municipality` |
| `assistant.feedback.vote` | Alguien vota | `vote`, `reason` (la descripción libre no va) |

- Los links a las fuentes y la descarga de la carpeta ya se miden solos con `link.outbound` y `data.download`.
- **Tokens y costo no van a PostHog:** se miran en el tablero de uso de AI Gateway y de OpenRouter, que ya los traen. El tope de gasto mensual se fija ahí.
- **Errores de las herramientas:** van al log de la función. Se revisan cuando sube el `no_answer`.

**Tres preguntas que se responden con eso:**
1. ¿Cuánta gente lo abre y cuántas conversaciones terminan con pasos?
2. ¿Qué recorridos reciben 👎 y por qué motivo?
3. ¿Qué municipios no publican lo que la gente pregunta? Son los `unpublished` por municipio, y se convierten en pedidos de información.

Si una pregunta nueva necesita otro dato, se suma ese evento y se dice en el PR para qué.

## Plan por municipio

Cada municipio se completa en cinco pasos y se da por terminado cuando pasa todos. La tabla se actualiza en cada PR que avanza un municipio, así se ve de un vistazo dónde está cada uno y qué falta probar.

1. **Tarifaria:** la norma vigente en `NORMAS` de `tributos`, su texto bajado y el lector de su anexo, con los montos validados contra el PDF. Si las tasas están en Unidades Tributarias, también el valor vigente de la UT y su decreto.
2. **Recorrido:** `abrir-un-comercio` relevado y cargado en `data/curado/tramites.yaml`, con `verificado` y `no_publica`.
3. **Evals:** al menos dos casos propios en `packages/assistant/evals/cases.ts`: los pasos con un rubro conocido y un dato que el municipio no publica.
4. **Prueba en `dev`:** tres preguntas a mano en la vista previa (pasos, tasa y algo que no se publica). Si una falla, se corrige antes de seguir.
5. **Lo que no se publica:** a `data/curado/no-publicado.yaml`, con dónde se buscó.

**Cómo se trabaja cada tanda:**
- Un subagente por municipio releva en paralelo y deja su informe y un borrador del recorrido en `tmp/agentes/tramites-<municipio>.md`, sin tocar código.
- Con los informes, la sesión principal escribe los lectores de los anexos, carga los recorridos y abre un PR por tanda. Antes de la tanda 1, el lector de cada municipio pasa a un archivo propio (`packages/scrapers/src/sources/tributos/<municipio>.ts`), como los buscadores de `municipios-lrf`, para que varios trabajen sin pisarse.
- Las preguntas que no se pueden cerrar con lo publicado se confirman con el municipio y quedan en la columna «Falta».

**Orden:** primero la población y la tarifaria disponible, porque es donde más gente pregunta y donde se puede dar el costo.

| Tanda | Municipio | Población (2022) | Tarifaria vigente | 1. Tarifaria | 2. Recorrido | 3. Evals | 4. Dev | Falta |
|---|---|---|---|---|---|---|---|---|
| Piloto | Godoy Cruz | 196.010 | Ord. 7497 (2026), Boletín | ✅ lector, 566 rubros | ✅ | ✅ | ⏳ evals con claves | Rentas: si el monto es mensual o anual; siglas COM, IND, SERV y AP |
| 1 | Guaymallén | 321.966 | Ord. 10298 (2026), Boletín | ✅ lector, 578 rubros, UTM de $ 130 | ✅ | ✅ | ⏳ | Si la UTM subió en 2026 (el art. 1 permite hasta 60 %) |
| 1 | Las Heras | 234.401 | Ord. 54/25 (2026), Boletín | ✅ lector, UT de $ 170 | ✅ | ✅ | ⏳ | Decreto de la UT de 2026 (el dato sale del portal de Rentas); el kiosco usa el rubro «Kioscos: municipal o en la vía pública», a confirmar; ficha ambiental y bomberos sin ficha |
| 1 | Maipú | 219.402 | Ord. 7831 (2026), Boletín (su sumario no dice «tarifaria») | ✋ a mano: anexo escaneado, 5 rubros | ✅ | ✅ | ⏳ | Verificar los montos contra la imagen; actualizaciones posteriores al primer cuatrimestre |
| 1 | San Rafael | 215.020 | Ord. 15539 (2026), sitio municipal | ⚠️ sin monto: la fórmula del art. 28 sale cortada | ✅ | ✅ | ⏳ | Fórmula completa y criterio de la categoría; texto de la Ord. 15179 (régimen simplificado) |
| 1 | Luján de Cuyo | 175.056 | Ord. 15095 (2026), Boletín | ✋ a mano: anexo escaneado, 5 rubros, UT de $ 235 | ✅ | ✅ | ⏳ | Qué rubros pagan la categorización ambiental; contradicciones entre la ficha y la tarifaria |
| 1 | Capital | 127.160 | Ord. 4222 (2026), Boletín | ✅ lector, 100 rubros, UTM de $ 130 | ✅ | ✅ | ⏳ | Qué es cada categoría (10 a 40); rubro del kiosco a confirmar; costo de la habilitación; acto que fija la UTM en $ 130 |
| 2 | San Martín | 139.792 | Ord. 3229/2026, Boletín | — | — | — | — | — |
| 2 | Rivadavia | 63.724 | Ord. 5303 (2026), Boletín | — | — | — | — | — |
| 2 | Tunuyán | 60.171 | Ord. 3351 (2026); valores en el anexo del Boletín | — | — | — | — | — |
| 2 | General Alvear | 52.584 | Tarifaria 2026, sitio municipal | — | — | — | — | — |
| 2 | Lavalle | 47.167 | Proyecto 2026 (decreto 4/2026); la 2025 es la Ord. 1252 | — | — | — | — | — |
| 2 | Junín | 46.604 | Ord. 967 (2025); no hay 2026 en el Boletín | — | — | — | — | — |
| 2 | Tupungato | 41.280 | Ord. 11/2026, sitio municipal | — | — | — | — | — |
| 3 | San Carlos | 39.869 | Solo la Ord. 2053/2025, que modifica la 2047/2024 | — | — | — | — | — |
| 3 | Malargüe | 32.717 | Ord. 2268/2024, la última del sitio | — | — | — | — | — |
| 3 | Santa Rosa | 19.382 | Ord. 34/2026, Boletín | — | — | — | — | — |
| 3 | La Paz | 12.086 | No se encontró | — | — | — | — | — |

Referencias: ✅ hecho, ✋ cargado a mano, ⚠️ no se puede con lo publicado, 🔄 en curso, ⏳ pendiente de la prueba en `dev` y de las evals, que ya se pueden correr contra la vista previa (ver «Lo que queda»), — sin empezar. La columna «Tarifaria vigente» sale de `docs/relevamiento-fuentes.md` (2.12).

## Lo que queda (27/10/2026)

### Estado verificado

- **Base D1:** las migraciones `0001` a `0005` están aplicadas en remoto. `assistant_feedback` tiene 2 votos y `assistant_gaps` 5 faltantes: la tasa de Tunuyán, «bar» en Capital, «cerveza artesanal» en Godoy Cruz, «peluquería» en Maipú y el trámite «licencia de conducir».
- **Secretos de Pages (vista previa y producción):** solo `OPENROUTER_API_KEY`. Falta `AI_GATEWAY_API_KEY`, así que no hay respaldo si OpenRouter falla. No está `ASSISTANT_MODEL`, así que se usa Haiku. `TURNSTILE_SECRET` ya existe, porque lo usa el registro.
- **Los secretos no se pueden leer:** Cloudflare los guarda cifrados y solo devuelve los nombres. Por eso las evals pasan a correr contra la vista previa, que usa la clave guardada en Cloudflare, en vez de pedir un `.env.asistente` local.

### Olas

Cada ola es un PR a `dev`. Las tareas de una misma ola tocan archivos distintos y se reparten entre subagentes en paralelo. Lo que toca las instrucciones, las herramientas o el modelo lo hace la sesión principal, porque pide correr las evals.

| Ola | Tarea | Quién | Archivos | Cierra |
|---|---|---|---|---|
| 0 | **Evals contra una URL:** `bun run asistente:evals --url <vista previa>` manda cada caso a `POST /api/asistente`, en secuencia y con una pausa entre caso y caso (el límite es de 10 pedidos cada 10 s). Cada PR tiene su propia vista previa, así que el cambio se evalúa antes de mergearlo. | Principal | `packages/assistant/scripts/run-evals.ts`, `docs/procesos/asistente.md` | Las evals sin `.env` |
| 0 | **Prueba por municipio:** tres preguntas en `dev` para cada uno de los 7 municipios (pasos, tasa y algo que no se publica), con un script que reusa el modo `--url`. | Principal | `packages/assistant/evals/cases.ts`, tabla de arriba | Columnas 3 y 4 |
| 1 | **Widget accesible:** el foco entra al campo al abrir y vuelve al botón al cerrar, `aria-modal` y trampa de foco, la página de atrás queda quieta en el celular y el 429 se distingue del error («Esperá unos segundos»). Se verifica con `bun run verificar`. | Subagente | `apps/web/src/features/assistant/` | Revisión del código |
| 1 | **Instrucciones:** que no remita a «abajo en la pantalla», más un caso de eval que lo controle. | Principal | `packages/assistant/src/instructions.ts`, `evals/cases.ts` | Prueba del 27/10 |
| 1 | **Faltantes reales:** sumar «bar», «cerveza artesanal» y «peluquería» a los rubros curados de esos municipios, si la tarifaria los tiene. | Subagente (`tramites-y-tributos`) | `data/curado/rubros.yaml`, `knowledge.json` | `assistant_gaps` |
| 2 | **Turnstile en el primer mensaje**, invisible, con la verificación del registro llevada a un lugar común. Gratis: Turnstile no tiene cupo. | Principal | `packages/assistant/src/http.ts`, `packages/participation`, el widget | Etapa 5 |
| 2 | **Un modelo por tarea:** `ASSISTANT_MODEL_TOOLS` (el que elige las herramientas) y `ASSISTANT_MODEL_ANSWER` (el que redacta), que caen en `ASSISTANT_MODEL` si no están. Se comparan con evals antes de cambiar. | Principal | `providers.ts`, `agent.ts` | Etapa 5 |
| 2 | **Vista del asistente en el panel:** votos por motivo y recorrido, faltantes agrupados, y la nota del 👎 solo para el equipo. | Subagente (`panel`) | `apps/panel/src/pages/assistant.tsx`, la API del panel | «Hasta que el panel tenga su vista» |
| 3 | **Tanda 2:** un subagente por municipio releva y deja su informe en `tmp/agentes/tramites-<municipio>.md`. Después la principal escribe los lectores y los recorridos. Tunuyán va primero porque ya hay un faltante. | 7 subagentes y la principal | `tributos/<municipio>.ts`, `tramites.yaml` | Tanda 2 |
| 3 | **Carpeta del trámite en PDF (etapa 6):** primero una vista previa para aprobar, después en el navegador con pdf-lib, como `/pedir`. | Principal | `features/assistant/`, `features/request-letter/utils/pdf.ts` | Etapa 6 |
| 3 | **Páginas de trámites (etapa 3):** una vista previa para aprobar y después la página, con su SEO. | Principal | `apps/web/src/pages/`, el registro de páginas | Etapa 3 |

### Lo que hace la persona

- **Cargar `AI_GATEWAY_API_KEY`** (`bun run asistente:claves`) para tener respaldo. Sin ella el asistente funciona igual, pero sin respaldo.
- **Confirmar el tope de gasto mensual** de OpenRouter.
- **Pedir la publicación `dev → main`** cuando quiera abrirlo al público. La producción ya tiene la clave, así que el widget aparece apenas se publica.
- **Elegir el segundo trámite.** El único pedido hasta ahora es «licencia de conducir», y uno solo no alcanza para decidir.

## Preguntas abiertas

- **Godoy Cruz:** el Anexo A no dice si el monto es anual o mensual (el artículo 26 dice que el pago es mensual). Tampoco define las siglas COM, IND, SERV y AP ni la columna final de 0 y 1. Hay que confirmarlo con la Dirección de Rentas o con una boleta real. En el rubro 34010 (envío de dinero), la categoría 10 cuesta más que la 9: probablemente es un error de la ordenanza.
- **Dónde corre el asistente:** eve se despliega en Vercel, una segunda plataforma además de Cloudflare. Hay que confirmar el cupo gratis y cómo se manejan los secretos de los dos lados.
- **Qué trámites siguen** después de abrir un comercio: se eligen con la medición de búsquedas.
- **Tema del widget (decidido el 26/10/2026):** fondo gris de la página, acciones blancas con sombra y los globos de la persona en un gris más oscuro.
