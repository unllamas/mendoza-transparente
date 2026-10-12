# Plan: el Estado por dentro

Objetivo: que cualquier persona pueda ver, para cada ministerio u organismo provincial, **quién lo conduce, cuánta gente trabaja ahí, cuánto cuesta, qué hace, qué compra y a quién designó**, y cruzar esos datos. Lo que no se pueda obtener se registra en "Lo que no se publica".

Fecha: 12/10/2026. Estado: etapas 1 a 3 en marcha (falta la planta del Presupuesto); etapa 4 pendiente.

## Qué no se puede saber (y por qué)

Mendoza no publica la nómina de personal con nombres ni los sueldos de sus autoridades, así que no se puede saber "a cuántas personas tiene a cargo" un funcionario puntual. Se trabaja **por organismo** (jurisdicción y unidad organizativa), que es el nivel en el que el Estado sí publica datos.

## Fuentes

| Dato | Fuente | Fuente en el repo | Estado |
|---|---|---|---|
| Personal y costo por organismo, por trimestre | Ley de Responsabilidad Fiscal, anexo 19 (Hacienda) | `lrf-personal` | Nueva |
| Cargos aprobados por organismo y categoría | Ley de Presupuesto, planillas 8.x | `presupuesto-planta` | Nueva |
| Conducción de cada organismo (ministros, secretarios, directores) | Oficina de Ética Pública | `etica-publica` | Ya existe |
| Designaciones, renuncias y ceses | Boletín Oficial | `designaciones` (lee lo descargado por `boletin-oficial`) | Nueva |
| Qué hace cada organismo | Ley de Ministerios y decretos de estructura | `data/curado/jurisdicciones.yaml` | Nueva, curada |
| Qué compra y a quién | COMPR.AR (OCDS) | `compras-ocds` | Ya existe |

**La pieza clave es la tabla de equivalencias** (`data/curado/jurisdicciones.yaml`): cada fuente nombra a los organismos distinto ("Ministerio de Salud y Deportes", "08 - SALUD", "MINISTERIO DE SALUD, DESARROLLO SOCIAL Y DEPORTES"). La tabla une todos los nombres y códigos de un mismo organismo, incluidos los cambios de nombre entre gestiones.

## Etapas

1. **Fuentes nuevas** (en paralelo, un agente por fuente):
   - `lrf-personal`: anexo 19 de todos los trimestres disponibles (2018 a 2026).
   - `presupuesto-planta`: planillas de cargos 8.x de 2020 a 2027.
   - `designaciones`: designaciones en las normas del Boletín.
   - `jurisdicciones.yaml`: organigrama vigente, competencias en lenguaje simple y equivalencias de nombres y códigos.

   Cada agente informa también qué datos buscó y no encontró.
2. **"Lo que no se publica" por categorías** (sesión principal): campo `categoria`, página agrupada y filtrable, y alta de cada dato faltante que surja de la etapa 1.
3. **Página por organismo**, `/gobierno/<organismo>`:
   - Quién lo conduce y su equipo, con link a las fichas y a las declaraciones juradas.
   - Personal y costo por trimestre, en pesos de hoy, con costo promedio por persona.
   - Cargos aprobados frente a personal real.
   - Qué hace, en lenguaje simple.
   - Compras y principales proveedores, con link a `/organismos` y `/proveedores`.
   - Designaciones recientes.
   - Sus datos que no se publican.
4. **Cruces y señales**: crecimiento del personal por gestión, gasto en personal frente a compras, organismos con más contratados que personal de planta y designaciones en masa antes de fin de mandato. Siempre como señales, no como acusaciones.
5. **SEO, enlaces internos, verificación y documentación**:
   - Agregar las páginas nuevas a `scripts/paginas.ts`.
   - Enlazar las relaciones en los dos sentidos: funcionario ↔ organismo, organismo ↔ compras y designación ↔ funcionario.
   - Correr `bun run verificar`.
   - Documentar en `docs/procesos/`.

## Criterios

- Los datos personales de la planta no se publican (no los hay). En las designaciones se muestran nombre, cargo y fecha, que son actos públicos; nunca DNI ni domicilio.
- Montos en pesos nominales en los CSV; en la web, también en pesos de hoy, con IPC.
- Cada número enlaza a su fuente oficial y a la copia archivada.
