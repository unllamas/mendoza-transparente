---
name: asistente
description: Asistente Aco de la guía de trámites (packages/assistant, /api/asistente y el widget de apps/web/src/features/assistant). Cubre herramientas, instrucciones, proveedores con respaldo (AI Gateway y OpenRouter), claves como secretos, límites de gasto, evals, los 3 eventos y las opiniones en D1. Cargar al tocar el asistente, su widget, su conocimiento, sus instrucciones o su modelo, o al configurar sus claves.
---

# Asistente (Aco)

Fuente completa: `docs/procesos/asistente.md`. Plan: `docs/planes/guia-de-tramites.md`.

## Reglas que no se negocian

1. **Lo que se ve en pantalla sale de las herramientas, no del modelo.** Pasos, links y montos se arman en `agent.ts` (`buildBlocks`) con lo que devolvieron las herramientas. El modelo solo escribe el texto.
2. **Aco solo sabe lo que está en `knowledge.json`.** Para que sepa algo nuevo, se carga en `data/curado/tramites.yaml` o en la fuente `tributos` y se corre `bun run asistente:datos`. Nada de buscar en la web en vivo.
3. **Las claves solo como secretos de Pages** (`AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`). Nunca en el repo, en `wrangler.toml`, en el navegador, en una respuesta ni en un log: los errores de los proveedores se registran solo con el código HTTP. Para las evals locales, `.env.asistente` (en `.gitignore`).
4. **El modelo es el secreto `ASSISTANT_MODEL`** (por defecto `anthropic/claude-haiku-5.5`), igual que el orden `ASSISTANT_PROVIDERS`: se cargan con `bun run asistente:claves` o en el panel como *Secret*, nunca en `wrangler.toml`.
5. **Cambiar las instrucciones, las herramientas o el modelo pide correr las evals** (`bun --env-file=.env.asistente run asistente:evals`) y decir el resultado en el PR.
6. **Medición mínima:** solo `assistant.launcher.open`, `assistant.answer.show` y `assistant.feedback.vote`. Nunca el texto de la conversación ni la nota del 👎. Tokens y costo, en el tablero de cada proveedor.
7. **La tasa solo si la piden, y lo que no tenemos se anota.** La tarjeta `fee` sale solo si la conversación preguntó por la plata (`asksAboutFee`); los rubros de la tasa son los curados a mano de cada municipio (`feeActivities`), nunca una búsqueda por palabras; lo que falta (municipio, rubro, trámite) se dice y queda en `assistant_gaps`. Detalle en `docs/procesos/asistente.md#la-tasa-y-lo-que-no-tenemos`.
8. **Gasto acotado:** 12 mensajes de 500 caracteres, 4 llamadas por respuesta, 700 tokens de salida y tope mensual en cada proveedor. Un evento, una llamada o un modelo más caro se justifican en el PR.

## Al cambiar algo

- **Un trámite o una tasa:** skill `tramites-y-tributos`, después `bun run asistente:datos`.
- **El widget:** skills `diseno` y `revisar-interfaz`; la vista aprobada tiene fondo gris, acciones blancas y respuestas sin globo al 85 %.
- **Una herramienta nueva:** en `tools.ts`, con su definición en `TOOL_DEFINITIONS`, su bloque en `buildBlocks` si dibuja algo, una prueba en `assistant.test.ts` y un caso en `evals/cases.ts`.
- **Verificar:** `bunx tsc --noEmit` en `packages/assistant` y `apps/web`; `bun test` (lo corre la CI).
