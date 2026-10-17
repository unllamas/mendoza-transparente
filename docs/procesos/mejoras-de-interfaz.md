# Mejoras de interfaz

Cómo se pide, se entiende, se arregla y se revisa una mejora sobre algo que ya está en el sitio. La meta es que quien pide no tenga que explicar dos veces: el agente ubica el lugar exacto, entiende qué regla está en juego y, si el pedido trae una regla nueva, la deja escrita para la próxima.

Lo adaptamos de recursos de la comunidad de *design engineering* (ver [Fuentes](#fuentes)), traducido y ajustado a nuestras reglas.

## 1. Pedir una mejora

**La forma más rápida: Agentation.** Con `bun run dev`, abajo a la derecha aparece una barra (solo en desarrollo; nunca llega al sitio publicado).

1. Tocar la barra para activarla y hacer clic en el elemento que hay que cambiar. También se puede seleccionar un texto o arrastrar sobre una zona.
2. Escribir qué está mal y qué se esperaba.
3. Enviar. El agente recibe el selector, el componente de React, la página y la nota.

Sin configurar nada, el botón de copiar de la barra deja la nota en el portapapeles para pegarla en el chat. Para que llegue sola al agente:

1. El repo trae `.mcp.json` con el servidor `agentation` (`npx -y agentation-mcp server`, puerto 4747). Claude Code pide aprobarlo la primera vez que se abre en la carpeta.
2. Crear `apps/web/.env.local` (no se commitea) con `VITE_AGENTATION_ENDPOINT=http://localhost:4747` y reiniciar `bun run dev`.
3. Comprobar con `npx agentation-mcp doctor`, dejar una nota de prueba y pedirle al agente que la lea.

La conexión es opcional a propósito: si la barra apunta al servidor y el servidor no está corriendo, ensucia la consola con errores de conexión.

**Sin Agentation**, el pedido sirve si dice cuatro cosas:

| Qué | Ejemplo |
|---|---|
| Dónde | `/municipios/capital`, la tarjeta de deuda |
| Qué pasa | El monto se corta en dos líneas |
| Qué se esperaba | Que entre en una línea, como en las otras tarjetas |
| En qué pantalla | Celular (o captura) |

## 2. Entender el pedido (para el agente)

1. **Ubicar.** De la URL a la página de `apps/web/src/pages/` y de ahí al componente; con Agentation, el selector y el nombre del componente ya lo dicen. Si el componente es compartido (`@mt/ui` o `src/components/`), anotar en qué otras pantallas aparece.
2. **Ver antes de tocar.** Captura en 375 y 1280 px, en modo oscuro, con `playwright-core` (ver `scripts/verificar-web.ts`).
3. **Traducir el pedido a una regla.** La gente describe lo que siente, no la regla. Esta tabla une las dos cosas:

| Lo que se dice | La regla detrás | Dónde está |
|---|---|---|
| «No se entiende que se puede tocar» | Una sola forma por tipo; la acción se ve antes del hover; flecha en `text-text-link` | `diseno.md`, Forma |
| «Se corta», «queda feo en el celu» | Una sola línea en cifras, títulos y montos; nunca scroll horizontal | `diseno.md`, Forma |
| «Es muy chico para tocar», «toco y no pasa nada» | 44 px para tocar; respuesta al tocar (`active:`) | `diseno.md`, Forma y Celular |
| «Al escribir se agranda la pantalla» | Campos con letra de 16 px en el celular | `diseno.md`, Celular |
| «No entiendo qué es este número» | Unidad aparte, pesos de hoy, aviso `note`, glosario | `diseno.md`, Avisos; `metodologia.md` |
| «Esto parece una acusación» | Señales, no acusaciones | `metodologia.md` |
| «Hay demasiado», «no sé dónde mirar» | La gente no lee: lista corta, detalle en hoja, lo informativo antes que lo crudo | `diseno.md`, Contenido |
| «Están desordenadas», «se siente disperso» | Tarjetas agrupadas por la pregunta que responden, sin etiqueta de tema en cada una; lo que limita al resto, primero | `diseno.md`, Contenido |
| «No sé qué hacer acá», «quedó vacío» | Pantallas vacías que dicen qué hacer | `diseno.md`, Textos de la interfaz |
| «Parece hecho por una IA», «parece un template» | Lo que no hacemos | `diseno.md`, Lo que no hacemos |
| «Quiero mandar a alguien directo a esta parte» | Cada sección tiene su link (`Section` con `id`) | `diseno.md`, Contenido; `web.md`, Link a cada sección |
| «Esto no se ve igual que lo otro» | Usar el componente de `@mt/ui`, no clases sueltas | `diseno.md`, Sistema de diseño |

4. **Si es ambiguo, una sola pregunta** con opciones concretas (por ejemplo: «¿cortar con … o pasar a dos líneas?»). Si no, actuar.
5. **Arreglar la causa, no el síntoma.** Si el problema está en un componente compartido, se arregla ahí y se avisa qué otras pantallas cambian.
6. **Si el pedido trae una regla nueva, se escribe.** Va a `diseno.md` (y a la skill `diseno`) en el mismo commit. Así la próxima vez el agente la aplica sin que nadie la pida.

## 3. Arreglar y comprobar

- Captura después del cambio en los mismos anchos, y `bun run verificar`.
- Si el componente muestra datos que cambian (nombres, montos, listas), **estresarlo** (sección 5).
- Reporte corto a quien pidió: qué se cambió, qué regla se aplicó, qué otras pantallas cambian y, si hubo, qué regla nueva quedó escrita.

## 4. Revisar un cambio de interfaz

Antes de commitear un cambio de interfaz grande, o al integrar lo que hizo un subagente, se revisa **el cambio**, no todo el sitio (skill `revisar-interfaz`):

1. **Alcance:** lo que está en la rama y no en `dev` (en un hotfix, `main`), más lo que no está commiteado. Si no hay cambios, preguntar qué revisar; nunca revisar el último commit por cuenta propia.
2. **Radio de impacto:** un archivo cambiado es una pista. Se revisan las pantallas donde aparece: un salto (quién lo importa) y dos si es un token o un componente de `@mt/ui`, que llega a todo el sitio.
3. **Leer también lo que se borró:** un `aria-label`, un `min-h-11`, un `truncate` o un `min-w-0` que desaparece sin reemplazo es una regresión.
4. **¿Hace lo que dice?** Contra el pedido o el mensaje del commit: ¿faltan estados (vacío, cargando, error, sin foto, ancho de 320 px)? ¿Se agregó algo en una pantalla y no en sus hermanas?
5. **Clasificar cada hallazgo:** `Nuevo` (lo causó el cambio), `Regresión` (empeoró algo que estaba bien) o `Previo` (ya estaba; máximo tres, como cortesía).
6. **Solo lectura:** no se cambia de rama ni se usa `git stash`. El resultado es una tabla y un veredicto: `Bloquear` si hay algo grave, `Aprobar` si no.

## 5. Estresar un componente

Los componentes se diseñan con datos amables: nombres cortos, montos redondos, todas las fotos. El sitio público recibe lo peor (skill `estresar-interfaz`):

1. **Un componente por vez**, no «la página de municipios».
2. **Listar lo que muestra** y de dónde sale cada valor (tipo en `src/types.ts`, JSON en `public/data/`).
3. **Armar el peor caso real**, sacado de nuestros datos, nunca inventado (`"aaaa…"` no prueba nada):

| Qué | Peor caso real |
|---|---|
| Nombre de persona | El más largo de `data/processed/` (apellidos compuestos, segundos nombres) |
| Cargo u organismo | El más largo (ministerios y direcciones con nombres de dos líneas) |
| Título de una ley | El más largo del índice de `/leyes` |
| Departamento | «General San Martín», «Luján de Cuyo», «Godoy Cruz» |
| Monto | El más grande (miles de millones), uno de $ 0 y uno negativo si el dato lo admite |
| Porcentaje | Un desvío enorme («+526.069 %») y uno de 0 % |
| Cantidad | 0, exactamente 1 (singular: «1 dato») y la mayor real |
| Lista | Vacía, de un solo elemento y la más larga |
| Foto | Persona sin foto (iniciales) y foto que no carga |
| Fecha | Sin fecha, una muy vieja y una de hoy |
| Campo opcional | Faltante: que no quede un «—» suelto ni un hueco |

4. **Mostrarlo en una página temporal** de desarrollo: una ruta que se registra solo con `import.meta.env.DEV`, con el componente real importado sin cambios, un escenario debajo de otro con su etiqueta, en 320 px y en el ancho real del contenedor. La página no agrega estilos propios.
5. **Mirar una vez y reportar lo que se rompió a la vista**, no lo que podría romperse:

| Escenario | Qué se ve | Causa probable | Arreglo |
|---|---|---|---|
| Nombre más largo | Empuja la flecha fuera de la fila | Falta `min-w-0` en la columna de texto | `min-w-0` + `truncate`, y `shrink-0` en la flecha |
| Persona sin foto | El avatar se aplasta | El avatar se encoge | `shrink-0` en `PersonAvatar` |
| 1 elemento | «1 datos» | Plural fijo | Plural según la cantidad |

6. **No arreglar sin que se pida.** Algunos casos son decisiones (¿cortar o pasar a dos líneas?): se proponen con una recomendación. Los números, montos y fechas **nunca se cortan**.
7. **La página temporal no se commitea.** Se borra cuando quien pidió dice que terminó.

## Herramientas

| Herramienta | Para qué | Estado |
|---|---|---|
| Agentation (`agentation`, dependencia de desarrollo de `apps/web`) | Señalar en la pantalla qué cambiar | En uso; `src/components/dev-feedback.tsx` |
| `agentation-mcp` (`.mcp.json`) | Que las notas lleguen solas al agente | En uso |
| `bun run verificar` | Scroll horizontal, consola, 44 px, encabezado, menú móvil y campos de 16 px | En uso |
| Rams (rams.ai) | Revisión automática de interfaz | No: es pago y la sección 4 cubre lo mismo |
| Skills de terceros instaladas tal cual (`npx skills add …`) | — | No: están en inglés, son genéricas y chocan con reglas nuestras (paleta celeste, sin CSS propio). Se toman las ideas y se escriben acá |

## Fuentes

Recopiladas en [desengs.com](https://desengs.com/):

- [Web Interface Guidelines](https://interfaces.rauno.me/), de Rauno Freiberg.
- [emilkowalski/skills](https://github.com/emilkowalski/skills): `break-ui` y `mobile-native`.
- [jakubkrehel/skills](https://github.com/jakubkrehel/skills): `break`, `interface-review`, `better-accessibility`, `better-writing` y `better-ui`.
- [Impeccable](https://impeccable.style/): su lista de errores típicos de las interfaces hechas con IA.
- [Agentation](https://www.agentation.com/).
