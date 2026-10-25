# Plan: votación

Objetivo: tener en `votacion.mendoza-transparente.com` los resultados de las elecciones provinciales de Mendoza, del histórico al conteo en vivo, para llegar a la próxima elección provincial con un sistema ya probado contra las anteriores.

Fecha: 25/10/2026. Estado: etapas 0 a 3 hechas en una primera versión: subdominio, las tres fuentes históricas, páginas por año (`/2023`) y auditoría automática. La portada sigue «en construcción» y nada se indexa. Faltan el conteo en vivo (etapa 4), los aportes de la ciudadanía (etapa 5) y abrir al público (etapa 6).

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

0. **Subdominio** (hecho): proyecto de Pages `mendoza-transparente-votacion` y app `apps/votacion`. Ver `docs/procesos/web.md#publicar`.
1. **Relevamiento** (hecho): `tmp/agentes/` de cada fuente; lo que quedó está en `sources.yaml` y en «Qué hay».
2. **Base histórica** (hecha): fuentes `elecciones-datos-abiertos` (por mesa, 2015 a 2019), `resultados-provisorios` (2019 a 2026, sin mesas) y `escrutinios-definitivos` (2023 y 2026), con el mismo formato. El nivel mesa va aparte en `mesas.csv.gz`, porque la web principal copia todos los CSV a su despliegue y Cloudflare no acepta archivos de más de 25 MiB.
3. **Páginas por año** (primera versión): `/<año>` con la elección, el escrutinio, el cargo y el departamento en la URL. Siguen la referencia del seguimiento de las presidenciales de Brasil de octubre de 2026: mano a mano entre las dos fuerzas que encabezan, mapa de quién ganó cada departamento (azul y naranja, ver `docs/procesos/diseno.md`), todas las listas, participación, la lista por departamento con su barra de las dos fuerzas, el detalle por mesa y la auditoría. Criterios en `docs/procesos/metodologia.md#resultados-electorales-y-auditoría`.
4. **Conteo en vivo:** el mismo lector de `resultados-provisorios`, corriendo cada pocos minutos la noche de la elección, y la página mostrando el avance (mesas escrutadas, quién va adelante y desde cuándo, cómo cambia). Antes de armarlo, decir cuánto gasta y de qué cupo: un Worker con cron de Cloudflare probablemente encaja mejor que GitHub Actions, que no garantiza intervalos cortos. El lector de hoy no detecta cambios de un conteo en curso (`huella()` de `@mt/core` ignora los campos ocultos del HTML): hay que ajustarlo antes.
5. **Aportes de la ciudadanía** (propuesta, sin empezar): que fiscales y vecinos carguen el resultado de la mesa de su escuela (los números del certificado de escrutinio) para tener una lectura rápida antes del provisorio y para contrastarlo después con el oficial. Condiciones:
   - **Solo números**, cargados a mano o leídos de la foto y confirmados por la persona. La foto del certificado no se publica ni se guarda, porque trae nombres y firmas de autoridades de mesa y fiscales.
   - **Siempre separado y rotulado** («cargado por personas, sin verificar»), nunca mezclado con lo oficial. Cuando llega el dato oficial de esa mesa, se compara y la diferencia va a la auditoría.
   - **Contra el abuso:** Turnstile, límite por IP y por mesa, varias cargas que coincidan antes de mostrar una mesa, y moderación desde el panel interno (`apps/panel`), como el registro de participación.
   - **Costo:** escrituras en D1 y pedidos a funciones de Pages, dentro del cupo gratis para una noche de elección; hay que estimarlo con el padrón de mesas antes de abrirlo.
   - **Legal:** que lo revise un abogado con experiencia electoral antes de abrirlo.
6. **Abrir al público:** sacar el `noindex`, sumar el sitemap y enlazarlo desde el sitio principal.

## Falta decidir

- Si la página de cada elección vive en el subdominio o también en el sitio principal (por ejemplo, en `/partidos`).
- Si los crudos de `escrutinios-definitivos` (85 MB de PDF escaneados) se guardan en el repositorio o solo en archive.org.
- Qué hacer con las legislativas de octubre de 2017 (los datos abiertos traen códigos sin leyenda) y con el escrutinio definitivo de 2025 (PDF en imagen).
- Qué señales de mesas raras se muestran y con qué umbrales. Conviene que las revise un abogado con experiencia electoral antes del conteo en vivo.
