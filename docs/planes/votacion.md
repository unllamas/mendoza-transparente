# Plan: votación

Objetivo: tener en `votacion.mendoza-transparente.com` los resultados de las elecciones provinciales de Mendoza, del histórico al conteo en vivo, para llegar a la próxima elección provincial con un sistema ya probado contra las anteriores.

Fecha: 25/10/2026. Estado: etapa 0 hecha (subdominio con una página «en construcción», sin indexar); falta el relevamiento detallado (etapa 1).

## Por qué

- **El conteo oficial se publica en páginas sueltas.** El sitio de resultados provisorios muestra cada elección por separado y no permite comparar entre años, ni el provisorio con el definitivo.
- **El histórico ya existe.** El mismo sistema que publica el conteo en vivo tiene online las elecciones anteriores, así que el lector del conteo se escribe y se prueba hoy, sin esperar una elección.

## Qué hay (relevamiento inicial, 25/10/2026)

| Fuente | Qué trae | Elecciones | Nivel | Formato |
|---|---|---|---|---|
| Resultados provisorios (`resultados.mendoza.gov.ar/eleccionAAMMDDpublico/`) | Conteo de la noche de la elección | 2019, 2023 (abril, junio, septiembre), 25/10/2025 y 22/02/2026, todas online | Provincia, sección, departamento y circuito; hay una vista «Mesas» por revisar | HTML estático que se regenera durante el conteo, sin API |
| Datos abiertos (`datosabiertos.mendoza.gov.ar`) | Escrutinio provisorio | Generales provinciales 2015 y 2019, municipales 2019, PASO 2017 y 2019, legislativas 2017 | Por mesa | ZIP con XLS, licencia CC BY 4.0 |
| Junta Electoral, escrutinios definitivos | Resultado oficial | Solo 2023 (11/06 y 24/09) | Departamento y sección | PDF escaneado con texto (OCR) |
| Junta Electoral, actas de proclamación | Quién resultó electo | 2015 a 2023 ya cargadas (fuente `junta-electoral`); de 1983 a 2014, sin procesar | Persona | PDF |
| Datos abiertos, ubicación de mesas | Escuela y rango de mesas | 2017 | Mesa | CSV |

Huecos: no aparecen resultados provinciales de 2021 en el sitio de resultados (puede ser porque se votó junto con la nacional; hay que confirmarlo), y no hay escrutinios definitivos publicados antes de 2023.

## Datos personales

Los resultados son votos sumados por lista y no tienen datos personales. Los nombres de candidatos y electos se publican, como en el resto del sitio. Nunca se copian los DNI de las actas ni se descarga el padrón. Si el sitio de resultados muestra imágenes de telegramas o certificados de mesa, se toman solo los números, porque las imágenes traen nombres y firmas de autoridades de mesa y fiscales. Las mesas con resultados raros se muestran como señales, con la regla que las detectó, nunca como acusaciones (`docs/procesos/metodologia.md`).

## Etapas

0. **Subdominio** (hecho): proyecto de Pages `mendoza-transparente-votacion` y app `apps/votacion` con una página sin indexar. Ver `docs/procesos/web.md#publicar`.
1. **Relevamiento detallado:** cómo se arman las URLs del sitio de resultados y si se llega a la mesa; qué columnas traen los ZIP por mesa de 2015 a 2019; qué pasó en 2021.
2. **Base histórica:** fuentes `resultados-provisorios` y `escrutinios-definitivos` con un formato común (elección, cargo, nivel geográfico, lista, votos), validado contra los totales impresos.
3. **Páginas:** cada elección, cada departamento y la comparación del provisorio con el definitivo.
4. **Conteo en vivo:** el mismo lector, corriendo cada pocos minutos la noche de la elección. Antes de armarlo, decir cuánto gasta y de qué cupo (un Worker con cron de Cloudflare probablemente encaja mejor que GitHub Actions, que no garantiza intervalos cortos).
5. **Abrir al público:** sacar el `noindex`, sumar el sitemap y enlazarlo desde el sitio principal.

## Falta decidir

- Si la página de cada elección vive en el subdominio o también en el sitio principal (por ejemplo, en `/partidos`).
- Qué señales de mesas raras se muestran y con qué umbrales. Conviene que las revise un abogado con experiencia electoral antes del conteo en vivo.
