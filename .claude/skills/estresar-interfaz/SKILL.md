---
name: estresar-interfaz
description: Probar un componente de Mendoza Transparente con el peor caso real de nuestros datos (el nombre más largo, el monto más grande, listas vacías o de uno, personas sin foto, campos faltantes, 320 px) en una página temporal de desarrollo, y reportar lo que se rompe a la vista con su arreglo. Cargar al crear o cambiar un componente que muestra datos que varían, cuando piden "fijate si aguanta", "probá casos raros" o "que no se rompa", y al revisar la regla de una sola línea.
---

# Estresar un componente

Fuente completa: `docs/procesos/mejoras-de-interfaz.md`, sección 5. Los componentes se arman con datos amables; el sitio público recibe lo peor.

## 1. Un componente por vez

"La página de municipios" no es un componente; la tarjeta de deuda de un municipio sí. Si el pedido abarca varios, listarlos y preguntar por cuál empezar. Decir en una oración qué recibe, qué muestra y dónde vive.

## 2. Qué muestra y de dónde sale

Tabla con cada valor visible: campo, tipo (`src/types.ts`), de qué JSON viene (`public/data/`) y si puede faltar. Incluir lo que se olvida: cantidades en los títulos, etiquetas, fechas, la foto y el largo de la lista.

## 3. El peor caso, de nuestros datos

Nunca inventado (`"aaaa…"` no prueba nada): se busca el valor real en `data/processed/` o en `public/data/` con un script de `bun` o `rg`.

| Qué | Peor caso |
|---|---|
| Nombre de persona | El más largo real (apellidos compuestos) y uno muy corto |
| Cargo, organismo, proveedor | El más largo real |
| Título de una ley | El más largo del índice |
| Departamento | "General San Martín", "Luján de Cuyo" |
| Monto | El más grande real, $ 0 y negativo si el dato lo admite |
| Porcentaje | El desvío más grande real y 0 % |
| Cantidad | 0, exactamente 1 (singular) y la mayor real |
| Lista | Vacía, un elemento y la más larga |
| Foto | Sin foto (iniciales) y una URL que no carga |
| Fecha | Faltante, la más vieja y hoy |
| Campo opcional | Faltante: que no quede un "—" suelto ni un hueco |

Repartir los casos entre filas, como en los datos reales, en vez de juntar todo en la primera. Escribir la lista antes de armar la página y decir qué ejes se descartaron y por qué.

## 4. Página temporal

- Una ruta que se registra solo con `import.meta.env.DEV` (por ejemplo `/_estres`), con el **componente real** importado sin cambios.
- Un escenario debajo del otro, con su etiqueta, dentro de contenedores de 320 px y del ancho real donde vive.
- Los datos entran como props. La página no agrega estilos, no cambia tokens y no se conecta a datos en vivo.
- **No se commitea.** Se borra cuando quien pidió dice que terminó; después, buscar que no quede nada (`git status`, `rg _estres`).

## 5. Mirar una vez y reportar

Una captura con `playwright-core` (o pasar la URL si no hay navegador). Reportar solo lo que se ve roto, no lo que podría romperse, y anotarlo también en la página, debajo de cada escenario.

| Escenario | Qué se ve | Causa | Arreglo |
|---|---|---|---|

Causas frecuentes:

| Se ve | Causa | Arreglo |
|---|---|---|
| El texto se sale de la caja | Falta `min-w-0` en la columna de texto | `min-w-0` + `truncate` |
| La flecha o el botón salen de la fila | El medio se come el espacio | `min-w-0` en el medio, `shrink-0` en la acción |
| Avatar o ícono aplastado | Se encoge en un `flex` | `shrink-0` |
| Una etiqueta pasa a dos líneas | Se encoge | `whitespace-nowrap shrink-0` |
| Un monto se parte | Sin `whitespace-nowrap` | Una línea; la unidad aparte y en chico |
| "1 datos", "0 dato" | Plural fijo | Singular y plural según la cantidad |
| Números que bailan o columnas desalineadas | Cifras proporcionales | `tabular-nums` |
| `NaN`, `undefined`, `1284` sin puntos | Número crudo | Formatear con `es-AR`; contemplar el faltante |
| Texto cortado sin forma de leerlo entero | Solo `truncate` | El texto completo en `title` o en la hoja de detalle |

Cortar o pasar a dos líneas se decide por campo: los nombres que identifican pueden ir en dos líneas; lo secundario se corta; **los números, montos y fechas nunca se cortan**.

Cerrar con: lo que se rompió (lo más grave primero), las decisiones para quien pidió (una línea cada una, con recomendación) y lo que aguantó. "Todo aguantó" es un buen reporte.

## 6. Arreglar solo si se pide

Con el arreglo, volver a mirar todos los escenarios, también el caso normal, para no romperlo.
