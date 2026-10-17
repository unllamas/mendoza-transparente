# Analítica

Para entender cómo se usa el sitio: qué páginas se visitan, qué se busca y qué se toca. El código está en `apps/web/src/analytics.ts`.

## Proveedor y privacidad

- **PostHog**, en modo sin cookies (`cookieless_mode: "always"`): no guarda nada en el navegador, así que no hace falta banner de cookies. Tampoco graba sesiones.
  - **Cómo cuenta visitantes:** el servidor de PostHog arma el identificador con `hash(proyecto, sal diaria, IP, navegador, dominio)` y después borra la IP. La sal cambia todos los días: la misma persona cuenta como una por día. En semanas o meses, los visitantes únicos quedan inflados, y dos personas con la misma red y el mismo navegador pueden contar como una. Por lo mismo, «Returning visitors» en Web analytics queda siempre en cero: todo visitante es «nuevo» cada día. Para medir quién vuelve hace falta consentimiento (plan en `docs/planes/consentimiento-de-cookies.md`).
  - **Requisito en el proyecto:** "Cookieless server hash mode" activado (`cookieless_server_hash_mode = 2`, en Project settings > Web analytics). Sin eso, PostHog descarta los eventos.
  - **No usar `ip: false`:** el hash necesita la IP; los eventos sin IP se descartan.
  - **Sin ubicación:** en este modo PostHog no agrega país ni ciudad, así que el mapa del panel queda vacío.
  - **Se carga tarde a propósito:** cuando la página terminó de cargar y el navegador está libre. Los eventos de antes quedan en cola.
  - **Antes** se usaba `persistence: "memory"`, que contaba cada carga de página como un visitante nuevo. Los datos hasta el 12 oct 2026 están inflados por eso.
- **Activación:** solo funciona si existe `VITE_POSTHOG_KEY` (y opcionalmente `VITE_POSTHOG_HOST`, por defecto `https://us.i.posthog.com`) en las variables de entorno del build de Cloudflare Pages. Sin clave, por ejemplo en desarrollo, no se carga ni se envía nada.
- **Cambiar de proveedor:** se edita solo `analytics.ts`. El resto del sitio llama a `track()` y no sabe quién recibe los eventos.
- **En el proyecto de PostHog:** activar "Discard client IP data" y desactivar la grabación de sesiones.
- Para depurar en desarrollo: `VITE_TRACK_DEBUG=1 bun run dev` imprime cada evento en la consola.

## Mapa de calor, scroll y clics sin respuesta

Para saber qué contenido se lee, qué se saltea y qué se toca sin que responda. Nada de esto graba la sesión.

- **Mapa de calor** (`capture_heatmaps: true`): guarda las coordenadas de cada clic, incluidos los clics repetidos de frustración, y la posición del mouse por página. Se mira con la barra de PostHog sobre el sitio: en PostHog, **Toolbar** → abrir `mendoza-transparente.com` → **Heatmap**, que superpone los clics y la profundidad de scroll a la página real. Funciona solo en dominios autorizados (Project settings > Toolbar).
- **Profundidad de scroll:** PostHog la agrega sola al `$pageleave` y al `$pageview` siguiente (`$prev_pageview_max_scroll_percentage`, `$prev_pageview_max_content_percentage`, `$prev_pageview_duration`, con la página en `$prev_pageview_pathname`). Se resume en el gráfico «Hasta dónde baja la gente en cada página» del tablero.
- **Clics sin respuesta** (`capture_dead_clicks: true`): `$dead_click` cuando alguien toca algo que parece tocable y no pasa nada. Se resume por página en el gráfico «Clics sin respuesta» del tablero. Para ignorar un elemento, se le pone la clase `ph-no-deadclick`.
- **Cómo leer el scroll:** «contenido visto» es la parte de la página que llegó a estar en pantalla; una página corta se ve entera sin scrollear. Una página con mucho tráfico, poco contenido visto y pocos segundos indica que la parte de arriba no invita a seguir.
- **Ojo con las pruebas propias:** las consultas SQL no aplican el filtro de cuentas de prueba; las páginas en las que se está trabajando quedan infladas.

## Errores

Todo error del sitio llega a PostHog como `$exception` y se ve agrupado en **Error tracking**.

- **Automáticos:** la captura de excepciones de PostHog (`capture_exceptions: true` en `src/analytics.ts`, y `autocapture_exceptions_opt_in` en el proyecto) toma los errores no capturados y las promesas rechazadas.
- **Antes de que cargue PostHog** (se carga diferido): `src/analytics.ts` los guarda en cola y los envía al cargar, con `early: true`.
- **Los que ataja React:** si una página falla al cargar o al mostrarse, el router muestra `RouteError` (`src/components/route-states.tsx`), que la reporta con `captureError(error, { path, boundary: "route" })`. El resto del sitio sigue andando, y la persona puede reintentar o reportarlo.
- **Para reportar uno a mano:** `captureError(error, props)` de `src/analytics.ts`. Nunca `console.error` solo: en producción nadie lo ve.
- **Source maps:** se publican con el build, así que el error se ve con la línea exacta del código.
- **Direcciones sin página:** el router muestra `RouteNotFound`, con el camino de vuelta.
## Cómo se mandan los eventos

1. **Páginas vistas:** `$pageview` en cada cambio de ruta (`layout.tsx`).
2. **Atributos en el HTML:** cualquier elemento con `data-track="evento"` manda ese evento al hacer clic, con cada `data-track-*` como propiedad. Es la forma preferida para botones y enlaces nuevos:
   ```tsx
   <button id="pedido-copiar" data-track="missing_data.request.copy" data-track-item={item.id}>
   ```
   Los botones importantes llevan además un `id` estable, que sirve para las pruebas y para filtrar en la herramienta.
3. **Automáticos, sin atributos:**
   - `link.outbound`: enlaces a otros sitios, como fuentes oficiales, PDF o ARCA.
   - `data.download`: descargas de CSV, JSON y XLSX propios.
4. **Desde componentes:**
   - `Sheet` manda `sheet.open` y `sheet.close` (con los segundos que estuvo abierta).
   - `Segmented` manda `<trackId>.change`.
   - `ListSearch` (`src/components/list-search.tsx`) manda `search.query` cuando la persona deja de escribir.

**Nombres:** `área.elemento.acción`, en inglés y snake_case. No se mandan datos personales: ni correos ni números de trámite.

## Catálogo

La descripción en español de cada evento vive en `apps/web/src/analytics-catalog.ts`. Al sumar un `data-track` o un `track()`, se agrega ahí su evento.

**Eventos que se dejan de enviar:** no se borran del catálogo. Pasan al final, con la etiqueta `en desuso` y una descripción que empieza con «Ya no se envía» y dice qué los reemplaza, porque PostHog conserva su historia. Si `posthog-sync` avisa de eventos sin descripción, es que falta uno nuevo o uno en desuso.

**`bun run posthog-sync`** (necesita `.env.posthog` en la raíz, que no se versiona):
- Copia las descripciones del catálogo a PostHog.
- Crea o actualiza el tablero **"Uso de Mendoza Transparente"** y sus gráficos, con título y descripción en español.
- Se puede correr cuantas veces haga falta. Los eventos que PostHog todavía no recibió se crean igual, con su descripción.

Proyecto de PostHog: "Mendoza Transparente" (cuenta propia, separada de cualquier otra organización), con zona horaria de Mendoza, IP descartadas, sin grabación de sesiones y con el tráfico de `localhost` excluido de los gráficos.

## MCP de PostHog

Para consultar PostHog desde el agente se usa el servidor MCP **`posthog-mendoza`**, que se configura en la máquina de cada persona y no en el repo, porque lleva la clave:

```sh
set -a && . ./.env.posthog && set +a
claude mcp add --transport http -s user posthog-mendoza https://mcp.posthog.com/mcp \
  --header "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  --header "x-posthog-project-id: $POSTHOG_PROJECT_ID"
```

- Usa la misma clave personal de `.env.posthog` y queda fijo en el proyecto "Mendoza Transparente": no puede cambiar de proyecto.
- Va con alcance `user` para que funcione también en los worktrees, que tienen otra ruta. El nombre lo distingue de otros conectores de PostHog que tenga la persona.
- Cualquier otro conector de PostHog (por ejemplo, uno llamado `posthog` a secas) puede ser de otra organización: **no se usa** para este proyecto. Ante la duda, `project-get` tiene que devolver "Mendoza Transparente".
- Se aplica al abrir una sesión nueva de Claude Code. Para verificarlo: `claude mcp list | grep posthog-mendoza`.

Resumen de los eventos:

| Evento | Dónde | Propiedades |
|---|---|---|
| `$pageview` | Toda ruta | `path` |
| `nav.mobile_menu.toggle`, `nav.mobile_menu.close`, `nav.group.toggle` | Menú | `open`, `group` |
| `footer.report_error` | Franja «Reportar un error» arriba del pie | `path` |
| `footer.friend_site.open` | Link a un sitio amigo en el pie | `site`, `href` |
| `sheet.open` / `sheet.close` | Toda hoja modal | `sheet`, `seconds` |
| `search.query` | Buscadores | `search`, `query` |
| `link.outbound` / `data.download` | Todo enlace | `href`, `host`, `text` / `file` |
| `missing_data.theme.toggle` / `.clear` | Lo que no se publica | `theme`, `active` |
| `missing_data.request.open` | Abrir un pedido | `item`, `theme` |
| `missing_data.request.copy` | Copiar el pedido | `item`, `edited` |
| `missing_data.request.official_form` | Ir al formulario oficial | `item` |
| `missing_data.request.register_filing` | Ir a registrar el trámite | `item` |
| `missing_data.request.where_we_looked`, `missing_data.law.open` | Enlaces de la hoja | `item` |
| `law.official_pdf.open`, `law.full_text.toggle` | Página de una ley | `law` |
| `participation.form.change` | Participá: pestaña | `value` |
| `participation.{request,answer,bug,data_suggestion,photo}.{success,error}` | Participá: envíos | `status` |
| `<id>.click` (`pedido-registrar.click`, etc.) | Participá: botones de envío | — |
| `participation.credentials.copy` | Participá: copiar el código o la clave recibidos | — |
| `participation.answer.toggle_key` | Contar la respuesta: con clave o con número de trámite | — |
| `registry.view.change` | Registro: pedidos o correcciones | `value` |
| `registry.request.open`, `registry.correction.open` | Registro: abrir un envío publicado | `item` |
| `registry.answer.open`, `registry.correction.page` | Registro: ver la respuesta del Estado o la página corregida | — |
| `landscape.credit`, `landscape.propose` | Foto de paisaje: crédito y «Proponé tu foto» | `photo` |

**Embudos sugeridos en PostHog:**
- `missing_data.request.open` → `.copy` → `.official_form` → `participation.request.success`: de leer un dato que falta a presentar el pedido.
- `participation.request.success` → `participation.answer.success`: cuántos vuelven a contar la respuesta.

El panel interno (`apps/panel`) no manda eventos a PostHog: lo que hace el equipo queda en su propia auditoría (ver [Panel interno](panel.md)).

## Mostrar números en el sitio

Los números públicos de participación (pedidos, respuestas) salen de nuestra propia base (`/api/pedidos/stats`, ver [Participación](participacion.md)), no del proveedor de analítica. Si más adelante se quieren mostrar visitas, PostHog permite compartir un tablero público por link.
