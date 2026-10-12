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

## Sumar una página temática

1. **Cálculo**: un script en `scripts/temas/<tema>.ts` que recibe las tablas y devuelve el JSON del tema; su tipo va en `src/types.ts`. Llamarlo desde `build-data.ts`.
2. **Página**: `src/pages/<tema>.tsx` con `PageHeader`, `FuentesOficiales` (fuente, sitio oficial y copia archivada), tarjetas `StatTile` y los gráficos de `src/charts/`.
3. **Ruta**: `createRoute` en `src/main.tsx` con su `loader`.
4. **Menú**: agregarla al grupo que corresponda en `src/pages/layout.tsx` (con ícono y descripción).
5. **SEO**: entrada en `PAGES` de `src/seo.ts` (título de hasta 60 caracteres con la palabra clave, descripción de 140 a 160) y su página en `scripts/paginas.ts` (cifra para la imagen, JSON-LD y contenido escrito). Ver [SEO y GEO](#seo-y-geo).
6. Verificar (ver abajo).

Componentes disponibles: `StatTile`, `Section`, `Segmented`, `PageHeader`, `Sheet` (hoja modal), `EstadoBadge` (`src/pages/components.tsx`); `LineChart`, `ColumnChart` (montos por año), `BarList` (rankings), `Sparkline`, `MapaMendoza` (`src/charts/`); `PanelDetalle`, `Proveedor`, `Proceso` (`src/pages/detalle.tsx`).

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

El dominio sale de `VITE_SITE_URL` (por defecto `https://mendozatransparente.org`).

## Verificar antes de dar algo por terminado

```bash
bun run typecheck   # tipos
bun run verificar   # scroll horizontal y consola
```

`bun run verificar` (`scripts/verificar-web.ts`) levanta el servidor de desarrollo y, con un Chrome sin extensiones, recorre todas las páginas en 320, 360, 375, 390, 1024 y 1280 px: falla si alguna tiene scroll horizontal o si aparece cualquier error o advertencia en la consola, incluso al abrir hojas de detalle. Mientras corre, el servidor no recarga por cambios en los datos (`MT_NO_DATA_WATCH`), para que un scraper que escribe en paralelo no corte la prueba. También controla que, con el menú móvil abierto, la página de atrás quede bloqueada y solo se desplace el menú.

Paneles sobre la página (menú móvil, hojas modales): usar `useScrollLock(abierto)` de `components.tsx`. Bloquea el scroll en `<html>` y `<body>`: con `overflow-x: clip` en `html`, el que desplaza la página es `<html>`, y bloquear solo `<body>` deja dos scrolls en el celular. El panel lleva `overflow-y-auto overscroll-contain`. Para revisar cómo se ve, sacar capturas con `playwright-core` (ver el mismo script como ejemplo).

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

**Antes de abrir al público:**
1. Dominio propio en Cloudflare, con proxy activado (nube naranja).
2. Security → Bots: activar Bot Fight Mode.
3. Security → WAF → Rate limiting: una regla para `/api/*`, por ejemplo 20 pedidos por minuto por IP, con bloqueo de 10 minutos.
4. Si llega un ataque: Security → Settings → "I'm Under Attack" mientras dure.
5. Caché: los HTML y `/data/*` se sirven desde la CDN, así que un pico de visitas no llega al origen.
