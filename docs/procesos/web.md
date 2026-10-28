# La web

`apps/web`: sitio estático con Vite, React y TanStack Router (rutas por código en `src/main.tsx`). Se publica en Cloudflare Pages.

## Cómo llegan los datos a la web

`apps/web/scripts/build-data.ts` (`bun run data`) corre antes de cada build y en desarrollo:

1. Lee `sources.yaml`, los `manifest.jsonl` y los CSV de `data/processed/`.
2. Escribe en `apps/web/public/data/`:
   - `index.json`: catálogo de fuentes y tablas (más de 100 KB: solo lo usan `/fuentes` y `/datos`).
   - `fuentes.json`: solo las fuentes, la fecha de los datos y dos totales (unos 4 KB comprimido). Lo usan el footer, la portada y cada sección «Fuentes».
   - Por tabla: el CSV completo (para descargar) y una vista previa de las filas más recientes (o una por grupo si la tabla se agrupa).
   - `temas/*.json`: los agregados de cada página temática, calculados por los scripts de `scripts/temas/` (deuda, coparticipación, empleo, población, funcionarios, señales, compras, portada).
   - `fotos/`: miniaturas de funcionarios.
3. `public/data/` no se versiona: se genera siempre.

En desarrollo (`bun run dev`), el plugin de `vite.config.ts` regenera todo y recarga el navegador cuando cambia algo en `data/processed`, `data/curado`, `sources.yaml` o los scripts.

## La portada como guía

La portada está pensada para quien llega sin saber por dónde empezar. Los componentes están en `src/components/home-guide.tsx` y los datos en `temas/guia.json` y `data/search.json` (`scripts/temas/guide.ts`):

0. **Hero:** ocupa toda la primera pantalla, en el celular y en escritorio, de borde a borde y debajo del header.
   - **Header:** en la portada, mientras la página está arriba de todo, el header no tiene fondo ni borde; al bajar vuelve a ser el de siempre (`useAtTop` en `layout.tsx`). El layout no le pone márgenes a la portada: la página arma su propio ancho después del hero.
   - **Qué tiene:** el título; el buscador y «Elegí tu departamento», uno al lado del otro y con el mismo peso; y tres preguntas como accesos («O empezá por una pregunta»). La cordillera en puntos va de fondo, abajo y detrás del contenido; el contenido se centra en toda la pantalla, entre el header y el borde de abajo.
   - **Por qué así:** en octubre de 2026, el buscador y el departamento los usaba un 6 % de las visitas cada uno (el departamento, más en el celular) y las preguntas un 15 %. Como el hero tapa la lista de preguntas en el celular, tres de ellas van adentro.
   - **Medición:** gráfico «Portada: uso del hero» del tablero de PostHog. `home.question.open` lleva `place` (`hero` o `list`) y `search.select` lleva `source` (`home` es el buscador del hero).
1. **Buscador avanzado** (`src/components/search-dialog.tsx`):
   - **Formato:** un panel por encima de todo. En el celular ocupa la pantalla completa; en escritorio es un panel centrado.
   - **Cómo se abre:** desde el campo de la portada, desde la lupa del header (en todas las páginas) o con `/` y Ctrl/⌘+K.
   - **Qué busca:** todas las páginas y también los proveedores sin página propia.
   - **Resultados:**
     - Agrupados por tipo, con tres por grupo, y un filtro por tipo que muestra todos los de ese tipo.
     - Cada resultado ocupa dos líneas: el nombre y lo que importa de ese tipo, sin repetir el nombre. Por ejemplo: cargo, partido y mandato; monto y procesos; o intendente y habitantes.
     - Los funcionarios llevan su foto.
   - **Coincidencias:** encuentra "9735" y "9.735", "ecoclean" y "ECO CLEAN", y las palabras pueden ir en cualquier orden.
   - **Antes de escribir:** muestra ejemplos para probar y accesos directos.
   - **Índice:** `data/search.json`, con nombre (`t`), línea de detalle (`s`), tipo (`k`), foto (`i`) y texto oculto para buscar (`q`: partido, CUIT, descripción). Se descarga la primera vez que se abre el buscador.
   - **Medición:** las búsquedas sin resultados se registran (`search.no_results`); son la lista de lo que falta.
   - **Selector:** al lado del campo de la portada está «Elegí tu departamento», que lleva a la página del departamento.
2. **Empezá por una pregunta:** seis preguntas frecuentes, cada una con un dato real y un link a la respuesta.
   - Para la pregunta del personal, el dato se elige entre los organismos que no cambiaron de estructura, para que la comparación sea justa.
3. **Lo nuevo:** leyes recién publicadas, designaciones del Boletín y las últimas cifras de deuda y personal. Cada ítem va fechado por el dato, no por la descarga.
4. **Todo lo que hay:** el mapa de secciones en cuatro preguntas (quién gobierna, en qué se gasta, qué se decide y qué falta), con la cantidad de páginas de cada una.
5. **Cómo leer estos datos:** cuatro reglas en la portada y la guía completa con glosario en `/como-leer`. El glosario vive en `src/glossary.ts` y también se publica como preguntas frecuentes para los buscadores.

Al sumar una sección, conviene ubicarla en el mapa (`EcosystemMap`) y, si responde una pregunta frecuente, en `StartingQuestions`.

## Todo se puede compartir: el estado va en la URL

Cualquier vista se puede pasar por link tal como está: la pestaña de una página, una búsqueda, el departamento elegido en un mapa y la hoja abierta.

| Página | Parámetros |
|---|---|
| Municipios | `?ver=coparticipacion` o `?ver=personal` |
| Empleo público | `?periodo=8` o `?periodo=todo` |
| Población | `?medida=crecimiento`, `?departamento=<slug>` |
| Coparticipación | `?departamento=<slug>` |
| Funcionarios | `?grupo=legislatura`, `?q=<búsqueda>` |
| Leyes, proveedores, organismos | `?q=<búsqueda>` |
| Lo que no se publica | `?tema=<id>`, `?dato=<id>` (los links viejos con `#id` siguen andando) |
| Participar | `?tipo=error` |
| Registro | `?ver=correcciones`, `?codigo=<P-… o R-…>` |
| Datos | `?<tabla>=<grupo>` (por ejemplo, `?personal=2025`) |
| Señales y compras | `?senal=`, `?proceso=`, `?proveedor=` (ver abajo) |

- **Cómo se hace:** con `useUrlOption` (opciones fijas) y `useUrlText` (texto o un id), de `src/url-state.ts`. Para cambiar varios parámetros juntos, `useSetUrlParams`. Nunca con `useState` para algo que alguien querría compartir.
- **Cómo se comporta:** cambiar una pestaña reemplaza la entrada del historial (no suma pasos al botón "atrás"), no mueve el scroll y conserva los demás parámetros. El valor por defecto no se escribe.
- **El router no vuelve a pedir los datos** cuando cambian los parámetros (`defaultStaleTime: Infinity`): los datos solo cambian con cada publicación.
- **Links internos:** a una hoja, con `search` (`<Link to="/no-publicado" search={{ dato: id }}>`), nunca con `hash`.
- **Buscador:** también encuentra las señales (`/senales?senal=…`) y los datos que no se publican (`/no-publicado?dato=…`).

## Botón «Compartir»

Cada página con encabezado (`PageHeader`) lleva el botón **Compartir** en una columna a la derecha del encabezado, alineado con la primera línea: solo el ícono, con un tooltip que dice «Compartir» al pasar el mouse o llegar con el teclado (`src/components/share-button.tsx`). Arma la publicación sola, para que nadie tenga que escribirla:

- **Texto:** la descripción de la página (la misma que muestran buscadores y vistas previas; en las páginas de detalle ya trae sus cifras principales) seguida de `#MendozaTransparente`. Se recorta en una palabra para que entre en X con el link.
- **Link:** la dirección completa, con sus parámetros: si había una hoja abierta (`?dato=`, `?proceso=`) se comparte abierta.
- **En el celular** abre el menú de compartir del teléfono; en la computadora, un menú con «Publicar en X», «Enviar por WhatsApp» y «Copiar texto y link».
- **Texto propio:** se le pasa `text`. La hoja de cada dato de «Lo que no se publica» comparte el pedido: «Pido que se publique <dato> (<organismo>). Cualquier persona puede pedirlo por la Ley 9070.», y suma «Ya hay N pedidos registrados» cuando hay más de uno.
- **Página nueva:** `<PageHeader action={<ShareButton />} …>`.
- **Eventos:** `share.open` (abrió el menú en la computadora), `share.x`, `share.whatsapp`, `share.copy` y `share.native`, con `context` (`page` o `missing_data`).

## Link a cada sección

Cada bloque con título de una página se puede compartir solo: `/municipios/san-rafael#leyes` abre la página ya bajada hasta «Leyes que tocan a San Rafael».

- **Cómo:** `Section` (`@mt/ui/components/section`) pide un `id`; el título es un link a `#id` con el ícono de link siempre visible. Al tocarlo, la página baja a la sección, la URL queda con `#id` y el link se copia. Los títulos que no usan `Section` (portada, listas de funcionarios, tablas de `/datos`, temas de «Lo que no se publica») usan `SectionTitle` con el mismo `id` en el bloque.
- **El id:** una o dos palabras en español, en minúsculas y con guiones (`leyes`, `coparticipacion`, `por-anio`). Forma parte de links compartidos: nunca lleva un año, un nombre ni una cifra que cambie, aunque el título los tenga. Único dentro de la página.
- **Al abrir el link** el router baja solo hasta la sección, también cuando la página carga sus datos después; `scroll-mt-20` deja el título debajo del encabezado fijo.
- **Evento:** `share.section.copy`, con `section` (el id).

## Hojas con el id en la URL

Las hojas de detalle se abren con parámetros en la URL, así cada caso se puede compartir y abrir directo:

- `?proceso=<ocid>` y `?proveedor=<cuit>`: los maneja `DetailSheet` (`src/components/detail-sheet.tsx`), montado una sola vez en el layout, así que funcionan sobre cualquier página. Desde código: `useDetail().open("proceso", ocid)`.
- `?senal=<id>`: la señal abierta en `/senales`. Sus casos abren la hoja del proceso o del proveedor encima (`/senales?senal=adjudicado-sobre-estimado&proceso=ocds-…`).

Pasar de un proceso a un proveedor agrega un paso al historial: el botón "atrás" vuelve a la hoja anterior y la X la cierra.

- **La página no se mueve al abrir o cerrar una hoja:** se navega con `router.navigate({ href, resetScroll: false })`. Sin eso, el router vuelve al principio de la página en cada cambio de URL.
- **Los ids numéricos llegan como número:** el router convierte `?proveedor=30717479188` en número. Por eso `DetailSheet` los pasa a texto antes de usarlos; sin eso, la hoja del proveedor no abría. En la tabla de datos de compras, cada fila abre la hoja de su proceso o de su proveedor.

## Sumar una página temática

1. **Cálculo**: un script en `scripts/temas/<tema>.ts` que recibe las tablas y devuelve el JSON del tema; su tipo va en `src/types.ts`. Llamarlo desde `build-data.ts`.
2. **Página**: `src/pages/<tema>.tsx` con `PageHeader`, tarjetas `StatTile`, los gráficos de `src/charts/` y, como último bloque, `FuentesOficiales` (la sección «Fuentes»: organismo, sitio oficial, copia archivada y copia en archive.org).
3. **Ruta**: `createRoute` en `src/main.tsx` con su `loader`.
4. **Menú**: agregarla al grupo que corresponda en `src/components/layout.tsx` (con ícono y descripción). Son tres grupos (Gobierno, Datos y Transparencia) más «Para mirar de cerca»: antes de sumar un grupo, ver si la página entra en uno de los que hay. Las compras del Estado van en Gobierno, porque responden a la misma pregunta (qué hace el Gobierno y con quién).
5. **SEO**: entrada en `PAGES` de `src/seo.ts` (título de hasta 60 caracteres con la palabra clave, descripción de 140 a 160) y su página en `scripts/paginas.ts` (cifra para la imagen, JSON-LD y contenido escrito). Ver [SEO y GEO](#seo-y-geo).
6. Verificar (ver abajo).

Estructura de `apps/web/src`:

| Carpeta | Qué va | Ejemplos |
|---|---|---|
| `pages/` | Solo las páginas de cada ruta (las que carga `src/main.tsx`). | `municipios.tsx`, `leyes.tsx` |
| `components/` | Componentes de la web: los que usan el router, la analítica o los datos del sitio. | `layout.tsx`, `search-dialog.tsx`, `detail-sheet.tsx`, `purchase-detail.tsx` (`Proceso`, `Proveedor`, `PanelDetalle`), `home-guide.tsx`, `official-sources.tsx`, `tracked-sheet.tsx`, `tracked-segmented.tsx`, `list-search.tsx`, `breadcrumbs.tsx` |
| `charts/` | Gráficos. | `LineChart`, `ColumnChart`, `ChangeChart`, `BarList`, `Sparkline`, `MapaMendoza` |
| raíz | Lógica sin interfaz. | `lib.ts`, `url-state.ts`, `analytics.ts`, `types.ts` |

Lo genérico (botones, hojas, bloques, campos) no va en la web: está en el design system (`@mt/ui`, ver `docs/procesos/diseno.md`). Si un componente de la web deja de depender del router o de la analítica, se pasa al paquete.

## SEO y GEO

Objetivo: que la gente encuentre el sitio cuando busca "intendente de Maipú", "Ley 9735 Mendoza" o "ECOCLEAN SAS licitaciones", y que los motores de IA (ChatGPT, Claude, Perplexity, Google) lo puedan leer y citar.

**Registro de páginas: `scripts/paginas.ts`.** Una sola lista con todas las páginas del sitio (temas, funcionarios, municipios, proveedores, organismos, leyes y datos). Cada una trae:

- `title` (hasta 60 caracteres; lleva la marca solo si entra) y `description` (hasta 160), armados con el dato real de la página.
- `og`: la imagen para compartir con su cifra principal.
- `ld`: datos estructurados schema.org. `Person` para funcionarios, `Organization` para proveedores (con CUIT), `GovernmentOrganization` para organismos y municipalidades, `AdministrativeArea` para departamentos, `Legislation` para leyes y `Dataset` para fuentes. Además, `BreadcrumbList` en todas y `FAQPage` con las preguntas que la gente hace ("¿Quién es el intendente de…?", "¿Cuánto gana…?").
- `html`: el contenido principal escrito (h1, resumen en una oración con los datos clave, tabla de datos, links a páginas relacionadas y fuente).
- `lastmod` y `prioridad` para el sitemap.

**Qué genera `bun run build`:**

- `scripts/build-data.ts` escribe `public/data/meta.json` (título, descripción e imagen por ruta). `usePageMeta` lo usa para actualizar los metadatos al navegar dentro de la app.
- `public/_redirects` lo copia Vite tal cual: son las redirecciones 301 de Cloudflare Pages. Cuando se saca una página, su ruta se redirige a la más cercana (por ejemplo, `/registro` a `/participar`) para no dejar links rotos.
- `scripts/seo.ts` (después de `vite build`) escribe:
  - `404.html`, la app sin contenido y con `noindex`: Cloudflare la sirve con código 404 para las rutas sin HTML propio, y React igual resuelve la ruta.
  - Un HTML por ruta (`dist/leyes/9735.html`, `dist/municipios/capital.html`…) con meta tags, Open Graph, Twitter, canonical, hreflang y JSON-LD, y el `html` de la página dentro de `#root`. Así buscadores, redes y motores de IA leen el contenido sin ejecutar JavaScript; React lo reemplaza al cargar. Van como `ruta.html` (no `ruta/index.html`) para que Cloudflare Pages las sirva sin barra final.
  - Una imagen para compartir por página (`dist/og/*.png`), en Inter (incluida en `scripts/fonts/`). De fondo lleva el paisaje de la página en puntos (`og.photo`; si no tiene, el del sitio, `DEFAULT_PHOTO`), tenue detrás del texto. Cada punto es un círculo de color plano y la capa se dibuja una vez por foto: así cada imagen pesa menos de 250 KB (WhatsApp no muestra las de más de 300 KB) y las 749 se generan en un minuto. Si cambia el diseño, subir `OG_DESIGN` en `scripts/seo.ts` para que las redes las vuelvan a pedir.
  - `sitemap.xml` con la fecha real de cada página.
  - `robots.txt` que permite explícitamente a los buscadores y a los robots de IA: los datos son públicos y queremos que nos citen.
  - `llms.txt` ([llmstxt.org](https://llmstxt.org)), un índice del sitio pensado para modelos de lenguaje.
- `index.html` lleva las etiquetas geográficas: `geo.region` AR-M, `geo.placename`, `geo.position` e `ICBM`.

**URLs y enlaces internos.** Las URLs son legibles y jerárquicas:

- `/funcionarios/<cargo>/<nombre>`, por ejemplo `/funcionarios/diputados-provinciales/edgardo-civit-evans`. Cada cargo tiene su página (`/funcionarios/intendentes`). Los cargos están en `ROLES` (`src/slug.ts`).
- `/funcionarios/historial`: quién ocupó cada cargo antes (gobernadores, cómo se repartieron los cargos en cada elección y ex funcionarios). Es una ruta fija, así que gana sobre `/funcionarios/<cargo>`: ningún cargo de `ROLES` puede llamarse `historial`. Los ex funcionarios no tienen página propia: se abren en una hoja (`?persona=etica-<id>` o `?persona=electo-<nombre>`), que el buscador enlaza. Criterios en [Metodología](metodologia.md#quién-ocupó-cada-cargo).
- `/municipios/<nombre>`, `/proveedores/<nombre>-<cuit>`, `/organismos/<nombre>` (áreas que compran) y `/leyes/<número>`.
- `/gobierno/<organismo>`: un organismo del Estado provincial, con su conducción, cargos, costo del personal, qué hace, compras y designaciones. Los ids salen de `data/curado/jurisdicciones.yaml`; el cálculo está en `scripts/temas/gobierno.ts` y los criterios en [Metodología](metodologia.md#personal-y-costo-de-cada-organismo).

Toda entidad enlaza a las relacionadas, en los dos sentidos:

- **Intendente ↔ municipio.**
- **Legislador provincial ↔ municipios de su sección electoral.**
- **Organismo ↔ proveedores.**
- **Coparticipación y población → página del municipio.**
- **Funcionario del Ejecutivo ↔ organismo que conduce** (`/gobierno`); **organismo ↔ áreas que compran y proveedores**.
- **Mapa:** en la página de un municipio, el mapa resalta ese departamento y lleva a los demás.

Al sumar una entidad, pensar qué la conecta con las otras y enlazarlo, también en el `html` de `scripts/paginas.ts`.

**Cuándo una entidad tiene página.** Solo si tiene contenido suficiente, para no llenar el buscador de páginas vacías. Los umbrales están en `UMBRAL` de `scripts/temas/entidades.ts`:

- Proveedores: solo personas jurídicas, con al menos $ 100 millones adjudicados y 3 procesos. A las personas humanas nunca se las perfila.
- Organismos: al menos 20 procesos.
- Municipios, funcionarios y leyes: todos.

**Sumar un tipo de página.** Agregar la sección en `construirPaginas()` con su `title`, `description`, `ld` y `html`, la ruta en `src/main.tsx` y, si es una sección nueva, su entrada en `PAGES` (`src/seo.ts`) y en `NAV` (`scripts/paginas.ts`). `scripts/seo.ts` corta el build si alguna página sale con "undefined", "NaN" o "null".

El dominio sale de `VITE_SITE_URL` (por defecto `https://mendoza-transparente.com`).

## Sitios amigos

El pie lista, debajo del selector de tema, otros proyectos cívicos y de datos abiertos. Para sumar uno se agrega una línea con `name` y `url` en `FRIEND_SITES` (`apps/web/src/components/layout.tsx`). Todo lo demás sale solo:

- **UTM:** `utm_source=mendoza-transparente.com`, `utm_medium=referral` y `utm_campaign=sitios_amigos`, para que el otro sitio vea de dónde llegan las visitas.
- **Atributos:** `target="_blank"` y `rel="noopener"`. Sin `noreferrer`, así el sitio amigo también recibe el referer; sin `nofollow`, porque es una recomendación editorial.
- **Analítica:** cada clic manda `footer.friend_site.open` con el dominio en `site`.

## Nota de pedido y carteles

Dos herramientas para que cualquier persona actúe con los datos, sin cuenta y sin que guardemos nada suyo.

**Nota de pedido (`/pedir`).** Una nota formal de acceso a la información pública para un municipio o un organismo de la provincia.

- **Dos pasos.** Primero se elige a quién (`?para=muni-<slug>` u `org-<slug>`) y qué (`?dato=`, uno o varios separados por coma). Después se completa la nota sobre la misma hoja: los espacios celestes y los puntos del pedido, que se pueden cambiar, quitar o sumar. Con `?dato=` en la URL se abre directo el segundo paso: así llegan el QR de un cartel, el link de `/no-publicado` y el de la ficha de cada municipio.
- **El texto de la nota** sigue la Ley 9070: sujeto, información pedida y datos de quien la pide (art. 10; el DNI es opcional), 15 días hábiles (art. 13), sin explicar el motivo (art. 9) y rechazo fundado (art. 18). Para un municipio cita además «la normativa municipal aplicable», porque la ley solo invita a los municipios a adherir (art. 40). El texto está en `features/request-letter/utils/letter.ts`.
- **Privacidad.** El PDF se arma en el navegador con `pdf-lib`: nombre, DNI, domicilio y contacto nunca salen del dispositivo. «Recordar mis datos» los guarda solo en ese navegador (`localStorage`), si la persona lo marca. La analítica cuenta descargas por organismo y dato, nunca el texto (`request_letter.download`).
- **Datos.** `temas/pedir.json` lo arma `scripts/temas/civic-tools.ts` con los 9 datos de cada municipio (`src/transparency-items.ts`, que también usa su ficha) y los pedidos de `data/curado/no-publicado.yaml` dirigidos a un solo organismo provincial (`singleBody` en `features/request-letter/utils/targets.ts`). Un pedido nuevo en ese archivo aparece solo en `/pedir`.

**Carteles (`/cartel`).** Un cartel sobre un municipio para imprimir (A4, en PDF) o compartir (cuadrado de 1080 × 1080 o historia de 1080 × 1920, en PNG).

- **Qué muestra** (`?tema=`): qué publica, un dato que no publica (`?dato=`), la coparticipación, en qué gasta y cuántas personas trabajan. **Los cinco temas aparecen siempre, para todos los municipios**: la herramienta sirve para pedir lo que falta, así que un dato que no tenemos se muestra, no se esconde. Si el municipio no lo publica (o no se puede leer), el cartel lo dice y su QR lleva a la nota de pedido de ese dato; si lo publica pero todavía no lo pasamos a números, lo dice así (nunca «no lo publica») y el QR lleva al documento oficial; si publica los nueve, «Un dato que no publica» dice «Ninguno» y el QR lleva a la nota para pedir otra información. En «En qué gasta», cada destino lleva el monto en millones y su porcentaje del total. Cada cartel lleva su fuente, la fecha y un QR: a la nota de pedido cuando falta algo, a la ficha del municipio en el resto.
- **Sin caras.** Los carteles muestran datos, no personas: un cartel con la foto del intendente junto a «no publica» se lee como acusación.
- **Cómo se genera.** El mismo cartel se dibuja fuera de la pantalla en su tamaño real y `html-to-image` lo pasa a PNG; el A4 se envuelve en un PDF. Los tamaños están en `cqw` (porcentaje del ancho) para que cada formato salga con su medida exacta. Al tocar el diseño, probar con los nombres más largos (Luján de Cuyo, General Alvear) que el QR se siga leyendo y la imagen no cambie de alto.
- **Datos.** `temas/carteles.json`, también de `scripts/temas/civic-tools.ts`.

Las tres librerías (`pdf-lib`, `html-to-image` y `qrcode-generator`) se cargan solo al descargar, salvo el QR, que es chico y va con la página.

## Velocidad de carga

### Los datos de cada página, por capas

Una página no espera todo lo que muestra: espera solo lo que se ve al entrar. Los datos se separan en tres capas:

| Capa | Qué es | Cómo se carga |
|---|---|---|
| **1. Primaria** | Lo que pide la búsqueda y se ve al entrar: el título, las cifras, el gráfico principal. | El `loader` de la ruta lo espera (`await`). El HTML de la página lo precarga (ver abajo). |
| **2. Secundaria** | Lo relacionado con lo que se busca, más abajo en la página. | El `loader` lo devuelve sin `await` y la página lo muestra con `<Await promise={…} fallback={<…Skeleton />}>` (TanStack Router). |
| **3. Terciaria** | Fuentes, metadatos, extras. | Se pide desde el componente, sin bloquear nada, y guarda su lugar mientras llega. `FuentesOficiales` y la fecha del footer son de esta capa. |

- **Ejemplo:** la portada espera `home.json`, `guia.json`, `mapa.json` y `fuentes.json`; «Lo que el Estado no publica» llega después (`no-publicado.json`, con `MissingDataSkeleton`).
- **Lo que llega después guarda su lugar.** Un bloque que aparece tarde y empuja lo de abajo es un salto (CLS). Mientras carga se muestra `Skeleton` o `SkeletonText` de `@mt/ui` con el alto real del bloque, medido en 375 y 1280 px. Un skeleton de otro alto sigue moviendo la página.
- **Al navegar, la espera se ve.** El router cambia la URL enseguida, pero deja la página anterior en pantalla hasta que la nueva tiene sus datos y su código. Si eso pasa de 300 ms, aparece `NavigationProgress` (`src/components/navigation-progress.tsx`): una línea celeste de 2 px pegada al borde de arriba, fija y por encima de todo, que no mueve nada. Sin ella, una carga lenta (o la recarga que hace el router cuando una pestaña abierta antes de una publicación pide un archivo que ya no existe) parece un cuelgue y la gente vuelve a tocar.
- **Un archivo se baja una sola vez.** Si la ruta ya cargó un archivo, el componente lo recibe por props (`initial` en `Proveedor`) en vez de volver a pedirlo.
- **Los archivos de una misma capa se piden juntos** (`Promise.all`), nunca uno detrás del otro.
- **Un archivo grande para un dato chico se parte en el build.** La fecha del footer no justifica bajar `index.json`: para eso está `fuentes.json`. Lo mismo vale para cualquier lista completa que se usa para mostrar un solo elemento.
- **`meta.json`** (título y descripción de las 800 páginas) se pide solo al navegar dentro del sitio: la página de entrada ya los trae en su HTML.

### Precarga desde el HTML

`scripts/seo.ts` agrega en el `<head>` de cada página prerenderizada:

- `<link rel="preload" as="fetch" crossorigin="anonymous">` para los JSON de la capa 1,
- `<link rel="modulepreload">` para el JavaScript de la página y todo lo que importa (incluido Recharts).

Así se descargan junto con el HTML, en vez de esperar a que corra `main.js` para descubrirlos. Qué archivos lleva cada ruta está en `apps/web/scripts/preload.ts` (`routePreload`): **cuando cambia el `loader` de una ruta en `src/main.tsx`, se cambia también ahí**. Los chunks salen del manifest de Vite (`build.manifest`), que `seo.ts` lee y borra antes de publicar. Un JSON que no existe no se precarga.

### Lo demás

- **Cada página es su propio archivo de JavaScript** (`lazyRouteComponent` en `src/main.tsx`): la primera visita baja el layout y la página donde entra. La hoja de detalle de compras se descarga la primera vez que se abre (`React.lazy` en `src/components/detail-sheet.tsx`).
- **El CSS va dentro del HTML:** `scripts/seo.ts` lo inserta en cada página después del build. Es un viaje menos antes de la primera pintura.
- **PostHog se carga cuando la página terminó y el navegador está libre** (`whenIdle` en `src/analytics.ts`). Los eventos de antes quedan en cola y se envían después.
- **Source maps publicados** (`build.sourcemap`): el repo es público.

### Medir

- **En local:** `bun run medir` (`scripts/measure-vitals.ts`) sobre el build (`bun run data`, `bunx vite build` y `bun scripts/seo.ts` en `apps/web`). Mide FCP, LCP y CLS de las páginas clave como un celular con red lenta y CPU 4 veces más lenta, y como una computadora. Para cada salto dice qué elementos se movieron, y además muestra los avisos de consola, como un preload sin usar. Con rutas como argumento mide solo esas. El LCP del celular varía de una corrida a otra: comparar varias.
- **En producción:** PostHog, *Web analytics → Web vitals*, siempre en **P75**, que es el criterio de Google. Con pocas visitas por día, P90 y P99 muestran la peor visita, no la tendencia. Para encontrar la página culpable: el evento `$web_vitals` desglosado por `$pathname` y `$device_type`.
- **El CLS de PostHog suma toda la visita**, incluidas las navegaciones dentro del sitio. Un salto al cambiar de página cuenta igual que uno al entrar.
- `bunx lighthouse <url> --form-factor=mobile` para el detalle de una página.

Plan de lo que falta: [Carga por capas](../planes/carga-por-capas.md).

## Verificar antes de dar algo por terminado

```bash
bun run typecheck   # tipos
bun run verificar   # scroll horizontal y consola
```

`bun run verificar` (`scripts/verificar-web.ts`) levanta el servidor de desarrollo y, con un Chrome sin extensiones, recorre todas las páginas en 320, 360, 375, 390, 1024 y 1280 px: falla si alguna tiene scroll horizontal o si aparece cualquier error o advertencia en la consola, incluso al abrir hojas de detalle. Mientras corre, el servidor no recarga por cambios en los datos (`MT_NO_DATA_WATCH`), para que un scraper que escribe en paralelo no corte la prueba. También controla que, con el menú móvil abierto, la página de atrás quede bloqueada y solo se desplace el menú, y que en los anchos de celular ningún campo de formulario tenga letra de menos de 16 px (si no, iOS agranda la página al tocarlo).

La barra de Agentation (`src/components/dev-feedback.tsx`) solo existe en desarrollo y no aparece cuando el navegador lo maneja un programa (`navigator.webdriver`), así que no interfiere con estos controles. Ver [Mejoras de interfaz](mejoras-de-interfaz.md).

El menú móvil ocupa toda la pantalla y tiene su propia barra con el botón de cerrar: no depende del header, que en el celular puede quedar fuera de la pantalla mientras la página está bloqueada (con `overflow: hidden` en `<html>`, `position: sticky` deja de funcionar). Paneles sobre la página (menú móvil, hojas modales): usar `useScrollLock(abierto)` de `@mt/ui/hooks/use-scroll-lock` (la `Sheet` ya lo hace). Bloquea el scroll en `<html>` y `<body>`: con `overflow-x: clip` en `html`, el que desplaza la página es `<html>`, y bloquear solo `<body>` deja dos scrolls en el celular. El panel lleva `overflow-y-auto overscroll-contain`. Para revisar cómo se ve, sacar capturas con `playwright-core` (ver el mismo script como ejemplo).

Si el puerto 5199 está ocupado (otro worktree con el sitio levantado), `MT_VERIFY_PORT=5299 bun run verificar`: si no, la prueba recorre el servidor que ya estaba.

Errores de consola del tipo «Could not establish connection. Receiving end does not exist» vienen de extensiones del navegador, no del sitio: verificar siempre con `bun run verificar`, que usa un Chrome limpio.

## Publicar

**Dónde:** Cloudflare Pages. Se eligió frente a Vercel por estas razones (precios verificados en octubre de 2026):

- **Tráfico sin costo extra:** los archivos estáticos se sirven sin límite de ancho de banda en el plan gratis. En Vercel, el plan gratis corta a los 100 GB por mes y el Pro cobra el excedente sobre 1 TB. Un pico de tráfico, o un ataque, no genera una factura en Cloudflare.
- **Protección contra DDoS:** incluida y sin límite en todos los planes. Además están el modo "Under Attack", las reglas de WAF y los límites de pedidos por IP, útiles para un sitio político que pueden intentar tumbar.
- **Backend gratis:** Turnstile (anti-spam), Pages Functions y D1 (base para participación) entran en el plan gratis: 100.000 pedidos por día a funciones y 100.000 filas escritas por día.
- **Límites a vigilar:** 20.000 archivos por sitio en el plan gratis (hoy usamos unos 3.600) y 25 MiB por archivo. Si se supera, el plan pago (USD 5 por mes) sube a 100.000 archivos. También hay 500 builds por mes, que se comparten entre producción y vistas previas.

**Ahorrar recursos.** El proyecto no tiene financiación, así que cuidamos lo que tiene cupo: builds, pedidos a funciones y lecturas de D1. Servir archivos estáticos no gasta nada.

- **Lo estático no se mueve a Workers.** Un HTML prerenderizado se sirve gratis y sin límite; la misma página armada en el momento por un Worker gastaría un pedido del cupo diario.
- **Commits que no necesitan build:** llevan `[CF-Pages-Skip]` en el mensaje y Cloudflare no los construye. Lo usan el back merge a `dev` y el commit de copias en archive.org. Los links a esas copias aparecen con el build siguiente. `scripts/release-notes.ts` saca la marca de las notas del release.
- **Cada app construye solo cuando cambia lo suyo** (*build watch paths*, configurado el 18/10/2026 por API). Un cambio solo de documentación, de `.github/` o de los scrapers no construye nada, y uno del panel no construye la web:

  | Proyecto | Construye si el push toca |
  |---|---|
  | `mendoza-transparente` (web) | `apps/web/*`, `data/*`, `sources.yaml`, `packages/ui/*`, `packages/participation/*`, `packages/assistant/*`, `packages/mascots/*`, `package.json`, `bun.lock`, `tsconfig.base.json` |
  | `mendoza-transparente-panel` | `apps/panel/*`, `packages/ui/*`, `packages/participation/*`, `package.json`, `bun.lock`, `tsconfig.base.json` |
  | `mendoza-transparente-votacion` | `apps/votacion/*`, `packages/ui/*`, `data/processed/{elecciones-datos-abiertos,resultados-provisorios,escrutinios-definitivos,geo}/*`, `data/curado/{colores-partidos,partidos,frentes}.yaml`, `package.json`, `bun.lock`, `tsconfig.base.json` |

  Si una app empieza a importar otro paquete del monorepo (por ejemplo `@mt/core`) o a leer otro archivo de la raíz, se suma a su lista en el mismo PR. Se cambia con `PATCH /accounts/$ID/pages/projects/<proyecto>` y `{"source":{"type":"github","config":{"path_includes":[…]}}}`, o en *Settings → Builds & deployments → Build watch paths*.
- **Vistas previas solo de `dev`** (*Preview branches → Custom*, en los tres proyectos). Las ramas de trabajo no arman vista previa: se prueban en local y la CI compila la web, el panel y votación en cada PR.
- **Cómo sigue:** ver el plan [Consumo de Cloudflare](../planes/consumo-de-cloudflare.md).

**Configuración del proyecto:**
- Directorio `apps/web`, comando de build `bun run build`, salida `dist`.
- Variables: `VITE_SITE_URL`, `VITE_POSTHOG_KEY` (ver [Analítica](analitica.md)) y `VITE_TURNSTILE_SITE_KEY`.
- Base D1 vinculada como `DB` y secretos `TURNSTILE_SECRET` e `IP_SALT` (ver [Participación](participacion.md)).

Cada push a `main` publica solo, incluidos los commits automáticos de datos. A `main` se llega con una publicación desde `dev`, que Cloudflare publica como vista previa en `dev.mendoza-transparente.pages.dev`: ver [Ramas y releases](ramas-y-releases.md). El panel interno se publica en otro proyecto de Pages (`mendoza-transparente-panel`), con la misma base D1: ver [Panel interno](panel.md).

**Votación (`votacion.mendoza-transparente.com`).** Proyecto de Pages aparte, `mendoza-transparente-votacion`, creado el 25/10/2026 por API con la misma configuración que el panel: raíz `apps/votacion`, build `cd ../.. && bun install --frozen-lockfile && cd apps/votacion && bun run build` (arma `public/datos/` con `scripts/build-data.ts` y después Vite), salida `dist`, rama de producción `main` y vista previa solo de `dev` (`dev.mendoza-transparente-votacion.pages.dev`). El dominio tiene un CNAME con proxy a `mendoza-transparente-votacion.pages.dev`. La portada sigue «en construcción», pero cada año con datos ya se ve en dos páginas: las provinciales en `/<año>` (por ejemplo `/2023`) y las municipales en `/<año>/municipales`; un año con un solo tipo manda la otra a esa. La elección, el escrutinio, el cargo, el departamento (o el `municipio`) y la hoja de la fuerza abierta van en la URL (`?eleccion=2023-09-24&escrutinio=definitivo&cargo=gobernador&departamento=capital&partido=501-cambia-mendoza`). **Para el QA visual, todo cambio de votación se mergea a `dev` y se mira en `dev.mendoza-transparente-votacion.pages.dev`** antes de la publicación. Mientras está en construcción no se indexa: `noindex` en el HTML, `X-Robots-Tag` en `public/_headers` y `Disallow: /` en `robots.txt`. Cuando tenga contenido, se sacan las tres cosas y se suma al sitemap y a la skill `seo-y-geo`. Se levanta en local con `bun run votacion` (puerto 5175). Qué va a tener: plan [Votación](../planes/votacion.md).

**Estado al 12/10/2026 (cuenta personal de Cloudflare, configurado por API con el token de `.env.cloudflare`):**
- Proyecto `mendoza-transparente` (`mendoza-transparente.pages.dev`), con root directory `apps/web`.
- Base D1 con las tablas de participación aplicadas.
- Secretos `TURNSTILE_SECRET` e `IP_SALT` cifrados.
- Dominio con HTTPS obligatorio y TLS 1.2 como mínimo.
- `www.mendoza-transparente.com` redirige con 301 a `mendoza-transparente.com`, con la misma ruta y la misma query (Redirect Rule de la zona, «www a dominio principal (301)»). Sin ella, `www` servía el sitio entero con 200: dos direcciones para el mismo contenido, links compartidos de las dos formas y métricas repartidas entre dos hosts. El `www` sigue como dominio del proyecto de Pages para que tenga certificado; la regla actúa antes.
- Bot Fight Mode activado. La protección contra robots de IA está apagada a propósito: queremos que nos lean y citen.
- Límite de pedidos: `/api/*` en el sitio público (no en `panel.`), 10 cada 10 segundos por IP con cualquier método; si se supera, bloqueo de 10 segundos (máximo del plan gratis, que permite una sola regla).
- Regla de WAF «Escáneres» (18/10/2026): bloquea las rutas que el sitio no tiene y que solo piden los escáneres (`.php`, `/wp-`, `/.env`, `/.git`, `/cgi-bin`) y los puertos que no son 80 ni 443. Sin ella, `/api/.env` y parecidas invocaban la función.

**Robots y consumo.** Leer el sitio es gratis y queremos que lo lean, así que no se bloquea a nadie por ser robot. Lo que se cuida es lo que tiene cupo:

- **Lo estático no tiene límite.** Un rastreador que baja las 800 páginas con todo su JavaScript (AhrefsBot hizo 16.800 pedidos en tres horas el 18/10/2026) no gasta nada.
- **`/api/*` sí.** Cada pedido invoca la función (100.000 por día) y puede leer D1. Lo protegen el límite por IP, la regla de escáneres y dos cachés de 60 s para las lecturas públicas: la Cache Rule de la zona «API pública de lectura» (`GET /api/pedidos/stats` y `/api/registro*`), que responde sin invocar la función, y la Cache API dentro de la función, por si la regla falta. Así D1 se lee como mucho una vez por minuto. El 18/10/2026 la API usaba entre 30 y 185 invocaciones por día.
- **Las herramientas de SEO van más lento.** `robots.txt` les pide `Crawl-delay: 10` (Ahrefs, Semrush, Majestic y otras; la lista está en `scripts/seo.ts`). Google lo ignora y los motores de IA no están en la lista.
- **Para mirar el tráfico:** la API GraphQL de analíticas (`httpRequestsAdaptiveGroups`, últimos días) por `userAgent`, `clientRequestPath` y `datetimeHour`, comparada con las páginas vistas de PostHog, que casi no cuenta robots. El token necesita *Zone → Analytics → Read*; para las invocaciones de funciones (`pagesFunctionsInvocationsAdaptiveGroups`), *Account → Account Analytics → Read*. Las Cache Rules piden *Zone → Cache Rules → Edit*.
- Analítica: PostHog en un proyecto propio, separado de cualquier otra organización (`.env.production`).

**Buscadores:** Google Search Console verifica el dominio con `apps/web/public/google9fb9587f2a5c020a.html`, servido por la función `functions/google9fb9587f2a5c020a.html.ts`: Pages redirige `/x.html` a `/x`, y la verificación necesita la URL exacta. No hay que borrarlos, porque Google vuelve a revisar el archivo. Después de verificar, enviar `https://mendoza-transparente.com/sitemap.xml`.

**Antes de abrir al público:**
1. Dominio propio en Cloudflare, con proxy activado (nube naranja).
2. Security → Bots: activar Bot Fight Mode.
3. Security → WAF → Rate limiting: una regla para `/api/*`, por ejemplo 20 pedidos por minuto por IP, con bloqueo de 10 minutos.
4. Si llega un ataque: Security → Settings → "I'm Under Attack" mientras dure.
5. Caché: los HTML y `/data/*` se sirven desde la CDN, así que un pico de visitas no llega al origen.
