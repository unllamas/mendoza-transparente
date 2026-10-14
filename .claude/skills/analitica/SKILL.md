---
name: analitica
description: Eventos y trackeo de uso en Mendoza Transparente. Cubre PostHog sin cookies, data-track, nombres de eventos, catálogo en español, tablero y privacidad. Cargar al agregar un botón, link, formulario, hoja o cualquier interacción nueva en la web, y al tocar PostHog o el tablero.
---

# Analítica

Fuente completa: `docs/procesos/analitica.md`. Código: `apps/web/src/analytics.ts`.

## Al agregar una interacción

1. **Botón o link importante:** ponerle un `id` estable y `data-track="area.element.action"`. Las propiedades van como `data-track-<nombre>={valor}`. No hace falta escribir JS: el clic se envía solo.
   ```tsx
   <button id="pedido-copiar" data-track="missing_data.request.copy" data-track-item={item.id}>
   ```
2. **Evento que no es un clic** (un envío que salió bien o mal, una búsqueda): `track("area.thing.action", { … })` desde `analytics.ts`.
3. **Componentes que ya miden solos** (no repetir):
   - `TrackedSheet` (`sheet.open` y `sheet.close`), `TrackedSegmented` (`<trackId>.change`) y `ListSearch` (`search.query`), en `apps/web/src/components/`.
   - El buscador global (`search.*`), los links externos (`link.outbound`) y las descargas (`data.download`).
4. **Catálogo:** sumar el evento a `apps/web/src/analytics-catalog.ts` con su descripción en español (qué hizo la persona y qué propiedades lleva).
5. **Sincronizar:** `bun run posthog-sync` desde la raíz (necesita `.env.posthog`). Crea la definición del evento con su descripción y actualiza el tablero "Uso de Mendoza Transparente".
6. **Gráfico nuevo:** agregarlo en `INSIGHTS` de `apps/web/scripts/posthog-sync.ts`, con nombre y descripción en español. Si se renombra uno, el viejo queda en PostHog: borrarlo.

## Nombres

- **Formato:** `área.elemento.acción`, en inglés y snake_case. Por ejemplo `missing_data.request.official_form`, `search.no_results` o `home.question.open`.
- **Áreas actuales:** `nav`, `footer`, `sheet`, `search`, `home`, `missing_data`, `law`, `participation`, `registry`, `link` y `data`.

## Privacidad (no se negocia)

- **Configuración de PostHog:** sin cookies (`persistence: "memory"`), sin IP, sin grabación de sesiones. Así no hace falta banner.
- **Nunca mandar datos personales:** ni correos, ni números de trámite, ni nombres escritos en formularios. Las búsquedas sí (`query`), recortadas a 80 caracteres.
- **Proyecto propio:** "Mendoza Transparente" (id en `.env.posthog`). El conector de PostHog de la sesión puede ser de otra organización: **no usarlo** para este proyecto.

## Probar

- En desarrollo no se envía nada sin clave. `VITE_TRACK_DEBUG=1 bun run dev` imprime los eventos en la consola.
- Desde `localhost` PostHog no recibe eventos (dominio autorizado: `mendoza-transparente.com`), y esos eventos igual quedan excluidos de los gráficos.
- PostHog descarta los navegadores automatizados. Para probar con `playwright` en producción, anular `navigator.webdriver` con `addInitScript`.
