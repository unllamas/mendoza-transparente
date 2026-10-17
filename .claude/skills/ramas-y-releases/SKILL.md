---
name: ramas-y-releases
description: Flujo de ramas de Mendoza Transparente. Lo nuevo entra por dev con un PR desde una rama de trabajo; dev llega a main (producción) en un release con merge commit; los hotfixes salen de main y vuelven a dev con el back merge automático; los datos se publican directo en main. Cargar antes de crear una rama, commitear, pushear, abrir o mergear un PR, hacer un release o un hotfix.
---

# Ramas y releases

Detalle completo: `docs/procesos/ramas-y-releases.md`.

## Reglas

- **Toda tarea se cierra con commit, push y PR a `dev`, sin esperar un pedido aparte.** Los cambios siguientes de la misma conversación van a la misma rama y al mismo PR.
- **`main` es producción**: cada push publica el sitio. Nunca se pushea directo a `main`.
- **Todo lo nuevo sale de `dev`**: `git switch dev && git pull && git switch -c <tipo>/<tema>` (`feat/`, `fix/`, `datos/`, `docs/`).
- **Mensajes de commit y títulos de PR en Conventional Commits**: `<tipo>(<ámbito>): <descripción en español>`. Tipos: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, `chore`, `revert`. Ámbitos por carpeta: `web`, `panel`, `ui`, `core`, `scrapers`, `participation`, `data`, `docs`, `skills`, `scripts`, `ci`, `release` (o ninguno si cruza todo el repo). Lo que rompe una columna de un CSV publicado lleva `!` y un pie `BREAKING CHANGE:`. Lo controlan el hook `commit-msg` y, sobre el título del PR, la CI. Tabla y ejemplos en el documento.
- **PR a `dev`** con la plantilla `.github/pull_request_template.md` completa, CI verde y **squash**. El agente lo mergea él mismo; no espera aprobación salvo que el PR venga de alguien de afuera del equipo, que necesita la revisión de alguien del equipo.
- **Release**: PR `dev → main` titulado `chore(release): <fecha>`, probado en `dev.mendoza-transparente.pages.dev`, mergeado con **merge commit** (nunca squash ni rebase). Si la persona pidió que se publique cuando funcione, el agente lo mergea con la CI y la vista previa bien.
- **Hotfix**: rama `hotfix/<tema>` desde `main`, PR a `main` con squash. Después, **confirmar el back merge a `dev`** (workflow «Back merge a dev»); si abrió un PR `main → dev` con la etiqueta `back-merge`, resolverlo con merge commit.
- **Datos**: se publican en `main` (workflow de actualización y `bun run actualizar`, que solo publica desde `main`). Un scraper nuevo o cambiado es código y va por `dev`.

## Antes de abrir el PR

1. ¿Estoy en una rama de trabajo, no en `main` ni en `dev`? ¿Salió de `dev` (o de `main` si es un hotfix)?
2. **Revisar el propio diff** (`git diff origin/dev...HEAD`; en un hotfix, `origin/main`): solo lo de la tarea, sin secretos ni `bun.lock` de más.
3. **Documentación**: si cambió un proceso, su documento en `docs/procesos/` y su skill; si cambió un comando, un script o una ruta, buscar el nombre viejo con `grep -rn` en `docs/`, `.claude/skills/`, `AGENTS.md` y `README.md`.
4. **Correr** `bun run lint`, `bun run typecheck`, `bun test` y, si hay interfaz, `bun run verificar` y la skill `revisar-interfaz`. Anotar cada resultado.
5. **Escribir el cuerpo** siguiendo `.github/pull_request_template.md` en un archivo temporal: marcar solo lo que se revisó de verdad, tachar con el motivo lo que no aplica, y dejar en «Riesgos y pendientes» lo que falló o quedó afuera.
6. `gh pr create --base dev --title "<tipo>(<ámbito>): …" --body-file <archivo>`. Con squash, el título del PR es el commit que queda en `dev`.
