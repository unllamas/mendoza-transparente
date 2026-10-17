# Metodología y criterios

El activo principal del proyecto es la credibilidad. Estos criterios se aplican igual a todos los gobiernos y partidos.

## Presentación de hallazgos

- **Señales, no acusaciones.** Un patrón en los datos (contratación directa, una sola oferta, empresa nueva, proveedor dominante) es una pregunta que merece explicación, no una conclusión. Cada señal dice por qué importa, cómo se calculó y lista los casos concretos, con su matiz al lado («68 % de los procesos, pero 29 % de la plata»).
- **La misma vara para todos**: mismas fórmulas y cortes para cada gestión.
- **Nunca inferir**: si una fuente no dice el partido de un legislador, se muestra «No lo informa la fuente oficial». Cuando dos fuentes oficiales no coinciden, se muestran las dos (ver `data/curado/correcciones.yaml`).
- Los límites de cada dato van en la misma página (por ejemplo: la valuación fiscal es menor que la de mercado; el sitio de Ética Pública solo muestra la última declaración).

## Cálculos

- **Valores reales**: los montos se llevan a pesos del último mes disponible con el IPC nacional de INDEC (promedio anual para series anuales). La serie está empalmada desde 1997; entre 2007 y 2015 el IPC oficial subestimó la inflación, y se aclara donde corresponde. Detalle en `data/processed/indices/README.md`.
- **Por habitante**: proyecciones de población de INDEC (base Censo 2010 hasta 2021 y base Censo 2022 desde 2022).
- **Deuda en dólares**: para comparar años con distinta inflación; se aclara que la deuda en pesos baja medida en dólares cuando hay devaluación.
- **Comparación por mandato**: el corte más cercano a la asunción contra el más cercano a la salida (o el último, si el mandato sigue).
- **Compras**: montos adjudicados nominales; si una adjudicación tiene varios proveedores, el monto se reparte en partes iguales.

## Cruces entre fuentes

- **Criterio conservador**: ante la duda, no se cruza. Las declaraciones juradas se asignan a un funcionario solo si todas las palabras del nombre más corto están en el otro y la coincidencia es única, y se revisa contra el cargo declarado.
- **Empresas nuevas**: fecha de constitución del Registro Nacional de Sociedades contra la primera adjudicación del CUIT.

## Datos personales

- Se publican datos institucionales (nombre, cargo, bloque, patrimonio declarado) y se quitan los personales (DNI, CUIL, domicilios, patentes, cuentas, familiares) antes de archivar.
- Los proveedores que son personas humanas no se perfilan: solo se indica que venden al Estado a título individual.
- Fotos solo de sitios oficiales, con el crédito del organismo.

## Fuentes y acceso a la información

- Solo fuentes oficiales. No se usan notas periodísticas como dato (pueden servir para encontrar la fuente oficial).
- Lo que debería estar publicado y no está va a «Lo que el Estado no publica», con el texto del pedido por la Ley 9070 de Acceso a la Información Pública (el organismo tiene 15 días hábiles para responder).

## Resúmenes de leyes

Cada ley tiene un resumen en lenguaje simple para un vecino que no sigue la política ni maneja el vocabulario jurídico, y que entra a saber qué pasa donde vive. El resumen contesta una sola pregunta: **¿qué cambia en la práctica y a quién le toca?** Quien quiera el detalle tiene el texto completo, ordenado por artículos, y el PDF oficial.

- **De dónde salen:** `data/curado/leyes.yaml`. Los escribe un modelo de IA (`apps/web/scripts/resumir-leyes.ts`, con la API de Claude) a partir del texto oficial de la ley, y se pueden corregir a mano.
- **Criterios** (la constante `INSTRUCCIONES` del script):
  - Solo lo que dice el texto.
  - Neutral, sin valoraciones.
  - Concreto: edades, montos, plazos, lugares, metros, qué se permite y qué se prohíbe.
  - **Nunca nombrar algo sin decir qué es.** "Aplica medidas y programas" no sirve si no dice cuáles. Si el texto no lo dice (porque está en un anexo o en otra ley), va a "lo que no dice", no a los puntos.
  - Primero lo que le pasa a la gente. El organigrama interno solo cuenta si es todo lo que hace la ley, y entonces se dice así: "es una ley de organización interna".
  - Sin números de artículos ni de otras leyes, salvo que se explique qué dicen.
- **Campos** de cada ley en el YAML:
  - `titulo`: hasta 70 caracteres, dice qué hace la ley.
  - `tema`: uno de una lista fija.
  - `resumen`: qué cambia, en 1 o 2 oraciones.
  - `a_quien`: a quién le toca.
  - `municipios`: los departamentos donde pasa algo concreto. Con ellos la ley aparece en la página del departamento ("Leyes que tocan a…").
  - `puntos`: de 2 a 4 cambios concretos.
  - `no_dice`: de 0 a 3 cosas que un vecino querría saber y el texto publicado no trae.
- **Ejemplo de referencia:** la Ley 9735 (régimen penal juvenil), escrita a mano. Antes decía "la Dirección aplica medidas y programas"; ahora cuenta cuáles (acompañante que informa al juez, guardia 24 horas, hogares abiertos, escuela obligatoria en el encierro, castigos prohibidos) y avisa que la edad y las penas están en un anexo sin publicar.
- **En la web** el resumen se presenta como hecho con IA (o revisado a mano, si tiene `revisado`), con la aclaración de que vale el texto oficial.
- **Revisión:** al corregir o validar un resumen a mano, agregarle `revisado: AAAA-MM-DD`. Un resumen editado no se vuelve a generar solo; para rehacerlo: `bun run resumir-leyes <número>`.
- **Sin resumen** (por ejemplo, si falta la clave de la API): la página muestra el título que sale del texto (el nombre que se da la propia ley o su primer artículo) y el primer artículo.

**Estructura del texto** (`apps/web/scripts/temas/leyes.ts`):

- El texto plano del Boletín se separa en capítulos, artículos (con su rótulo si lo tienen, como "Objeto") y el cierre ("Dada en…" y quiénes firman).
- Se descartan el preámbulo ("El Senado y Cámara de Diputados… sancionan con fuerza de ley") y el artículo de forma "Comuníquese al Poder Ejecutivo".

## Personal de cada municipio

Fuente: el anexo 19 de la Ley de Responsabilidad Fiscal que cada municipio publica en su propio sitio (`municipios-personal`, scraper en `packages/scrapers/src/sources/municipios-personal.ts`). Cálculo en `buildMunicipalStaff` (`apps/web/scripts/temas/entidades.ts`).

- **Qué se muestra:** cargos de planta permanente y temporaria, y contratos de locación, del último trimestre publicado. Las horas cátedra quedan afuera: son horas, no cargos.
- **Son cargos, no personas,** igual que en la provincia. En la web siempre se aclara.
- **Cada 1.000 habitantes:** (cargos de planta + contratos) ÷ población estimada del departamento × 1.000. El puesto se calcula solo entre los municipios con datos.
- **Evolución:** una columna por año, con el último trimestre publicado de ese año.
- **Validación:** permanente más temporaria debe dar el total de planta. Si no cuadra por mucho, el documento se descarta; si no cuadra por poco, entra con una aclaración. Las aclaraciones sobre importes no se muestran, porque la web no publica importes.
- **Huecos:** cada municipio publica en su formato (PDF, ZIP, planillas, Drive) y varios solo los últimos trimestres. Godoy Cruz no lo tiene en su listado de anexos (figura en «Lo que no se publica») y Las Heras lo deja bajar desde una aplicación con links que vencen, así que no se puede archivar solo: su página dice que lo publica y que todavía no lo sumamos. Lavalle y San Martín se sumaron en octubre de 2026; de San Martín se archiva solo la hoja del anexo 19, porque su Excel trae todos los anexos y los 22 y 23 tienen datos de contribuyentes.
- **Ciudad de Mendoza:** además publica una serie mensual (`personal_capital_mensual.csv`), con otra definición. Va aparte y no se mezcla con la trimestral.

## Presupuesto y gasto de cada municipio

Fuente: los anexos de la Ley de Responsabilidad Fiscal (Ley 7314) que cada municipio publica cada trimestre en su sitio (`municipios-lrf`, scraper en `packages/scrapers/src/sources/municipios-lrf.ts`). Desde 2023 se interpretan el anexo 2 (gasto contra el presupuesto, `ejecucion_gastos.csv`), el 3 (recursos, `ejecucion_recursos.csv`) y el 5 (deuda, `deuda.csv`). Los anexos 1, 2 bis y 4 se archivan y todavía no se interpretan. Qué municipios y trimestres se pudieron leer, y por qué no los demás, está en `documentos.csv`.

**Formatos conocidos del anexo 2.** Cada uno lo resuelve una rama del lector (`parseSpendingAnnex`):

| Formato | Municipios | Cómo se reconoce |
|---|---|---|
| Una fila por partida, código de 5 dígitos | San Martín (planilla) | `41100 PERSONAL` y 11 cifras |
| Por área de gobierno | San Rafael (PDF) | `1.00.040101.PERSONAL`, con filas de jurisdicción y unidad |
| Código jerárquico con puntos | Capital (PDF del sistema de Contaduría) | `4.1.1.PERSONAL`, con los subtotales `4.EROGACIONES CORRIENTES` y `4.1.OPERACIÓN`; la partida es el código sin hijos en el documento (`6.3` no tiene `6.3.x`). Recursos por grupo: `1.1. De Jurisdiccion Municipal` |
| Código de 3 dígitos | Guaymallén | `## 411- Personal` y fila `999 TOTALES`; recursos de 4 a 6 dígitos (`5110 Rec. Ctes. de Origen Provincial`, `57120 Uso del Crédito…`). A veces el nombre queda en un renglón y las cifras solas en el siguiente: se unen |
| Infogov (pie "www.infogov.com.ar") | General Alvear, Malargüe, Maipú, Lavalle, La Paz, Rivadavia, Santa Rosa, Tunuyán, San Carlos y Tupungato | `41100000 (Subtotal)` abre cada partida, con el nombre y las cifras en las líneas siguientes; la fila final es "TOTAL GENERAL" y el trimestre va en palabras ("Segundo"). Las cifras largas se derraman y desordenan las columnas 10 a 12: se leen las columnas 2 a 9 y las otras se derivan de ellas. Se toman solo las partidas del nivel más detallado. En el anexo 3, los recursos tienen 4 dígitos (`5110` municipal, `5120` nacional, `5130` provincial; `52xx` de capital, `7xxx` financiamiento) |

**Casos de Infogov que el lector resuelve:**

- Un PDF que imprime el mismo anexo dos o tres veces (Maipú 2023-T4 y 2025-T3): se lee hasta la primera fila de totales.
- Tunuyán carga el crédito de intereses y de amortización en el código del subtotal (`42000000`, `62000000`) y la ejecución en la partida (`42100000`): las repeticiones del subtotal se suman a la partida, y el TOTAL GENERAL lo confirma.
- En el anexo 5, un negativo partido en dos renglones (el "-" en la fila y la cifra sola abajo, Santa Rosa y La Paz) se une; un "-" suelto que no es eso se prueba como cero; las filas con solo el código de cuenta se cuentan; y si el documento no trae fila de totales (Rivadavia), cada deuda se controla con sus propias cuentas y queda la observación.
- Las cuentas `616…` del anexo 5 (Santa Rosa, La Paz) son la amortización de esas mismas deudas vista como gasto: entran en el control de totales y no se listan, para no contar los pagos dos veces.
- El anexo 5 de La Paz y de Malargüe no lista préstamos sino cuentas del pasivo de corto plazo (fondos de terceros, retenciones, descubiertos): no es comparable con el de los municipios que informan préstamos. En la web se muestra como "Deudas de corto plazo", con una línea que lo explica (`SHORT_TERM_DEBT` en `apps/web/scripts/temas/municipal-budget.ts`; si otro municipio informa así, se suma ahí).

**Envases poco comunes:**

- San Carlos publica un ZIP por trimestre con los anexos 1 a 4 como páginas guardadas desde el navegador (`.htm`, y `.mht` de Internet Explorer en 2023) y el anexo 5 como planilla. `htmlTables` (`lrf/read.ts`) arma una fila por cada `<tr>`; del `.mht` toma la parte HTML y la decodifica. Se archivan tal cual, con su extensión.
- Tupungato publica un solo PDF por trimestre con todo el informe (93 a 141 páginas, con deudores con nombre en los anexos 22 y 23). Es un `report`: se recorren solo las primeras 20 páginas, cada anexo se ubica por su título impreso y se guardan solo esas páginas, como textos con su posición (JSON), con el sha256 del PDF original. El resto del informe nunca se guarda.

**Cómo se suma un municipio.** Se escribe su buscador en `packages/scrapers/src/lrf/finders/<municipio>.ts` (exporta `find()`, que devuelve un `Release` por trimestre con la URL de cada anexo, un ZIP o una planilla) y se prueba con `bun packages/scrapers/src/lrf/try-finder.ts <archivo>`, que lee los anexos 2, 3 y 5 con los mismos controles sin escribir en `data/`. Si el lector necesita un cambio, se hace en `lrf/annexes.ts` o `lrf/read.ts` con un caso de prueba y se vuelve a probar con los municipios que ya estaban. Después se registra en `FINDERS`.

**Control del archivo.** Además del período, se controla el número de anexo impreso en el título: hay archivos publicados con otro nombre (en Rivadavia 2024-T2, "Anexo02.pdf" trae el anexo 2 bis). Los nombres de archivo se reconocen en romano o arábigo y con errores de tipeo ("Anexo-II", "Anxo-2-bis", "Anexi-III").

**Por qué los anexos:** el Tribunal de Cuentas fija qué columnas lleva cada anexo y qué cuentas hay entre ellas (Acuerdo 3949, texto ordenado por el Acuerdo 6644/25). Los 18 municipios publican el mismo contenido en envases distintos (un PDF por anexo, un ZIP, una planilla con todos los anexos) y con distinto detalle. El anexo 2 trae el crédito votado, así que da el presupuesto aprobado aunque el municipio no publique la ordenanza.

**Capas.** Cada una resuelve una sola diferencia, así que sumar un municipio es escribir su buscador, y sumar un anexo es escribir su lector:

| Capa | Dónde | Resuelve |
|---|---|---|
| Encontrar | `FINDERS` en `sources/municipios-lrf.ts`, una por municipio | Dónde publica cada uno los documentos de cada trimestre |
| Leer | `lrf/read.ts`, una por formato | PDF o planilla → filas de fichas. Los PDF se leen por la posición de cada texto, porque San Rafael imprime cada columna como un bloque aparte |
| Interpretar | `lrf/annexes.ts`, una por anexo | Filas → cifras, con las cuentas del propio documento |
| Clasificar | `lrf/classify.ts` | El código de partida de cada municipio → un código común |

**Normalización:**

- **Código común:** el clasificador por objeto del gasto, con un nivel por número (`4.1.1` es Personal). San Martín escribe `41100` y San Rafael `040101` (precedido de jurisdicción y unidad). Si dos municipios usan códigos distintos para lo mismo, la equivalencia va en `EQUIVALENT_CODES` con un comentario (por ejemplo, la amortización de la deuda es `060201` en San Rafael y `72100` en San Martín). Siempre se publica el código y el nombre originales junto al común.
- **Detalle:** el que publica cada municipio. San Rafael abre cada partida por jurisdicción y unidad; San Martín da un total por partida. Para comparar municipios se suma por `objeto_codigo`.
- **Acumulados:** los importes van desde enero hasta el fin del trimestre. El cuarto trimestre es el año completo; el año en curso se muestra con su último trimestre y la aclaración ("hasta junio").
- **Pesos nominales,** como todos los datos; la conversión a pesos de hoy se hace en la web.
- **Celdas vacías:** las planillas dejan en blanco los montos en cero (San Martín). Una celda vacía entre dos cifras de la misma fila se lee como cero (`blankAsZero` en `lrf/read.ts`); si no, todas las cifras siguientes se correrían una columna.
- **Recursos:** los códigos solo coinciden entre municipios en el primer dígito, que da el `tipo` (corriente, capital o financiamiento). Debajo, cada municipio agrupa distinto: San Martín registra casi toda la coparticipación en un rubro "a clasificar" y San Rafael la abre por impuesto. La tabla de equivalencias de recursos se arma cuando estén relevados todos los municipios.
- **Deuda:** los movimientos del anexo 5 son del trimestre, no acumulados, y el saldo final del cuarto trimestre es la deuda al cierre del año. Un saldo adeudado nunca es negativo: San Martín y San Rafael anotan a veces los saldos en negativo, como pasivo, y se toman en valor absoluto (queda la observación en `documentos.csv`). Se omiten las deudas con todas sus cifras en cero. La norma legal y el acreedor todavía no se leen, porque en los PDF vienen partidos en varias líneas. Algunos municipios no informan préstamos sino cuentas del pasivo: en Malargüe, el anexo 5 es deuda de corto plazo con bancos (descubierto, cheques de pago diferido). En Infogov se descartan las filas "Subtotal" y la fila final es "TOTAL GENERAL".
- **Páginas giradas:** si un PDF no cierra leído por filas horizontales, se lee por el otro eje (`pdfTables(bytes, "v")`). Pasa con el anexo 5 de General Alvear.
- **Signo suelto:** un "-" separado de la cifra es signo si abre la fila o sigue a otra cifra con decimales. Después de un nombre es ambiguo: en General Alvear es parte del nombre ("Prestamo Ley 9356 - 33980500,00") y en San Rafael es un saldo negativo ("LEY9243 - 9.007,97"). El anexo 5 prueba las dos lecturas y se queda con la que cierra con la fila de totales.
- **Negativos entre paréntesis** ("(1.324.907.402,56)", Malargüe) se leen como negativos, solo si tienen decimales: los números de columna "(1)", "(2)" quedan como texto.

**Validación** (`parseSpendingAnnex`):

- Se rechaza el documento si una partida no cumple crédito vigente = votado + aumentos − disminuciones, o si las partidas no suman la fila TOTALES en una columna publicada (2 a 9). Queda en `documentos.csv` con el motivo y un aviso en la corrida.
- Si fallan solo las columnas 10 a 12, que se derivan de las otras y no se publican, el documento entra y la falla queda como observación en `documentos.csv`. Pasa en San Martín 2025-T2: la planilla corre una cifra de la columna 12 a la fila de abajo.
- El período impreso en el anexo debe coincidir con el del listado. El anexo 1 es anual: solo se controla el año.
- En el anexo 3 se aplican las mismas reglas: cálculo vigente = original + aumentos − disminuciones y la suma contra la fila de totales. Se rechazó San Martín 2025-T1, donde dos rubros tienen lo ingresado cargado en la columna de aumentos.
- Control entre anexos: el cálculo de recursos vigente (anexo 3) es igual al crédito vigente de gastos (anexo 2), porque el presupuesto se aprueba equilibrado. Se cumple en San Martín en todos los cortes y en San Rafael desde 2025; en 2023 y 2024 San Rafael no incluye el financiamiento en el anexo 3.

**Datos personales:** los anexos 22 y 23 traen deudores con nombre y nunca se bajan. De una planilla con todos los anexos (San Martín) se archivan solo las hojas de los anexos 1 a 5.

**En la web** (`/municipios/<slug>/presupuesto/<año>`; sin año, abre el último año publicado, aunque esté en curso; la ficha del municipio muestra ese mismo año con hasta qué mes llega). Cálculo en `apps/web/scripts/temas/municipal-budget.ts`:

- **Cada año** se muestra con su último trimestre publicado. Si no es el cuarto, la página avisa hasta qué mes llegan las cifras y el gráfico lo marca con asterisco. Si el año ya terminó pero falta el informe de diciembre (no se publicó o no se pudo leer, como Tupungato 2024), el aviso lo dice así y no "el año todavía no terminó".
- **Aprobado, autorizado, gastado y pagado** son las sumas del crédito votado, el crédito vigente, el devengado y el pagado del anexo 2. "Gastado" es lo devengado, y la página lo explica (glosario: `devengado`, `credito-vigente`).
- **En qué se gasta** suma por `objeto`, igual para todos los municipios. **Por área** solo aparece si el municipio abre el gasto por jurisdicción (San Rafael).
- **De dónde sale la plata:** lo ingresado sin préstamos ni remanentes (tipo `financiamiento`), que van en un renglón aparte. Los rubros llevan el nombre que usa cada municipio, porque los códigos no coinciden; los grupos de Infogov se acortan para que entren en el celular ("Recursos corrientes de origen provincial" → "De la Provincia").
- **Deuda:** el saldo final del último trimestre del año, y los pagos y la deuda nueva sumados en los trimestres del año.
- **Comparación entre años y por habitante:** en pesos de hoy, con el deflactor del sitio y la población estimada del año.

**Cómo debería publicarse:** una planilla por trimestre con las columnas del Acuerdo, como hace San Martín, se lee sin errores y la puede reusar cualquiera. Un PDF se puede leer, pero cada sistema contable lo arma distinto.

## Transparencia municipal

Qué publica cada municipio de lo que las leyes le piden publicar. Relevamiento a mano en `data/curado/transparencia-municipal.yaml` y cálculo en `apps/web/scripts/temas/transparency.ts`. Se muestra en la página de cada municipio («Qué publica el municipio») y en el mapa de `/municipios` («Qué publica»).

- **Una lista verificable, no un puntaje propio.** Un índice da un número que no dice qué falta. La lista dice, para cada cosa, si la encontramos, de qué período es el último dato y dónde está, y cualquiera puede comprobarlo. No es una nota al municipio: es lo que encontramos el día que lo revisamos.
- **Las 9 cosas** (marco: Ley 7314 de Responsabilidad Fiscal y Acuerdo 3949 del Tribunal de Cuentas, Ley 9070 de Acceso a la Información Pública y Ley 8993 de Ética Pública): presupuesto del año, ejecución del gasto (anexos 2 a 5), personal y contratos (anexo 19), deuda, compras y licitaciones, decretos y ordenanzas, sueldos de las autoridades, declaraciones juradas y un canal para pedir información.
- **Estados:** *al día*, *atrasado* (lo publica, pero el último dato es viejo), *lo publica* (sin fecha a la vista), *no se puede leer* (existe pero no se puede descargar ni leer: una aplicación sin archivo, un link roto, un PDF escaneado ilegible) y *no lo publica*. «Publica» cuenta al día, atrasado y lo publica.
- **Cuándo está al día**, contado desde la fecha de verificación:
  - Presupuesto: el del año en curso.
  - Ejecución, personal y deuda: el último trimestre cerrado hace más de 75 días (los anexos salen unos dos meses después del cierre). El 16 de octubre, el 2.º trimestre.
  - Compras y decretos u ordenanzas: lo más reciente, de los últimos 90 días.
  - Sueldos de las autoridades: de los últimos 120 días.
  - Declaraciones juradas: del año en curso o del anterior.
- **Lo que ya bajamos manda sobre el relevamiento:** el personal sale del anexo 19 que archiva `municipios-personal` (último trimestre y archivo).
- **Lo que publica la provincia también cuenta, con la aclaración.** Si el municipio no lo tiene al día en su sitio:
  - Declaraciones juradas: las de la Oficina de Ética Pública (`etica-publica`), que por la Ley 8993 las publica para los funcionarios municipales.
  - Decretos y ordenanzas: las normas del municipio en el Boletín Oficial (`boletin-oficial`) del último año, con la fecha de la más reciente.
  - Presupuesto: la ordenanza de presupuesto del año publicada en el Boletín Oficial, si su sumario lo dice explícitamente (se carga a mano en el relevamiento). Un decreto que solo promulga «la ordenanza presupuestaria» sin decir el año no alcanza.
- **Compras:** cuentan si el municipio muestra la lista de sus compras, en su sitio o con un link directo a su búsqueda en el portal provincial. Remitir al portal de compras de la Provincia en general no alcanza. Si solo publica llamados, sin a quién se adjudicó y por cuánto, cuenta igual, con la aclaración en la nota.
- **Sin fecha a la vista:** si lo publica en una aplicación con buscador donde no se ve la fecha del último dato, el estado es *lo publica* (cuenta como publicado, no como al día).
- **Puesto y promedio:** por cantidad de cosas publicadas; los empates comparten puesto.
- **Sin índices de otros:** no se muestran puntajes ni rankings de transparencia hechos por otros sitios u organizaciones, aunque sean sitios amigos. Los sitios amigos se enlazan solo desde el pie de página.
- **Revisión:** cada municipio lleva su `fecha_verificacion`. Se vuelve a revisar al menos cada trimestre, cuando salen los anexos, y cada vez que un municipio cambia de sitio. Lo que no se encuentra se suma a «Lo que no se publica» si todavía no está.

## Personal y costo de cada organismo

Fuente: anexo 19 del informe trimestral de Responsabilidad Fiscal (`lrf-personal`). Cálculo en `apps/web/scripts/temas/gobierno.ts`.

- **Son cargos, no personas.** Una persona puede tener más de un cargo; los docentes suman además horas cátedra. En la web siempre se aclara.
- **Unir organismos entre años:** el anexo no trae códigos, y los organismos cambian de nombre entre gestiones. Cada nombre se asigna a su organismo actual en `equivalencias_lrf` de `data/curado/jurisdicciones.yaml`.
  - Lo que se dividió sin un sucesor claro (por ejemplo, Economía y Energía) queda en `null` y no se suma a ningún organismo.
  - La serie de un ministerio que absorbió áreas no es comparable antes y después del cambio. Se avisa en la nota de la página.
- **Costo anual:** los importes del anexo son acumulados desde enero, así que el costo del año es el del último trimestre informado. Se pasa a pesos de hoy con el IPC promedio del año.
- **Costo mensual por cargo:** costo del último año completo ÷ promedio de cargos de los cuatro trimestres (planta y contratos) ÷ 12. Incluye aguinaldo y lo que se liquide; es un promedio aproximado, no un sueldo.
- **Cargos en el Presupuesto:** planillas 8.2 (cargos ocupados al mes de corte) y 8.6 (retenidos y vacantes en trámite, desde 2022) de cada Ley de Presupuesto (`presupuesto-planta`). Se asignan al organismo por el código `carácter-jurisdicción-unidad`. En 2025 la 8.6 no trae códigos de unidad, así que ese año no se muestran vacantes por organismo. El año en proyecto se marca con asterisco.
- **Conducción:** los funcionarios del Ejecutivo de la página de funcionarios, más quienes tienen un cargo vigente en la Oficina de Ética Pública en las reparticiones del organismo. Se ordenan por jerarquía según el nombre del cargo.
- **Compras:** los procesos cuyo comprador empieza con alguno de los `prefijos_compras` del organismo (código `carácter-jurisdicción-`).
- **Cruces en `/gobierno`** (`buildOverview`):
  - Cambio de cargos de planta desde el cuarto trimestre de 2023, el inicio de la gestión actual. Solo organismos con al menos 50 cargos. Se marcan con asterisco los que cambiaron de áreas (`antes`), porque parte de la diferencia puede ser un traspaso.
  - Contratados cada 100 cargos de planta.
  - Se presentan como preguntas, no como irregularidades.
- **Designaciones:** las del Boletín Oficial (`designaciones`), asignadas por organismo emisor o repartición. La cobertura depende de cuántos Boletines tengamos con texto completo.

## Desvío entre lo estimado y lo adjudicado

- **Señal "adjudicado-sobre-estimado":** procesos con un estimado de al menos $ 100.000 y una adjudicación de al menos el doble. Se ordenan por la diferencia en pesos.
- **Señal "estimado-simbolico":** estimados de menos de $ 1.000 y adjudicaciones de al menos $ 100.000 y de más de 100 veces lo estimado. No se mide un sobreprecio: el organismo no estimó, y eso impide el control.
- **En la hoja del proceso:** el desvío se expresa en "veces lo estimado" a partir del doble y en porcentaje por debajo. Lleva aviso en los dos casos de arriba.
- **Explicaciones posibles** (errores de carga, cambios de alcance, inflación entre el llamado y la adjudicación): se mencionan siempre. Son señales, no acusaciones.

