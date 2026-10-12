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
