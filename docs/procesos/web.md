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
5. **SEO**: entrada en `PAGES` de `src/seo.ts` (título de hasta 60 caracteres con la palabra clave, descripción de 140 a 160) y su cifra para la imagen de redes en `scripts/seo.ts`.
6. Verificar (ver abajo).

Componentes disponibles: `StatTile`, `Section`, `Segmented`, `PageHeader`, `Sheet` (hoja modal), `EstadoBadge` (`src/pages/components.tsx`); `LineChart`, `ColumnChart` (montos por año), `BarList` (rankings), `Sparkline`, `MapaMendoza` (`src/charts/`); `PanelDetalle`, `Proveedor`, `Proceso` (`src/pages/detalle.tsx`).

## SEO y redes

`bun run build` = datos + `vite build` + `scripts/seo.ts`, que genera:

- Un HTML por ruta (`dist/deuda.html`, `dist/datos/<fuente>.html`) con título, descripción, canonical, Open Graph, Twitter y JSON-LD. Van como `ruta.html` (no `ruta/index.html`) para que Cloudflare Pages las sirva sin barra final.
- Una imagen para compartir por página (`dist/og/*.png`) con su cifra principal, en Inter (incluida en `scripts/fonts/`, para que funcione en servidores sin fuentes).
- `sitemap.xml` y `robots.txt`.

El dominio sale de `VITE_SITE_URL` (por defecto `https://mendozatransparente.org`).

## Verificar antes de dar algo por terminado

```bash
bun run typecheck   # tipos
bun run verificar   # scroll horizontal y consola
```

`bun run verificar` (`scripts/verificar-web.ts`) levanta el servidor de desarrollo y, con un Chrome sin extensiones, recorre todas las páginas en 320, 360, 375, 390, 1024 y 1280 px: falla si alguna tiene scroll horizontal o si aparece cualquier error o advertencia en la consola, incluso al abrir hojas de detalle. Para revisar cómo se ve, sacar capturas con `playwright-core` (ver el mismo script como ejemplo).

Errores de consola del tipo «Could not establish connection. Receiving end does not exist» vienen de extensiones del navegador, no del sitio: verificar siempre con `bun run verificar`, que usa un Chrome limpio.

## Publicar

Cloudflare Pages, conectado al repo: directorio `apps/web`, comando de build `bun run build`, salida `dist`. Cada push a `main` (incluidos los commits automáticos de datos) publica solo.
