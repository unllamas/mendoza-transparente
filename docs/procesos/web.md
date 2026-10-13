# La web

`apps/web`: sitio estático con Vite, React y TanStack Router (rutas por código en `src/main.tsx`). Se publica en Cloudflare Pages.

## Cómo llegan los datos a la web

`apps/web/scripts/build-data.ts` (`bun run data`) corre antes de cada build y en desarrollo:

1. Lee `sources.yaml`, los `manifest.jsonl` y los CSV de `data/processed/`.
2. Escribe en `apps/web/public/data/`:
   - `index.json`: catálogo de fuentes y tablas.
   - Por tabla: el CSV completo (para descargar) y una vista previa de las filas más recientes (o una por grupo si la tabla se agrupa).
   - `temas/*.json`: los agregados de cada página temática, calculados por los scripts de `scripts/temas/` (deuda, coparticipación, empleo, población, funcionarios, señales, compras, portada).
   - `fotos/`: miniaturas de funcionarios.
3. `public/data/` no se versiona: se genera siempre.

En desarrollo (`bun run dev`), el plugin de `vite.config.ts` regenera todo y recarga el navegador cuando cambia algo en `data/processed`, `data/curado`, `sources.yaml` o los scripts.

## La portada como guía

La portada está pensada para quien llega sin saber por dónde empezar. Los componentes están en `src/components/home-guide.tsx` y los datos en `temas/guia.json` y `data/search.json` (`scripts/temas/guide.ts`):

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
   - **Selector:** al lado del campo de la portada está "¿Dónde vivís?", que lleva a la página del departamento.
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
| Datos | `?<tabla>=<grupo>` (por ejemplo, `?personal=2025`) |
| Señales y compras | `?senal=`, `?proceso=`, `?proveedor=` (ver abajo) |

- **Cómo se hace:** con `useUrlOption` (opciones fijas) y `useUrlText` (texto o un id), de `src/url-state.ts`. Para cambiar varios parámetros juntos, `useSetUrlParams`. Nunca con `useState` para algo que alguien querría compartir.
- **Cómo se comporta:** cambiar una pestaña reemplaza la entrada del historial (no suma pasos al botón "atrás"), no mueve el scroll y conserva los demás parámetros. El valor por defecto no se escribe.
- **El router no vuelve a pedir los datos** cuando cambian los parámetros (`defaultStaleTime: Infinity`): los datos solo cambian con cada publicación.
- **Links internos:** a una hoja, con `search` (`<Link to="/no-publicado" search={{ dato: id }}>`), nunca con `hash`.
- **Buscador:** también encuentra las señales (`/senales?senal=…`) y los datos que no se publican (`/no-publicado?dato=…`).

## Hojas con el id en la URL

Las hojas de detalle se abren con parámetros en la URL, así cada caso se puede compartir y abrir directo:

- `?proceso=<ocid>` y `?proveedor=<cuit>`: los maneja `DetailSheet` (`src/components/detail-sheet.tsx`), montado una sola vez en el layout, así que funcionan sobre cualquier página. Desde código: `useDetail().open("proceso", ocid)`.
- `?senal=<id>`: la señal abierta en `/senales`. Sus casos abren la hoja del proceso o del proveedor encima (`/senales?senal=adjudicado-sobre-estimado&proceso=ocds-…`).

Pasar de un proceso a un proveedor agrega un paso al historial: el botón "atrás" vuelve a la hoja anterior y la X la cierra.

- **La página no se mueve al abrir o cerrar una hoja:** se navega con `router.navigate({ href, resetScroll: false })`. Sin eso, el router vuelve al principio de la página en cada cambio de URL.
- **Los ids numéricos llegan como número:** el router convierte `?proveedor=30717479188` en número. Por eso `DetailSheet` los pasa a texto antes de usarlos; sin eso, la hoja del proveedor no abría. En la tabla de datos de compras, cada fila abre la hoja de su proceso o de su proveedor.

## Sumar una página temática

1. **Cálculo**: un script en `scripts/temas/<tema>.ts` que recibe las tablas y devuelve el JSON del tema; su tipo va en `src/types.ts`. Llamarlo desde `build-data.ts`.
2. **Página**: `src/pages/<tema>.tsx` con `PageHeader`, `FuentesOficiales` (fuente, sitio oficial y copia archivada), tarjetas `StatTile` y los gráficos de `src/charts/`.
3. **Ruta**: `createRoute` en `src/main.tsx` con su `loader`.
4. **Menú**: agregarla al grupo que corresponda en `src/components/layout.tsx` (con ícono y descripción).
5. **SEO**: entrada en `PAGES` de `src/seo.ts` (título de hasta 60 caracteres con la palabra clave, descripción de 140 a 160) y su página en `scripts/paginas.ts` (cifra para la imagen, JSON-LD y contenido escrito). Ver [SEO y GEO](#seo-y-geo).
6. Verificar (ver abajo).

Estructura de `apps/web/src`:

| Carpeta | Qué va | Ejemplos |
|---|---|---|
| `pages/` | Solo las páginas de cada ruta (las que carga `src/main.tsx`). | `municipios.tsx`, `leyes.tsx` |
| `components/` | Componentes de la web: los que usan el router, la analítica o los datos del sitio. | `layout.tsx`, `search-dialog.tsx`, `detail-sheet.tsx`, `purchase-detail.tsx` (`Proceso`, `Proveedor`, `PanelDetalle`), `home-guide.tsx`, `official-sources.tsx`, `tracked-sheet.tsx`, `tracked-segmented.tsx`, `list-search.tsx`, `breadcrumbs.tsx` |
| `charts/` | Gráficos. | `LineChart`, `ColumnChart`, `BarList`, `Sparkline`, `MapaMendoza` |
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
- `scripts/seo.ts` (después de `vite build`) escribe:
  - `404.html`, la app sin contenido y con `noindex`: Cloudflare la sirve con código 404 para las rutas sin HTML propio, y React igual resuelve la ruta.
  - Un HTML por ruta (`dist/leyes/9735.html`, `dist/municipios/capital.html`…) con meta tags, Open Graph, Twitter, canonical, hreflang y JSON-LD, y el `html` de la página dentro de `#root`. Así buscadores, redes y motores de IA leen el contenido sin ejecutar JavaScript; React lo reemplaza al cargar. Van como `ruta.html` (no `ruta/index.html`) para que Cloudflare Pages las sirva sin barra final.
  - Una imagen para compartir por página (`dist/og/*.png`), en Inter (incluida en `scripts/fonts/`).
  - `sitemap.xml` con la fecha real de cada página.
  - `robots.txt` que permite explícitamente a los buscadores y a los robots de IA: los datos son públicos y queremos que nos citen.
  - `llms.txt` ([llmstxt.org](https://llmstxt.org)), un índice del sitio pensado para modelos de lenguaje.
- `index.html` lleva las etiquetas geográficas: `geo.region` AR-M, `geo.placename`, `geo.position` e `ICBM`.

**URLs y enlaces internos.** Las URLs son legibles y jerárquicas:

- `/funcionarios/<cargo>/<nombre>`, por ejemplo `/funcionarios/diputados-provinciales/edgardo-civit-evans`. Cada cargo tiene su página (`/funcionarios/intendentes`). Los cargos están en `ROLES` (`src/slug.ts`).
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

## Velocidad de carga

- **Cada página es su propio archivo de JavaScript** (`lazyRouteComponent` en `src/main.tsx`): la primera visita baja el layout y la página donde entra. La hoja de detalle de compras se descarga la primera vez que se abre (`React.lazy` en `src/components/detail-sheet.tsx`).
- **El CSS va dentro del HTML:** `scripts/seo.ts` lo inserta en cada página después del build. Es un viaje menos antes de la primera pintura.
- **PostHog se carga cuando la página terminó y el navegador está libre** (`whenIdle` en `src/analytics.ts`). Los eventos de antes quedan en cola y se envían después.
- **Source maps publicados** (`build.sourcemap`): el repo es público.
- **Para medir:** `bunx lighthouse <url> --form-factor=mobile`. Lo más pesado que queda es el tiempo de render: la página aparece cuando corre el JavaScript.

## Verificar antes de dar algo por terminado

```bash
bun run typecheck   # tipos
bun run verificar   # scroll horizontal y consola
```

`bun run verificar` (`scripts/verificar-web.ts`) levanta el servidor de desarrollo y, con un Chrome sin extensiones, recorre todas las páginas en 320, 360, 375, 390, 1024 y 1280 px: falla si alguna tiene scroll horizontal o si aparece cualquier error o advertencia en la consola, incluso al abrir hojas de detalle. Mientras corre, el servidor no recarga por cambios en los datos (`MT_NO_DATA_WATCH`), para que un scraper que escribe en paralelo no corte la prueba. También controla que, con el menú móvil abierto, la página de atrás quede bloqueada y solo se desplace el menú.

El menú móvil ocupa toda la pantalla y tiene su propia barra con el botón de cerrar: no depende del header, que en el celular puede quedar fuera de la pantalla mientras la página está bloqueada (con `overflow: hidden` en `<html>`, `position: sticky` deja de funcionar). Paneles sobre la página (menú móvil, hojas modales): usar `useScrollLock(abierto)` de `@mt/ui/hooks/use-scroll-lock` (la `Sheet` ya lo hace). Bloquea el scroll en `<html>` y `<body>`: con `overflow-x: clip` en `html`, el que desplaza la página es `<html>`, y bloquear solo `<body>` deja dos scrolls en el celular. El panel lleva `overflow-y-auto overscroll-contain`. Para revisar cómo se ve, sacar capturas con `playwright-core` (ver el mismo script como ejemplo).

Errores de consola del tipo «Could not establish connection. Receiving end does not exist» vienen de extensiones del navegador, no del sitio: verificar siempre con `bun run verificar`, que usa un Chrome limpio.

## Publicar

**Dónde:** Cloudflare Pages. Se eligió frente a Vercel por estas razones (precios verificados en octubre de 2026):

- **Tráfico sin costo extra:** los archivos estáticos se sirven sin límite de ancho de banda en el plan gratis. En Vercel, el plan gratis corta a los 100 GB por mes y el Pro cobra el excedente sobre 1 TB. Un pico de tráfico, o un ataque, no genera una factura en Cloudflare.
- **Protección contra DDoS:** incluida y sin límite en todos los planes. Además están el modo "Under Attack", las reglas de WAF y los límites de pedidos por IP, útiles para un sitio político que pueden intentar tumbar.
- **Backend gratis:** Turnstile (anti-spam), Pages Functions y D1 (base para participación) entran en el plan gratis: 100.000 pedidos por día a funciones y 100.000 filas escritas por día.
- **Límites a vigilar:** 20.000 archivos por sitio en el plan gratis (hoy usamos unos 3.600) y 25 MiB por archivo. Si se supera, el plan pago (USD 5 por mes) sube a 100.000 archivos.

**Configuración del proyecto:**
- Directorio `apps/web`, comando de build `bun run build`, salida `dist`.
- Variables: `VITE_SITE_URL`, `VITE_POSTHOG_KEY` (ver [Analítica](analitica.md)) y `VITE_TURNSTILE_SITE_KEY`.
- Base D1 vinculada como `DB` y secretos `TURNSTILE_SECRET` e `IP_SALT` (ver [Participación](participacion.md)).

Cada push a `main` publica solo, incluidos los commits automáticos de datos.

**Estado al 12/10/2026 (cuenta personal de Cloudflare, configurado por API con el token de `.env.cloudflare`):**
- Proyecto `mendoza-transparente` (`mendoza-transparente.pages.dev`), con root directory `apps/web`.
- Base D1 con las tablas de participación aplicadas.
- Secretos `TURNSTILE_SECRET` e `IP_SALT` cifrados.
- Dominio con HTTPS obligatorio y TLS 1.2 como mínimo.
- Bot Fight Mode activado. La protección contra robots de IA está apagada a propósito: queremos que nos lean y citen.
- Límite de pedidos: `POST /api/*`, 10 cada 10 segundos por IP; si se supera, bloqueo de 10 segundos (máximo del plan gratis).
- Analítica: PostHog en un proyecto propio, separado de cualquier otra organización (`.env.production`).

**Buscadores:** Google Search Console verifica el dominio con `apps/web/public/google9fb9587f2a5c020a.html`, servido por la función `functions/google9fb9587f2a5c020a.html.ts`: Pages redirige `/x.html` a `/x`, y la verificación necesita la URL exacta. No hay que borrarlos, porque Google vuelve a revisar el archivo. Después de verificar, enviar `https://mendoza-transparente.com/sitemap.xml`.

**Antes de abrir al público:**
1. Dominio propio en Cloudflare, con proxy activado (nube naranja).
2. Security → Bots: activar Bot Fight Mode.
3. Security → WAF → Rate limiting: una regla para `/api/*`, por ejemplo 20 pedidos por minuto por IP, con bloqueo de 10 minutos.
4. Si llega un ataque: Security → Settings → "I'm Under Attack" mientras dure.
5. Caché: los HTML y `/data/*` se sirven desde la CDN, así que un pico de visitas no llega al origen.
