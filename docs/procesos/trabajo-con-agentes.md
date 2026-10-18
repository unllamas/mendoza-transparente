# Trabajo con agentes

El proyecto se construye con Claude Code. La guía para agentes es `AGENTS.md`, el formato común que leen Codex, Cursor y otros agentes; `CLAUDE.md` solo tiene `@AGENTS.md`, que lo importa, porque Claude Code lee ese nombre. Las reglas se editan siempre en `AGENTS.md`. La sesión principal orquesta y delega las tareas acotadas en subagentes que trabajan en paralelo.

## Roles

- **Sesión principal (Opus)**: decide, diseña, integra, revisa todo lo que entregan los subagentes y hace los commits, en una rama que sale de `dev` (ver [Ramas y releases](ramas-y-releases.md)). **Toda tarea termina con commit, push y PR a `dev`, sin esperar un pedido aparte**: lo que queda sin commitear en un worktree se pierde. **El PR no lo mergea el agente salvo que el usuario se lo pida explícitamente**; si no, lo revisa y lo mergea una persona del equipo. Los cambios que llegan después en la misma conversación van a la misma rama y al mismo PR.
- **Subagentes (Sonnet)**: tareas acotadas y largas: un scraper, un relevamiento, un diccionario de datos, una búsqueda de fotos. Corren en paralelo y en segundo plano. Configurado en `~/.claude/settings.json` con `CLAUDE_CODE_SUBAGENT_MODEL`.

## Harness: skills, hooks y permisos

El repo trae la configuración de Claude Code en `.claude/`. Funciona cuando Claude Code se abre en la carpeta del repo:

- **`skills/<nombre>/SKILL.md`:** una skill por proceso: `codigo`, `arquitectura`, `diseno`, `mejoras`, `vista-previa`, `revisar-interfaz`, `estresar-interfaz`, `analitica`, `datos-y-fuentes`, `contenido-y-metodologia`, `seo-y-geo`, `produccion`, `panel`, `delegar-en-agentes` y `ramas-y-releases`.
  - Cada una tiene una descripción que dice cuándo cargarla y una checklist corta.
  - El detalle sigue en `docs/procesos/`. Si algo cambia, se actualizan los dos en el mismo commit.
  - El índice de qué cargar según la tarea está en `AGENTS.md`.
- **`hooks/protect-secrets.ts`:** se ejecuta antes de cada comando o lectura de archivos y bloquea cualquier intento de mostrar `.env.cloudflare` o `.env.posthog` (`cat`, `grep`, `Read`…). Cargarlos en el shell sí se permite.
- **`.mcp.json`** (en la raíz): servidor MCP de Agentation, para que las notas que se marcan en la pantalla lleguen al agente. Ver [Mejoras de interfaz](mejoras-de-interfaz.md).
- **`settings.json`:**
  - Activa el hook.
  - Permite sin preguntar los comandos de verificación (`typecheck`, `verificar`, `data`, `git status`/`diff`/`log`) y los de lectura compacta (`bun run crudo`, `bun run seccion`), para que los subagentes los usen sin pedir permiso.
  - Niega leer los archivos de credenciales.

**Sumar un proceso:**
1. Escribir su documento en `docs/procesos/`.
2. Crear la skill: `.claude/skills/<nombre>/SKILL.md`, con `name`, una `description` que diga cuándo cargarla, y la checklist.
3. Agregarla a la tabla de `AGENTS.md`.

Todo en el mismo commit.

## Reglas para delegar

Cada pedido a un subagente incluye:

1. Qué leer primero: `AGENTS.md`, la skill del proceso (`.claude/skills/…`) y, si es una fuente, `packages/core/src/*.ts` y la sección del relevamiento. De los documentos largos se pide **la sección**, no el archivo (`bun run seccion <documento> "<título>"`; ver [Cuidar el contexto](#cuidar-el-contexto)).
2. El objetivo concreto y el formato de salida (archivos, columnas, ids).
3. Qué archivos le pertenecen (solo los de su fuente) y qué **no** tocar: `sources.yaml`, `packages/core`, `package.json`, otras fuentes. Varios agentes editando `bun.lock` a la vez se pisan; las dependencias las instala la sesión principal antes de lanzarlos.
4. **Nunca hacer commit**: lo hace la sesión principal después de revisar.
5. Qué verificar antes de terminar (conteos, totales, escalas, que corra dos veces sin duplicar).
6. El reporte final con el [formato fijo](#el-reporte-de-un-subagente), que entra en una pantalla. Los datos van a disco y nunca al reporte.
7. Si aparece un problema de seguridad: parar, no descargar nada más y cargarlo con `bun run hallazgo`, sin copiar los datos ni escribirlo en archivos, y poner el código `S-…` en el reporte (ver [Hallazgos de seguridad](seguridad.md)).

## Cuidar el contexto

Cada agente tiene un límite de texto que puede tener presente a la vez (el contexto). Lo que lee y lo que le devuelven los subagentes lo va llenando. Cuando se llena, resume y pierde detalles. En octubre de 2026 medimos las 126 sesiones del proyecto:

- **Lo que devuelven los subagentes ya era poco**: una mediana de unos 570 caracteres por entrega. Las excepciones fueron los relevamientos, de hasta 25.000 caracteres.
- **La sesión principal se llena leyendo documentos y código enteros**: el 60 % de lo que entra. Los tres documentos más largos (`diseno.md`, `metodologia.md` y `web.md`, de unos 30 KB cada uno) se leen enteros en casi todas las sesiones, aunque la tarea use una sección.
- **Los subagentes se llenan leyendo HTML y PDF crudos**: el 40 % de lo que leen. Además repiten pedidos: de 918 pedidos web, 264 repetían una URL y 50 eran archivos que ya estaban en `data/raw/`.
- **Las orquestaciones largas no cortan nunca**: la del relevamiento de los anexos municipales llegó a 964.000 tokens en una sola sesión.

De ahí salen cuatro reglas.

### 1. Un archivo crudo se mira con `bun run crudo`

Antes de bajar una página con `curl` o de pasar un PDF a texto, se usa `bun run crudo` (`packages/scrapers/src/inspect.ts`). Devuelve una vista compacta: título, encabezados, links a documentos y texto recortado para el HTML; páginas para el PDF; hojas y primeras filas para las planillas; la estructura para el JSON; la lista de archivos para el ZIP.

```bash
bun run crudo municipios-lrf                         # lo archivado de la fuente
bun run crudo municipios-lrf/san-rafael-2023-T1-anexo2.pdf --paginas 1-2
bun run crudo https://www.sanrafael.gov.ar/informacion-publica/ley-resp-fiscal/ --links 2024
bun run crudo <url> --buscar "anexo 2" --max 2000
```

- Una URL se busca primero en los `manifest.jsonl` de `data/raw/`. Si ya está archivada, no se pide de nuevo.
- Si no está, va al caché compartido (`~/.cache/mendoza-transparente/crudo/`, dura 7 días, se cambia con `MT_CRUDO_CACHE`). Lo comparten todos los agentes y worktrees de la máquina, así que dos subagentes que relevan el mismo municipio piden la página una sola vez.
- Con `--fuente <id>` la descarga queda archivada en `data/raw/<id>/` con `archive()`, como cualquier crudo. `--fresco` ignora el caché y lo archivado.
- Por defecto muestra hasta 3.000 caracteres de texto y avisa cuánto quedó afuera. Para ver más se usan `--buscar`, `--paginas` o `--max`, nunca el archivo entero.

### 2. De los documentos largos se lee una sección

`bun run seccion <documento>` muestra el índice con el tamaño de cada sección, y `bun run seccion <documento> "<título>"` muestra solo esa sección. También acepta el ancla de los links (`bun run seccion web#velocidad-de-carga`), cualquier documento de `docs/` y las skills. Los documentos no se parten en archivos: así no se rompen los links que ya apuntan a sus secciones.

### 3. El reporte de un subagente

El reporte entra en una pantalla (unas 40 líneas) y sigue siempre este formato:

```
Archivos: rutas que creó o cambió
Cobertura: filas, períodos y municipios; qué falta y por qué
Verificación: totales contra el original, segunda corrida sin duplicar, tsc
Muestra: hasta 3 filas
Dudas: lo que la sesión principal tiene que decidir
No publicado: qué no se encontró y dónde se buscó
```

- **Los relevamientos se escriben en un archivo**, `tmp/agentes/<tarea>.md` (`tmp/` no se commitea). El reporte trae solo las conclusiones y la ruta. La sesión principal pasa a `docs/relevamiento-fuentes.md` o a `data/curado/` lo que corresponda.
- **Nada de HTML, tablas largas ni fragmentos de PDF en el reporte.** Si la sesión principal necesita verlos, los mira con `bun run crudo`.

### 4. Sesiones por etapa

Una orquestación larga (un relevamiento de 18 municipios o una fuente con varias capas) se parte en etapas. Al cerrar cada una:

1. Commit, push y PR de lo que está terminado.
2. El estado se escribe en `docs/planes/<plan>.md`: qué se hizo, qué falta, qué se decidió y por qué, y los subagentes que siguen corriendo.
3. La etapa siguiente arranca en una sesión nueva, que lee ese plan y no toda la conversación anterior.

Conviene cortar al terminar cada entrega integrada, o antes si la sesión ya integró más de cinco o seis subagentes. Sin datos, una sesión no sabe cuánto contexto lleva: la integración de cada entrega es el punto natural de corte.

## Revisión de lo que entregan

- Correr y mirar los CSV con comandos que devuelvan poco: conteos (`wc -l`), totales, escalas y `head -5`, no el archivo entero.
- Revisar los casos que el agente marcó como dudosos (por ejemplo, la adjudicación de $54.137 M que resultó ser real, o el intendente de Rivadavia que no coincidía entre fuentes).
- Tipos (`bunx tsc --noEmit`) y, si toca la web, `bun run verificar`.
- Un commit por entrega, con un mensaje en [Conventional Commits](ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr) que explique qué datos trae.

## Cosas que aprendimos

- Los subagentes no ven la conversación: el pedido tiene que ser autocontenido.
- Pedir siempre que verifiquen contra el documento original y que reporten lo dudoso en vez de resolverlo en silencio.
- Las decisiones de diseño y producto las toma la sesión principal; los subagentes ejecutan.
- **El turno no termina esperando una CI.** Varias veces la sesión cerró con «espero a que termine la CI» y la persona tuvo que preguntar «¿y?». La CI y el despliegue se siguen en segundo plano hasta el final, y la tarea llega hasta donde se pidió (ver [Hasta dónde llevar cada pedido](ramas-y-releases.md#hasta-dónde-llevar-cada-pedido)).
- **La captura muestra un lugar, el pedido es de todos.** Un arreglo de interfaz se busca en todas las páginas que tienen el mismo patrón (ver [Mejoras de interfaz](mejoras-de-interfaz.md#2-entender-el-pedido-para-el-agente)).
- **Cada propuesta dice cuánto gasta.** El proyecto no tiene financiación: una CI nueva, una función o un servicio se evalúa contra los planes gratis (ver [Costo cero](arquitectura.md#costo-cero)).
