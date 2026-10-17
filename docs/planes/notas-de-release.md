# Notas de release

## Qué se quiere lograr

Que el PR de release (`dev → main`) traiga solo, en el cuerpo, la lista de lo que sale agrupada por tipo: lo nuevo, los arreglos, la documentación. Hoy el cuerpo es el `git log --oneline` crudo (ver [Ramas y releases](../procesos/ramas-y-releases.md#release-de-dev-a-main)).

## Por qué ahora se puede

Desde octubre de 2026 los commits que llegan a `dev` siguen [Conventional Commits](../procesos/ramas-y-releases.md#mensajes-de-commit-y-títulos-de-pr), con un tipo y un ámbito que una herramienta puede leer. Agrupar por tipo deja de ser trabajo a mano.

## Etapas

1. **Un script** (`scripts/`) que lee `git log origin/main..origin/dev`, agrupa por tipo y por ámbito y escribe el cuerpo en markdown, en español: «Nuevo», «Arreglos», «Datos y fuentes», «Documentación», «Mantenimiento». Se usa en el comando del release en lugar del `git log` crudo.
2. **Opcional:** un `CHANGELOG.md` o releases de GitHub con etiqueta por fecha (`2026-10-17`), si alguien de afuera necesita seguir los cambios.

## Qué falta decidir

- **Script propio o [git-cliff](https://git-cliff.org).** git-cliff hace esto con una plantilla, pero es un binario más. Un script de Bun de unas decenas de líneas alcanza para agrupar.
- **Versiones.** El sitio no publica versiones semver: no tiene sentido calcularlas con release-please. Si hacen falta etiquetas, por fecha.
- **Qué se muestra.** Si los `chore(data)` del back merge entran en las notas o se resumen en una línea («N actualizaciones de datos»).
