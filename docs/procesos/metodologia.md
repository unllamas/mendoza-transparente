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

Cada ley tiene un resumen en lenguaje simple para quien no maneja el vocabulario jurídico. Quien quiera el detalle tiene el texto completo, ordenado por artículos, y el PDF oficial.

- **De dónde salen:** `data/curado/leyes.yaml`. Los escribe un modelo de IA (`apps/web/scripts/resumir-leyes.ts`, con la API de Claude) a partir del texto oficial de la ley, y se pueden corregir a mano.
- **Criterios** (la constante `INSTRUCCIONES` del script):
  - Solo lo que dice el texto.
  - Neutral, sin valoraciones.
  - Concreto: quién, qué, dónde, cuánta plata y qué plazo.
  - Título de hasta 70 caracteres, un tema de una lista fija, 2 o 3 oraciones y de 2 a 5 puntos.
- **En la web** el resumen siempre se presenta como hecho con IA, con la aclaración de que vale el texto oficial.
- **Revisión:** al corregir o validar un resumen a mano, agregarle `revisado: AAAA-MM-DD`. Un resumen editado no se vuelve a generar solo; para rehacerlo: `bun run resumir-leyes <número>`.
- **Sin resumen** (por ejemplo, si falta la clave de la API): la página muestra el título que sale del texto (el nombre que se da la propia ley o su primer artículo) y el primer artículo.

**Estructura del texto** (`apps/web/scripts/temas/leyes.ts`):

- El texto plano del Boletín se separa en capítulos, artículos (con su rótulo si lo tienen, como "Objeto") y el cierre ("Dada en…" y quiénes firman).
- Se descartan el preámbulo ("El Senado y Cámara de Diputados… sancionan con fuerza de ley") y el artículo de forma "Comuníquese al Poder Ejecutivo".

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

