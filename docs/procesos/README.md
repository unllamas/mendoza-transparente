# Procesos internos

Cómo se trabaja en Mendoza Transparente, para poder replicarlo, retomarlo o sumar gente. Cada documento es corto y práctico: qué hacer, en qué orden y qué revisar.

| Documento | Para qué |
|---|---|
| [Agregar una fuente](agregar-una-fuente.md) | Sumar un dato público nuevo: del relevamiento al CSV y a la web |
| [Actualización de datos](actualizacion-de-datos.md) | Cómo se mantienen al día los datos, en la nube y a mano, y qué hacer si algo falla |
| [Datos y archivo](datos-y-archivo.md) | Reglas de `data/`: archivo crudo, procesados, diccionario y contenido curado |
| [Arquitectura](arquitectura.md) | Dónde va cada cosa en el monorepo y las reglas que se controlan solas (Biome, dependency-cruiser, hooks, CI), y el costo cero de lo que se suma |
| [La web](web.md) | Cómo está armada `apps/web`, cómo se suma una página y cómo se verifica |
| [Diseño](diseno.md) | Reglas de interfaz que no se negocian |
| [Mejoras de interfaz](mejoras-de-interfaz.md) | Cómo se pide, se entiende, se revisa y se estresa un cambio sobre algo existente |
| [Vista previa de interfaz](vista-previa.md) | Armar, capturar y revisar una pantalla descartable antes de tocar el código real |
| [Relevamiento municipal](relevamiento-municipal.md) | Cómo se revisa cada trimestre qué publica cada uno de los 18 municipios |
| [Metodología y criterios](metodologia.md) | Cómo se calculan los números y cómo se presentan los hallazgos |
| [Analítica](analitica.md) | Qué se mide del uso del sitio, cómo se nombran los eventos, cómo se suma uno y cómo se decide un cambio con los datos |
| [Participación](participacion.md) | Pedidos de información, respuestas, errores y sugerencias: API, base y moderación |
| [Panel interno](panel.md) | La app del equipo para revisar y publicar lo que llega: login, publicación, seguridad y casos límite |
| [Hallazgos de seguridad](seguridad.md) | Qué hacer si al relevar aparece un problema de seguridad en un sitio del Estado: límites legales, carga en el panel y a quién se reporta |
| [Trámites y tributos](tramites-y-tributos.md) | Cómo se cargan los trámites y las tasas e impuestos de cada municipio |
| [Asistente (Aco)](asistente.md) | Cómo funciona el chat de la guía de trámites, cómo se configuran sus claves sin exponerlas y cómo se evalúa |
| [Trabajo con agentes](trabajo-con-agentes.md) | Cómo se orquesta el trabajo con Claude y subagentes |
| [Ramas y releases](ramas-y-releases.md) | Ramas de trabajo, PRs a `dev`, publicaciones a `main`, releases de GitHub por día, hotfixes, back merge y hasta dónde llevar cada pedido |

Comandos de todos los días (desde la raíz):

```bash
bun install                      # dependencias
bun run dev                      # web en desarrollo, se recarga sola con los datos nuevos
bun run panel                    # panel interno en desarrollo (misma base local que la web)
bun run scrape <fuente> [args]   # correr un scraper
bun run actualizar               # actualización manual de las fuentes bloqueadas en la nube
bun run verificar                # controles de la web (scroll horizontal y consola)
bun run hallazgo                 # cargar un hallazgo de seguridad en el panel (JSON por la entrada estándar, ver seguridad.md)
bun run vista-previa <ruta>      # capturas en 375 y 1280 px para revisar una vista previa
bun run typecheck                # tipos de todo el monorepo
bun run asistente:datos          # regenera lo que sabe el asistente desde el catálogo y las tasas
```
