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

1. **Crear las claves** en cada proveedor y ponerles un **tope de gasto mensual** desde su panel: es lo que corta el costo si alguien abusa.
2. **Cargarlas como secretos**, desde `apps/web`, para la vista previa (`dev`) y para producción. Wrangler pide el valor por la terminal, así no queda en el historial:

   ```bash
   bunx wrangler@4 pages secret put AI_GATEWAY_API_KEY --project-name mendoza-transparente --env preview
   bunx wrangler@4 pages secret put OPENROUTER_API_KEY --project-name mendoza-transparente --env preview
   # producción: lo mismo con --env production
   ```

   O en el panel de Cloudflare: *Workers & Pages → mendoza-transparente → Settings → Variables and Secrets → Add → Secret*.
3. **Volver a desplegar** (un push a `dev`, o *Retry deployment*): los secretos se leen en el despliegue.
4. **Probar** en `dev.mendoza-transparente.pages.dev`: aparece el botón «Preguntá» abajo a la derecha. Con una sola clave también funciona, sin respaldo.

Sin ninguna clave, `GET /api/asistente` responde `{ "enabled": false }`, el widget no aparece y el sitio no llama a ningún proveedor.

**Modelo y orden** (no son secretos): `ASSISTANT_MODEL` y `ASSISTANT_PROVIDERS` en `[vars]` de `apps/web/wrangler.toml`. El id del modelo es el mismo en los dos catálogos (hoy `anthropic/claude-haiku-5.5`, el barato). Si un proveedor usa otro id, `ASSISTANT_MODEL_GATEWAY` o `ASSISTANT_MODEL_OPENROUTER`. Cambiar de modelo pide correr las evals antes.

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
