# Índices para valores reales y dólares

Archivos (generados por `bun run scrape indices`):

- `ipc_nacional_mensual.csv`: anio, mes, indice (base dic-2016=100), variacion_mensual (%), region (nacional, cuyo), fuente.
- `tipo_cambio_mensual.csv`: promedio mensual del tipo de cambio mayorista de referencia (Com. A3500 del BCRA), minorista (promedio vendedor BCRA, desde 2010-06) y cantidad de días hábiles usados.

## Cómo deflactar

    monto_real = monto_nominal * indice[mes_referencia] / indice[mes_del_monto]

Para "pesos de hoy", mes_referencia es el último mes disponible del archivo. Para montos anuales, usar el índice promedio del año
(o el de diciembre si el monto es de cierre). Para dólares: `monto_usd = monto_ars / tipo_cambio_oficial_promedio` del mismo mes.
Para pesos reales en dólares constantes, primero convertir al dólar del mes y luego no deflactar por IPC argentino.

## Empalmes del IPC (columna `fuente`)

| Tramo | Fuente |
|---|---|
| 2016-12 en adelante | INDEC IPC cobertura nacional, regiones Nacional y Cuyo (incluye Mendoza). Base dic-2016=100. |
| 2016-04 a 2016-11 | INDEC IPC GBA (única medición oficial de 2016, sólo Gran Buenos Aires), usada como proxy nacional. |
| 2015-11 a 2016-03 | INDEC no publicó IPC. Puente con la variación mensual de "Inflación mensual" del BCRA (API v4, variable 27), encadenada hacia atrás desde abr-2016. Es el tramo menos preciso. |
| 2014-01 a 2015-10 | INDEC IPCNu (nacional urbano, base oct13-sep14=100), reescalado para empalmar con el tramo siguiente. |
| 1997-01 a 2013-12 | Variación mensual de la serie del BCRA (variable 27) encadenada hacia atrás. |

Advertencias:

- Entre 2007 y 2015 la serie del BCRA y el IPCNu replican el IPC oficial de INDEC, que está ampliamente cuestionado por subestimar la inflación (intervención del INDEC). Para ese período los pesos reales quedan sobreestimados en términos de nivel. No se pudo incorporar el IPC-CABA (DGEyC) ni índices provinciales alternativos porque el sitio de estadística de la Ciudad y datos.gob.ar no respondieron desde el entorno de scraping.
- Cuyo sólo existe desde dic-2016. Antes de esa fecha usar region = nacional.
- Los empalmes son cadenas de variaciones mensuales: los niveles absolutos antes de 2016 son una aproximación, las razones entre meses cercanos son más confiables.

## Crudos

Archivados en data/raw/indices/ (INDEC: serie_ipc_divisiones.csv, sh_ipc_aperturas.xls, sh_ipc_01_18.xls, sh_ipcnu.xls; BCRA: JSON por año de las variables 4, 5 y 27).
