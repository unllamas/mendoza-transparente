# Asistente de la guía de trámites (Aco)

Aco es el chat flotante del sitio. Responde qué hay que hacer, qué papeles hacen falta y cuánto cuesta un trámite en Mendoza, y siempre muestra la fuente oficial y la fecha en que se verificó cada paso. Plan y decisiones de producto: [Guía de trámites, impuestos y tasas](../planes/guia-de-tramites.md).

## Cómo está armado

| Pieza | Dónde | Qué hace |
|---|---|---|
| Conocimiento | `data/curado/tramites.yaml`, `data/curado/rubros.yaml` y `data/processed/tributos/rubros_comercio.csv` → `packages/assistant/src/knowledge.json` | Lo único que Aco sabe. `bun run asistente:datos` lo regenera; una prueba falla si quedó viejo |
| Herramientas | `packages/assistant/src/tools.ts` | Funciones puras sobre el conocimiento: pasos de un recorrido, tasa de un rubro, lo que no se publica y la pregunta al usuario |
| Agente | `packages/assistant/src/agent.ts` | Hasta 4 llamadas al modelo por respuesta. El texto lo escribe el modelo; **los bloques de la pantalla (pasos, links, montos) se arman con lo que devolvieron las herramientas**, nunca con lo que escribió |
| Instrucciones | `packages/assistant/src/instructions.ts` | Cortas: citar, decir «no publica», no opinar, no pedir datos personales |
| Proveedores | `packages/assistant/src/providers.ts` | Vercel AI Gateway y OpenRouter con la API de OpenAI, en orden; si uno falla (error, demora de 20 s, 429 o 5xx), responde el otro |
| API | `packages/assistant/src/http.ts`, servida por `apps/web/functions/api/[[route]].ts` | `GET /api/asistente` (si está prendido), `POST /api/asistente` (una respuesta) y `POST /api/asistente/opinion` (👍 o 👎) |
| Widget | `apps/web/src/features/assistant/` | Botón «Preguntá» y panel. Se carga recién si `GET /api/asistente` dice que está prendido. Accesibilidad: al abrir el foco va a «Tu pregunta» y al cerrar vuelve al botón que lo abrió; el diálogo es `aria-modal` con el foco atrapado (las hojas internas manejan el suyo); en celular la página de atrás no scrollea; cada respuesta nueva se anuncia en una región `aria-live="polite"`. Si la API responde 429 (10 pedidos cada 10 s por IP) muestra un texto propio y «Reintentar» espera 10 s |
| Opiniones | Tabla `assistant_feedback` de D1 (migración `0004`) | Voto, motivo y nota opcional. Sin IP ni texto de la conversación |
| Faltantes | Tabla `assistant_gaps` de D1 (migración `0005`) | Lo que se pidió y no tenemos: municipio, rubro o trámite, en pocas palabras |

## La tasa y lo que no tenemos

Son reglas del código, no de las instrucciones al modelo, así que no dependen de que el modelo las cumpla:

- **La tarjeta de la tasa sale solo si la persona preguntó por la plata** («tasa», «cuánto cobra», «cuánto pago», «costo»…, en cualquier mensaje de la conversación: `asksAboutFee` en `tools.ts`). Si no preguntó, la herramienta ni siquiera le pasa los montos al modelo. Es una tarjeta propia (bloque `fee`), separada de los pasos.
- **Al pedir el rubro para la tasa, se ofrecen solo los que tenemos en ese municipio** (`feeActivities`): 30 en Godoy Cruz y Guaymallén, 29 en Las Heras, 28 en Capital y 5 en Luján y Maipú, donde el anexo está escaneado. Para los pasos sirve cualquier rubro, porque solo cambia los de alimentos.
- **Los sinónimos llevan al mismo rubro, pero lo que la ordenanza separa se muestra separado.** «Quiosco», «golosinas» y «maxikiosco» llevan al kiosco, y la tarjeta muestra cada actividad del anexo con su propio monto (ver [Trámites y tributos](tramites-y-tributos.md)).
- **Lo que no tenemos se dice y se anota**, nunca se adivina. La herramienta de la tasa devuelve uno de cinco estados: `found`, `ask_activity`, `unknown_activity` (el rubro no está en la lista de ese municipio: se ofrecen los que hay), `not_surveyed` (no leímos su tarifaria) o `not_computable` (San Rafael). La de los pasos distingue un trámite que no tenemos (`known: false`) de un municipio sin relevar. En el buscador de rubros, lo que no aparece se puede mandar igual («Preguntar por «…»»).

## Faltantes

Cada respuesta guarda en `assistant_gaps` lo que se pidió y no tenemos, para decidir qué relevar primero:

| `kind` | Cuándo | `value` |
|---|---|---|
| `municipio` | Pasos o tasa de un municipio sin relevar | `abrir-un-comercio` o `tasa-de-comercio` |
| `rubro` | Tasa de un rubro que no está en la lista de ese municipio | El rubro como lo dijo la persona, normalizado |
| `tramite` | Un trámite que no tenemos | El id que armó el modelo («sacar-licencia-de-conducir») |

No se guarda la IP ni la conversación; `value` se normaliza y se corta a 60 caracteres. Igual es texto que viene de la persona: no se publica y se revisa antes de usarlo. Si la tabla no existe todavía, la respuesta sale igual y queda un aviso en el log. Se ve en la pantalla **Asistente** del panel (agrupados por tipo, municipio y valor, con la cantidad y la última fecha, de lo más pedido a lo menos). A mano:

```bash
cd apps/web && bunx wrangler@4 d1 execute mendoza-transparente --remote --command "SELECT kind, municipality, value, COUNT(*) AS veces FROM assistant_gaps GROUP BY 1, 2, 3 ORDER BY veces DESC LIMIT 50"
```

La migración `0005` se aplica con `cd apps/web && bunx wrangler@4 d1 migrations apply mendoza-transparente --remote`, antes de probar en la vista previa: la base es la misma para la vista previa y producción, y la tabla nueva no cambia nada de lo que ya existe.

## Claves y configuración

Las claves **solo** viven como secretos cifrados del proyecto de Pages. Nunca van al repositorio, a `wrangler.toml`, al navegador, a una respuesta ni a un log.

1. **Crear las claves** y ponerles un **tope de gasto mensual** en el panel de cada proveedor: es lo que corta el costo si alguien abusa.
   - Vercel AI Gateway: [API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys) → *Create key*. La clave se ve una sola vez.
   - OpenRouter: [Keys](https://openrouter.ai/settings/keys) → *Create key*, con su límite de crédito.
2. **Cargarlas como secretos de Pages**, para la vista previa (`dev`) y, cuando se publique, para producción. Hay dos formas:
   - **Por la terminal**, desde la raíz: `bun run asistente:claves` (vista previa) o `bun run asistente:claves --produccion`. Pregunta qué cargar y wrangler pide cada valor sin mostrarlo, así no queda en el historial. Necesita `bunx wrangler@4 login` o las variables `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` cargadas en el shell.
   - **Por el panel** de Cloudflare: [mendoza-transparente → Settings → Variables and Secrets](https://dash.cloudflare.com/?to=/:account/pages/view/mendoza-transparente/settings/environment-variables) → *Add*, tipo **Secret**, en *Preview* o en *Production*.
3. **Volver a desplegar** (un push a `dev`, o *Retry deployment*): los secretos se leen en el despliegue.
4. **Probar** en `dev.mendoza-transparente.pages.dev`: aparece el botón «Preguntá» abajo a la derecha (hasta 5 minutos después, porque el estado del asistente queda en la caché del borde). Con una sola clave también funciona, sin respaldo.

Sin ninguna clave, `GET /api/asistente` responde `{ "enabled": false }`, el widget no aparece y el sitio no llama a ningún proveedor.

### Elegir el modelo

El modelo se elige sin tocar el código: es el secreto `ASSISTANT_MODEL`, que se carga igual que las claves (`bun run asistente:claves` o el panel, tipo **Secret**). No es un dato sensible, pero va como secreto porque, con `wrangler.toml`, Pages ignora las variables comunes del panel.

- **Sin cargarlo:** `anthropic/claude-haiku-5.5`, el barato y rápido (`DEFAULT_MODEL` en `packages/assistant/src/providers.ts`).
- **El id es el mismo en los dos catálogos** (por ejemplo `anthropic/claude-sonnet-5.5`). Se busca en el [catálogo de AI Gateway](https://ai-gateway.vercel.sh/v1/models) y en el de [OpenRouter](https://openrouter.ai/models). Si un proveedor usa otro id, `ASSISTANT_MODEL_GATEWAY` o `ASSISTANT_MODEL_OPENROUTER` pisan el general para ese proveedor.
- **Un modelo por tarea:** `ASSISTANT_MODEL_TOOLS` lee la pregunta y elige las herramientas, y `ASSISTANT_MODEL_ANSWER` redacta el texto después de que corrieron. Si `ASSISTANT_MODEL_ANSWER` no está, escribe el mismo modelo de las herramientas, sin llamadas de más. Si está, suma una llamada solo en las respuestas que usaron herramientas, siempre dentro del tope de 4 por respuesta. Sirve para usar uno barato en lo mecánico y uno mejor para lo que lee la persona.
- **`ASSISTANT_PROVIDERS`** cambia el orden (`openrouter,gateway`) o deja uno solo.
- **Antes de cambiarlo,** correr las evals con el modelo nuevo: `ASSISTANT_MODEL=<id> bun --env-file=.env.asistente run asistente:evals`, o cargar el secreto solo en *Preview* y correrlas contra la vista previa. Un modelo más caro multiplica el gasto de cada respuesta: revisar el tope en los proveedores.
- **El cambio se aplica** en el próximo despliegue.

## Límites contra el abuso y el gasto

- Conversación recortada a los últimos 12 mensajes, cada uno a 500 caracteres; pedidos de más de 16 KB, rechazados.
- Hasta 4 llamadas al modelo por respuesta (la última, sin herramientas) y 700 tokens de salida por llamada.
- El límite del sitio para `/api/*`: 10 pedidos cada 10 segundos por IP.
- El tope de gasto mensual de cada proveedor (paso 1 de arriba).
- **Turnstile, una vez por conversación, apagado por defecto.** Se prende con el secreto `ASSISTANT_TURNSTILE=on` y reusa `TURNSTILE_SECRET`, el del registro. Con Turnstile prendido:
  - `GET /api/asistente` responde `challenge: true`;
  - el primer mensaje lleva el token de Turnstile y la respuesta devuelve un pase firmado, que vale 30 minutos y sirve para los mensajes siguientes (`packages/assistant/src/pass.ts`);
  - el pase solo lleva su vencimiento, nada de la persona;
  - si falta `TURNSTILE_SECRET`, no pasa nadie (503).

  Turnstile es gratis y no consume cupo. **Se prende si aparece abuso**: Turnstile frena a los scripts, y con él prendido las evals contra esa vista previa dejan de funcionar. Por eso conviene prenderlo solo en *Production*.

## Evals

`packages/assistant/evals/cases.ts` tiene preguntas con respuesta conocida y trampas: pedir el DNI, opinión política, fuera de tema, un plazo que no se publica. Se corren contra el modelo real **antes de cambiar las instrucciones, las herramientas o el modelo**.

**Contra la vista previa de `dev` (la forma de siempre):** cada caso va a `POST /api/asistente` de un despliegue, que usa las claves guardadas como secretos de Pages, así que nadie necesita tenerlas en su máquina. Las ramas de trabajo no arman vista previa (`docs/procesos/web.md`). Entonces se corre antes de mergear, para tener la línea de base, y otra vez cuando el cambio llega a `dev`. Si algo empeoró, se arregla en otro PR antes de publicar:

```bash
bun run asistente:evals --url https://dev.mendoza-transparente.pages.dev --solo tunuyán   # solo los casos cuyo nombre lo dice
```

Los casos van de a uno, con una pausa entre caso y caso, para no chocar con el límite de 10 pedidos cada 10 segundos. Si igual llega un 429, el script espera y lo reintenta una vez.

**En la máquina:** sirve para probar un modelo o un orden de proveedores antes de cargarlo como secreto. Las claves van en `.env.asistente`, en la raíz (está en `.gitignore`). Los secretos de Pages no se pueden leer: Cloudflare solo devuelve los nombres.

```bash
bun --env-file=.env.asistente run asistente:evals
```

Un 👎 real que muestra un error nuevo se suma como caso.

## Sumar o corregir un trámite

Se edita `data/curado/tramites.yaml` (proceso en [Trámites y tributos](tramites-y-tributos.md)) y se corre `bun run asistente:datos`. El cambio llega al asistente en el próximo despliegue.

## Medición

Solo tres eventos en PostHog, sin texto de la conversación (detalle en el plan, etapa 7):
- `assistant.launcher.open`;
- `assistant.answer.show`, con `outcome` (`steps`, `fee`, `ask`, `unpublished`, `answer` o `no_answer`), `flow` y `municipality`;
- `assistant.feedback.vote`, con `vote` y `reason`.

Tokens y costo se miran en el tablero de uso de cada proveedor, no en PostHog. Los errores de los proveedores quedan en el log de la función (`asistente: …`), solo con el código HTTP.

## Opiniones

`assistant_feedback` guarda cada voto. La nota del 👎 es texto libre y puede traer datos personales: no se publica, no va a la analítica y se revisa antes de usarla. Se ve en la pantalla **Asistente** del panel (`apps/panel`, consultas en `packages/participation/src/assistant.ts`): los totales 👍 y 👎, los 👎 por motivo, recorrido (`flow`) y municipio, y los últimos 50 votos. La lista nunca trae la nota: se abre de a una, con un aviso de que puede traer datos personales, y cada lectura queda en la auditoría (`assistant.note.read`, con el id del voto y sin el texto). Para consultarlo a mano:

```bash
cd apps/web && bunx wrangler@4 d1 execute mendoza-transparente --remote --command "SELECT created_at, vote, reason, flow, municipality FROM assistant_feedback ORDER BY id DESC LIMIT 50"
```
