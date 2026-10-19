# Plan: consumo de Cloudflare

Objetivo: que el sitio crezca a miles de páginas (leyes, escuelas, Boletín completo) sin salir del plan gratis de Cloudflare y sin que el build y la verificación se vuelvan lentos. El proyecto no tiene financiación: cualquier recurso que no gastamos es mejor.

Fecha: 17/10/2026. Estado: etapas 1, 2 y 6 hechas; las demás, sin empezar.

## Por qué

- **Hoy hay 813 URLs** en el sitemap: 236 leyes, 204 proveedores, 135 funcionarios, 79 municipios (con su presupuesto por año), 73 organismos, 51 de gobierno, 24 datos y 11 páginas temáticas. Cada URL es un HTML y una imagen para compartir: unos 3.600 archivos en total.
- **Un solo dominio, no subdominios.** Partir el sitio en `leyes.`, `escuelas.`, etc. reparte la autoridad en buscadores, corta los enlaces entre entidades (intendente ↔ municipio, organismo ↔ proveedores) y multiplica los proyectos, sitemaps y propiedades de Search Console. Si una sección llega a necesitar un deploy propio, se monta en una ruta del mismo dominio (`/escuelas`) con otro Worker.
- **Lo que tiene cupo en el plan gratis**:

| Recurso | Cupo | Quién lo gasta |
|---|---|---|
| Builds de Pages | 500 por mes, entre producción y vistas previas | Cada push a `main`, a `dev` y a cada rama |
| Archivos por deploy | 20.000 | Un HTML y una imagen por página, más los datos |
| Pedidos a funciones | 100.000 por día | `/api/*` (participación) |
| D1 | 5 millones de filas leídas y 100.000 escritas por día | Participación |
| Archivos estáticos | Sin límite | — |

- **Una corrida de datos gastaba hasta 4 builds:** el commit de datos en `main`, el de copias en archive.org y los dos back merges a `dev`. A eso se suma una vista previa por cada push a cada rama de trabajo.

## Etapas

### 1. Commits que no necesitan build (hecha)

El back merge a `dev` y el commit de copias en archive.org llevan `[CF-Pages-Skip]`. Ahora una corrida de datos gasta un solo build. Ver `docs/procesos/web.md#publicar`.

### 2. Configuración de los proyectos en Cloudflare (hecha)

Hecha el 18/10/2026 por API, en los dos proyectos (`mendoza-transparente` y `mendoza-transparente-panel`):

- **Vistas previas solo de `dev`.** Las ramas de trabajo se prueban en local y la CI compila la web y el panel igual.
- **Build watch paths** como lista de lo que sí construye (`path_includes`), no de lo que no: un archivo nuevo en la raíz o en `docs/` no dispara builds por olvido. Las listas están en `docs/procesos/web.md#publicar`.

**Línea de base** (deployments del 12 al 18/10/2026, contados con `GET …/deployments`): **454 builds en una semana**, contra un cupo de 500 por mes para toda la cuenta.

| Proyecto | Producción (`main`) | Vista previa de `dev` | Vistas previas de ramas | Total |
|---|---|---|---|---|
| Web | 89 | 68 | 93 | 250 |
| Panel | 56 | 68 | 80 | 204 |

Con la configuración nueva se dejan de gastar los 173 builds de ramas de trabajo y casi todos los del panel, que cambia poco. Medir de nuevo cerca del 01/11/2026.

### 3. Verificación por muestra

`bun run verificar` recorre todas las páginas en 6 anchos: hoy son unas 4.900 cargas, y crecen con cada página. Como las plantillas son pocas, alcanza con verificar todas las páginas fijas y una muestra de cada tipo de entidad: la de nombre más largo, la de más filas y una al azar. Esto no gasta Cloudflare (corre en GitHub, que es gratis para repos públicos), pero acorta la CI y la espera antes de cada PR.

### 4. Menos imágenes para compartir

- **Incrementales:** generar solo las de las páginas cuyos datos cambiaron. `scripts/seo.ts` ya calcula un hash del contenido de cada imagen (lo usa en `?v=`). Con una caché de imágenes por hash entre builds, se dibujan solo las nuevas.
- **Por sección, si hace falta:** cuando una sección pase de miles de páginas (las leyes), sus páginas pueden usar una imagen de la sección con la cifra general. Es la mitad de los archivos de esa sección.

### 5. Build en GitHub Actions, sin builds de Cloudflare

El workflow de datos ya compila la web completa para comprobarla, y después Cloudflare la vuelve a compilar. Si se publica desde GitHub con `wrangler pages deploy` (Direct Upload), Cloudflare no hace ningún build y el cupo de 500 deja de importar. Cuesta un proyecto de Pages nuevo, porque uno conectado a git no se puede pasar a Direct Upload, y mover el dominio y los bindings (D1, secretos) a ese proyecto.

### 6. Funciones y D1 (hecha)

Hecha el 18/10/2026, después de un rastreo de AhrefsBot: la función guarda las lecturas públicas de la API (`max-age=60`) en la Cache API del centro de datos, así que D1 se lee una vez por minuto, sin importar cuánta gente o cuántos robots entren. La función se sigue invocando en cada pedido.

Además, una Cache Rule de la zona («API pública de lectura», 18/10/2026) guarda `GET /api/pedidos/stats` y `/api/registro*` 60 s en el borde: lo cacheado ni siquiera invoca la función.

Consumo medido el 18/10/2026 (`pagesFunctionsInvocationsAdaptiveGroups`): entre 30 y 185 invocaciones por día, contra un cupo de 100.000.

## Lo que no hacemos

- **Pasar páginas estáticas a Workers para ahorrar archivos.** Cada visita gastaría un pedido del cupo diario, cuando hoy sale gratis. Antes van las etapas 4 y 5 y, si igual no alcanza, el plan de USD 5 por mes (100.000 archivos).

## Preguntas abiertas

- La etapa 5, ¿vale la migración del proyecto? Depende de cuántos builds queden después de la etapa 2 (medir cerca del 01/11/2026).
