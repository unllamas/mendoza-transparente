# Procesos internos

Cómo se trabaja en Mendoza Transparente, para poder replicarlo, retomarlo o sumar gente. Cada documento es corto y práctico: qué hacer, en qué orden y qué revisar.

| Documento | Para qué |
|---|---|
| [Agregar una fuente](agregar-una-fuente.md) | Sumar un dato público nuevo: del relevamiento al CSV y a la web |
| [Actualización de datos](actualizacion-de-datos.md) | Cómo se mantienen al día los datos, en la nube y a mano, y qué hacer si algo falla |
| [Datos y archivo](datos-y-archivo.md) | Reglas de `data/`: archivo crudo, procesados, diccionario y contenido curado |
| [Arquitectura](arquitectura.md) | Dónde va cada cosa en el monorepo y las reglas que se controlan solas (Biome, dependency-cruiser, hooks, CI) |
| [La web](web.md) | Cómo está armada `apps/web`, cómo se suma una página y cómo se verifica |
| [Diseño](diseno.md) | Reglas de interfaz que no se negocian |
| [Mejoras de interfaz](mejoras-de-interfaz.md) | Cómo se pide, se entiende, se revisa y se estresa un cambio sobre algo existente |
| [Relevamiento municipal](relevamiento-municipal.md) | Cómo se revisa cada trimestre qué publica cada uno de los 18 municipios |
| [Metodología y criterios](metodologia.md) | Cómo se calculan los números y cómo se presentan los hallazgos |
| [Analítica](analitica.md) | Qué se mide del uso del sitio, cómo se nombran los eventos y cómo se suma uno |
| [Participación](participacion.md) | Pedidos de información, respuestas, errores y sugerencias: API, base y moderación |
| [Panel interno](panel.md) | La app del equipo para revisar y publicar lo que llega: login, publicación, seguridad y casos límite |
| [Trabajo con agentes](trabajo-con-agentes.md) | Cómo se orquesta el trabajo con Claude y subagentes |

Comandos de todos los días (desde la raíz):

```bash
bun install                      # dependencias
bun run dev                      # web en desarrollo, se recarga sola con los datos nuevos
bun run panel                    # panel interno en desarrollo (misma base local que la web)
bun run scrape <fuente> [args]   # correr un scraper
bun run actualizar               # actualización manual de las fuentes bloqueadas en la nube
bun run verificar                # controles de la web (scroll horizontal y consola)
bun run typecheck                # tipos de todo el monorepo
```
