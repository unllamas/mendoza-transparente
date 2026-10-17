---
name: mejoras
description: Cómo entender y resolver un pedido de mejora o arreglo sobre algo que ya está en el sitio de Mendoza Transparente. Cubre notas de Agentation (selector y componente), ubicar la página y el componente, traducir lo que la persona describe a la regla de diseño que está en juego, preguntar solo si es ambiguo, arreglar la causa y dejar escrita la regla nueva. Cargar cada vez que alguien pide mejorar, arreglar, cambiar o "que se vea mejor" algo existente, o pega una nota de Agentation o una captura.
---

# Pedidos de mejora

Fuente completa: `docs/procesos/mejoras-de-interfaz.md`. La meta: que nadie tenga que explicar dos veces.

## 1. Leer el pedido

- **Nota de Agentation** (con el MCP `agentation`: `agentation_get_all_pending`; si no, viene pegada en el chat): trae la página, el selector, el componente de React y el comentario. Al terminar, marcarla resuelta y contestar en la misma nota.
- **Captura o texto:** buscar dónde (URL o pantalla), qué pasa, qué se esperaba y en qué ancho. Si falta el dónde y no se deduce, es lo único que se pregunta.

## 2. Ubicar y ver

1. URL → `apps/web/src/pages/` → componente. Si es compartido (`@mt/ui`, `src/components/`), listar en qué otras pantallas aparece.
2. Captura **antes** en 375 y 1280 px, en modo oscuro (`playwright-core`).

## 3. Traducir a una regla

La gente describe lo que siente. Buscar la regla (detalle en `docs/procesos/diseno.md`):

| Lo que se dice | Regla | Skill |
|---|---|---|
| "No se entiende que se puede tocar" | Una sola forma por tipo, acción visible sin hover, flecha en `text-text-link` | `diseno` |
| "Se corta", "queda feo en el celu" | Una línea en cifras, títulos y montos; nunca scroll horizontal | `diseno` |
| "Es chico para tocar", "toco y no pasa nada" | 44 px, respuesta con `active:` | `diseno` |
| "Al escribir se agranda la pantalla" | Campos de 16 px en el celular | `diseno` |
| "No entiendo este número" | Unidad aparte, pesos de hoy, `Alert note`, glosario | `diseno`, `contenido-y-metodologia` |
| "Parece una acusación" | Señales, no acusaciones | `contenido-y-metodologia` |
| "Hay demasiado", "no sé dónde mirar" | Lista corta, detalle en hoja, lo informativo antes que lo crudo | `diseno` |
| "Quedó vacío", "no sé qué hacer acá" | Pantallas vacías que orientan | `diseno` |
| "Parece hecho por una IA", "parece un template" | Lo que no hacemos | `diseno` |
| "Unos se ven más chicos que otros", "salta el layout" | Misma altura en una fila; lo que se toca solo cambia el fondo | `diseno` |
| "El borde del seleccionado se rompe", "no se ve cuál elegí" | El elegido con su color, los demás apagados | `diseno` |
| "Ese botón ocupa una fila entera", "sobra lugar abajo del título" | La acción de la página va en columna a la derecha del encabezado, solo ícono con tooltip | `diseno` |
| "Se repite arriba del título", "dos líneas que dicen lo mismo" | Una sola línea arriba del título: la ruta termina en la página actual con su ícono | `diseno` |
| "Queda un espacio de más arriba del título", "sobra lugar" | El link para atrás va pegado al encabezado (`WithBreadcrumbs`) | `diseno` |
| "El gráfico no es proporcional", "¿qué es el 100 %?" | En una composición, la barra llena es el total | `diseno` |
| "Ocupa toda la pantalla", "en la compu sobra espacio" | Dos gráficos chicos seguidos, en dos columnas en desktop | `diseno` |
| "Las fuentes están arriba en unas y abajo en otras", "repite mucho «Fuente»" | Fuentes siempre al final, una fila por organismo | `diseno` |
| "No se ve igual que lo otro" | Componente de `@mt/ui`, no clases sueltas | `diseno`, `arquitectura` |
| "Quiero mandar directo a esta parte", "no puedo compartir una sección" | Cada sección tiene su link (`Section id`) | `diseno` |
| "No aparece en Google", "se ve mal al compartir" | Títulos, descripciones, imágenes para compartir | `seo-y-geo` |

Cargar la skill de la columna antes de tocar código.

## 4. Decidir

- **Ambiguo:** una sola pregunta, con opciones concretas y una recomendación ("¿cortar con … o pasar a dos líneas? Recomiendo cortar porque…").
- **Claro:** actuar.
- **Arreglar la causa,** en el componente compartido si corresponde, y avisar qué otras pantallas cambian.

## 5. Cerrar

1. Captura **después** en los mismos anchos; si muestra datos variables, skill `estresar-interfaz`.
2. `bun run verificar`.
3. **¿El pedido trajo una regla que no estaba escrita?** Agregarla a `docs/procesos/diseno.md` y a la skill `diseno` en el mismo commit, y sumar la frase a la tabla del paso 3 si es una forma nueva de pedir lo mismo.
4. Reporte corto: qué cambió, qué regla se aplicó, qué otras pantallas cambian y qué regla nueva quedó escrita.
