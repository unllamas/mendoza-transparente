# Plan: guía de trámites, impuestos y tasas

Objetivo: que cualquier persona pueda saber **qué tiene que hacer, qué papeles necesita y cuánto le va a costar** un trámite ante el Estado en Mendoza (por ejemplo, abrir un comercio en Godoy Cruz), con cada paso atado a la norma o la página oficial de donde sale y a la fecha en que se verificó. Primero como páginas del sitio y después como un asistente que responde preguntas usando esos mismos datos.

Fecha: 26/10/2026. Estado: etapa 1 en piloto (Godoy Cruz y Ley Impositiva 2026).

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

- **Arnés:** [eve](https://github.com/vercel/eve) de Vercel, de código abierto. Cada herramienta es un archivo y trae evals, subagentes y aprobaciones humanas. Las herramientas son las de la etapa 4, importadas desde el paquete.
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
- **Opinión sobre cada respuesta.** Debajo de cada respuesta va cuándo se dio y dos botones, 👍 y 👎. El 👎 pregunta qué estuvo mal: un dato está mal, no respondió lo que pregunté, un link no anda o falta un paso.
  - Cada voto es un evento de PostHog. Lleva el motivo, las herramientas que usó el agente y las filas y fuentes que citó, pero **no el texto de la pregunta**: alcanza para encontrar el dato equivocado sin guardar lo que escribió la persona.
  - Si hace falta ver la conversación entera para entender un error, se le pide permiso a la persona en ese momento, con un botón aparte.
  - Los 👎 por «un dato está mal» se revisan como una corrección (`data/curado/correcciones.yaml`). Los demás alimentan las evals: cada caso real que falló se suma como pregunta de prueba.

### 6. Carpeta del trámite en PDF

Al final de cada recorrido, la persona baja un PDF con lo que tiene que llevar o subir:
- los pasos en orden, cada uno con su fuente y la fecha en que se verificó;
- la lista de papeles para tachar;
- **el formulario oficial completo con sus datos**, cuando el organismo publica uno. Godoy Cruz, por ejemplo, publica el formulario de habilitación en PDF.

Cómo se hace:
- **En el navegador, como la nota de `/pedir`** (`features/request-letter/utils/pdf.ts`, con pdf-lib). Los datos de la persona nunca pasan por un servidor ni se guardan.
- **El formulario oficial se completa, no se rehace.** Se usa el PDF del organismo, archivado con su fecha; si tiene campos, se llenan, y si no, se escribe encima en las posiciones de cada campo. Si el organismo cambia el formulario, el recorrido avisa que hay que revisarlo.
- **No subimos nada por la persona:** las plataformas oficiales (Ciudadanía Digital, Mis Trámites Online de la ATM, ARCA) piden su clave y muchos trámites, su firma en persona. El PDF le ahorra escribir y le dice qué llevar; el envío lo hace ella.
- Lo que el asistente completó con IA se marca, para que la persona lo revise antes de firmar.

## Preguntas abiertas

- **El anexo de la Ley Impositiva pesa 50 MB comprimido**, cinco veces más que el crudo más grande del repo. Hay tres opciones:
  - commitearlo igual;
  - dejarlo solo en archive.org;
  - archivar solo el texto extraído.

  Por ahora no está commiteado.
- **Godoy Cruz:** el Anexo A no dice si el monto es anual o mensual (el artículo 26 dice que el pago es mensual). Tampoco define las siglas COM, IND, SERV y AP ni la columna final de 0 y 1. Hay que confirmarlo con la Dirección de Rentas o con una boleta real. En el rubro 34010 (envío de dinero), la categoría 10 cuesta más que la 9: probablemente es un error de la ordenanza.
- **Dónde corre el asistente:** eve se despliega en Vercel, una segunda plataforma además de Cloudflare. Hay que confirmar el cupo gratis y cómo se manejan los secretos de los dos lados.
- **Qué trámites siguen** después de abrir un comercio: se eligen con la medición de búsquedas.
- **La mascota del asistente:** un cóndor andino en la vista previa del 26/10/2026, con «Aco» (por el Aconcagua) como nombre de trabajo. Faltan el nombre definitivo y una ilustración hecha por alguien que dibuje. El encabezado del panel muestra la cordillera en celestes planos, sin gradientes, para seguir las reglas de diseño.
