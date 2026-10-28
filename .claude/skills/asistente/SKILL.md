---
name: asistente
description: Asistente Aco (packages/assistant, /api/asistente y el widget de apps/web/src/features/assistant), que responde trámites y lo que publica el sitio (proveedores, autoridades, municipios, leyes). Cubre herramientas, datos del sitio (/data/asistente.json), instrucciones, proveedores con respaldo (AI Gateway y OpenRouter), claves como secretos, límites de gasto, evals, sus eventos de PostHog y las opiniones en D1. Cargar al tocar el asistente, su widget, su conocimiento, sus instrucciones o su modelo, o al configurar sus claves.
---

# Asistente (Aco)

Fuente completa: `docs/procesos/asistente.md`. Plan: `docs/planes/guia-de-tramites.md`.

## Reglas que no se negocian

1. **Lo que se ve en pantalla sale de las herramientas, no del modelo.** Pasos, links y montos se arman en `agent.ts` (`buildBlocks`) con lo que devolvieron las herramientas. El modelo solo escribe el texto.
2. **Aco solo sabe lo que está en `knowledge.json` (trámites y tasas) y en `/data/asistente.json` (lo que publica el sitio).** Para un trámite nuevo, se carga en `data/curado/tramites.yaml` o en la fuente `tributos` y se corre `bun run asistente:datos`. Lo del sitio sale solo de `bun run data` (`apps/web/scripts/temas/assistant-data.ts`): una sección nueva se suma ahí y en `SECTION_IDS`. Nada de buscar en la web en vivo.
3. **Las claves solo como secretos de Pages** (`AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`). Nunca en el repo, en `wrangler.toml`, en el navegador, en una respuesta ni en un log: los errores de los proveedores se registran solo con el código HTTP. Las evals corren contra una vista previa; solo para probar un modelo en la máquina, `.env.asistente` (en `.gitignore`).
4. **El modelo es el secreto `ASSISTANT_MODEL`** (por defecto `anthropic/claude-haiku-5.5`), y se puede separar por tarea con `ASSISTANT_MODEL_TOOLS` y `ASSISTANT_MODEL_ANSWER`. Lo mismo vale para el orden `ASSISTANT_PROVIDERS` y para `ASSISTANT_TURNSTILE=on` (Turnstile una vez por conversación, solo en *Production*): se cargan con `bun run asistente:claves` o en el panel como *Secret*, nunca en `wrangler.toml`.
5. **Cambiar las instrucciones, las herramientas o el modelo pide correr las evals** contra la vista previa de `dev` (`bun run asistente:evals --url https://dev.mendoza-transparente.pages.dev`, que usa las claves de Pages), antes de mergear y otra vez cuando el cambio llega a `dev`, y decir el resultado en el PR. Si empeora, se arregla antes de publicar.
6. **Medición mínima:** un evento por control del widget (abrir, preguntar, respuesta, error, reintento, link, reinicio y voto), con la tabla en `docs/procesos/asistente.md#medición`. Nunca el texto de la conversación ni la nota del 👎. Toda pregunta pasa por `ask()` en `panel.tsx`, que manda `assistant.question.send` con su `source`. Tokens, costo y fallas, en el panel (`assistant_answers` y `assistant_calls` de D1, sin texto; ver `docs/procesos/asistente.md#consumo`).
7. **La tasa solo si la piden, y lo que no tenemos se anota.** La tarjeta `fee` sale solo si la conversación preguntó por la plata (`asksAboutFee`); los rubros de la tasa son los curados a mano de cada municipio (`feeActivities`), nunca una búsqueda por palabras; lo que falta (municipio, rubro, trámite) se dice y queda en `assistant_gaps`. Detalle en `docs/procesos/asistente.md#la-tasa-y-lo-que-no-tenemos`.
8. **Gasto acotado:** 12 mensajes de 500 caracteres, 4 llamadas por respuesta, 400 tokens de salida y tope mensual en cada proveedor. Un evento, una llamada o un modelo más caro se justifican en el PR. Lo que una herramienta devuelve al modelo es lo justo para escribir 280 caracteres: los links y las listas van a la pantalla, no al modelo (`procedureForModel`), porque cada llamada vuelve a mandar todo.
9. **Límites propios, no solo el WAF** (`quota.ts`, tabla `assistant_quota`): Aco responde solo en `mendoza-transparente.com` y en la vista previa de `dev`, nunca en las direcciones `*.pages.dev` de producción, y corta por IP (cada 10 minutos y por día), por conversación (el pase de Turnstile, que no se renueva) y por día en todo el sitio (`ASSISTANT_DAILY_LIMIT`). Detalle en `docs/procesos/asistente.md#límites-contra-el-abuso-y-el-gasto`.

## Al cambiar algo

- **Un trámite o una tasa:** skill `tramites-y-tributos`, después `bun run asistente:datos`.
- **El widget:** skills `diseno` y `revisar-interfaz`; la vista aprobada tiene fondo gris, acciones blancas y respuestas sin globo al 85 %. Reglas del widget (bienvenida que se va, avance arriba del campo, respuestas de un tuit, íconos de rubros) en `docs/procesos/asistente.md#el-widget`.
- **Un dato del sitio:** las herramientas de `site-data.ts` devuelven valores ya formateados y una tarjeta (bloque `data`) con links dentro del sitio. Hasta 2 tarjetas y 5 filas. Detalle en `docs/procesos/asistente.md#datos-del-sitio`.
- **Una herramienta nueva:** en `tools.ts`, con su definición en `TOOL_DEFINITIONS`, su bloque en `buildBlocks` si dibuja algo, una prueba en `assistant.test.ts` y un caso en `evals/cases.ts`.
- **Verificar:** `bunx tsc --noEmit` en `packages/assistant` y `apps/web`; `bun test` (lo corre la CI).
