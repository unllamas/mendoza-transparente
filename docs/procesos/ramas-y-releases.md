# Ramas y releases

Hasta octubre de 2026 todo iba directo a `main`, que publica el sitio en cada push. Con una sola persona funcionaba; con más gente, no: nadie revisa nada antes de que llegue a producción. Desde ahora lo nuevo entra por `dev`, se prueba ahí y llega a `main` en un **release**.

## Las ramas

| Rama | Qué es | Quién escribe |
|---|---|---|
| `main` | Producción. Cada push publica mendoza-transparente.com (Cloudflare Pages). | Solo releases, hotfixes y los commits automáticos de datos |
| `dev` | Integración. Lo que va a salir en el próximo release. Cloudflare la publica como vista previa en `dev.mendoza-transparente.pages.dev`. | PRs de las ramas de trabajo |
| `<tipo>/<tema>` | Una rama por tarea, que sale de `dev`: `feat/pedidos-por-municipio`, `fix/menu-movil`, `datos/fuente-nueva`. | Quien hace la tarea |
| `hotfix/<tema>` | Un arreglo urgente de producción, que sale de `main`. | Quien arregla |

Los nombres de rama van en inglés o en español sin tildes, cortos y en `kebab-case`.

## Trabajo de todos los días

```bash
git switch dev && git pull
git switch -c feat/mi-cambio
# … commits …
git push -u origin feat/mi-cambio
gh pr create --base dev          # abre el editor con la plantilla
```

1. **El PR usa la plantilla** (`.github/pull_request_template.md`); ver [abajo](#la-plantilla-de-pr).
2. **Cada PR a `dev` pasa la CI** (`.github/workflows/ci.yml`: Biome, arquitectura, tipos, pruebas, build y verificación visual). Quién más lo revisa depende de quién lo manda: ver [Quién aprueba](#quién-aprueba).
3. **Se mergea con squash**: un commit por tarea en `dev`, con el mensaje en español que explica qué cambia y por qué.
4. **Cloudflare publica la vista previa** de cada rama y de `dev`: se prueba ahí, no en producción.
5. Si `dev` avanzó mientras tanto, se actualiza la rama con `git pull --rebase origin dev`.

## La plantilla de PR

`.github/pull_request_template.md` la carga GitHub al abrir un PR desde la web, y `gh pr create` sin `--fill` ni `--body`. Pide:

- **Qué cambia y por qué**, para alguien que no vio la conversación.
- **Tipo**: funcionalidad, arreglo, hotfix, datos, documentación o release.
- **Revisión del propio cambio**: alcance del diff, documentación al día (procesos, skills, `AGENTS.md` y referencias viejas a comandos o rutas), convenciones de idioma, secretos, reglas de `data/` y, si hay interfaz, la revisión con `revisar-interfaz`, la analítica y las capturas.
- **Cómo se verificó**: cada comando corrido con su resultado (`bun run lint`, `bun run typecheck`, `bun test`, `bun run verificar`…) y el link a la vista previa.
- **Riesgos y pendientes**.

Lo que no aplica se tacha diciendo por qué, en vez de borrarlo: así quien revisa ve que se pensó.

**Un agente** no abre el PR sin hacer esa revisión de verdad: mira el diff (`git diff origin/dev...HEAD`), corre los comandos y busca las referencias viejas antes de marcar cada punto. Si algo falla o falta, lo arregla antes de abrir el PR o lo deja escrito en «Riesgos y pendientes». Escribe el cuerpo en un archivo temporal siguiendo la plantilla y abre el PR con `gh pr create --base dev --title "…" --body-file <archivo>`.

## Quién aprueba

La plantilla y la CI son la validación de todos los días. Una aprobación de otra persona solo hace falta cuando el cambio viene de afuera:

| Quién manda el PR | Qué hace falta para mergear |
|---|---|
| Alguien del equipo, o un agente trabajando a su pedido | Plantilla completa y CI en verde. Lo mergea quien lo abrió, sin esperar a nadie |
| Alguien de afuera del equipo (un fork o una persona nueva) | Además, la revisión y aprobación de alguien del equipo, que también lee el diff contra la plantilla |

El release sigue la misma lógica: si la persona que pidió el trabajo dijo que se publique cuando funcione, el agente mergea el release apenas la CI y la vista previa están bien.

## Release: de `dev` a `main`

Cuando lo que está en `dev` está probado en su vista previa:

```bash
gh pr create --base main --head dev --title "Release $(date +%F)" --body "$(git log --oneline origin/main..origin/dev)"
```

1. **Revisar el PR**: la lista de commits es el registro de lo que sale. La CI tiene que estar verde. Si `dev` trae PRs de alguien de afuera del equipo, tienen que haber pasado su revisión (ver [Quién aprueba](#quién-aprueba)).
2. **Probar `dev.mendoza-transparente.pages.dev`** en celular y escritorio, en las pantallas que cambiaron.
3. **Mergear con «Create a merge commit»**, nunca con squash ni rebase: así `main` y `dev` comparten la historia y el próximo release no repite commits ni trae conflictos falsos.
4. **Seguir el despliegue** en Cloudflare (skill `produccion`) y probar el sitio real.

No hay calendario fijo: se hace un release cuando hay algo listo para publicar. Mejor seguido y chico que de a meses.

## Hotfix: un arreglo urgente

Solo para algo roto en producción que no puede esperar al próximo release (una página caída, un dato mal publicado, un problema de seguridad).

```bash
git switch main && git pull
git switch -c hotfix/mi-arreglo
# … el arreglo mínimo …
git push -u origin hotfix/mi-arreglo
gh pr create --base main
```

1. El PR va a `main`, con la plantilla completa y la CI verde. Se mergea con squash.
2. **Back merge a `dev`**: lo hace solo el workflow `.github/workflows/back-merge.yml` en cada push a `main` (ver abajo). Hay que **confirmar que corrió**: si `dev` no recibe el arreglo, el próximo release lo pisa y el error vuelve a producción.

## Back merge automático

`main` recibe commits que no pasan por `dev`: los hotfixes y las actualizaciones de datos (las automáticas de GitHub Actions y las manuales con `bun run actualizar`, que se publican directo en `main` para no esperar un release). Para que `dev` no quede atrás, el workflow **«Back merge a dev»** corre en cada push a `main`:

- Si `dev` ya tiene todo, no hace nada.
- Si puede, mergea `main` en `dev` y pushea (después de un release es un fast-forward).
- Si hay un conflicto, o la deploy key falla, abre un PR `main → dev` con la etiqueta `back-merge`. Se resuelve a mano y **se mergea con merge commit**, nunca con squash.

Si alguna vez hace falta a mano:

```bash
git switch dev && git pull
git merge origin/main
git push
```

## Datos

Los datos no esperan un release: se publican en `main` apenas se descargan y el back merge los lleva a `dev`.

- `.github/workflows/actualizar-datos.yml` fija `ref: main` en todos sus checkouts, así que publica en `main` aunque la rama por defecto sea `dev`.
- `bun run actualizar` solo publica desde `main`: en otra rama, frena antes del commit y deja los cambios en `data/`.
- Un **scraper nuevo o cambiado** es código: va por una rama de trabajo y `dev` como cualquier cambio.

## Configuración en GitHub

Configurado por API el 17/10/2026 en `unllamas/mendoza-transparente`:

| Qué | Estado |
|---|---|
| Rama por defecto | `dev`: los PRs apuntan ahí sin pensarlo, y los workflows programados corren desde ahí (por eso el de datos fija `ref: main`) |
| Merges permitidos | Squash y merge commit; rebase deshabilitado |
| Ruleset «main: producción» | Prohíbe borrar la rama y el force push; pide PR y la CI (`verificar`) en verde |
| Ruleset «dev: integración» | Lo mismo |
| Aprobaciones | Las reglas piden 0: la revisión de PRs de afuera del equipo es una regla de este documento ([Quién aprueba](#quién-aprueba)) |
| Excepciones (*bypass*) | Quien administra el repo y las deploy keys, en las dos reglas |
| Deploy key «Bot de GitHub Actions (datos y back merge)» | Clave SSH con escritura, guardada en el secreto **`DEPLOY_KEY`** |

**Por qué una deploy key.** En un repo personal, GitHub no deja que GitHub Actions saltee las reglas (eso solo se puede en organizaciones), así que con el token del workflow el bot no podría publicar datos en `main` ni hacer el back merge en `dev`. Una deploy key sí puede ser excepción, se crea por API y no vence. Además, a diferencia del token del workflow, sus push disparan otros workflows: por eso el back merge corre solo después de cada commit de datos. Los dos workflows la usan en `actions/checkout` con `ssh-key: ${{ secrets.DEPLOY_KEY }}`.

**Rotar la clave** (si se filtra, o para cambiarla):

```bash
D=$(mktemp -d) && ssh-keygen -q -t ed25519 -N "" -C mendoza-transparente-bot -f $D/key
gh api -X POST repos/unllamas/mendoza-transparente/keys -f title="Bot de GitHub Actions (datos y back merge)" -f key="$(cat $D/key.pub)" -F read_only=false
gh secret set DEPLOY_KEY -R unllamas/mendoza-transparente < $D/key && rm -rf $D
gh api repos/unllamas/mendoza-transparente/keys            # borrar la vieja con -X DELETE …/keys/<id>
```

Para ver o cambiar las reglas: Settings → Rules → Rulesets, o `gh api repos/unllamas/mendoza-transparente/rulesets`.

## Agentes

- Un agente **nunca pushea a `main`**. Trabaja en una rama que sale de `dev` y abre el PR a `dev`, salvo que le pidan un hotfix.
- Mergea sus propios PRs a `dev` cuando la plantilla está completa y la CI en verde, y el release cuando se lo pidieron (ver [Quién aprueba](#quién-aprueba)). Un PR de alguien de afuera del equipo no lo mergea: lo revisa y deja la aprobación a una persona del equipo.
- Para comparar los cambios de una rama, la base es `origin/dev` (en un hotfix, `origin/main`).
