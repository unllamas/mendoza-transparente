---
name: contenido-y-metodologia
description: Criterios editoriales y de cálculo de Mendoza Transparente. Cubre señales y no acusaciones, neutralidad, pesos de hoy, cargos y personas, datos personales, contenido curado (no-publicado, correcciones, leyes, jurisdicciones) y resúmenes con IA. Cargar antes de escribir un texto que interprete datos, calcular una cifra, armar una señal o cruce, o editar data/curado.
---

# Contenido y metodología

Fuente completa: `docs/procesos/metodologia.md`. Glosario público: `apps/web/src/glossary.ts` (`/como-leer`).

## Neutralidad

- **Señales, no acusaciones:** un patrón en los datos es una pregunta que el organismo puede explicar. Siempre se aclara en el texto.
- **La misma vara para todos:** igual metodología para todas las gestiones y partidos, con las bandas de gobierno (`GOBIERNOS`) cuando hay series largas.
- **Comparaciones justas:** si un organismo cambió de estructura entre gestiones, se marca y no se usa como titular (ver `restructured` en `gobierno.ts`).
- **Sin adjetivos valorativos** ("escandaloso", "importante"). Se dicen los hechos con su fuente.

## Cálculos

- **Pesos de hoy:** IPC nacional empalmado, con el promedio anual (`deflactor()` en `scripts/temas/inflacion.ts`). La referencia siempre va visible ("en pesos de ago 2026").
- **Por habitante:** proyecciones de INDEC del mismo año.
- **Cargos, no personas:** en todo lo de personal del Estado.
- **Acumulados:** el anexo 19 de Responsabilidad Fiscal acumula desde enero, así que el año es el último trimestre.
- **Valor fiscal:** el patrimonio declarado es avalúo fiscal, muy por debajo del de mercado. Siempre se aclara.

## Datos personales

- **Solo actos públicos:** nombre, cargo, fecha, patrimonio declarado. **Nunca** DNI, CUIL, domicilio ni fecha de nacimiento (se redactan si aparecen).
- **Proveedores personas humanas:** no se perfilan. Solo las personas jurídicas tienen página.
- **Participación:** el correo es opcional y no se publica. Los números de trámite no se muestran, solo se cuentan.

## Contenido curado (`data/curado/`)

| Archivo | Qué es | Regla |
|---|---|---|
| `no-publicado.yaml` | Datos que el Estado debería publicar | Cada entrada lleva `categoria` (el build falla sin ella), organismo, marco legal, dónde se buscó y el pedido. Todo dato que no se encuentra se suma acá. |
| `correcciones.yaml` | Cuando dos fuentes oficiales no coinciden | Se explica la diferencia y se cita la fuente. Se muestra como nota visible. |
| `leyes.yaml` | Resúmenes de leyes en lenguaje simple | Hechos con IA a partir del texto oficial (criterios en `resumir-leyes.ts`). Siempre se presentan como hechos con IA, y revisados (`revisado:`) cuando corresponde. |
| `jurisdicciones.yaml` | Organismos, competencias y equivalencias | Basado en la Ley 9501; las dudas quedan en `nota`. |

## Resúmenes con IA

- **Solo lo que dice el texto:** si el contenido está en un anexo que no se publicó, decirlo, no suponer.
- **Revisión:** revisar a mano una muestra contra el original antes de commitear, sobre todo leyes largas o con anexos.
