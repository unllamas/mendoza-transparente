# Plan: una base de datos para consultar los datos (Neon)

Objetivo: que los datos de Mendoza Transparente se puedan **buscar, filtrar y cruzar completos**, no solo las primeras 500 filas. Que lo puedan hacer las páginas, el asistente Aco y, más adelante, los asistentes de IA de cada persona ([Agentes sobre los datos](agentes-sobre-los-datos.md)). Todo sin salir del costo cero.

Fecha: 27/10/2026. Estado: propuesta, sin empezar. Faltan las decisiones del final.

## Por qué

- **Hoy cada fuente se publica como CSV y una vista previa de 500 filas** (`PREVIEW_ROWS` en `apps/web/scripts/build-data.ts`). En las tablas grandes, casi todo queda afuera de la búsqueda: 47.305 adjudicaciones de compras, 22.872 procesos, 15.501 normas del Boletín y 99.380 filas del RON nacional. Quien quiere todo baja el CSV.
- **Cruzar fuentes se hace en el build**, con código a medida en `apps/web/scripts/temas/` (proveedor ↔ compras ↔ Boletín ↔ funcionarios). Cada cruce nuevo es un script nuevo. Con SQL, es una consulta.
- **Las páginas que más se usan ya andan bien estáticas.** En los últimos 30 días, la portada, los funcionarios, los municipios, las señales y los proveedores son casi todo el tráfico. Las páginas crudas de `/datos` casi no se visitan: la del Boletín, 14 vistas. **La base no es para servir más rápido lo que ya existe, sino para hacer lo que hoy no se puede.**

## Qué va a la base y qué no

**La fuente de verdad sigue siendo `data/processed/` en git.** Los CSV son el contrato público, se archivan y se pueden reproducir. La base es una **copia derivada**: se carga con un script desde los CSV, igual que `knowledge.json` sale del catálogo, y se puede borrar y rehacer en cualquier momento. Nadie escribe a mano en ella.

| Qué | Dónde | Por qué |
|---|---|---|
| Páginas de entidades, señales y portada | **Estático** (como hoy) | Son lo más visitado y ya cargan rápido gratis. «Lo que puede ser estático, se genera en el build» ([Costo cero](../procesos/arquitectura.md#costo-cero)) |
| Participación, opiniones y faltantes de Aco, hallazgos | **D1** (como hoy) | Son datos que se escriben desde el sitio, están atados a Pages y ya funcionan. Pasarlos a Neon no suma nada |
| Tablas grandes que se quieren buscar o cruzar | **Neon** (nuevo) | Ver la lista de abajo |

### Primeras fuentes, por valor

1. **Compras (`compras-ocds`) y proveedores.** Unas 70.000 filas. `/proveedores` es de lo más visitado. Permite buscar en todas las adjudicaciones de un proveedor, por organismo, por monto o por fecha, y no solo en las 500 primeras.
2. **Boletín Oficial (`boletin-oficial`).** 15.501 normas y 6,6 MB de textos. Permite buscar en el texto completo de las normas (Postgres tiene búsqueda en español con `tsvector`) y cruzar designaciones con organismos. Es la base del histórico de designaciones que falta en [El Estado por dentro](el-estado-por-dentro.md).
3. **Presupuesto y personal (`presupuesto-planta`, `lrf-personal`, `municipios-personal`).** Cerca de 60.000 filas. Permite comparar organismos y años sin un script por gráfico.
4. **Ejecución nacional (`dnap-ron`, `dnap-aif`, `dnap-deuda`).** Unas 190.000 filas. Son las más grandes, pero hoy las consulta poca gente: van después de medir.
5. **Tasas (`tributos`) para Aco.** Hoy viajan adentro de la función en `knowledge.json`. Conviene pasarlas recién cuando sean demasiadas para ese archivo.

Las tablas chicas y curadas (`autoridades`, `legislatura`, `indices`, `geo`…) no ganan nada en una base: siguen estáticas.

## Cuánto cuesta (plan gratis de Neon)

Por proyecto: 100 horas de cómputo por mes, hasta 2 CU, y 1 GB de almacenamiento. Por cuenta: 5 GB de tráfico por mes. La base se apaga sola cuando nadie la consulta. No pide tarjeta.

- **Almacenamiento:** `data/processed` pesa 51 MB en CSV. En Postgres, con índices, se estima entre 150 y 300 MB. Entra en 1 GB con margen.
- **Cómputo:** cada vez que la base se despierta gasta unos minutos a 0,25 CU, unas 0,02 horas. Con 100 horas entran unas 4.800 despertadas por mes. El riesgo son los robots (ya pasó con AhrefsBot en D1). Por eso, toda consulta pasa por una función con la Cache API, como se hizo con D1 ([Consumo de Cloudflare](consumo-de-cloudflare.md), etapa 6): una misma búsqueda va a la base, como mucho, una vez por hora.
- **Tráfico:** la carga completa de la base es de unos 50 MB. Aunque se recargue todos los días, son 1,5 GB por mes.
- **Cloudflare:** cada búsqueda suma un pedido a funciones, de los 100.000 por día que da el plan.
- **GitHub Actions:** la carga corre al final del workflow de datos que ya existe, solo si cambió `data/processed`.

## Etapas

1. **Proyecto y carga.** Crear el proyecto `mendoza-transparente` en una organización de Neon con plan gratis, en `aws-sa-east-1` (San Pablo, la región más cerca). Escribir `bun run base:cargar`: lee los CSV con `readProcessed()` y crea una tabla por archivo, con los tipos del diccionario (`.meta.json`). Carga todo en una transacción (borra y vuelve a cargar, así que es idempotente) y anota la fecha de corte de cada fuente. Empezar por compras y Boletín, y medir cuánto ocupan.
2. **Una búsqueda en el sitio.** `GET /api/datos/compras?proveedor=…&desde=…` en las funciones de Pages, con `@neondatabase/serverless` (consultas por HTTP, funciona en Workers), la Cache API y paginado. La primera página que la usa: la ficha de un proveedor con todas sus adjudicaciones. Medir uso y horas de cómputo durante dos semanas.
3. **El texto del Boletín.** Búsqueda de texto completo en español sobre las normas, en `/leyes` y en la búsqueda general.
4. **Agentes sobre los datos.** El servidor MCP del [plan de agentes](agentes-sobre-los-datos.md) lee de esta base. Así se resuelve su pregunta abierta sobre de dónde leer.
5. **Lo demás, según el uso:** presupuesto y personal, la ejecución nacional y las tasas de Aco.

## Reglas desde el principio

- **Solo lectura desde el sitio.** La función se conecta con un rol de Postgres que solo puede leer. El rol que carga datos vive en los secretos de GitHub y nunca llega a Pages.
- **Las claves solo como secretos** (`DATABASE_URL` de solo lectura en Pages y la de carga en GitHub), igual que las del asistente.
- **Toda respuesta trae la fuente y la fecha de corte** de las filas, como en las páginas.
- **Si la base no responde, el sitio sigue funcionando.** Las páginas estáticas no dependen de ella. Las búsquedas dicen que no pudieron y ofrecen el CSV.

## Preguntas abiertas

- **¿Hay una necesidad concreta que empuja esto ahora?** Si es una búsqueda puntual o el MCP, conviene empezar por esa fuente y no por la carga de todo.
- **¿Neon o una copia en D1?** D1 ya está integrado, no suma otra plataforma y tiene 5 millones de lecturas por día. Pero es SQLite: no tiene búsqueda de texto completo en español como Postgres, cada base tiene un tope de tamaño más chico y cargar 400.000 filas consume del cupo de 100.000 escrituras por día. Para el Boletín, Postgres es claramente mejor. Para compras, alcanzan los dos.
- **¿Qué organización de Neon?** La cuenta tiene hoy una organización con el proyecto «trama». Mendoza Transparente necesita una propia en plan gratis, para no mezclar costos.
