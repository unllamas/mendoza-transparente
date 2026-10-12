# Participación ciudadana

Página `/participar`. Ahí la gente puede:
- Registrar los pedidos de acceso a la información que presentó (Ley 9070), con su número de trámite.
- Contar qué le respondió el Estado.
- Reportar errores del sitio.
- Sugerir datos.

Con eso publicamos cuántos pedidos hay por dato y cuánto responde el Estado. Se ve en la página y en cada hoja de "Lo que no se publica".

## Cómo funciona

- **Lógica:** `apps/web/server/participation.ts`. Son funciones puras sobre una interfaz `Store`. Valida y normaliza los datos y aplica el anti-spam y el límite de envíos.
- **Producción:** Cloudflare Pages Function `apps/web/functions/api/[[route]].ts` sobre una base **D1**. El esquema está en `apps/web/migrations/`.
- **Desarrollo:** el mismo código corre como middleware de Vite (`vite.config.ts`) con una base en memoria, que se pierde al reiniciar. Se puede probar todo con `bun run dev`.

| Endpoint | Qué hace |
|---|---|
| `POST /api/pedidos` | Registra un pedido: `itemId` (id de `no-publicado.yaml` u `otro`), `agency`, `filedOn`, `filingNumber`, `detail`, `email`. Rechaza el mismo trámite repetido para el mismo dato. |
| `POST /api/pedidos/respuesta` | Actualiza los pedidos con ese número de trámite: `status` puede ser `respondido`, `parcial`, `denegado` o `sin_respuesta`. Lleva además fecha, resumen y link. |
| `POST /api/feedback` | Error o sugerencia: `kind` (`error`, `dato` u `otro`), `message`, `page` y `email`. |
| `GET /api/pedidos/stats` | Totales por dato: pedidos, respondidos, negados y vencidos. Un pedido vence a los 21 días corridos sin respuesta, que equivalen aproximadamente a los 15 hábiles de la ley. Cache de 60 segundos. |

## Protección

- **Turnstile** de Cloudflare (gratis, sin captchas molestos): `VITE_TURNSTILE_SITE_KEY` en el build y el secreto `TURNSTILE_SECRET` en la función. Sin secreto (desarrollo), no se verifica.
- **Campo trampa** (`website`), invisible: si un bot lo completa, el envío se descarta sin avisar.
- **Límite de envíos:** 10 por hora por conexión. La IP se guarda solo como hash con sal (`IP_SALT`).
- **Validación:** largo máximo en todos los campos. Los números de trámite solo pueden tener letras, números y separadores; las fechas, desde 2016 hasta hoy; los links, solo http(s).
- **Datos personales:** el correo es opcional y nunca se devuelve. No se pide DNI. No se publican los números de trámite, solo los totales.

## Puesta en marcha (una vez)

```bash
cd apps/web
wrangler d1 create mendoza-transparente          # copiar el database_id en wrangler.toml
wrangler d1 migrations apply mendoza-transparente --remote
wrangler pages secret put TURNSTILE_SECRET
wrangler pages secret put IP_SALT                # un texto largo al azar
```

Además:
- Crear el widget de Turnstile en el panel de Cloudflare y cargar `VITE_TURNSTILE_SITE_KEY` en las variables del proyecto de Pages.
- Vincular la base D1 al proyecto de Pages con el nombre `DB` (Settings → Bindings).

## Revisar lo que llega

```bash
wrangler d1 execute mendoza-transparente --remote --command "SELECT created_at, kind, page, message FROM feedback WHERE reviewed = 0 ORDER BY created_at DESC"
wrangler d1 execute mendoza-transparente --remote --command "SELECT item_id, estado, COUNT(*) FROM pedidos GROUP BY 1, 2"
```

- Un error ya corregido o una sugerencia ya evaluada se marcan con `UPDATE feedback SET reviewed = 1 WHERE id = …`.
- Un dato que se sugiere y no está publicado va a `data/curado/no-publicado.yaml`.
- Los pedidos registrados también sirven para completar el campo `pedidos` de cada entrada de ese archivo.
