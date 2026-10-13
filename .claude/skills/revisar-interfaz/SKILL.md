---
name: revisar-interfaz
description: Revisión de solo lectura de un cambio de interfaz en Mendoza Transparente (rama, cambios sin commitear o PR) contra las reglas de diseño, celular, accesibilidad, textos y movimiento. Encuentra lo que el cambio rompió, empeoró o dejó a medias, y devuelve una tabla con veredicto. Cargar antes de commitear un cambio de interfaz grande, al integrar lo que hizo un subagente en apps/web o packages/ui, o cuando piden "revisá esto".
---

# Revisar un cambio de interfaz

Fuente completa: `docs/procesos/mejoras-de-interfaz.md`, sección 4. Las reglas están en `docs/procesos/diseno.md` (cargar la skill `diseno`). Bugs, tipos y seguridad son de la revisión de código general: se nombran una vez y se sigue.

La pregunta es "¿este cambio empeoró algo?", no "¿qué está mal en el sitio?".

## 1. Alcance

Sin un objetivo dado, en este orden:

1. Si la rama tiene commits que `main` no tiene: `git diff $(git merge-base origin/main HEAD)` más lo no commiteado. Decir cuántos commits y cuántos archivos sin commitear.
2. Si solo hay cambios sin commitear: esos.
3. Si no hay nada: **preguntar** (el PR abierto de la rama, el último commit con su título, otra rama). Nunca revisar el último commit por cuenta propia.

Fuera del alcance: `bun.lock`, `data/`, `public/data/` y archivos generados.

## 2. Radio de impacto

Un archivo cambiado es una pista. Revisar las pantallas donde aparece: quién lo importa (un salto), y dos saltos si es un token de `globals.css` o un componente de `@mt/ui`. Máximo cinco pantallas; decir cuántas quedaron sin revisar.

## 3. Leer lo que se borró

En cada `-` del diff, buscar señales que desaparecen sin reemplazo: `aria-label`, `label` de `IconButton`, `min-h-11`, `truncate`, `min-w-0`, `shrink-0`, `whitespace-nowrap`, `text-link` en una flecha, `overscroll-contain`, `motion-safe:`, `text-base` en un campo, `FuentesOficiales`, `PersonAvatar`. Si el mismo efecto reaparece en otro lado del diff, no es regresión.

## 4. ¿Hace lo que dice?

Contra el pedido, el PR o el mensaje del commit, buscar lo que **falta**:

- Estados: vacío, cargando, error, sin foto, un solo elemento, 320 px, modo oscuro.
- Variantes a medias: hover sin `focus-visible`, `active:` sin `disabled:`.
- Algo agregado en una pantalla y no en sus hermanas (por ejemplo, en `/funcionarios/...` y no en `/gobierno/...`).
- Texto nuevo sin revisar contra el glosario y los nombres que ya usa el sitio.

## 5. Chequeos rápidos en el diff

| Si aparece | Hallazgo |
|---|---|
| `<div onClick` o `<span onClick` | Usar `<button>` o `Link` |
| Botón, tarjeta o etiqueta con clases sueltas | Usar el componente de `@mt/ui` |
| Color fuera de los tokens (`blue-`, hex, `text-red-`) | Paleta de la marca y colores de estado con texto |
| `transition-all`, `duration-500` o más | Propiedad con nombre, 200 ms o menos |
| `outline-none` sin otro indicador de foco | Foco visible |
| `text-sm` o `text-xs` en un `<input>`, `<textarea>` o `<select>` | 16 px en el celular |
| `h-` fijo en un contenedor de texto | `min-h-` |
| "acá", "ver más" suelto, "¡Ups!", "Algo salió mal", "exitosamente" | Textos de la interfaz |
| Tarjeta dentro de tarjeta, chip sobre un título, gradiente | Lo que no hacemos |

## 6. Reporte

Solo lectura: no cambiar de rama ni usar `git stash`. Si hace falta verlo, capturas con `playwright-core` sobre la copia actual; si no se pudo mirar, marcar "Sin verificar".

| Gravedad | Tema | Estado | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|---|

- **Gravedad:** `Alta` (impide una tarea, esconde algo a un lector de pantalla, rompe una regla que no se negocia), `Media` (más difícil o inconsistente) o `Baja` (detalle).
- **Estado:** `Nuevo` (lo causó el cambio), `Regresión` (empeoró algo que estaba bien) o `Previo` (ya estaba; máximo tres, al final).
- **Dónde:** `ruta/archivo.tsx:línea`.

Cerrar con `Bloquear` si queda algo `Alta`, o `Aprobar` si no. Sin hallazgos: "Sin problemas de interfaz en este cambio", más lo que se revisó.
