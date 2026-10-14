# Participación ciudadana

Página `/participar`. Ahí la gente puede:
- Registrar los pedidos de acceso a la información que presentó (Ley 9070), con su número de trámite.
- Contar qué le respondió el Estado.
- Reportar errores del sitio.
- Sugerir datos.
- Proponer una foto de paisaje para el sitio (ver [Fotos de paisaje](diseno.md#fotos-de-paisaje)).

Con eso publicamos cuántos pedidos hay por dato y cuánto responde el Estado (en la página y en cada hoja de "Lo que no se publica") y, después de revisar cada envío, el **registro público** en `/registro`. Lo que llega se revisa en el **panel interno** (ver [Panel interno](panel.md)).

## El registro público (`/registro`)

Muestra los pedidos y las correcciones que alguien del equipo revisó y marcó para publicar. Nada se publica solo.

| Se publica | No se publica nunca |
|---|---|
| Código público (`P-…`, `R-…`), dato pedido, organismo, fechas, estado y días transcurridos | Correo, número de trámite, IP (ni su hash) |
| Un **resumen público** escrito por el equipo | Lo que la persona escribió tal cual (`detalle`, `message`, resumen de la respuesta) |
| El link a la respuesta, si el equipo lo revisó | Notas internas y auditoría |

- Las columnas que salen se eligen una por una en `publicRegistry` (`packages/participation/src/store.ts`): agregar una columna a la tabla no la publica.
- Cada envío se abre con `?codigo=P-…`; si no está publicado, la página lo dice sin contar si existe.
- Los errores se publican solo resueltos y con resumen; las fotos y los envíos "otro" no se publican.

## Código y clave de cada pedido

Al registrar un pedido, la API devuelve un **código** (`P-` + 8 caracteres al azar) y una **clave** (20 caracteres, 100 bits al azar) que se muestran una sola vez. De la clave se guarda solo su hash.

- **Con código y clave,** la respuesta que cuenta la persona se aplica en el momento.
- **Solo con el número de trámite** (pedidos registrados antes de las claves, o una clave perdida), la respuesta queda **pendiente** y el equipo la aplica o la rechaza desde el panel. Antes, cualquiera que supiera un número de trámite podía cambiar el estado del pedido.
- Los errores y sugerencias también devuelven su código (`R-…`), para seguirlos en el registro.

## Reportar un error desde cualquier página

Arriba del pie de todas las páginas (menos `/participar`) hay una franja «¿Viste un dato mal en esta página?» con el botón **Reportar un error** (`apps/web/src/components/report-error.tsx`). Lleva al formulario de error de `/participar` con todo lo que se puede completar solo:

| Parámetro | Qué lleva |
|---|---|
| `tipo=error` | Abre el formulario de error. |
| `pagina` | La dirección completa, con sus parámetros: si había una hoja abierta (`?proceso=`, `?proveedor=`) o una búsqueda, queda en el reporte. |
| `titulo` | El título de la página, para que se lea de qué se trata sin abrir el link. |
| `cita` | El texto que la persona marcó en la página antes de tocar el botón (hasta 300 caracteres). |

En el formulario la persona elige además **qué tipo de error** es (un dato mal, desactualizado, que falta, un link roto, algo que se ve mal u otra cosa) y puede dejar el link a la fuente con el dato correcto. Como la API guarda un solo texto por reporte, todo eso va al principio del mensaje: `[Tipo · Título] mensaje | Texto marcado: «…» | Dato correcto en: https://…`.

Cualquier link puede armar el mismo pedido: `/participar?tipo=error&pagina=/deuda`.

## Cómo funciona

- **Lógica:** paquete `@mt/participation` (`packages/participation/src/`), compartido por la web y el panel:
  - `public-api.ts`: la API pública. Valida, aplica el anti-spam y el límite de envíos.
  - `store.ts`: todas las consultas a la base.
  - `validation.ts`, `secrets.ts` y `privacy.ts`: normalización de lo que llega, códigos y claves, y la detección de datos personales.
  - `panel-api.ts` y `access.ts`: el panel y su login (ver [Panel interno](panel.md)).
- **Producción:** Cloudflare Pages Function `apps/web/functions/api/[[route]].ts` sobre una base **D1**. El esquema está en `packages/participation/migrations/`. Sin `TURNSTILE_SECRET` o sin `IP_SALT`, los envíos responden 503 en vez de saltearse los controles.
- **Desarrollo:** el mismo código corre como middleware de Vite (`vite.config.ts`) sobre un SQLite local en `.dev/participation.sqlite`, compartido con el panel y con envíos de ejemplo. Para empezar de cero, se borra el archivo.
- **Pruebas:** `bun test packages/participation`. Cubren lo que no se puede publicar, la clave, el CSRF del panel y el login.

| Endpoint | Qué hace |
|---|---|
| `POST /api/pedidos` | Registra un pedido: `itemId` (id de `no-publicado.yaml` u `otro`), `agency`, `filedOn`, `filingNumber`, `detail`, `email`. Rechaza el mismo trámite repetido para el mismo dato. Devuelve `code` y `key`. |
| `POST /api/pedidos/respuesta` | Con `code` y `key`, aplica la respuesta (200). Con solo `filingNumber`, la deja pendiente de revisión (202). `status` puede ser `respondido`, `parcial`, `denegado` o `sin_respuesta`; lleva además fecha (no anterior a la presentación), resumen y link. |
| `POST /api/feedback` | Error o sugerencia: `kind` (`error`, `dato` u `otro`), `message`, `page` y `email`. Las fotos propuestas llegan con `kind = 'otro'` y `page = 'foto'`, con el link en la primera línea del mensaje. Devuelve `code`. |
| `GET /api/pedidos/stats` | Totales por dato: pedidos, respondidos, negados y vencidos, sin lo marcado como spam o descartado. Un pedido vence a los 21 días corridos sin respuesta, que equivalen aproximadamente a los 15 hábiles de la ley. Cache de 60 segundos. |
| `GET /api/registro` | El registro público: pedidos y correcciones publicados. Cache de 60 segundos. |
| `GET /api/registro/<código>` | Un envío publicado; 404 si no existe o no está publicado (la misma respuesta para los dos casos). |

## Protección

- **Turnstile** de Cloudflare (gratis, sin captchas molestos): `VITE_TURNSTILE_SITE_KEY` en el build y el secreto `TURNSTILE_SECRET` en la función. Sin secreto (desarrollo), no se verifica.
- **Campo trampa** (`website`), invisible: si un bot lo completa, el envío se descarta sin avisar.
- **Límite de envíos:** 10 por hora por conexión. La IP se guarda solo como hash con sal (`IP_SALT`).
- **Validación:** largo máximo en todos los campos; se borran los caracteres invisibles y los que invierten la dirección del texto. Los números de trámite solo pueden tener letras, números y separadores; las fechas, desde 2016 hasta hoy; los links, solo http(s).
- **Datos personales:** el correo es opcional y nunca se devuelve. No se pide DNI. No se publican los números de trámite. Los hash de IP se borran a los 30 días (solo hacen falta para el límite por hora). Si alguien pide que borremos lo que mandó (Ley 25.326), se anonimiza desde el panel.

## Puesta en marcha (una vez)

```bash
cd apps/web
wrangler d1 create mendoza-transparente          # copiar el database_id en wrangler.toml
wrangler d1 migrations apply mendoza-transparente --remote   # también después de sumar una migración
wrangler pages secret put TURNSTILE_SECRET
wrangler pages secret put IP_SALT                # un texto largo al azar
```

Además:
- Crear el widget de Turnstile en el panel de Cloudflare y cargar `VITE_TURNSTILE_SITE_KEY` en las variables del proyecto de Pages.
- Vincular la base D1 al proyecto de Pages con el nombre `DB` (Settings → Bindings).

## Revisar lo que llega

Desde el panel interno (ver [Panel interno](panel.md)): bandeja, publicación, respuestas pendientes, estadísticas y auditoría. Si el panel no está disponible, las consultas de siempre siguen sirviendo:

```bash
wrangler d1 execute mendoza-transparente --remote --command "SELECT code, created_at, kind, page, message FROM feedback WHERE review_status = 'new' ORDER BY created_at DESC"
wrangler d1 execute mendoza-transparente --remote --command "SELECT item_id, estado, COUNT(*) FROM pedidos GROUP BY 1, 2"
```

- Un dato que se sugiere y no está publicado va a `data/curado/no-publicado.yaml`.
- Los pedidos registrados también sirven para completar el campo `pedidos` de cada entrada de ese archivo.
