---
name: ramas-y-releases
description: Flujo de ramas de Mendoza Transparente. Lo nuevo entra por dev con un PR desde una rama de trabajo; dev llega a main (producción) en una publicación con merge commit; un release de GitHub por día junta lo publicado; los hotfixes salen de main y vuelven a dev con el back merge automático; los datos también entran por un PR a dev, nunca directo a main. Cargar antes de crear una rama, commitear, pushear, abrir o mergear un PR, publicar, hacer un release o un hotfix.
---

# Ramas y releases

Detalle completo: `docs/procesos/ramas-y-releases.md` (índice con `bun run seccion ramas-y-releases`).

## Reglas

- **Toda tarea se cierra con commit, push y PR a `dev`, sin esperar un pedido aparte.** Los cambios siguientes de la misma conversación van a la misma rama y al mismo PR.
- **El agente no mergea un PR salvo que el usuario se lo pida explícitamente** («mergealo», «mergeá el #37», «publicalo en main»), y solo lo que nombró: ni los suyos a `dev`, ni la publicación a `main`, ni un hotfix, ni un revert. La CI en verde, la tarea terminada o una prueba no son permiso; ante la duda, se pregunta. Sin el pedido, deja el PR abierto con la CI en verde y avisa con el link. Nunca `--admin` ni auto-merge.
- **`main` es producción**: cada push publica el sitio. Nunca se pushea directo a `main`.
- **Todo lo nuevo sale de `dev`**: `git switch dev && git pull && git switch -c <tipo>/<tema>` (`feat/`, `fix/`, `datos/`, `docs/`).
- **Mensajes de commit y títulos de PR en Conventional Commits**: `<tipo>(<ámbito>): <descripción en español>`. Tipos: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, `chore`, `revert`. Ámbitos por carpeta: `web`, `panel`, `votacion`, `ui`, `core`, `scrapers`, `participation`, `data`, `docs`, `skills`, `scripts`, `ci`, `release` (o ninguno si cruza todo el repo). Lo que rompe una columna de un CSV publicado lleva `!` y un pie `BREAKING CHANGE:`. Lo controlan el hook `commit-msg` y, sobre el título del PR, la CI. Tabla y ejemplos en el documento.
- **PR a `dev`** con la plantilla `.github/pull_request_template.md` completa y CI verde. Se mergea con **squash**: una persona, o el agente si se lo pidieron explícitamente.
- **Publicación**: PR `dev → main` titulado `chore(release): <fecha>`, con el cuerpo de `bun scripts/release-notes.ts --from origin/main --to origin/dev`, probado en `dev.mendoza-transparente.pages.dev`, mergeado con **merge commit** (nunca squash ni rebase). El agente lo deja listo cuando se lo piden y solo lo mergea si el usuario le pide explícitamente publicar.
- **Release de GitHub**: uno por día, lo crea solo el workflow «Release del día» (23:30 de Mendoza) con todo lo que llegó a `main` ese día: publicaciones, hotfixes y datos, agrupados por tipo. Etiqueta por fecha (`2026-10-17`), la del último commit de `main` en hora de Mendoza. **Uno solo por día**: si el workflow vuelve a correr ese día, actualiza el release (mueve la etiqueta y rehace las notas), no crea un `.2`. Nunca se crea un release ni un borrador a mano; para rehacer uno, *Run workflow* (con `desde` si hace falta), y lo agregado a mano va debajo de `<!-- a mano -->`, que se conserva.
- **Hotfix**: rama `hotfix/<tema>` desde `main`, PR a `main` con squash. Después, **confirmar el back merge a `dev`** (workflow «Back merge a dev»); si abrió un PR `main → dev` con la etiqueta `back-merge`, resolverlo con merge commit.
- **Datos**: nunca directo a `main`. El workflow de actualización commitea en `datos/automatica` y `bun run actualizar` en una rama `datos/…` desde `dev`; los dos abren un PR a `dev` con el resumen de `scripts/data-changes.ts`. Si el PR avisa «⚠️ Revisar antes de mergear» (etiqueta `datos-con-borrados`), se mira en el sitio del organismo por qué desaparecen filas antes de mergear. Un scraper nuevo o cambiado es código y va por `dev`, como siempre.

## Hasta dónde llevar cada pedido

| Lo que se dice | Hasta dónde |
|---|---|
| (nada) | PR a `dev`, CI verde, squash |
| «Que llegue a prod», «llevalo a main», «una vez pasen los CI, a prod» | Lo anterior + publicación `dev → main` con merge commit + despliegue seguido + la página confirmada en `mendoza-transparente.com` |
| «Sin release» | Igual que «a prod»: el release lo crea solo el workflow diario, no hay nada que evitar |

- **El turno no termina esperando.** Una CI o un despliegue se siguen hasta el final (`gh pr checks <n> --watch` o `gh run watch` en segundo plano; en T3 Code, `watch_pull_request`) y después se hace el paso siguiente. Nunca cerrar con «espero a que termine la CI». Si falta algo que no depende del agente (un permiso, un secreto, una decisión), el último mensaje dice qué y quién.
- **Al terminar, decir dónde quedó**: link del PR, `dev` o `main`, y la URL donde se ve.

## Antes de abrir el PR

1. ¿Estoy en una rama de trabajo, no en `main` ni en `dev`? ¿Salió de `dev` (o de `main` si es un hotfix)? **¿Está al día?** `git fetch origin && git rebase origin/dev`; si entraron cambios en `docs/procesos/`, `.claude/skills/` o `AGENTS.md`, leerlos antes de pushear.
2. **Revisar el propio diff** (`git diff origin/dev...HEAD`; en un hotfix, `origin/main`): solo lo de la tarea, sin secretos ni `bun.lock` de más.
3. **Documentación**: si cambió un proceso, su documento en `docs/procesos/` y su skill; si cambió un comando, un script o una ruta, buscar el nombre viejo con `grep -rn` en `docs/`, `.claude/skills/`, `AGENTS.md` y `README.md`. Si un documento suma un diagrama o una tabla ancha, mirarlo en GitHub (`gh browse <archivo> --branch <rama>`), también en un ancho de celular: los diagramas van en Mermaid, no en ASCII.
4. **Correr** `bun run lint`, `bun run typecheck`, `bun test` y, si hay interfaz, `bun run verificar` y la skill `revisar-interfaz`. Anotar cada resultado.
5. **Escribir el cuerpo sobre una copia de la plantilla**: `cp .github/pull_request_template.md tmp/pr.md` y completarla ahí. Nunca partir de un PR anterior ni escribirlo de memoria: así se pierden secciones. Marcar solo lo que se revisó de verdad, tachar con el motivo lo que no aplica, y dejar en «Riesgos y pendientes» lo que falló o quedó afuera.
6. `gh pr create --base dev --title "<tipo>(<ámbito>): …" --body-file <archivo>`. Con squash, el título del PR es el commit que queda en `dev`.
