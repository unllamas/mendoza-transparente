# Asistente de la guía de trámites (Aco)

Aco es el chat flotante del sitio. Responde qué hay que hacer, qué papeles hacen falta y cuánto cuesta un trámite en Mendoza, y siempre muestra la fuente oficial y la fecha en que se verificó cada paso. Plan y decisiones de producto: [Guía de trámites, impuestos y tasas](../planes/guia-de-tramites.md).

## Cómo está armado

| Pieza | Dónde | Qué hace |
|---|---|---|
| Conocimiento | `data/curado/tramites.yaml` y `data/processed/tributos/rubros_comercio.csv` → `packages/assistant/src/knowledge.json` | Lo único que Aco sabe. `bun run asistente:datos` lo regenera; una prueba falla si quedó viejo |
| Herramientas | `packages/assistant/src/tools.ts` | Funciones puras sobre el conocimiento: pasos de un recorrido, tasa de un rubro, lo que no se publica y la pregunta al usuario |
| Agente | `packages/assistant/src/agent.ts` | Hasta 4 llamadas al modelo por respuesta. El texto lo escribe el modelo; **los bloques de la pantalla (pasos, links, montos) se arman con lo que devolvieron las herramientas**, nunca con lo que escribió |
| Instrucciones | `packages/assistant/src/instructions.ts` | Cortas: citar, decir «no publica», no opinar, no pedir datos personales |
| Proveedores | `packages/assistant/src/providers.ts` | Vercel AI Gateway y OpenRouter con la API de OpenAI, en orden; si uno falla (error, demora de 20 s, 429 o 5xx), responde el otro |
| API | `packages/assistant/src/http.ts`, servida por `apps/web/functions/api/[[route]].ts` | `GET /api/asistente` (si está prendido), `POST /api/asistente` (una respuesta) y `POST /api/asistente/opinion` (👍 o 👎) |
| Widget | `apps/web/src/features/assistant/` | Botón «Preguntá» y panel. Se carga recién si `GET /api/asistente` dice que está prendido |
| Opiniones | Tabla `assistant_feedback` de D1 (migración `0004`) | Voto, motivo y nota opcional. Sin IP ni texto de la conversación |

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
- **`ASSISTANT_PROVIDERS`** cambia el orden (`openrouter,gateway`) o deja uno solo.
- **Antes de cambiarlo,** correr las evals con el modelo nuevo: `ASSISTANT_MODEL=<id> bun --env-file=.env.asistente run asistente:evals`. Un modelo más caro multiplica el gasto de cada respuesta: revisar el tope en los proveedores.
- **El cambio se aplica** en el próximo despliegue.

## Límites contra el abuso y el gasto

- Conversación recortada a los últimos 12 mensajes, cada uno a 500 caracteres; pedidos de más de 16 KB, rechazados.
- Hasta 4 llamadas al modelo por respuesta (la última, sin herramientas) y 700 tokens de salida por llamada.
- El límite del sitio para `/api/*`: 10 pedidos cada 10 segundos por IP.
- El tope de gasto mensual de cada proveedor (paso 1 de arriba).
- Pendiente: Turnstile en el primer mensaje si aparece abuso.

## Evals

`packages/assistant/evals/cases.ts` tiene preguntas con respuesta conocida y trampas: pedir el DNI, opinión política, fuera de tema, un plazo que no se publica. Se corren contra el modelo real **antes de cambiar las instrucciones, las herramientas o el modelo**:

```bash
# .env.asistente en la raíz (está en .gitignore) con AI_GATEWAY_API_KEY y/o OPENROUTER_API_KEY
bun --env-file=.env.asistente run asistente:evals
```

Un 👎 real que muestra un error nuevo se suma como caso.

## Sumar o corregir un trámite

Se edita `data/curado/tramites.yaml` (proceso en [Trámites y tributos](tramites-y-tributos.md)) y se corre `bun run asistente:datos`. El cambio llega al asistente en el próximo despliegue.

## Medición

Solo tres eventos en PostHog, sin texto de la conversación (detalle en el plan, etapa 7):
- `assistant.launcher.open`;
- `assistant.answer.show`, con `outcome`, `flow` y `municipality`;
- `assistant.feedback.vote`, con `vote` y `reason`.

Tokens y costo se miran en el tablero de uso de cada proveedor, no en PostHog. Los errores de los proveedores quedan en el log de la función (`asistente: …`), solo con el código HTTP.

## Opiniones

`assistant_feedback` guarda cada voto. La nota del 👎 es texto libre y puede traer datos personales: no se publica, no va a la analítica y se revisa antes de usarla. Hasta que el panel tenga su vista, se consulta a mano:

```bash
cd apps/web && bunx wrangler@4 d1 execute mendoza-transparente --remote --command "SELECT created_at, vote, reason, flow, municipality FROM assistant_feedback ORDER BY id DESC LIMIT 50"
```
