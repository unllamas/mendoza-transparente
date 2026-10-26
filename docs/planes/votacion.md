# Plan: votación

Objetivo: tener en `votacion.mendoza-transparente.com` los resultados de las elecciones provinciales de Mendoza, del histórico al conteo en vivo, para llegar a la próxima elección provincial con un sistema ya probado contra las anteriores.

Fecha: 26/10/2026. Estado: etapas 0 a 3 hechas en una primera versión: subdominio, las tres fuentes históricas, páginas por año (`/2023`) y auditoría automática. La portada sigue «en construcción» y nada se indexa. Faltan el conteo en vivo (etapa 4: primero las versiones del conteo, después la noche de la elección), los aportes de la ciudadanía (etapa 5) y abrir al público (etapa 6). Los riesgos que la auditoría tiene que cubrir están en [Riesgos que se controlan](#riesgos-que-se-controlan).

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

## Riesgos que se controlan

Idea tomada del [Sistema Anti-Fraude Electoral](https://github.com/Las-Fuerzas-Del-Cielo/Sistema-Anti-Fraude-Electoral): primero se listan los riesgos que se quieren cubrir, y cada función de la auditoría sale de uno de ellos. Así se ve qué se controla y qué no, y cualquiera puede repetir cada control con la fuente oficial. Lo adaptamos a nuestra metodología: cada riesgo se controla con una regla que marca **señales**, nunca acusaciones, y no se habla de fraude ni se señala a personas.

| Riesgo | Qué se compara | Regla | Estado |
|---|---|---|---|
| **Totales mal sumados**: las unidades están bien cargadas, pero el total de arriba no da | Mesas contra departamento; departamentos contra sección y provincia | `sumas` | Mesas contra departamento, hecho. Departamentos contra sección y provincia, falta |
| **Mesas que no existían**: aparecen mesas en el conteo que no estaban en la lista de mesas | La lista de mesas y electores por mesa que la Junta publica **antes** de la elección, contra las mesas del conteo | `mesas-fuera-de-lista` | Hoy solo se detectan las mesas del definitivo que no estaban en el provisorio. Falta conseguir la lista previa (en datos abiertos solo está la de 2017) |
| **Una unidad cargada que después cambia**: el conteo muestra bien una mesa y horas después la cambia | Cada versión archivada del provisorio contra la anterior | `mesa-reescrita` | Etapa 4a. El archivo ya guarda cada versión con su sha256; desde el 26/10/2026 `huella()` también ve los cambios de votos |
| **Más votos que votantes o más votantes que electores** | Votos emitidos, votantes y electores de cada unidad | `participacion` | Hecho |
| **Mesas sin escrutar** | Mesas habilitadas contra escrutadas | `mesas-sin-escrutar` | Hecho |
| **Provisorio y definitivo distintos** | Cada mesa o departamento del provisorio contra el definitivo | `provisorio-definitivo` | Hecho |
| **Errores de carga en los aportes de la ciudadanía** | Varias cargas de la misma mesa entre sí, y después contra el oficial | `aporte-distinto` | Etapa 5 |

**La auditoría tiene que correr en vivo**, no solo al día siguiente: una vez que se anuncia quién ganó, es difícil volver atrás. Cada regla corre también sobre cada versión del conteo de la noche (etapa 4).

**Lo que no tomamos del proyecto de origen:** el enfoque partidario (es la herramienta de los fiscales de un partido), investigar a fiscales con su DNI y sus redes, dar a auditores externos acceso a datos de fiscales y guardar fotos completas de actas como prueba. Todo eso choca con nuestras reglas de neutralidad y de datos personales.

## Etapas

0. **Subdominio** (hecho): proyecto de Pages `mendoza-transparente-votacion` y app `apps/votacion`. Ver `docs/procesos/web.md#publicar`.
1. **Relevamiento** (hecho): `tmp/agentes/` de cada fuente; lo que quedó está en `sources.yaml` y en «Qué hay».
2. **Base histórica** (hecha): fuentes `elecciones-datos-abiertos` (por mesa, 2015 a 2019), `resultados-provisorios` (2019 a 2026, sin mesas) y `escrutinios-definitivos` (2023 y 2026), con el mismo formato. El nivel mesa va aparte en `mesas.csv.gz`, porque la web principal copia todos los CSV a su despliegue y Cloudflare no acepta archivos de más de 25 MiB.
3. **Páginas por año** (primera versión): `/<año>` con la elección, el escrutinio, el cargo y el departamento en la URL. Siguen la referencia del seguimiento de las presidenciales de Brasil de octubre de 2026: mano a mano entre las dos fuerzas que encabezan, mapa de quién ganó cada departamento con el color oficial de cada fuerza (ver `docs/procesos/diseno.md`), todas las listas, participación, la lista por departamento con su barra de las dos fuerzas, el detalle por mesa y la auditoría. Criterios en `docs/procesos/metodologia.md#resultados-electorales-y-auditoría`.
4. **Conteo en vivo**, en dos partes:
   - **4a. Versiones del conteo** (se hace antes, sin esperar una elección): guardar cada versión del provisorio que se lea durante la noche y compararla con la anterior, para detectar una unidad ya escrutada que cambia sus números (regla `mesa-reescrita`).
     - **Archivo** (hecho el 26/10/2026): `huella()` de `@mt/core` ignoraba los campos ocultos del HTML, y en el sitio de resultados los votos viven ahí (`...ContainerDataV`). Un cambio de votos con las mismas mesas escrutadas no se archivaba. Ahora sí se archiva, con su hora y su sha256 en el `manifest.jsonl`.
     - **Nivel:** el sitio exporta provincia, sección y departamento; las vistas por circuito y por mesa no se exportan, y los PDF «Resumen de Actas por Mesa» traen nombres de autoridades y fiscales. La regla arranca por departamento. Si la noche de la elección el sitio sí muestra mesas, se suman, tomando solo los números.
     - **La regla:** una unidad con las mismas mesas escrutadas (o una mesa ya escrutada) cuyos votos cambian entre dos versiones es una alerta. Se muestran las dos versiones, con su hora y su huella, para que cualquiera las compare.
     - **Que se pueda verificar que tampoco nosotros cambiamos nada:** publicar la huella de cada versión y mandar cada versión a archive.org en el momento, o sellarla según [Sellos de tiempo](sellos-de-tiempo.md).
     - **Se prueba hoy:** con dos versiones históricas archivadas de la misma página, o con una copia alterada a mano.
   - **4b. La noche de la elección:** el mismo lector de `resultados-provisorios`, corriendo cada pocos minutos la noche de la elección, y la página mostrando el avance (mesas escrutadas, quién va adelante y desde cuándo, cómo cambia) y la auditoría de cada versión. Antes de armarlo, decir cuánto gasta y de qué cupo: un Worker con cron de Cloudflare probablemente encaja mejor que GitHub Actions, que no garantiza intervalos cortos.
5. **Aportes de la ciudadanía** (propuesta, sin empezar): que fiscales y vecinos carguen el resultado de la mesa de su escuela (los números del certificado de escrutinio) para tener una lectura rápida antes del provisorio y para contrastarlo después con el oficial. Condiciones:
   - **Solo números**, cargados a mano o leídos de la foto por una IA y confirmados por la persona.
   - **Del certificado, solo sale del teléfono el recorte de los números.** El certificado es un formulario fijo: la página marca con un recuadro dónde encuadrar la foto, y el navegador recorta las zonas de números y de número de mesa y descarta el resto antes de subir nada. Así los nombres y firmas de autoridades de mesa y fiscales nunca se suben. Al redibujar la imagen también se borran los metadatos (ubicación GPS, modelo del teléfono, hora), que son datos de quien la sacó.
   - **El recorte se guarda como prueba, en privado:** en un bucket privado de R2, nunca público, con su sha256 publicado junto a los números de la mesa. Así cualquiera puede comprobar que la prueba existe y no cambió, sin verla. El equipo la abre desde el panel interno si se discute esa mesa, y se borra al terminar el escrutinio definitivo y el plazo de impugnaciones.
   - **La IA lee el recorte, no el certificado entero.** Como el recorte no tiene datos personales, mandarlo a un modelo no es pasar datos personales a un tercero. Si se guardara la foto entera, aunque fuera en privado, sería una base de datos personales, con obligación de registrarla ante la AAIP (Ley 25.326); el recorte lo evita.
   - **Siempre separado y rotulado** («cargado por personas, sin verificar»), nunca mezclado con lo oficial. Cuando llega el dato oficial de esa mesa, se compara y la diferencia va a la auditoría.
   - **Contra el abuso:** Turnstile, límite por IP y por mesa, varias cargas que coincidan antes de mostrar una mesa, y moderación desde el panel interno (`apps/panel`), como el registro de participación.
   - **Costo:** escrituras en D1, recortes en R2 y pedidos a funciones de Pages, dentro del cupo gratis para una noche de elección; hay que estimarlo con el padrón de mesas antes de abrirlo. Para leer los recortes, de más barato a más caro: un OCR que corre en el navegador (gratis, menos preciso con letra a mano), Workers AI dentro de su cupo gratis diario, y un modelo pago solo como respaldo.
   - **Legal:** que lo revise un abogado con experiencia electoral antes de abrirlo.
6. **Abrir al público:** sacar el `noindex`, sumar el sitemap y enlazarlo desde el sitio principal.

## Falta decidir

- Si la página de cada elección vive en el subdominio o también en el sitio principal (por ejemplo, en `/partidos`).
- Si los crudos de `escrutinios-definitivos` (85 MB de PDF escaneados) se guardan en el repositorio o solo en archive.org.
- Qué hacer con las legislativas de octubre de 2017 (los datos abiertos traen códigos sin leyenda) y con el escrutinio definitivo de 2025 (PDF en imagen).
- Qué señales de mesas raras se muestran y con qué umbrales. Conviene que las revise un abogado con experiencia electoral antes del conteo en vivo.
- Para la etapa 5: conseguir el modelo en blanco del certificado de escrutinio de Mendoza (y saber si cambia entre elecciones), para ubicar las zonas del recorte.
- Si la Junta Electoral publica las imágenes de los certificados, como el sitio de resultados nacional publica los telegramas. Si las publica, los números se toman de la imagen oficial y los aportes de la ciudadanía pasan a ser un contraste, no la única copia.
- De dónde sale la lista de mesas y electores por mesa de cada elección antes de la jornada (riesgo «Mesas que no existían»).
