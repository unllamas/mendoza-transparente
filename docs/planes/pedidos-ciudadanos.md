# Pedidos y carteles ciudadanos

Que cualquier persona pueda actuar con los datos: pedir lo que falta y mostrar lo que hay. La idea salió de revisar [municipiosargentinos.net](https://municipiosargentinos.net/) (25/10/2026): su modelo de pedido imprimible y sus carteles por municipio.

## Hecho

- **Nota de pedido en PDF (`/pedir`)** y **carteles (`/cartel`)**. Cómo funcionan: `docs/procesos/web.md#nota-de-pedido-y-carteles`.
- **Conteo anónimo** de notas descargadas y carteles exportados, con eventos de PostHog (`request_letter.download`, `poster.export`), sin el texto ni los datos de la persona.

## Pendiente

1. **Qué municipios adhirieron a la Ley 9070.** El artículo 40 solo invita a los municipios a adherir: la ley provincial no los obliga directamente. Hoy el sitio dice que el municipio «está obligado a responder» y que tiene 15 días hábiles (ficha de cada municipio, `/no-publicado`, `/pedir` y los carteles). Hay que relevar, municipio por municipio, la ordenanza de adhesión o la norma propia de acceso a la información y su plazo, y ajustar esos textos. Es trabajo de datos: va a `data/curado/` con su fuente.
2. **Mostrar cuánta gente pide cada dato.** Cuando haya volumen de notas descargadas (por ejemplo, 100), la ficha de cada municipio puede decir «23 notas para pedir sus compras». Sin ranking entre municipios: no se trata de hacerlos competir.
3. **Contadores públicos que cualquiera pueda verificar.** Si se muestra un contador en la web, publicar los totales por día y por organismo en un archivo abierto y explicar cómo se cuentan, sin nada que identifique a nadie.
4. **Verificación de municipios.** Que un municipio acredite su identidad y mande sus fuentes oficiales para corregir el relevamiento. Necesita una metodología propia antes de empezar.
5. **Nota de reclamo.** Si a los 15 días hábiles no respondieron, una segunda nota para reclamar ante la autoridad de aplicación (art. 22 de la Ley 9070), con el número de expediente de la primera.
6. **Pedidos a organismos nacionales.** La UNCuyo y la UTN responden por la Ley 27.275; la nota hoy solo cubre la 9070.

## Qué falta decidir

- El umbral de notas para mostrar el conteo en la ficha (punto 2).
- Si la nota de reclamo (punto 5) va en `/pedir` como un tercer paso o como otra opción del primero.
