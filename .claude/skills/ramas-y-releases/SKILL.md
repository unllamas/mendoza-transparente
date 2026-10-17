---
name: ramas-y-releases
description: Flujo de ramas de Mendoza Transparente. Lo nuevo entra por dev con un PR desde una rama de trabajo; dev llega a main (producción) en un release con merge commit; los hotfixes salen de main y vuelven a dev con el back merge automático; los datos se publican directo en main. Cargar antes de crear una rama, commitear, pushear, abrir o mergear un PR, hacer un release o un hotfix.
---

# Ramas y releases

Detalle completo: `docs/procesos/ramas-y-releases.md`.

## Reglas

- **`main` es producción**: cada push publica el sitio. Nunca se pushea directo a `main`.
- **Todo lo nuevo sale de `dev`**: `git switch dev && git pull && git switch -c <tipo>/<tema>` (`feat/`, `fix/`, `datos/`, `docs/`).
- **PR a `dev`** con `gh pr create --base dev --fill`, CI verde y **squash**.
- **Release**: PR `dev → main` titulado `Release <fecha>`, probado en `dev.mendoza-transparente.pages.dev`, mergeado con **merge commit** (nunca squash ni rebase). Lo decide una persona: un agente puede abrirlo, no mergearlo sin pedido.
- **Hotfix**: rama `hotfix/<tema>` desde `main`, PR a `main` con squash. Después, **confirmar el back merge a `dev`** (workflow «Back merge a dev»); si abrió un PR `main → dev` con la etiqueta `back-merge`, resolverlo con merge commit.
- **Datos**: se publican en `main` (workflow de actualización y `bun run actualizar`, que solo publica desde `main`). Un scraper nuevo o cambiado es código y va por `dev`.

## Checklist antes de pushear

1. ¿Estoy en una rama de trabajo, no en `main` ni en `dev`?
2. ¿La rama salió de `dev` (o de `main` si es un hotfix)?
3. ¿El PR apunta a la base correcta?
4. Para revisar el cambio, la base es `origin/dev` (`origin/main` en un hotfix).
