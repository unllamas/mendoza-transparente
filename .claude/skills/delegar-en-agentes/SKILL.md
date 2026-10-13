---
name: delegar-en-agentes
description: Cómo delegar trabajo en subagentes (Sonnet) y revisar lo que entregan en Mendoza Transparente. Cubre plantilla del pedido, archivos propios, qué no tocar, verificación y reporte. Cargar antes de lanzar un subagente o al integrar lo que devolvió.
---

# Delegar en agentes

Fuente completa: `docs/procesos/trabajo-con-agentes.md`.

## Cuándo delegar

- **Sí:** tareas acotadas y largas, como un scraper, un relevamiento de fuentes, resúmenes en lote o la búsqueda de fotos oficiales. Si son independientes, varios en paralelo y en segundo plano, siempre con `model: "sonnet"`.
- **No:** decisiones de diseño, integración en la web, commits o cualquier cosa que toque archivos que otro agente está usando. Eso lo hace la sesión principal.

## Plantilla del pedido (autocontenido: el agente no ve la conversación)

1. **Repo y copia:** `/Users/macbook/Documents/Testing/mendoza-transparente`. No usar otras copias.
2. **Qué leer primero:** `AGENTS.md` y la skill o el documento de `docs/procesos/` que corresponda.
3. **Reglas:**
   - **NO commit.**
   - Código en inglés y textos en español.
   - Sin dependencias nuevas.
   - **Archivos propios** (lista exacta) y **qué no tocar**: `apps/web` si otra sesión la edita, `sources.yaml` salvo su bloque, y `data/*` de otras fuentes.
4. **Objetivo y salida exacta:** archivos, columnas, ids y formato. Si hay que relevar, pedir primero el relevamiento y después la implementación.
5. **Verificación esperada:** totales contra el original, que corra dos veces sin duplicar, `tsc` y una muestra revisada a mano.
6. **Reporte:** archivos, cobertura y lo que falta, ejemplos, dudas, y **datos que no se publican** con dónde se buscó.

## Al integrar

1. **Revisar el código y los datos:** conteos, totales y una muestra contra el original. Las dudas que marcó el agente se resuelven, no se ignoran. Si tocó la interfaz, skill `revisar-interfaz`.
2. **Correr lo que el agente no pudo** (por ejemplo `bun test`, si se lo bloquearon).
3. **Si son fotos,** mirarlas una por una: que sea la persona y que esté sola.
4. **Sumar lo que no se publica** a `data/curado/no-publicado.yaml`.
5. **Un commit por entrega,** con `git add` de sus rutas; si el agente sigue corriendo, nunca `-A`.
6. **Contarle al usuario** qué llegó, qué falta y qué hay que decidir.
