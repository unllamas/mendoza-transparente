# Mendoza Transparente: relevamiento de datos públicos

*Relevado el 11/10/2026. Abrimos cada URL ese día con un script (curl) y en las fuentes clave descargamos archivos de muestra para ver si se podían procesar.*

---

## 0. Resumen

- **Hay mucho más dato del que se ve.** Varias fuentes clave tienen API o archivos estructurados que funcionan sin login:
  - Boletín Oficial: API JSON con texto completo.
  - Declaraciones juradas de funcionarios: API JSON.
  - Compras en formato OCDS.
  - Deuda: XLSX.
  - Coparticipación a municipios: XLS mensual.
  - Transferencias de Nación (DNAP): diarias, en XLS y CSV.
- **El problema no es que no exista el dato, sino cómo está publicado.** Está disperso, en PDF, desactualizado, y hay que buscarlo en 18 sitios municipales distintos. Ahí está el valor del proyecto.
- **Datos que deberían publicarse y no se publican:**
  - Cuenta General del Ejercicio.
  - Nómina y sueldos actualizados.
  - Financiamiento de campañas provinciales.
  - Turnos y esperas en salud.
  - Estadísticas de seguridad propias de la provincia.
  - Balances de Mendoza Fiduciaria.

  Esta ausencia también se puede mostrar en el sitio, como un "índice de opacidad".
- **Los municipios son el eje para comparar.** Solo Capital, Godoy Cruz y Luján de Cuyo tienen datos abiertos de verdad. Lo único comparable entre los 18 son:
  - Los anexos trimestrales de la **Ley de Responsabilidad Fiscal 7314**, con el mismo formato en todos los municipios, aunque en PDF.
  - La **coparticipación** que la provincia transfiere a cada municipio.
  - San Martín (sitio hackeado) y Lavalle (sin sitio) no publican nada.
- **Detalle técnico:** la provincia migró de `mendoza.gov.ar` a `mendoza.gob.ar` / `sitios.mendoza.gob.ar`, y el firewall devuelve **403 si no se manda un User-Agent de navegador**. Para listar el contenido de los sitios WordPress conviene usar `wp-sitemap.xml` (la API `wp-json` está bloqueada).

---

## 1. Preguntas que se pueden responder (y con qué fuente)

| Pregunta del ciudadano | Fuente principal | Estado |
|---|---|---|
| ¿Cuánto gastó la provincia y en qué? | Ejecución AIF mensual (Hacienda), anexos de Responsabilidad Fiscal (LRF), Ley de Presupuesto, DNAP | Hay datos. PDF con texto o XLS |
| ¿Cuánto recauda y de dónde viene la plata? | Ejecución mensual AIF, DNAP RON (fondos que manda Nación) y TOP (recaudación propia), notas de recaudación | Hay datos |
| ¿Cuánto debe Mendoza? | Tablero de deuda en XLSX (2015 a 2026), DNAP deuda | **Fácil** |
| ¿Cuánta plata recibió cada municipio? | Participación municipal en XLS mensual (Hacienda) | **Fácil** |
| ¿Qué municipio gastó más o mejor? | Anexos LRF municipales, ejecución municipal consolidada, DNAP para municipios | Difícil (PDF), pero comparable |
| ¿A quién le compra el Estado y por cuánto? | OCDS de COMPR.AR (2020 a enero de 2026) más scraping de COMPR.AR | Fácil hasta enero de 2026; después, difícil |
| ¿Qué obras se hicieron? | OCDS, adjudicaciones en el Boletín, licitaciones de Irrigación, MapaInversiones (obras nacionales), plan de obras del presupuesto | Hay que armarlo: no existe un mapa unificado |
| ¿Cuántos empleados públicos hay y cuánto cuestan? | Anexo 19 LRF, planta del presupuesto (8.x), ocupación DNAP | PDF; la nómina con nombres no es pública |
| ¿Qué patrimonio tienen los funcionarios? | API de declaraciones juradas de Ética Pública | **Fácil** |
| ¿Quién fue sancionado? | API de sanciones de Ética Pública (737 casos), fallos del Tribunal de Cuentas | Fácil o media |
| ¿Qué decretó el gobierno hoy? | API del Boletín Oficial | **Fácil** |
| ¿Qué hacen los legisladores? | Diputados y Senado: proyectos y diarios de sesión | Media. **No hay votaciones nominales estructuradas** |
| ¿Cuánto ingresa por petróleo? | Secretaría de Energía: regalías y producción por pozo | **Fácil**, mensual |
| ¿Mejoró o empeoró la vida? | DEIE (IPC, canasta, pobreza, PBG), INDEC EPH, SNIC, DEIS, Aprender, OEDE | Hay datos (mezcla de formatos) |
| ¿Cómo votó Mendoza históricamente? | Junta Electoral (PDF), CKAN (2015 a 2019), DINE | Media |
| ¿Quién financia las campañas? | CNE (solo campañas nacionales) | Provincial: **no está publicado** |

---

## 2. Inventario de fuentes por área

**Escala de dificultad:**
- 🟢 Fácil: API, CSV o XLSX.
- 🟡 Media: PDF con texto, HTML o formularios simples.
- 🔴 Difícil: aplicaciones ASP.NET o JavaScript, Power BI, captcha o PDF con tablas complejas.

### 2.1 Finanzas provinciales (Ministerio de Hacienda)

Sitio base: `https://sitios.mendoza.gob.ar/haciendayfinanzas/` (para listar todo: `wp-sitemap.xml`)

| Fuente | URL | Datos | Formato / frecuencia | Cobertura | Dif. |
|---|---|---|---|---|---|
| Ley de Presupuesto | `…/ley-de-presupuesto/` (p. ej. `/2026/08/proyecto-presupuesto-2027/`) | Gasto por jurisdicción, objeto y programa; recursos; empresas y fondos fiduciarios (6.1); plan de obras (7.x); **planta por cargo (8.x)**; proyección de caja | Unos 35 PDF por año. Anual. **El proyecto 2027 ya está publicado** | 2020 a 2027 | 🟡 |
| Ejecución mensual AIF | `…/668-2/ejecucion-presupuestaria/ejecuciones-presupuestarias-provinciales/` | Recursos (IIBB, automotor, regalías, coparticipación) y gastos por carácter, mes a mes, base devengado | Un PDF de 1 página por año (`serie_mensual_AA.pdf`). Mensual, con un mes de atraso | **2001 a 2026** | 🟡 |
| Ejecuciones municipales | `…/ejecuciones-presupuestarias-municipales/` | Ejecución de los 18 municipios, comparada | PDF. Anual | 2019 a 2024 (faltan años sueltos) | 🟡 |
| **Responsabilidad Fiscal (LRF) trimestral** | `…/ley-de-responsabilidad-fiscal/` | Anexos 2 a 6 (ejecución y deuda), 16 (condiciones de la deuda), **19 (planta y contratos con importes)**, 20 (locaciones), 30; pagos de deuda; Fondo Anticíclico | ZIP con PDF dentro. Trimestral, unos 2 meses después del cierre | 3T 2018 a 2T 2026 | 🟡 |
| **Deuda: stock vigente** | `…/stock-vigente/` | Cada instrumento: acreedor, moneda, saldo en USD, tasa, vencimiento, perfil de pagos | **XLSX** de 7 hojas. Trimestral | 2T 2026 | 🟢 |
| Deuda: histórico | `…/14619-2/` | Los mismos tableros | ZIP con XLSX | 2015 a 2025 | 🟢 |
| Informe de deuda | `…/deuda-publica/informe-de-la-deuda/` | Informe narrativo con cuadros | PDF. Semestral | 2015 a 2026 | 🟡 |
| Recaudación | `…/informes-de-recaudacion/` | Recaudación acumulada y variación real | PDF de 2 páginas. Mensual. **Solo queda el último** (hay que archivarlos uno por uno) | — | 🟡 |
| **Participación municipal** | `…/participacion-municipal/` | **Coparticipación mensual por municipio**, por recurso, índices de distribución, retenciones | **XLS**. Mensual | 2018 a 2026 (serie desde 1997) | 🟢 |
| Fideicomiso Fondos de Resarcimiento | `…/fideicomiso-fondos-de-resarcimiento/` | Los USD 1.023 millones que pagó Nación (ex Portezuelo del Viento): ingresos, inversiones y obras | PDF. Trimestral | 2025 a 2026 | 🟡 |
| Plan Provincial de Inversión Pública | `…/plan-provincial-de-inversion-publica/` | Cartera de obras | PDF. Anual | 2026 | 🟡 |
| ATM: anexos LRF | https://atm.mendoza.gov.ar/ley-responsabilidad-fiscal/ | **100 mayores deudores de inmobiliario y automotor**, morosidad por municipio, grandes contribuyentes de IIBB, **gasto tributario (exenciones) por municipio** | Unos 1.189 PDF. Trimestral | 2022 a 2026 | 🟡 |
| CKAN provincial | https://datosabiertos.mendoza.gov.ar/ (API `/api/3/action/package_search?rows=1000`) | 204 datasets: ejecución 2016 a 2023, deuda, **planta de personal (nov 2023)**, viáticos 2018 a 2021, FTyC | CSV. **Desactualizado** | 2015 a 2024 | 🟢 (histórico) |

### 2.2 Control y fiscalización

| Fuente | URL | Datos | Formato | Dif. |
|---|---|---|---|---|
| Tribunal de Cuentas: fallos | https://www.tribcuentasmendoza.gob.ar/tcnet/digesto/filtrodigesto/FiltroNormativaWeb_2.aspx?TipNorId=9 | Juicios de cuentas por organismo y ejercicio: aprobaciones, multas, cargos. Unos 150 a 180 por año, desde 2005 | Formulario ASP.NET; PDF firmados en `/TCNet/Herramientas/DescargarArchivo.ashx?tipo=firmado&arcid=N` | 🟡 (ya se probó el POST con ViewState) |
| Tribunal de Cuentas: memoria anual | https://www.tribcuentasmendoza.gob.ar/memoriacms | Estado de las rendiciones | SPA en JavaScript | 🔴 |
| **Ética Pública: declaraciones juradas** | `https://eticapublica.mendoza.gov.ar/api/v1/public/officials?last_name=X` · `/officials/{id}` · `/declarations/{id}` · `/distributions` (101 reparticiones) | Funcionarios con cargos e historial. Inmuebles, autos, cuentas, ingresos | **JSON sin login** | 🟢 |
| Ética Pública: sanciones | `https://eticapublica.mendoza.gov.ar/api/v1/public/sanctions?page_size=N` | 737 sumariados o sancionados: repartición, expediente, motivo | JSON | 🟢 |
| Fiscalía de Estado | http://fiscalia.mendoza.gov.ar/datos-abiertos | Juicios contra el Estado | HTML/PDF | 🟡 |
| Poder Judicial | https://jusmendoza.gob.ar/portal-datos-abiertos/ | Estadísticas del fuero civil | HTML/PDF | 🟡 |

### 2.3 Compras y obra pública

| Fuente | URL | Datos | Formato | Dif. |
|---|---|---|---|---|
| **OCDS de COMPR.AR** | https://datosabiertos-compras.mendoza.gov.ar/datasets/ · tramos: [2020 a 10/2023](https://datosabiertos-compras.mendoza.gov.ar/descargar-json/01/2020_20231021_v1_release.json), [10/2023 a 08/2025](https://datosabiertos-compras.mendoza.gov.ar/descargar-json/02/20250810_release.json), [08/2025 a 01/2026](https://datosabiertos-compras.mendoza.gov.ar/descargar-json/03/20260104_release.json) | Todos los procesos: comprador, proveedores con CUIT, montos, adjudicaciones, contratos. Licencia CC-BY | JSON OCDS 1.1 y XLSX. **Último corte: 04/01/2026** (unos 9 meses de atraso) | 🟢 |
| COMPR.AR en vivo | https://comprar.mendoza.gov.ar/ | Procesos en tiempo real (para lo que falta del OCDS) | ASP.NET con sesión: hay que automatizar un navegador | 🔴 |
| MapaInversiones (Nación) | https://mapainversiones.obraspublicas.gob.ar/opendata/dataset_mop.csv | Obras nacionales en Mendoza: monto, avance, contratista, departamento | CSV (desactualizado: mayo de 2025) | 🟢 |
| Irrigación (DGI): licitaciones | https://public.cloud.irrigacion.gov.ar/public/licitaciones | Obras hídricas | SPA, probablemente con una API JSON detrás | 🟡 |
| Irrigación: boletín y transparencia | https://www.irrigacion.gov.ar/web/pronostico/ · `/web/904-2/` | Caudales, embalses, presupuesto | HTML/PDF | 🟡 |
| IPV (vivienda) | https://www.ipvmendoza.gov.ar/obras/ | Barrios en ejecución | HTML | 🟡 |
| CONTRAT.AR | https://contratar.gob.ar/ | Licitaciones de obra nacional | ASP.NET | 🔴 |

> No existe un mapa de obras provinciales. Se puede armar cruzando tres fuentes: los procesos de **OCDS**, los decretos de adjudicación del **Boletín** y las **licitaciones de Irrigación**, más el plan de obras del presupuesto.

### 2.4 Boletín Oficial: la fuente diaria

| Endpoint | Uso |
|---|---|
| `GET https://portalgateway.mendoza.gov.ar/api/boe/current` | Edición del día |
| `POST /api/boe/find` (`fecha=YYYY-MM-DD`) | Buscar por fecha |
| `POST /api/boe/index` (`fecha`, `numero`) | Índice: tipo, número, organismo, expediente |
| `POST /api/boe/detail` (`tipo_busqueda=norma&norma_edicto_id=ID&…`) | **Texto completo** de la norma |
| `https://boe.mendoza.gov.ar/publico/verpdf/{nro}` | PDF de la edición |

Hay ediciones desde 2017. Se probó con el BO N° 32695 (9/10/2026): 37 normas y 241 edictos. 🟢 (API no documentada, puede cambiar)

Qué se puede sacar de ahí: designaciones ("DESIGNA…"), adjudicaciones, ampliaciones presupuestarias, aportes a empresas del Estado, **resoluciones quincenales de coparticipación**, la convocatoria a elecciones y las emisiones de deuda.

### 2.5 Municipios (18)

| Municipio | Portal | Qué publica | Formato | Calidad (1-5) |
|---|---|---|---|---|
| **Capital** | https://datos.ciudaddemendoza.gob.ar (CKAN, 180 datasets) | Presupuesto, ejecución, funcionarios con salario, planta, compras, obras, declaraciones juradas, pauta publicitaria, LRF | CSV con API | 5 |
| **Godoy Cruz** | https://datos.godoycruz.gob.ar · https://webapps.godoycruz.gob.ar/consultacompras/index | Presupuesto, gasto, compras, funcionarios, declaraciones juradas, ordenanzas, obras, plan de metas | XLSX | 5 |
| **Luján de Cuyo** | https://datos.lujandecuyo.gob.ar | Datos abiertos con API, LRF, licitaciones, digesto | API / Drive | 4 |
| Rivadavia | https://rivadaviamendoza.gob.ar/transparencia/ | **Nómina y sueldos de autoridades mensuales** (hasta agosto de 2026), presupuesto, LRF | PDF | 4 |
| Guaymallén | https://www.guaymallen.gob.ar/category/transparencia/ | Presupuesto, LRF, funcionarios 2024, contratos | PDF | 3 |
| Las Heras | https://lasheras.gob.ar/transparencia/ | Ejecución, deuda mensual, LRF (aplicación Oracle APEX) | Web/PDF | 3 |
| Maipú | https://www.maipu.gob.ar/responsabilidad-fiscal/ | LRF, compras (la sección de datos abiertos está vacía) | PDF | 3 |
| Junín | https://www.juninmendoza.gov.ar/transparencia/ | LRF, licitaciones, obras | PDF | 3 |
| La Paz | https://lapazmendoza.gob.ar | LRF 2020 a 2026 sin cortes | PDF | 3 |
| Tupungato | https://tupungato.gov.ar/?page_id=3094 | LRF, presupuestos 2019 a 2026 | PDF | 3 |
| San Rafael | https://www.sanrafael.gov.ar/informacion-publica/ | LRF **en XLS** (el único), licitaciones | XLS/PDF | 3 |
| General Alvear | https://alvearmendoza.gob.ar/ley-de-responsabilidad-fiscal/ | LRF (unos 800 PDF), presupuestos | PDF | 3 |
| Malargüe | https://www.malargue.gov.ar/presupuesto-anual | Presupuesto, LRF, licitaciones | PDF | 3 |
| Tunuyán | https://www.tunuyan.gov.ar/site/resp-fiscal/ | LRF desde 2025 | ZIP | 2-3 |
| San Carlos | https://sancarlos.gob.ar/responsabilidad-fiscal/ | LRF | ZIP | 2 |
| Santa Rosa | https://santarosamendoza.gob.ar/informacionpublica/ | LRF (Google Sites), licitaciones; no publica presupuesto | Drive | 2 |
| San Martín | https://sanmartinmza.gob.ar | **Nada. El sitio tiene spam de casinos inyectado (parece hackeado)** | — | 1 |
| Lavalle | — (el dominio no resuelve) | Nada propio | — | 1 |

**Fuentes que comparan municipios:**
- Coparticipación en XLS de Hacienda, ya listada en 2.1. 🟢
- Resoluciones quincenales en el Boletín. Los índices de 2026 incluyen un nuevo "Coeficiente de Equilibrio del Desarrollo Municipal".
- Anexos LRF de cada municipio. El formato lo fija el Acuerdo 3949 del Tribunal de Cuentas: anexos 2 a 5 (ejecución y deuda) y **19 (personal)**.
- DNAP: AIF municipal de Mendoza 1993 a 2024 (`eaif_-_mendoza.xlsx`). 🟢
- Fallos del Tribunal de Cuentas sobre rendiciones municipales. Por ejemplo, en 2026 hubo multas a intendentes de Rivadavia, San Carlos, Santa Rosa, San Rafael y La Paz por el ejercicio 2024.
- Compras municipales: Maipú, Tunuyán, Alvear y Malargüe usan el mismo sistema de proveedores (Infogov), así que se pueden scrapear con un solo scraper.

**Rankings que ya existen:**
- **IERAL "Transparencia 2024":** Capital 7.º, Godoy Cruz 8.º, Guaymallén 9.º, Las Heras 62.º y Maipú 67.º, sobre 82 municipios del país.
- **Índice de Datos Abiertos de Ciudades:** Capital, Godoy Cruz y Luján de Cuyo tienen 100%.
- **ASAP (provincial):** Mendoza cayó a 55/100 en junio de 2026, desde 80 en septiembre de 2025.
- **CIPPEC:** Mendoza está 15.ª de 24.

### 2.6 Legislatura y política

| Fuente | URL | Datos | Dif. |
|---|---|---|---|
| Diputados | https://www.hcdmza.gob.ar/site/consulta/ (POST: autor, bloque, tema, fechas) · PDF de expedientes en `/eweb/E-NNNNN/...` | Proyectos, sesiones, bloques, comisiones, viáticos | 🟡 |
| Senado | https://www.senadomza.gov.ar/exptes/index.php · https://www.senadomendoza.gob.ar/sesiones/ | Expedientes (1109 en 2026), leyes, diarios de sesión | 🟡/🔴 (ScriptCase con token CSRF) |
| Votaciones nominales y asistencia | — | **No se publican de forma estructurada.** Se pueden sacar de los diarios de sesión o pedir por acceso a la información | 🔴 |

### 2.7 Elecciones

| Fuente | URL | Datos | Dif. |
|---|---|---|---|
| Junta Electoral | https://jusmendoza.gob.ar/junta-electoral-de-mendoza/ · `/escrutinios-definitivos-elecciones-generales-de-mendoza/` | Escrutinios definitivos por cargo y departamento (2023, municipales 2026), alianzas, proclamaciones | 🟡/🔴 (PDF) |
| Portal electoral | https://elecciones.mendoza.gob.ar/ | Calendario, leyes (8967, 7005 de financiamiento, 4746 de partidos) | 🟢 |
| Resultados provisorios | `https://resultados.mendoza.gov.ar/eleccionAAMMDDpublico/` | Por mesa, departamento y cargo | 🟡 (hay que descubrir los JSON) |
| Resultados históricos | CKAN: `resultados-elecciones-generales-provinciales-2015/2019` y otros | CSV | 🟢 |
| DINE (Nación) | https://www.argentina.gob.ar/dine/resultados-electorales | 1983 a 2023, por mesa | 🟢 |
| Financiamiento nacional (CNE) | https://www.electoral.gob.ar/nuevo/paginas/cne/financiamiento.php · https://aportantes.electoral.gob.ar/ | Informes de campaña por agrupación y aportantes | 🟡/🔴 (captcha) |
| Financiamiento provincial | Ley 7005: se rinde ante la Junta Electoral | **No se publica online** → hay que pedirlo por acceso a la información | — |

**Calendario:** la última elección fue la municipal del 22/02/2026 (La Paz, Luján, Maipú, Rivadavia, Santa Rosa y San Rafael). La Ley 8967 fija el desdoblamiento como regla, pero el gobernador puede unificar con la nacional, como hizo en 2025 con el Decreto 1480.

### 2.8 Indicadores sociales y económicos

| Fuente | URL | Datos | Formato | Dif. |
|---|---|---|---|---|
| **DEIE** | https://sitios.mendoza.gob.ar/deie/ · RSS de IPC: `…/category/economia/precios-e-indices/ipc/feed/` | IPC Gran Mendoza (volvió en 2026), canasta básica, pobreza (Encuesta de Condiciones de Vida), IPM, **PBG por departamento**, empleo, salud, educación, construcción, turismo | RSS, HTML y PDF. Cada categoría tiene su feed `/feed/` | 🟢 (cifra principal) / 🔴 (series) |
| INDEC EPH | https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-46-152 · microdatos (aglomerado 10) | Pobreza y desempleo del Gran Mendoza | XLS y microdatos (librerías `eph`, `pyeph`) | 🟡 |
| Censo 2022 | https://censo.gob.ar/ | Datos por departamento | XLS/REDATAM | 🟡 |
| **SNIC** | https://www.argentina.gob.ar/seguridad/estadisticascriminales/bases-de-datos | Delitos por **departamento** desde 2000 | CSV | 🟢 |
| **OEDE / SIPA** | https://www.argentina.gob.ar/trabajo/estadisticas/oede-estadisticas-provinciales | Empleo privado y salarios por provincia y **departamento** | XLSX/CSV, mensual | 🟢 |
| **DNAP: ocupación** | `…/coordinacion-fiscal-provincial/ejecucion-presupuestaria-provincial/ocupacion-y` | Empleo público por provincia y cada 1.000 habitantes (1987 a 2025) | XLSX | 🟢 |
| **Energía: regalías y producción** | http://datos.energia.gob.ar/ (`regalias-de-petroleo-crudo-gas-natural-…`, `produccion-de-petroleo-y-gas-por-pozo`) | Regalías por provincia; producción por pozo | CKAN, ZIP y CSV, mensual (actualizado 10/2026) | 🟢 |
| DEIS (salud) | https://www.argentina.gob.ar/salud/deis/datos | Nacimientos, defunciones, **mortalidad infantil** por departamento | CSV, anual | 🟢 |
| Aprender / Relevamiento Anual | https://www.argentina.gob.ar/educacion/evaluacion-informacion-educativa/aprender · https://mapa.educacion.gob.ar/ | Resultados por provincia; escuelas con matrícula | XLSX y microdatos | 🟡 |
| Hidrocarburos (provincia) | https://www.mendoza.gob.ar/energiayambiente/hidrocarburos/tablero-de-produccion-y-reservas/ | Producción y reservas | Power BI | 🔴 (usar la fuente nacional) |
| Presupuesto Abierto (Nación) | https://www.presupuestoabierto.gob.ar/api/ | **Transferencias no automáticas a Mendoza** (filtrando por ubicación geográfica) | API con token gratuito | 🟡 |

### 2.9 Nación → Mendoza (comparación entre provincias)

| Fuente | URL | Datos | Dif. |
|---|---|---|---|
| **DNAP RON** | https://www.argentina.gob.ar/economia/sechacienda/asuntosprovinciales/ron | **Transferencias automáticas diarias** por provincia; serie `serie_ron_2003_2025.csv` | 🟢 (ojo con el prefijo `blank:#` en los href) |
| DNAP TOP | `…/recursos-tributarios-de-origen-provincial-top` | Recaudación propia por provincia (1984 a 2026) | 🟢 |
| DNAP AIF provincial | `…/ejecucion-presupuestaria-provincial/ejecuciones` | Ejecución homogénea de las 24 jurisdicciones | 🟢 |
| DNAP deuda | `…/deuda-publica-provincial/evolucion-de-stock` | Stock por acreedor y provincia | 🟢 |
| ASAP | https://www.asap.org.ar/informes-detalle/de-provincias-/5 | Informe de ejecución de Mendoza 2022 a 2025 (septiembre de 2026) | 🟡 |
| datos.gob.ar | https://datos.gob.ar/ | Catálogo nacional | **Caído (HTTP 523) al momento del relevamiento** → cachear todo localmente |

### 2.10 Empresas y fondos del Estado

| Entidad | URL | Qué hay | Qué falta |
|---|---|---|---|
| EMESA | https://emesa.com.ar/balances/ | Balances 2016 a 2024 | 2025 |
| AYSAM | https://www.aysam.com.ar/ | Plan Estratégico 2026; balances 2022 a 2024 (no están enlazados desde el sitio: se encuentran en `wp-content/uploads`) | 2025 |
| FTyC | https://ftyc.gob.ar/ (⚠️ `ftyc.com.ar` ya no es del Fondo) | Datasets en CKAN hasta junio de 2024 | Datos actuales |
| Mendoza Fiduciaria | https://mendozafiduciaria.com/ | Reglamentos de crédito | **Balances y lista de fideicomisos con sus saldos** |
| Todas | Planilla 6.1 del presupuesto | Presupuesto de empresas y fondos fiduciarios | Aportes reales del Tesoro (hay que buscarlos en el Boletín) |

---

## 3. Lo que no se publica (posible sección "Lo que no sabemos")

1. Cuenta General del Ejercicio (Contaduría General).
2. Ejecución detallada por programa y objeto, en formato abierto, posterior a 2023.
3. Nómina con nombres y escalas salariales vigentes de la provincia.
4. Flujo de caja de Tesorería.
5. Serie mensual de recaudación de la ATM por tributo.
6. Transferencias no automáticas de Nación desde 2019 (hay que reconstruirlas).
7. Balances de Mendoza Fiduciaria; AYSAM y EMESA 2025.
8. OCDS de compras posterior a enero de 2026.
9. Votaciones nominales y asistencia en la Legislatura.
10. Financiamiento de campañas provinciales.
11. Turnos y esperas en salud, estadísticas propias de seguridad, matrícula descargable de la DGE, datos del IPV.
12. Datos de San Martín y Lavalle.

Cada punto puede llevar un botón **"Pedilo vos"**, que arme un pedido de acceso a la información con la Ley 9070 (formulario: `https://ticketsform.mendoza.gov.ar/ticketsform/servlet/responderformulario?AIP_SOLICITUDINFORMACIONPUBLICA`, plazo de 15 días hábiles), y un contador público de pedidos hechos y respondidos.

---

## 4. Referencias analizadas: qué tomar de cada una

| Sitio | Qué hace | Qué tomar |
|---|---|---|
| **DatosHoy** | Tablero nacional con series históricas | Un **número grande** con variación mensual e interanual; **franjas por gobierno** que se pueden apagar; **comparación por mandato** (primer contra último dato) con notas metodológicas; botón "descargar gráfico". Stack: JS vanilla en Vercel |
| **Pensiómetro** | Página única que cuenta una historia con scroll (pensiones por invalidez) | **Unidad humana** ("26 de cada 1.000"); contador animado; **mapa de hexágonos** con trama donde falta el dato; selector "versus" contra otros; **impacto por mandato**; fuente en cada evento; archivos de fuentes abiertos. Stack: módulos ES con JSON estáticos |
| **OpenArg** | Chat con IA sobre más de 30.000 datasets, con servidor MCP | **Preguntas de ejemplo** que abren directo `/chat?q=`; el proceso del agente a la vista (planificar, recolectar, analizar, sintetizar); fuentes citadas. Stack: Next.js con FastAPI, LangGraph y pgvector. **Ya tienen `dashboard-mendoza` y `Dashboard-Lujan-de-Cuyo` en GitHub (colossus-lab)**: vale revisarlos para reutilizar o diferenciarse |
| Chequeado | Verificación de datos y discursos | **Promesómetro**: promesas de campaña de 2023 con un veredicto |
| Poder Ciudadano | Transparencia | Índice de opacidad y pedidos de información |
| Presupuesto Abierto / OpenSpending | Seguir el dinero | **"Tu recibo de impuestos"**: de tus $X, $Y fueron a salud |
| Ojo Público (Perú) | Periodismo de datos | Alertas de riesgo en compras: proveedor único, contrataciones directas, empresas nuevas, cruces de proveedores con declaraciones juradas |
| Directorio Legislativo | Legisladores | Fichas de legisladores y candidatos |
| Gasto Público Bahiense | Gasto municipal en tiempo casi real | Buen modelo, pero **el dominio hoy está muerto**: muestra que la sostenibilidad es parte del diseño |

**Lo que ninguno hace bien y es la oportunidad:**
- **Tarjetas para compartir por dato, pensadas para WhatsApp.** Es el canal principal en Mendoza.
- **Comparar los 18 departamentos** en el mismo mapa.
- **Avisar cuando un dato está viejo o falta**, en vez de esconderlo.

---

## 5. Propuesta de producto (borrador)

### Secciones
1. **Inicio, "Mendoza hoy":** 6 a 8 números grandes (deuda, recaudación del mes, IPC, canasta, empleo, regalías, coparticipación del mes, decretos de hoy), cada uno con su fuente y fecha.
2. **¿Adónde va tu plata?:** el gasto provincial por finalidad y jurisdicción; "tu recibo" según cuánto pagás de impuestos; evolución 2001 a 2026 con franjas por gobernador (Cornejo 2015-19, Suárez 2019-23, Cornejo desde 2023).
3. **Tu municipio:** mapa de los 18 departamentos con coparticipación por habitante, gasto en personal contra obra (anexos LRF), deuda, nota de transparencia (si publican o no), fallos del Tribunal de Cuentas, y la comparación "tu municipio contra el resto".
4. **Deuda:** cuánto, con quién, en qué moneda y cuándo vence.
5. **Compras y obras:** principales proveedores, buscador por CUIT, contrataciones directas, alertas, y un mapa de obras armado con OCDS, el Boletín, Irrigación y MapaInversiones.
6. **Funcionarios:** ficha con cargo, declaración jurada (evolución del patrimonio), sanciones y designaciones en el Boletín.
7. **Hoy en el Boletín:** resumen diario en lenguaje llano, posiblemente generado con un LLM: "hoy el gobierno designó a X, adjudicó Y por $Z".
8. **¿Mejoró la vida?:** pobreza, empleo, delito, mortalidad infantil y Aprender, comparando **Mendoza contra el país y contra Cuyo**, por mandato.
9. **Elecciones:** resultados históricos y Legislatura.
10. **Lo que no sabemos:** el índice de opacidad con el botón "Pedilo vos".
11. **Preguntale a Mendoza** (más adelante): un chat que responde sobre los datos ya cargados, o que usa el MCP de OpenArg.

### MVP sugerido (de 4 a 6 semanas, empezando por lo 🟢)
1. Deuda provincial, con los XLSX trimestrales de 2015 a 2026.
2. Coparticipación a municipios, con el XLS mensual: ranking y valores por habitante con datos del Censo 2022.
3. Transferencias de Nación, con DNAP RON.
4. Boletín diario con su API y un resumen.
5. Declaraciones juradas y sanciones, con la API de Ética Pública.
6. Compras, con el OCDS de 2020 a enero de 2026: principales proveedores y buscador.
7. Regalías, con datos.energia.gob.ar.
8. "Mendoza hoy" con el RSS de la DEIE (IPC y canasta).

**Segunda etapa (parsers de PDF):** ejecución AIF mensual de 2001 a 2026, anexos LRF provinciales y municipales, planillas del presupuesto 2027 (está en debate ahora, así que es muy oportuno) y fallos del Tribunal de Cuentas.

### Arquitectura sugerida
- **Ingesta:** scrapers por fuente que corren con un cron (por ejemplo GitHub Actions o Trigger.dev). Cada uno guarda el **archivo original crudo** (PDF, XLS, JSON) con fecha y hash, para no perder datos aunque el gobierno los borre. Por ejemplo, los informes de recaudación solo muestran el último y datos.gob.ar estaba caído.
- **Normalización:** un esquema común con las dimensiones período, jurisdicción, municipio, concepto, monto nominal y monto real (deflactado con el IPC de la DEIE o del INDEC). Base en Postgres o DuckDB.
- **Frontend:** un sitio estático o con renderizado en el servidor (por ejemplo Next.js), con imágenes para compartir generadas por indicador.
- **Transparencia del propio sitio:** cada número enlaza al archivo original, con la fecha de captura y la metodología. El código y los datos son abiertos.

### Riesgos
- **Endpoints que cambian:** varias APIs (Boletín, Ética Pública) no están documentadas y pueden cambiar sin aviso. Conviene un monitoreo que avise cuando un scraper se rompe.
- **Firewall del gobierno:** devuelve 403 sin User-Agent y bloquea `wp-json`. Hay que pedir con poca frecuencia y cachear.
- **Pesos que pierden valor:** siempre hay que mostrar los montos **en valores reales** y por habitante.
- **Neutralidad:** usar la misma metodología para todos los gobiernos y partidos, citar siempre la fuente y no editorializar. La credibilidad es el activo principal.
- **Datos personales:** las declaraciones juradas y las sanciones son públicas, pero hay que mostrarlas con criterio (por ejemplo, no exponer DNI).
