# Panel interno

`apps/panel` es la app del equipo para revisar lo que llega por [Participá](participacion.md), decidir qué se publica en el registro público (`/registro`) y medir cuánto responde el Estado. Corre en su propio proyecto de Cloudflare Pages (`mendoza-transparente-panel`, en `panel.mendoza-transparente.com`), usa la misma base D1 que el sitio y está entero detrás de **Cloudflare Access**.

| Pantalla | Para qué |
|---|---|
| Inicio | Lo pendiente: nuevos, respuestas para revisar y pedidos vencidos |
| Bandeja | Lista y detalle, como un correo. Filtros por estado de revisión, tipo, texto y fechas, todos en la URL (`?estado=&tipo=&q=&desde=&hasta=&envio=`). Teclado: `j`/`k` moverse, `e` resolver, `#` descartar, `/` buscar. Exporta CSV |
| Estadísticas | Pedidos por organismo (respondidos, negados, vencidos y días hasta la respuesta) y envíos por mes |
| Auditoría | Cada cambio hecho desde el panel, con quién lo hizo |

## Cómo se entra (login)

Con **Cloudflare Access** (Zero Trust, gratis hasta 50 personas). La persona abre el panel, escribe su correo, le llega un código de 6 dígitos y entra. No hay contraseñas que guardar ni código de sesiones propio.

1. Access corta el pedido antes de que llegue a Pages: sin sesión no se descarga ni el HTML.
2. Con sesión, Access agrega a cada pedido un token firmado (`Cf-Access-Jwt-Assertion`).
3. La función del panel (`apps/panel/functions/api/[[route]].ts`) **verifica ese token** con `verifyAccess` (`packages/participation/src/access.ts`):
   - firma RS256 con las claves públicas del equipo de Access;
   - emisor (`iss`), audiencia (`aud`) de la aplicación y vencimiento;
   - el correo tiene que estar en `PANEL_EMAILS`.
4. Si algo falla, responde 401 y el panel muestra «Tu sesión venció» con el botón para volver a entrar.

**Por qué se verifica el token si ya está Access:** el mismo proyecto también responde en `*.pages.dev` y en cada despliegue de vista previa, que pueden no estar detrás de Access, y ahí cualquiera puede inventar cabeceras. Con la verificación, sin un token válido no se lee nada, sea cual sea la dirección.

**Salir:** el link «Salir» lleva a `/cdn-cgi/access/logout`.

## Puesta en marcha (una vez)

Ya hecha: ver el estado en la sección siguiente. Para rehacerla en otra cuenta:

1. **Proyecto de Pages:** `mendoza-transparente-panel`, conectado al repositorio, con directorio `apps/panel`, comando de build `cd ../.. && bun install --frozen-lockfile && cd apps/panel && bunx vite build` y salida `dist`. Vincular la base D1 `mendoza-transparente` como `DB`.
2. **Dominio:** `panel.mendoza-transparente.com` como dominio propio del proyecto.
3. **Zero Trust → Access → Applications → Add → Self-hosted:**
   - Dominios: `panel.mendoza-transparente.com`, `mendoza-transparente-panel.pages.dev` y `*.mendoza-transparente-panel.pages.dev` (las vistas previas).
   - Duración de la sesión: 24 horas.
   - Política «Equipo»: *Allow*, *Emails* con la lista del equipo.
   - Métodos de login: *One-time PIN* (código al correo). Opcional: Google.
   - Una segunda aplicación con política *Bypass* para `panel.mendoza-transparente.com/.well-known/acme-challenge/*`, para que Pages pueda validar el dominio.
   - Copiar el **Application Audience (AUD) Tag**.
4. **Secretos del proyecto del panel** (Settings → Variables, como *secret*):
   - `ACCESS_TEAM_DOMAIN`: `<equipo>.cloudflareaccess.com`.
   - `ACCESS_AUD`: el AUD del paso 3.
   - `PANEL_EMAILS`: los mismos correos de la política, separados por comas.
5. **Migración:** `cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote`. La `0002` agrega lo que usa el panel. Se aplica **justo antes de publicar** el código que la usa: después, la API pública vieja guardaría envíos sin código público; antes, la nueva se rompe.
6. **Probar:**
   - en una ventana privada, `panel.mendoza-transparente.com` pide el correo;
   - `curl https://mendoza-transparente-panel.pages.dev/api/panel/me` responde 401;
   - con un correo que no está en `PANEL_EMAILS`, Access deja pasar pero la API responde 401.

**Sumar o sacar a alguien:** cambiar la política de Access **y** `PANEL_EMAILS`. Para cortar el acceso en el momento, además: Zero Trust → My Team → Users → *Revoke*.

## El proyecto en Cloudflare: estado y cómo consultarlo

**Estado al 14/10/2026** (cuenta personal de Cloudflare, configurado por API con el token de `.env.cloudflare`): **andando**.

| Qué | Valor |
|---|---|
| Proyecto de Pages | `mendoza-transparente-panel`, separado del sitio (`mendoza-transparente`) |
| Repositorio | `unllamas/mendoza-transparente`, directorio `apps/panel`, producción desde `main`, vistas previas de todas las ramas |
| Build | `cd ../.. && bun install --frozen-lockfile && cd apps/panel && bunx vite build`, salida `dist`. Las variables de build y el binding `DB` salen de `apps/panel/wrangler.toml` |
| Direcciones | `panel.mendoza-transparente.com` (propia, CNAME con proxy a `mendoza-transparente-panel.pages.dev`) y `mendoza-transparente-panel.pages.dev` |
| Base | La misma D1 que el sitio (`mendoza-transparente`, binding `DB`), con la migración `0002` aplicada |
| Equipo de Zero Trust | `flat-bush-923e.cloudflareaccess.com`, plan Free |
| Login | Access con *One-time PIN* (código al correo). El login con cuenta de Cloudflare también está activo, pero solo sirve a quien es miembro de la cuenta |
| Aplicación de Access | «Panel Mendoza Transparente», con los tres dominios, sesión de 24 h y política «Equipo» (*Allow* por correo) |
| Ruta sin login | Aplicación aparte «Panel: validación del certificado» con política *Bypass* para `panel.mendoza-transparente.com/.well-known/acme-challenge/*`. Sin ella, Access bloquea la validación HTTP del dominio en Pages y el dominio queda pendiente. No sirve nada del panel |
| Secretos | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `PANEL_EMAILS`, en producción y en vistas previas |
| Quién entra | El dueño de la cuenta. La lista está en la política «Equipo» y en `PANEL_EMAILS`, no en el repositorio |

El token de `.env.cloudflare` tiene, además de Pages y D1:
- *Account → Access: Apps and Policies → Edit*;
- *Account → Access: Organizations, Identity Providers, and Groups → Edit*;
- *Zone → DNS → Edit*, para `mendoza-transparente.com`.
- *Zone → Single Redirect → Edit*, para `mendoza-transparente.com` (la redirección de `www`, ver [Web](web.md#publicar)).

**Indexación:** el panel no aparece en buscadores. Access manda a su login a cualquiera sin sesión, robots incluidos, y además el panel tiene `noindex` (cabecera y meta) y un `robots.txt` que bloquea todo.

**Si cambian los secretos**, hay que volver a publicar (`POST $B/deployments`): Pages los toma al desplegar.

**Consultas útiles** (desde la raíz de la copia de trabajo, sin imprimir el token):

```bash
set -a && . ./.env.cloudflare && set +a
B="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/mendoza-transparente-panel"
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
curl -s -H "$H" "$B" | jq '.result | {domains, build_config, source: .source.config}'   # configuración
curl -s -H "$H" "$B/deployments?per_page=3" | jq '.result[] | {id, branch: .deployment_trigger.metadata.branch, stage: .latest_stage}'
curl -s -H "$H" "$B/deployments/<id>/history/logs" | jq -r '.result.data[].line'          # logs de un build
curl -s -X POST -H "$H" "$B/deployments" -F branch=main                                  # volver a publicar
curl -s -H "$H" "$B/domains" | jq '.result[] | {name, status}'                           # estado del dominio
```

- Para cambiar el build o las ramas: `PATCH $B` con `build_config` o `source.config`.
- Para las variables de build y el binding `DB`: editar `apps/panel/wrangler.toml`. Con ese archivo, Pages ignora lo que se cargue en el dashboard, salvo los secretos.

## Cómo se revisa un envío

1. **Leer lo que llegó.** El bloque «Lo que llegó» es privado y nada de eso se publica tal cual.
2. **Elegir el estado de revisión:** Nuevo, En revisión, Resuelto, Descartado o Spam. Lo descartado y el spam no cuentan en ninguna cifra, ni pública ni interna.
3. **Pedidos:**
   - cargar el **organismo con su nombre oficial** (agrupa las estadísticas y es lo que se publica);
   - corregir el estado si hace falta;
   - aplicar o rechazar las **respuestas para revisar**, que son las que llegaron sin clave. Se aplican solo si se pueden confirmar, por ejemplo con el link a la respuesta.
4. **Publicar:**
   - escribir el **resumen público** (una o dos oraciones, sin nombres de personas);
   - prender «Publicar en el registro»;
   - mirar la vista previa, que muestra exactamente lo que va a salir, y guardar.
   - Reglas que controla la API:
     - los reportes se publican solo resueltos y con resumen;
     - las fotos y los envíos «otro» no se publican;
     - si el resumen parece tener un correo, un teléfono, un DNI o un CUIL, hay que confirmarlo.
5. **Si la persona pide que se borren sus datos** (Ley 25.326): «Borrar datos personales», escribiendo el código para confirmar.
   - Se borran el correo, los textos, el número de trámite, el link, la clave, las notas y el hash de IP, y el envío se despublica.
   - Quedan el dato pedido, el organismo, las fechas y el estado.

## Seguridad: amenazas y cómo se cubren

| Riesgo | Cómo se cubre |
|---|---|
| Entrar al panel sin permiso por `*.pages.dev` o una vista previa | La API verifica el token de Access (firma, `iss`, `aud`, vencimiento) y la lista `PANEL_EMAILS`. Sin configuración no entra nadie |
| Token inventado o con `alg: none` | Solo RS256 con las claves del equipo. Si llega un `kid` desconocido, las claves se vuelven a pedir a lo sumo una vez por minuto |
| Alguien que pasa Access pero no es del equipo (una política mal armada) | La lista `PANEL_EMAILS` es una segunda llave, independiente de Access |
| CSRF: otra página hace que un navegador con sesión cambie cosas | Las escrituras exigen el `Origin` del panel y `content-type: application/json`, que un formulario de otro sitio no puede mandar |
| XSS guardado: un envío con HTML o scripts | React escapa todo, nunca se usa `dangerouslySetInnerHTML`. Solo se aceptan links http(s), y la CSP del panel (`public/_headers`) no deja correr scripts de otro origen ni inline |
| Texto engañoso (caracteres invisibles, inversión de dirección) | `validation.ts` los borra al recibir |
| Links de terceros que filtran la dirección del panel o abren ventanas | `rel="noreferrer noopener nofollow"` y `Referrer-Policy: no-referrer` |
| Publicar datos personales | Nada se publica solo. El texto original no se publica nunca, solo el resumen del equipo. `publicRegistry` elige los campos uno por uno. `privacy.ts` avisa si hay correos, teléfonos, DNI o CUIL. Hay pruebas que fallan si sale un correo o un trámite |
| Cambiar el estado de un pedido ajeno (antes alcanzaba con saber el número de trámite) | Código y clave por pedido (100 bits, se guarda solo el hash). Sin clave, la respuesta queda para revisar |
| Adivinar códigos para ver lo que todavía no se publicó | Códigos al azar de 40 bits, no correlativos. Un código no publicado responde lo mismo que uno inexistente |
| Robots y spam | Turnstile, campo trampa y 10 envíos por hora por conexión (incluidas las respuestas), más la regla de Cloudflare sobre `/api/*` |
| Producción sin los secretos de Turnstile o de la sal | Los envíos responden 503 en vez de saltearse los controles |
| Inyección de fórmulas al abrir el CSV exportado | Las celdas que empiezan con `= + - @` llevan `'` adelante. El CSV no incluye correos ni trámites, y cada exportación queda en la auditoría |
| Que el panel aparezca en buscadores o dentro de un iframe | `noindex` (meta, cabecera y `robots.txt`), `X-Frame-Options: DENY` y `frame-ancestors 'none'` |
| Cambios sin rastro | Cada escritura deja una fila en `audit_log`. El panel no tiene forma de borrarla |
| Datos que se guardan de más | Los hash de IP se borran a los 30 días. El correo es opcional |
| Inyección SQL | Todas las consultas van con parámetros. Los nombres de tabla y columna salen de listas fijas |

**Lo que queda afuera, a propósito:**
- La lista del panel incluye el texto de los envíos, porque es para el equipo.
- Responder por correo desde el panel requiere un servicio de envío y avisarlo en el formulario: queda para más adelante.
- `POST /api/pedidos/respuesta` con un número de trámite inexistente responde 404, así que confirma si un trámite está registrado. Se eligió así para que un error de tipeo no pase desapercibido, y está limitado por el límite de envíos.

## Casos límite

- **Un mismo trámite para varios datos:**
  - se registra una vez por dato, cada uno con su código y su clave;
  - una respuesta con solo el número de trámite queda pendiente en todos;
  - con código y clave, se aplica solo al pedido de ese código.
- **El mismo trámite y el mismo dato, registrados por dos personas:** el segundo intento recibe 409. No se le da el código del primero.
- **Fechas:**
  - la respuesta no puede ser anterior a la presentación;
  - ninguna fecha puede ser futura ni anterior a 2016.
  - El «hoy» del servidor está en UTC: a la noche de Mendoza ya es mañana, lo que solo puede aceptar una fecha de un día más.
- **El plazo:**
  - la ley da 15 días hábiles; se cuenta como vencido a los 21 corridos, sin feriados ni prórrogas;
  - el sitio lo dice así («contamos como vencido…»);
  - el equipo puede marcar «sin respuesta» o corregir el estado.
- **Un dato que se saca de `no-publicado.yaml`:**
  - los pedidos guardan el id, así que no se pierden;
  - el sitio muestra el id en lugar del título y no ofrece «Pedir este dato».
  - Conviene no borrar ids con pedidos.
- **Pedidos de «otro dato»:** no tienen título; el resumen público hace de título y es obligatorio para publicarlos.
- **El mismo organismo escrito de varias formas:** el nombre oficial que carga el equipo agrupa las estadísticas y es el que se publica.
- **Despublicar:** el registro tiene 60 segundos de caché. Un link compartido a un envío despublicado muestra «No hay ningún envío publicado con ese código».
- **Anonimizar algo publicado:** se despublica solo. El código se mantiene, así los links viejos dicen que no está.
- **Respuestas que se contradicen** (respondido y después denegado): se guarda cada una en `answers` y vale la última aplicada. El historial muestra quién aplicó cada una.
- **Sesión vencida a mitad de una edición:** la API responde 401 (o Access redirige) y el panel pide volver a entrar. Lo que no se guardó se pierde: guardar seguido.
- **Envíos anteriores a la migración:** reciben un código al migrar. Los pedidos no tienen clave, así que sus respuestas siempre pasan por revisión. Los reportes marcados `reviewed = 1` quedan como resueltos.
- **Fecha «Lo resolvimos» del registro:** es la del último cambio de revisión (`reviewed_at`). Si se edita algo después, se corre.

## Desarrollo

- `bun run panel` levanta el panel en `http://localhost:5174`, y `bun run dev` el sitio.
- Los dos usan la misma base local, `.dev/participation.sqlite`, con envíos de ejemplo. Lo que se manda desde `/participar` aparece en la bandeja. Para empezar de cero, se borra el archivo.
- En desarrollo no hay login: la API del panel corre como `equipo@localhost` (plugin de `apps/panel/vite.config.ts`, que no existe en el build). El login se prueba en producción con los pasos de arriba.
- `virtual:item-titles` le da al panel los títulos de `data/curado/no-publicado.yaml`.
- Pruebas: `bun test packages/participation`.
- Los dos lados no se importan entre sí: lo compartido va en `@mt/participation` y `@mt/ui`. Lo controla `bun run lint:arch`.
