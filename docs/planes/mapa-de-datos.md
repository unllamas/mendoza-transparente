# Plan: mapa de datos

Objetivo: saber, para cada dato, en qué punto del camino está (**relevado → descargado → procesado → mostrado**, o **no se publica → pedido**) y qué falta para que avance. Es la lista de trabajo para decidir qué sumar al sitio y qué pedir por la Ley 9070.

Fecha: 01/11/2026. Estado: primera versión. La parte A se recalcula sola con `bun run mapa-de-datos`; las partes B a D se revisan a mano.

## Cómo se lee y cómo se mantiene

| Etapa | Dónde queda la huella | Cómo se comprueba |
|---|---|---|
| Relevado | `docs/relevamiento-fuentes.md` | Está en la tabla de su área |
| Descargado | `data/raw/<id>/manifest.jsonl` (con sha256) | `bun run crudo <id>/<archivo>` |
| Procesado | `data/processed/<id>/*.csv` + `.meta.json`, fila en `sources.yaml` | Se descarga en `/datos` |
| Mostrado | Una página, una ficha o el asistente lo lee | `bun run mapa-de-datos` |
| No se publica | `data/curado/no-publicado.yaml` | Aparece en `/no-publicado` |
| Pedido | `pedidos:` del mismo ítem, con la fecha y el número de expediente | Aparece en `/no-publicado` |

**Cuándo se actualiza este documento:** cuando un dato cambia de etapa. Por ejemplo, cuando una página empieza a usar un CSV, cuando se procesa algo que estaba archivado, cuando se suma una fuente relevada o cuando se presenta un pedido. El cambio va en el mismo PR.

**Todos los CSV se pueden descargar en `/datos`.** "No se muestra" quiere decir que ninguna página, ficha ni el asistente lo usa para responder: el dato está, pero nadie lo ve si no lo busca.

## Resumen

| Situación | Cuántos | Dónde está el detalle |
|---|---|---|
| CSV procesados | 60, de 31 fuentes (hay 32 en `sources.yaml`) | `bun run mapa-de-datos` |
| Procesados que no usa ninguna app | **15** | [A](#a-lo-que-tenemos-y-no-mostramos) |
| Usados solo por `apps/votacion`, que todavía no es pública | 8 (resultados de elecciones 2015 a 2026) | [Votación](votacion.md) |
| Archivados y sin procesar | 6 grupos | [B](#b-lo-que-descargamos-y-no-procesamos) |
| Relevados y sin descargar | 30 fuentes | [C](#c-lo-relevado-que-falta-recopilar) |
| Lo que el Estado no publica | 40 temas (20 sin publicar, 17 parciales y 3 desactualizados) | [D](#d-lo-que-el-estado-no-publica) |
| Pedidos de acceso a la información presentados | **0 de 40** | [D](#d-lo-que-el-estado-no-publica) |

## A. Lo que tenemos y no mostramos

Salida de `bun run mapa-de-datos --sin-uso` del 01/11/2026, con el período, por qué no se muestra y qué haría falta.

| Fuente / archivo | Filas | Período | Qué es | Dónde encajaría | Prioridad |
|---|---:|---|---|---|---|
| `dnap-aif/aif_trimestral.csv` | 70.445 | 2005 a 2T 2026 | Ingresos y gastos de las 24 provincias por tipo: sueldos, bienes, servicios, transferencias, intereses, obra | Página nueva **«¿En qué se gasta?»**: de cada $100, cuánto va a cada cosa, y Mendoza contra otras provincias | **Alta** |
| `lrf-personal/contratos.csv` | 1.205 | 2018 a 2026 | Contratados de locación por organismo y trimestre: altas, bajas e importe liquidado (Anexo 20) | `/empleo` y la ficha de cada organismo en `/gobierno`. Hoy se muestra la cantidad de contratados, no las altas, las bajas ni el importe | **Alta** |
| `presupuesto-planta/cargos_escalafon.csv` | 45.607 | 2020 a 2027 | Cargos ocupados de cada unidad por escalafón y clase (planilla 8.3) | Ficha del organismo: qué tipo de cargos tiene (docentes, policías, médicos, administrativos) | Media |
| `presupuesto-planta/jurisdicciones.csv` | 151 | 2020 a 2027 | Cargos, horas cátedra y partida de personal por jurisdicción (planilla 8.1) | `/empleo`: costo de la planta por ministerio según la ley | Media |
| `hacienda-participacion-municipal/coparticipacion_mensual.csv` | 1.890 | 2018 a 2026 | Lo que la Provincia giró a cada municipio, mes a mes y por concepto | `/coparticipacion`: hoy se muestra el total del año, no los meses ni los conceptos | Media |
| `energia-regalias/regalias_mensual.csv` | 13.064 | 1991 a 2026 | Regalías de petróleo y gas cobradas por provincia y producto | `/recaudacion`: cuánto entra por petróleo y cómo cambió | Media |
| `etica-publica/sanciones.csv` | 736 | sin fecha de la sanción (solo de vencimiento) | Agentes con sumarios o sanciones de la Oficina de Ética Pública | Antes de mostrarlo hay que decidir el criterio: son personas, muchas sin cargo jerárquico (skill `contenido-y-metodologia`) | Media, con criterio pendiente |
| `deie-ipc/ipc_mensual.csv`, `ipc_capitulos.csv`, `canasta_mensual.csv` | 9 / 81 / 17 | 2025 a 2026 | Inflación del Gran Mendoza por rubro y canasta básica | Contexto en `/recaudacion` y en «pesos de hoy». La serie es corta (desde enero de 2026): hoy se ajusta con el IPC nacional | Baja |
| `universidades-estadisticas/presupuesto.csv` | 255 | 2012 a 2024 | Presupuesto de la UNCuyo y la UTN según el Anuario | `/universidades`: hoy muestra las transferencias de Presupuesto Abierto; este sirve para cruzarlas | Baja |
| `municipios-personal/personal_capital_mensual.csv` | 31 | 2021 a 2025 | Planta, locaciones y gasto mensual de la Ciudad de Mendoza | Ficha de Capital en `/municipios` | Baja |
| `legislatura/remuneraciones.csv` | 10 | 2025 a 2026 | Total de viáticos y pasajes informado por cada cámara | `/funcionarios/viajes`, junto con lo que no se publica de la Legislatura | Baja |
| `dnap-deuda/deuda_stock.csv` | 20.475 | 1996 a 2026 | Deuda de las 24 provincias por acreedor | `/deuda`: Mendoza contra otras provincias. Hoy se usa solo la deuda de Hacienda de Mendoza | Baja |
| `municipios-lrf/documentos.csv` | 1.242 | 2023 a 2026 | Índice de los informes de Responsabilidad Fiscal de cada municipio | Links a los documentos originales en la ficha de cada municipio | Baja |

Además, `boletin-oficial/normas.csv` se muestra, pero **el 94 % de las 15.500 normas no tiene categoría** (`categoria` vacía): solo se separan leyes, designaciones y unas pocas contrataciones, normas de presupuesto y de deuda. Clasificar adjudicaciones, ampliaciones presupuestarias, aportes a empresas del Estado y emisiones de deuda abriría datos que hoy están en el texto pero no se ven.

## B. Lo que descargamos y no procesamos

| Qué | Dónde está | Qué falta |
|---|---|---|
| Planillas 8.5 y 8.7 de la Ley de Presupuesto (horas cátedra por escalafón y cargos nuevos) | `data/raw/presupuesto-planta/` | El scraper las archiva y no las procesa. La 8.7 dice qué cargos nuevos autoriza cada ley |
| Viáticos y pasajes del Senado por solicitud | `data/raw/legislatura/` (PDF trimestrales) | Se guarda solo el total por trimestre. El detalle trae beneficiarios, en su mayoría personal: decidir qué se publica antes de procesarlo |
| Ejecución presupuestaria y anexos del Acuerdo 3949 de Diputados | `data/raw/legislatura/` | Se archivan los PDF más recientes, sin leerlos |
| Informes IPC de la DEIE en PDF | `data/raw/deie-ipc/` | Se leen las tablas principales; no las aperturas por región |
| Escrutinios y resultados por mesa | `elecciones-datos-abiertos/mesas.csv.gz` y similares | Procesados, pero solo los usa `apps/votacion`, que no está abierta al público |
| Texto completo de las normas del Boletín | `data/processed/boletin-oficial/textos/` | Lo usan designaciones y misiones oficiales; el resto de las categorías del Boletín no tiene extractor (ver arriba) |

## C. Lo relevado que falta recopilar

Fuentes del [relevamiento](../relevamiento-fuentes.md) que todavía no tienen scraper. La dificultad es la del relevamiento: 🟢 fácil, 🟡 media, 🔴 difícil.

### Gasto y presupuesto provincial (lo que más falta)

| Fuente | Qué daría | Dif. |
|---|---|---|
| Ley de Presupuesto: gasto por jurisdicción, objeto y **finalidad** (salud, educación, seguridad) | Para qué se usa la plata, no solo en qué tipo de gasto | 🟡 PDF |
| Ejecución mensual AIF de Hacienda | Lo mismo que `dnap-aif`, pero mes a mes y solo Mendoza, con un mes de atraso | 🟡 PDF |
| Responsabilidad Fiscal provincial, anexos 2 a 6, 16 y 30 | Ejecución y deuda trimestral de la Provincia. Hoy se bajan solo los anexos 19 y 20 | 🟡 ZIP con PDF |
| Ley de Presupuesto: planilla 6.1 (empresas y fondos fiduciarios) y 7.x (plan de obras) | Cuánto se le asigna a cada empresa del Estado y qué obras se prometen | 🟡 PDF |
| Plan Provincial de Inversión Pública | Cartera de obras | 🟡 PDF |
| Fideicomiso Fondos de Resarcimiento | Los USD 1.023 millones de Portezuelo: ingresos, inversiones y obras | 🟡 PDF |
| ATM: anexos de Responsabilidad Fiscal | Gasto tributario (exenciones) y morosidad por municipio | 🟡 PDF |
| DNAP TOP | Recaudación propia de cada provincia, para comparar | 🟢 |
| Presupuesto Abierto (Nación) | Transferencias **no automáticas** de Nación a Mendoza | 🟡 token gratis |
| CKAN provincial (histórico) | Viáticos 2018 a 2021, planta de noviembre de 2023, ejecución 2016 a 2023: sirve para mostrar lo que antes se publicaba | 🟢 |

### Compras, obras y control

| Fuente | Qué daría | Dif. |
|---|---|---|
| COMPR.AR en vivo | Las compras desde el 04/01/2026, donde se corta el OCDS (ver `compras-2026` en no publicado) | 🔴 sesión ASP.NET |
| MapaInversiones (Nación) | Obras nacionales en Mendoza, con monto, avance y contratista | 🟢 CSV |
| Irrigación: licitaciones | Obras hídricas | 🟡 |
| IPV | Barrios en ejecución | 🟡 |
| Tribunal de Cuentas: fallos | Juicios de cuentas, multas y cargos por organismo desde 2005 | 🟡 |
| Fiscalía de Estado | Juicios contra el Estado | 🟡 |
| EMESA, AYSAM, FTyC | Balances de las empresas y fondos del Estado | 🟡 PDF |

### Municipios

| Fuente | Qué daría | Dif. |
|---|---|---|
| Ejecuciones municipales comparadas (Hacienda) | La ejecución de los 18 municipios en un solo formato | 🟡 PDF |
| Portales de Capital (CKAN) y Godoy Cruz (XLSX) | Funcionarios con salario, compras, obras, pauta publicitaria | 🟢 |
| Compras de Maipú, Tunuyán, Alvear y Malargüe (Infogov) | Compras municipales con un solo scraper | 🟡 |
| Rivadavia: nómina y sueldos de autoridades | Sueldos de intendente y secretarios | 🟡 PDF |

### Legislatura, elecciones e indicadores

| Fuente | Qué daría | Dif. |
|---|---|---|
| Diputados y Senado: proyectos y diarios de sesión | Qué presenta cada legislador; votaciones sacadas del texto | 🟡/🔴 |
| DINE | Resultados nacionales por mesa en Mendoza, 1983 a 2023 | 🟢 |
| CNE: financiamiento de campañas | Aportantes de las agrupaciones en elecciones nacionales | 🟡/🔴 captcha: no se pasa |
| DEIE: pobreza, PBG por departamento, empleo | Indicadores sociales provinciales | 🟡 |
| SNIC | Delitos por departamento desde 2000 | 🟢 CSV |
| OEDE / SIPA | Empleo privado y salarios por departamento | 🟢 |
| DEIS | Nacimientos, defunciones y mortalidad infantil por departamento | 🟢 CSV |
| INDEC EPH, Censo 2022, Aprender | Pobreza, desempleo, educación | 🟡 |
| UNCuyo: becas, plan de obras, compras, estadísticas por facultad | Lo que la universidad publica por su cuenta | 🟢/🟡 |

## D. Lo que el Estado no publica

Lista viva en `data/curado/no-publicado.yaml` (se ve en `/no-publicado`): 40 temas, cada uno con el organismo, dónde se buscó y el texto del pedido listo. **Ninguno tiene un pedido presentado todavía** (`pedidos: []` en los 40). Presentar los pedidos es lo que más mueve este mapa: cada respuesta convierte un tema de D en un dato de A.

Los que más ayudarían a explicar el gasto, por orden:

1. `cuenta-general`: la Cuenta General del Ejercicio, el cierre oficial de lo gastado cada año.
2. `ejecucion-detallada`: la ejecución por programa (desactualizada).
3. `gasto-personal-detallado`: el gasto en personal mes a mes y por concepto.
4. `nomina-sueldos`: la nómina con sueldos (parcial).
5. `contratados`: quiénes son los contratados.
6. `costo-misiones-oficiales`: cuánto cuestan los viajes oficiales.
7. `compras-2026`: las compras desde enero de 2026.
8. `dieta-legisladores`: cuánto cobra cada legislador.

## Próximos pasos

1. Presentar los primeros pedidos de la lista D (la nota sale de `/pedir`) y registrarlos (proceso en `docs/procesos/participacion.md`).
2. Página «¿En qué se gasta?» con `dnap-aif` (A).
3. Sumar `lrf-personal/contratos.csv` y la coparticipación mensual a las páginas que ya existen.
4. Relevar y procesar el gasto por finalidad de la Ley de Presupuesto (C).
5. Decidir el criterio para `etica-publica/sanciones.csv` y para el detalle de viáticos del Senado.
