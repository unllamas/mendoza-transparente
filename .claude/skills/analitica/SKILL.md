---
name: analitica
description: Eventos y trackeo de uso en Mendoza Transparente. Cubre PostHog sin cookies, data-track, nombres de eventos, catálogo en español, tablero y privacidad. Cubre también cómo decidir un cambio con los datos de uso (datos → posición o UX → plan → vista previa → código → medir después). Cargar al agregar un botón, link, formulario, hoja o cualquier interacción nueva en la web, al tocar PostHog o el tablero, y cuando se pregunta qué se usa más o por qué algo no se usa.
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

## Decidir con los datos de uso

1. **Datos** de `posthog-mendoza`, al menos dos semanas: vistas, clics por `data-track`, scroll, clics sin respuesta, búsquedas sin resultados. Sin contar las páginas en las que se estuvo trabajando.
2. **¿Posición o UX?** Poco usado y debajo de donde baja la mayoría → posición. A la vista y sin clics → UX. Con las cifras.
3. **Plan corto** con la métrica que va a mostrar si funcionó.
4. **Vista previa** (skill `vista-previa`) antes del código.
5. **Código, PR, publicación.**
6. **Medir después:** anotación en PostHog el día que se publica, y en «Riesgos y pendientes» del PR qué métrica mirar y cuándo (dos semanas). Si no mejoró, se dice.

Con poco tráfico, una diferencia chica es una señal, no una conclusión. Detalle en `docs/procesos/analitica.md#decidir-con-los-datos-de-uso`.

## Nombres

- **Formato:** `área.elemento.acción`, en inglés y snake_case. Por ejemplo `missing_data.request.official_form`, `search.no_results` o `home.question.open`.
- **Áreas actuales:** `nav`, `footer`, `sheet`, `search`, `home`, `missing_data`, `law`, `participation`, `registry`, `share`, `link` y `data`.

## Privacidad (no se negocia)

- **Configuración de PostHog:** sin cookies (`cookieless_mode: "always"`; el hash usa la IP y PostHog la borra), sin grabación de sesiones. Así no hace falta banner. Si se suma un aviso de cookies, ver `docs/planes/consentimiento-de-cookies.md`.
- **Nunca mandar datos personales:** ni correos, ni números de trámite, ni nombres escritos en formularios. Las búsquedas sí (`query`), recortadas a 80 caracteres.
- **Proyecto propio:** "Mendoza Transparente" (id en `.env.posthog`). Para consultarlo desde el agente, usar solo el MCP **`posthog-mendoza`** (fijo en este proyecto; cómo se configura en `docs/procesos/analitica.md`). Cualquier otro conector de PostHog puede ser de otra organización: **no usarlo**.

## Probar

- En desarrollo no se envía nada sin clave. `VITE_TRACK_DEBUG=1 bun run dev` imprime los eventos en la consola.
- Desde `localhost` PostHog no recibe eventos (dominio autorizado: `mendoza-transparente.com`), y esos eventos igual quedan excluidos de los gráficos.
- PostHog descarta los navegadores automatizados. Para probar con `playwright` en producción, anular `navigator.webdriver` con `addInitScript`.
