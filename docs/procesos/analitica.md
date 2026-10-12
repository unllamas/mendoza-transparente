# Analítica

Para entender cómo se usa el sitio: qué páginas se visitan, qué se busca y qué se toca. El código está en `apps/web/src/analytics.ts`.

## Proveedor y privacidad

- **PostHog**, en modo sin cookies (`persistence: "memory"`): no guarda nada en el navegador, así que no hace falta banner de cookies. Tampoco graba sesiones ni guarda la IP (`ip: false`).
- **Activación:** solo funciona si existe `VITE_POSTHOG_KEY` (y opcionalmente `VITE_POSTHOG_HOST`, por defecto `https://us.i.posthog.com`) en las variables de entorno del build de Cloudflare Pages. Sin clave, por ejemplo en desarrollo, no se carga ni se envía nada.
- **Cambiar de proveedor:** se edita solo `analytics.ts`. El resto del sitio llama a `track()` y no sabe quién recibe los eventos.
- **En el proyecto de PostHog:** activar "Discard client IP data" y desactivar la grabación de sesiones.
- Para depurar en desarrollo: `VITE_TRACK_DEBUG=1 bun run dev` imprime cada evento en la consola.

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
   - `Buscador` manda `search.query` cuando la persona deja de escribir.

**Nombres:** `área.elemento.acción`, en inglés y snake_case. No se mandan datos personales: ni correos ni números de trámite.

## Catálogo

La descripción en español de cada evento vive en `apps/web/src/analytics-catalog.ts`. Al sumar un `data-track` o un `track()`, se agrega ahí su evento.

**`bun run posthog-sync`** (necesita `.env.posthog` en la raíz, que no se versiona):
- Copia las descripciones del catálogo a PostHog.
- Crea o actualiza el tablero **"Uso de Mendoza Transparente"** y sus gráficos, con título y descripción en español.
- Se puede correr cuantas veces haga falta. Los eventos que PostHog todavía no recibió se describen en la corrida siguiente a su primera aparición.

Proyecto de PostHog: "Mendoza Transparente" (cuenta propia, separada de cualquier otra organización), con zona horaria de Mendoza, IP descartadas, sin grabación de sesiones y con el tráfico de `localhost` excluido de los gráficos.

Resumen de los eventos:

| Evento | Dónde | Propiedades |
|---|---|---|
| `$pageview` | Toda ruta | `path` |
| `nav.mobile_menu.toggle`, `nav.group.toggle` | Menú | `open`, `group` |
| `footer.report_error` | Pie | — |
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
| `participation.{request,answer,bug,data_suggestion}.{success,error}` | Participá: envíos | `status` |
| `<id>.click` (`pedido-registrar.click`, etc.) | Participá: botones de envío | — |

**Embudos sugeridos en PostHog:**
- `missing_data.request.open` → `.copy` → `.official_form` → `participation.request.success`: de leer un dato que falta a presentar el pedido.
- `participation.request.success` → `participation.answer.success`: cuántos vuelven a contar la respuesta.

## Mostrar números en el sitio

Los números públicos de participación (pedidos, respuestas) salen de nuestra propia base (`/api/pedidos/stats`, ver [Participación](participacion.md)), no del proveedor de analítica. Si más adelante se quieren mostrar visitas, PostHog permite compartir un tablero público por link.
