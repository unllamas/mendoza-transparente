---
name: produccion
description: Operación del sitio en producción (mendoza-transparente.com). Cubre Cloudflare Pages y su API, base D1, secretos, protección contra ataques, seguimiento de despliegues, PostHog y Search Console. Cargar antes de tocar algo de Cloudflare o PostHog, al publicar, al diagnosticar el sitio en vivo o ante un ataque.
---

# Producción

Fuentes completas: `docs/procesos/web.md` (Publicar), `participacion.md` y `analitica.md`.

## Accesos (cuentas personales del usuario, no las laborales)

- **Cloudflare:** token y account id en `.env.cloudflare` (raíz del repo, en `.gitignore`). Se usan con `set -a && . ./.env.cloudflare && set +a` y `curl`/`bun` contra `api.cloudflare.com`, o con `bunx wrangler@4` desde `apps/web`.
- **PostHog:** clave personal e id del proyecto en `.env.posthog`; `bun run posthog-sync`.
- **Nunca** imprimir, leer con `cat`/`grep`/`Read` ni commitear esos archivos (un hook lo bloquea). Para verificarlos, contar caracteres.
- Los conectores (MCP) de la sesión pueden ser de otras organizaciones: **no usarlos** para este proyecto. La única excepción es `posthog-mendoza`, fijo en el proyecto de PostHog de Mendoza Transparente (ver `docs/procesos/analitica.md`).

## Publicar

- **Cómo se publica:** cada push a `main` (una publicación desde `dev`, un hotfix o un commit de datos; ver la skill `ramas-y-releases`) dispara el build en Cloudflare Pages (proyecto `mendoza-transparente`, root `apps/web`, comando en `wrangler.toml` y en el panel).
- **Cuidar el plan gratis:** 500 builds por mes, 20.000 archivos por deploy, 100.000 pedidos a funciones por día. Un commit automático que no necesita build lleva `[CF-Pages-Skip]` en el mensaje. Lo estático no se pasa a Workers: servirlo es gratis. Plan y próximos pasos en `docs/planes/consumo-de-cloudflare.md`.
- **Seguir el despliegue:** con un Monitor que consulte `GET /accounts/$ID/pages/projects/mendoza-transparente/deployments?per_page=1` hasta `deploy:success` o `failure`. Si falla, leer los logs en `…/deployments/<id>/history/logs`.
- **Después de publicar:** probar en el sitio real, con `playwright` y `--host-resolver-rules` si el DNS local está cacheado. Revisar páginas clave, `/api/pedidos/stats` y la consola.
- **Variables:** las públicas van en `apps/web/.env.production`; las de build en `[vars]` de `wrangler.toml` (Pages ignora las del panel cuando existe ese archivo); los secretos (`TURNSTILE_SECRET`, `IP_SALT`) en el panel como `secret_text`.

## Base D1 y participación

- **Base:** `mendoza-transparente` (`wrangler.toml`). Migraciones en `packages/participation/migrations/` (las dos apps las comparten); se aplican desde `apps/web` con `wrangler d1 migrations apply mendoza-transparente --remote`.
- **Moderación:** desde el panel interno (`apps/panel`, proyecto de Pages `mendoza-transparente-panel` detrás de Cloudflare Access, secretos `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `PANEL_EMAILS`). Puesta en marcha y seguridad en `docs/procesos/panel.md`; las consultas a mano siguen en `participacion.md`.

## Protección

- **Activo:** HTTPS obligatorio, TLS 1.2 mínimo, `www` redirigido con 301 al dominio principal, Bot Fight Mode, Turnstile en formularios, límite de 10 pedidos cada 10 s por IP en `/api/*` del sitio público, regla de WAF que bloquea escáneres (`.php`, `/wp-`, `/.env`, `/.git`, puertos raros) y caché de 60 s de las lecturas de la API en la función.
- **Robots:** leer lo estático es gratis y sin límite, así que no se bloquea a nadie por ser robot; se cuida `/api/*`, que gasta cupo. Las herramientas de SEO tienen `Crawl-delay: 10` en `robots.txt`. Ver `docs/procesos/web.md` (Robots y consumo).
- **Robots de IA:** su protección queda **apagada** a propósito, para que nos lean y nos citen.
- **Ante un ataque:** activar "I'm Under Attack" en Security → Settings mientras dure, y avisarle al usuario.

## Correo del proyecto

- **`hola@mendoza-transparente.com`** recibe con Cloudflare Email Routing (gratis) y reenvía a la casilla personal del responsable (verificada en la cuenta). Lo demás que llega al dominio se descarta: la regla «catch-all» está apagada.
- **Configurado el 18/10/2026 por API:** Email Routing activo, los MX `route1/2/3.mx.cloudflare.net` y el SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, que agrega Cloudflare, y la regla «hola@ al correo del responsable».
- **El token** necesita *Account → Email Routing Addresses → Edit* y *Zone → Email Routing Rules → Edit*, con la zona incluida en *Zone Resources*. Sin la zona, la API responde `Authentication error`.
- **Solo recibe.** Para mandar desde `hola@` (los reportes de [seguridad](../../../docs/procesos/seguridad.md)) falta un servicio de envío y sumar su registro al SPF. Mientras tanto se responde desde la casilla personal.
- **Para cambiar el destino o sumar otra dirección:** dar de alta la casilla en `/accounts/$ID/email/routing/addresses` (le llega un correo de verificación) y editar la regla en `/zones/<zona>/email/routing/rules`.

## Search Console y redes

- **Google:** el sitemap ya está enviado. Bing Webmaster Tools se importa desde Search Console.
- **Imágenes para compartir:** están versionadas (`?v=<hash>`), así que alcanza con publicar.
