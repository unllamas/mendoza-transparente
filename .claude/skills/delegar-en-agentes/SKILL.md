---
name: delegar-en-agentes
description: Cómo delegar trabajo en subagentes (Sonnet) y revisar lo que entregan en Mendoza Transparente. Cubre plantilla del pedido, archivos propios, qué no tocar, verificación, reporte de una pantalla, `bun run crudo` en vez de `curl` y sesiones por etapa. Cargar antes de lanzar un subagente o al integrar lo que devolvió.
---

# Delegar en agentes

Fuente completa: `docs/procesos/trabajo-con-agentes.md`.

## Cuándo delegar

- **Sí:** tareas acotadas y largas, como un scraper, un relevamiento de fuentes, resúmenes en lote o la búsqueda de fotos oficiales. Si son independientes, varios en paralelo y en segundo plano, siempre con `model: "sonnet"`.
- **No:** decisiones de diseño, integración en la web, commits o cualquier cosa que toque archivos que otro agente está usando. Eso lo hace la sesión principal.

## Plantilla del pedido (autocontenido: el agente no ve la conversación)

1. **Repo y copia:** `/Users/macbook/Documents/Testing/mendoza-transparente`. No usar otras copias.
2. **Qué leer primero:** `AGENTS.md` y la skill que corresponda. De los documentos largos, **la sección** que hace falta: `bun run seccion <documento> "<título>"` (o `bun run seccion <documento>` para ver el índice).
3. **Reglas:**
   - **NO commit.**
   - Nombres del código en inglés; comentarios, documentación y textos visibles en español. Los comentarios en inglés de los archivos que edita, los traduce.
   - Sin dependencias nuevas.
   - **Para mirar una página, un PDF o una planilla, `bun run crudo <url|fuente/archivo>`, nunca `curl` ni el archivo entero.** Primero busca en `data/raw/` y en el caché compartido, y devuelve una vista compacta (`--buscar`, `--links`, `--paginas` para ver más).
   - Antes de escribir una función auxiliar, usar las que ya existen: `sleep`, `collapseSpaces`, `parseArNumber`, `finiteNumber` y `fetchOrReuse` de `@mt/core`, y `pdfText` y `pdfPages` de `packages/scrapers/src/lib/pdf.ts`.
   - **Archivos propios** (lista exacta) y **qué no tocar**: `apps/web` si otra sesión la edita, `sources.yaml` salvo su bloque, y `data/*` de otras fuentes.
4. **Objetivo y salida exacta:** archivos, columnas, ids y formato. Si hay que relevar, pedir primero el relevamiento y después la implementación.
5. **Verificación esperada:** totales contra el original, que corra dos veces sin duplicar, `tsc` y una muestra revisada a mano.
6. **Reporte de una pantalla (unas 40 líneas), siempre con este formato:**
   ```
   Archivos: · Cobertura: · Verificación: · Muestra (hasta 3 filas): · Dudas: · No publicado:
   ```
   Nada de HTML, tablas largas ni fragmentos de PDF: los datos van a disco y nunca al reporte. **Un relevamiento se escribe en `tmp/agentes/<tarea>.md`** y el reporte trae solo las conclusiones y la ruta.
7. **Si aparece un problema de seguridad** (datos de la gente expuestos, un sitio hackeado): parar, no descargar nada más, cargarlo con `bun run hallazgo` y poner el código `S-…` en el reporte, sin copiar los datos ni escribirlo en ningún archivo. Ver `docs/procesos/seguridad.md`.

## Al integrar

1. **Revisar el código y los datos con comandos que devuelvan poco** (`wc -l`, totales, `head -5`, `bun run crudo` para el original): conteos, totales y una muestra contra el original. Las dudas que marcó el agente se resuelven, no se ignoran. Si tocó la interfaz, skill `revisar-interfaz`.
2. **Correr lo que el agente no pudo** (por ejemplo `bun test`, si se lo bloquearon).
3. **Si son fotos,** mirarlas una por una: que sea la persona y que esté sola.
4. **Sumar lo que no se publica** a `data/curado/no-publicado.yaml`.
5. **Un commit por entrega,** con `git add` de sus rutas; si el agente sigue corriendo, nunca `-A`.
6. **Contarle al usuario** qué llegó, qué falta y qué hay que decidir.

## Sesiones por etapa

Una orquestación larga se parte en etapas: al integrar cada entrega (o después de cinco o seis subagentes), commit, push y PR; el estado (hecho, pendiente, decisiones, agentes en curso) en `docs/planes/<plan>.md`; y la etapa siguiente en una sesión nueva que lee ese plan. Detalle y por qué en `docs/procesos/trabajo-con-agentes.md#cuidar-el-contexto`. Si el agente cargó un hallazgo de seguridad, pasarle a la persona el código `S-…` para que lo reporte; nunca va al repositorio.
