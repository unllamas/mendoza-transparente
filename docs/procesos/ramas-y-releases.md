# Ramas y releases

Hasta octubre de 2026 todo iba directo a `main`, que publica el sitio en cada push. Con una sola persona funcionaba; con más gente, no: nadie revisa nada antes de que llegue a producción. Desde ahora lo nuevo entra por `dev`, se prueba ahí y llega a `main` en una **publicación** (un PR `dev → main`). Una vez por día, un **release de GitHub** junta todo lo que llegó a producción ese día: ver [Releases de GitHub](#releases-de-github-uno-por-día).

## Las ramas

| Rama | Qué es | Quién escribe |
|---|---|---|
| `main` | Producción. Cada push publica mendoza-transparente.com (Cloudflare Pages). | Solo publicaciones desde `dev` y hotfixes |
| `dev` | Integración. Lo que va a salir en el próximo release. Cloudflare la publica como vista previa en `dev.mendoza-transparente.pages.dev`. | PRs de las ramas de trabajo |
| `<tipo>/<tema>` | Una rama por tarea, que sale de `dev`: `feat/pedidos-por-municipio`, `fix/menu-movil`, `datos/fuente-nueva`. Las actualizaciones de datos van en `datos/automatica` (el bot) o `datos/actualizacion-<fecha>` (`bun run actualizar`). | Quien hace la tarea |
| `hotfix/<tema>` | Un arreglo urgente de producción, que sale de `main`. | Quien arregla |

Los nombres de rama van en inglés o en español sin tildes, cortos y en `kebab-case`.

## Trabajo de todos los días

```bash
git switch dev && git pull
git switch -c feat/mi-cambio
# … commits …
git push -u origin feat/mi-cambio
gh pr create --base dev --title "feat(web): …"   # abre el editor con la plantilla
```

1. **Los agentes abren el PR solos, pero no lo mergean salvo pedido explícito:** toda tarea termina con commit, push y PR a `dev`, sin esperar un pedido aparte; lo siguiente que se pida en la misma conversación va a la misma rama y al mismo PR. El PR queda abierto hasta que una persona lo revisa y lo mergea, o le dice al agente explícitamente que lo mergee (ver [Quién aprueba](#quién-aprueba)).
2. **El PR usa la plantilla** (`.github/pull_request_template.md`); ver [abajo](#la-plantilla-de-pr).
3. **Cada PR a `dev` pasa la CI** (`.github/workflows/ci.yml`: Biome, arquitectura, tipos, pruebas, build y verificación visual). Quién más lo revisa depende de quién lo manda: ver [Quién aprueba](#quién-aprueba).
4. **Se mergea con squash** (una persona, o el agente si se lo pidieron explícitamente): un commit por tarea en `dev`, con el mensaje en español que explica qué cambia y por qué.
5. **Cloudflare publica la vista previa** solo de `dev` (`dev.mendoza-transparente.pages.dev`): se prueba ahí, no en producción. Las ramas de trabajo se prueban en local y con la CI del PR.
6. **Antes de cada push, la rama se pone al día con `dev`**: `git fetch origin && git rebase origin/dev`. Si lo que entró trae cambios en `docs/procesos/`, `.claude/skills/` o `AGENTS.md` (`git diff --stat HEAD@{1} HEAD -- docs/procesos .claude/skills AGENTS.md` después del rebase), se leen antes de pushear: puede haber un proceso nuevo que el cambio tenga que cumplir.

## Hasta dónde llevar cada pedido

Lo que se pide en una conversación define hasta dónde llega el trabajo del agente. **Sin un pedido explícito de merge, el agente llega hasta el PR abierto con la CI en verde y avisa con el link.**

| Lo que dice el usuario | Hasta dónde llega el agente |
|---|---|
| (nada sobre mergear) | Rama desde `dev` → PR a `dev` con la plantilla → CI verde → avisa con el link. No mergea: lo revisa y lo mergea una persona |
| Pide explícitamente mergear ese PR («mergealo», «mergeá el #37») | Lo anterior y el merge a `dev` con squash |
| Pide explícitamente publicarlo en producción («publicalo en main», «mergealo y llevalo a prod») | Lo anterior, el PR de publicación `dev → main` ([Publicar](#publicar-de-dev-a-main)) con la CI verde, el merge con merge commit, el seguimiento del despliegue de Cloudflare y la confirmación en `mendoza-transparente.com` |

**El permiso vale para lo que se nombró, en esa conversación.** Mergear un PR no autoriza a mergear el siguiente, ni a publicar en `main`. Que la tarea esté terminada, que la CI esté en verde o que el trabajo sea una prueba no cuentan como permiso. Ante la duda, no se mergea y se pregunta.
| «Sin release», «no generes release» | `main` | Igual que el anterior. No hay nada que evitar: el release de GitHub lo crea solo el workflow una vez por día, y nadie lo crea a mano |
| «Una vez pasen los CI, llevalo a prod» | `main` | Igual, sin volver a preguntar: el pedido ya autoriza la publicación |
| «Datos en prod» | `main` | Los datos entran por un PR a `dev` ([Datos](#datos)) y llegan a `main` con la publicación, igual que el código |

**El turno no termina esperando.** Si falta que termine una CI o un despliegue, el agente lo sigue hasta el final (`gh pr checks <n> --watch` o `gh run watch` en segundo plano, que avisan al terminar; en T3 Code, `watch_pull_request`) y después hace el paso siguiente. Cerrar con «espero a que termine la CI» deja la tarea a medias y obliga a la persona a preguntar «¿y?». Si de verdad no se puede seguir (falta un permiso, una decisión o un secreto), el último mensaje dice qué falta y quién lo tiene que hacer.

**Al terminar se dice dónde quedó:** el link del PR, si está en `dev` o en `main` y, si se publicó, la URL donde se ve.

## Mensajes de commit y títulos de PR

Desde octubre de 2026 seguimos [Conventional Commits 1.0.0](https://www.conventionalcommits.org/es/v1.0.0/). Antes cada commit empezaba con un área libre (`Municipios: …`, `Web: …`) y llegamos a tener unas cuarenta distintas; el historial viejo no se reescribe.

```
<tipo>(<ámbito>): <descripción en español>

<cuerpo opcional: qué cambia y por qué>

<pies opcionales: BREAKING CHANGE: …, Co-Authored-By: …>
```

- **Tipo y ámbito van en inglés** (son palabras fijas que leen las herramientas, como el código); **la descripción y el cuerpo, en español**. La descripción empieza en minúscula, salvo que arranque con un nombre propio, y no termina en punto.
- **El ámbito es opcional**: se omite cuando el cambio cruza todo el repo.

| Tipo | Cuándo |
|---|---|
| `feat` | Algo nuevo que se ve o se usa: una página, una sección, una fuente de datos, un comando |
| `fix` | Un arreglo de algo que andaba mal |
| `docs` | Solo documentación, procesos o skills |
| `refactor` | Cambia el código sin cambiar lo que hace |
| `perf` | Más rápido o más liviano |
| `test` | Solo pruebas |
| `build` | Dependencias, Vite, Turborepo, la configuración del monorepo |
| `ci` | Workflows de GitHub Actions y hooks de git |
| `style` | Formato del código, sin cambiar lo que hace (no es el diseño de la web: eso es `feat` o `fix`) |
| `chore` | Mantenimiento: las actualizaciones de datos, las publicaciones, el back merge |
| `revert` | Deshace un commit anterior |

| Ámbito | Qué cubre |
|---|---|
| `web`, `panel` | `apps/web`, `apps/panel` |
| `ui`, `core`, `scrapers`, `participation` | Cada paquete de `packages/` |
| `data` | `data/` (crudos, procesados y curado) |
| `docs` | `docs/`, `README.md`, `AGENTS.md` |
| `skills` | `.claude/skills/` |
| `scripts` | `scripts/` de la raíz |
| `ci` | `.github/` y `lefthook.yml` |
| `release` | Solo para el PR de release |

Un ámbito nuevo se suma a `commitlint.config.mjs` y a esta tabla en el mismo commit.

**Ejemplos:**

- `feat(web): botón «Compartir» con el texto armado y #MendozaTransparente`
- `feat(scrapers): Capital y Guaymallén en el anexo 19`
- `fix(web): el link para atrás va pegado al encabezado`
- `docs(skills): la regla de una sola línea en diseno`
- `chore(data): actualización automática (indices)`, el mensaje del bot de datos y de `bun run actualizar`
- `chore(release): 2026-10-17` y `chore: back merge main → dev`

**Lo que rompe un contrato** lleva `!` después del ámbito y un pie `BREAKING CHANGE:` que explica la migración. Pasa sobre todo al renombrar o sacar una columna de un CSV publicado, que solo se hace con un plan de migración (ver [Datos y archivo](datos-y-archivo.md)):

```
feat(data)!: monto_total pasa a llamarse monto_pesos en compras

BREAKING CHANGE: la columna monto_total de data/processed/compras deja de existir; usar monto_pesos.
```

**Quién lo controla:**

- **Al commitear**: el hook `commit-msg` de lefthook (`lefthook.yml`) corre commitlint con `commitlint.config.mjs`. Se instala con `bun run hooks`, igual que el de antes de commitear.
- **En cada PR**: el workflow «Título del PR» (`.github/workflows/titulo-del-pr.yml`) valida el título con la misma configuración. Si falla, se edita el título del PR y el control vuelve a correr solo.
- Los merges (`Merge pull request …`) los saltea commitlint.

## La plantilla de PR

`.github/pull_request_template.md` la carga GitHub al abrir un PR desde la web, y `gh pr create` sin `--fill` ni `--body`. Pide:

- **Qué cambia y por qué**, para alguien que no vio la conversación.
- **Revisión del propio cambio**: alcance del diff y rama al día con `dev`, documentación al día (procesos, skills, `AGENTS.md`, referencias viejas a comandos o rutas, y diagramas que se lean en GitHub), convenciones de idioma, secretos, costo de lo que suma consumo, reglas de `data/` y, si hay interfaz, la revisión con `revisar-interfaz`, el barrido del patrón en todas las páginas, la analítica y las capturas.
- **Cómo se verificó**: cada comando corrido con su resultado (`bun run lint`, `bun run typecheck`, `bun test`, `bun run verificar`…) y el link a la vista previa.
- **Riesgos y pendientes**.

Lo que no aplica se tacha diciendo por qué, en vez de borrarlo: así quien revisa ve que se pensó.

**Un agente** no abre el PR sin hacer esa revisión de verdad: mira el diff (`git diff origin/dev...HEAD`), corre los comandos y busca las referencias viejas antes de marcar cada punto. Si algo falla o falta, lo arregla antes de abrir el PR o lo deja escrito en «Riesgos y pendientes». Escribe el cuerpo en un archivo temporal siguiendo la plantilla y abre el PR con `gh pr create --base dev --title "<tipo>(<ámbito>): …" --body-file <archivo>`.

## Quién aprueba

La plantilla y la CI son el piso. Encima, **un merge lo decide siempre una persona del equipo**:

| Quién manda el PR | Qué hace falta para mergear |
|---|---|
| Un agente (aunque trabaje a pedido de alguien del equipo) | Plantilla completa, CI en verde y la decisión de una persona: lo mergea ella, o le pide explícitamente al agente que lo mergee. **Sin ese pedido, el agente no mergea**: ni a `dev`, ni a `main`, ni un hotfix, ni un revert |
| Alguien del equipo | Plantilla completa y CI en verde. Lo mergea quien lo abrió |
| Alguien de afuera del equipo (un fork o una persona nueva) | Además, la revisión y aprobación de alguien del equipo, que también lee el diff contra la plantilla |

La publicación (`dev → main`) sigue la misma regla: el agente deja el PR de publicación listo y avisa, y solo lo mergea si el usuario se lo pide explícitamente.

Por qué: un agente puede equivocarse de alcance (mergear una prueba exploratoria como si fuera un cambio final) y no tiene forma de saber qué está esperando cada persona. El merge es el punto donde alguien del equipo decide que el cambio llega a la rama compartida.

## Publicar: de `dev` a `main`

Cuando lo que está en `dev` está probado en su vista previa:

```bash
git fetch origin
gh pr create --base main --head dev --title "chore(release): $(date +%F)" --body "$(bun scripts/release-notes.ts --from origin/main --to origin/dev)"
```

El cuerpo lo arma `scripts/release-notes.ts`: los commits de `dev` que todavía no están en `main`, agrupados por tipo (ver [Releases de GitHub](#releases-de-github-uno-por-día)).

1. **Revisar el PR**: la lista es el registro de lo que sale. La CI tiene que estar verde. Si `dev` trae PRs de alguien de afuera del equipo, tienen que haber pasado su revisión (ver [Quién aprueba](#quién-aprueba)).
2. **Probar `dev.mendoza-transparente.pages.dev`** en celular y escritorio, en las pantallas que cambiaron.
3. **Mergear con «Create a merge commit»**, nunca con squash ni rebase: así `main` y `dev` comparten la historia y la próxima publicación no repite commits ni trae conflictos falsos.
4. **Seguir el despliegue** en Cloudflare (skill `produccion`) y probar el sitio real.

No hay calendario fijo: se publica cuando hay algo listo. Mejor seguido y chico que de a meses; puede haber varias publicaciones en un día, y el release de GitHub las junta.

## Releases de GitHub: uno por día

Una publicación no es un release. El release de GitHub ([unllamas/mendoza-transparente/releases](https://github.com/unllamas/mendoza-transparente/releases)) es el registro de lo que llegó a producción **en un día**: todas las publicaciones desde `dev`, los hotfixes y las cargas de datos, juntos y explicados en español. Sirve para que alguien de afuera (un periodista, quien reutiliza los CSV) siga los cambios sin leer commits.

**Cómo se arma.** El workflow **«Release del día»** (`.github/workflows/release.yml`) corre todos los días a las 23:30 de Mendoza y lee `origin/main`. **Hay un solo release por día**: si corre dos veces el mismo día, la segunda actualiza el release en vez de crear otro.

1. El día del release es la fecha, en hora de Mendoza, del último commit que llegó a `main`, no la hora en que corre el workflow. GitHub a veces demora el cron varias horas, y una corrida de las 23:30 que arranca pasada la medianoche igual cae en el día que corresponde.
2. Busca el último release de un día anterior (la etiqueta más reciente con forma de fecha). Si no hay ninguno, arranca desde el primer commit de ese día.
3. Si `main` no cambió desde entonces, no hace nada: los días sin cambios no tienen release.
4. Si cambió, corre `bun scripts/release-notes.ts --release --to origin/main`. Si el día todavía no tiene release, lo crea con la fecha como etiqueta (`2026-10-17`) y la fecha larga como título («17 de octubre de 2026»). Si ya lo tiene, mueve la etiqueta al último commit de `main` y rehace las notas con todo el día.

El script sale de la misma rama que el workflow (`dev`, que es la rama por defecto y la que usa el cron), no de `main`: así un cambio al workflow y al script vale apenas entra a `dev`, sin esperar a la próxima publicación.

**Lo que se agrega a mano** a un release va debajo de una línea `<!-- a mano -->`. Cuando el workflow rehace las notas, conserva todo lo que está de esa línea para abajo; lo que esté arriba se pisa.

Las etiquetas viejas con número (`2026-10-18.2`) son de antes de esta regla: se aceptan como release anterior, pero no se crean más.

**Qué dice cada release:**

- Las publicaciones del día (los PRs `dev → main`, con su número).
- Los cambios agrupados: **Cambios que rompen un contrato** (los que llevan `!` o `BREAKING CHANGE:`), **Nuevo** (`feat`), **Datos y fuentes** (ámbito `data` o `scrapers`), **Arreglos** (`fix`), **Documentación** (`docs`, o ámbito `docs` o `skills`), **Mantenimiento** (el resto) y **Otros cambios** (commits viejos, de antes de Conventional Commits).
- Las actualizaciones automáticas de datos resumidas en una línea («3 actualizaciones automáticas: `indices` (2), `dnap`»), y la lista de los datos publicados que cambiaron (`data/processed/<id>` y `data/curado/<archivo>`).
- El link para comparar contra el release anterior.

Se saltean los merges, los back merges y los `chore(release)`. Cada línea es el título del PR que quedó como commit con squash: por eso importa que el título [se entienda solo](#mensajes-de-commit-y-títulos-de-pr).

**A mano.** Desde Actions → «Release del día» → *Run workflow*. El campo `desde` arranca el release desde otra ref (una etiqueta o un commit), por ejemplo para el primero o para rehacer uno. Para ver las notas sin crear nada: `bun scripts/release-notes.ts --release --to origin/main`.

**Si un release salió mal**, se vuelve a correr el workflow, que lo rehace. Para un agregado que tiene que quedar, se escribe debajo de `<!-- a mano -->` en la web de GitHub. Nunca se crea un segundo release ni un borrador para el mismo día.

**Las pruebas** del script están en `scripts/release-notes.test.ts` (`bun test scripts`).

## Hotfix: un arreglo urgente

Solo para algo roto en producción que no puede esperar al próximo release (una página caída, un dato mal publicado, un problema de seguridad).

```bash
git switch main && git pull
git switch -c hotfix/mi-arreglo
# … el arreglo mínimo …
git push -u origin hotfix/mi-arreglo
gh pr create --base main
```

1. El PR va a `main`, con la plantilla completa y la CI verde. Se mergea con squash: una persona, o el agente si se lo pidieron explícitamente.
2. **Back merge a `dev`**: lo hace solo el workflow `.github/workflows/back-merge.yml` en cada push a `main` (ver abajo). Hay que **confirmar que corrió**: si `dev` no recibe el arreglo, el próximo release lo pisa y el error vuelve a producción.

## Back merge automático

`main` recibe commits que no pasan por `dev`: los hotfixes. Para que `dev` no quede atrás, el workflow **«Back merge a dev»** corre en cada push a `main`:

- Si `dev` ya tiene todo, no hace nada.
- Si puede, mergea `main` en `dev` y pushea (después de una publicación es un fast-forward). El commit lleva `[CF-Pages-Skip]`, así Cloudflare no gasta un build en la vista previa de `dev` (ver [Web: ahorrar recursos](web.md#publicar)). Si es un fast-forward no hay commit nuevo: la vista previa se arma igual.
- Si hay un conflicto, o la deploy key falla, abre un PR `main → dev` con la etiqueta `back-merge`. Se resuelve a mano y **se mergea con merge commit**, nunca con squash.

Si alguna vez hace falta a mano:

```bash
git switch dev && git pull
git merge origin/main
git push
```

## Datos

Los datos **nunca van directo a `main`**. Entran a `dev` por un PR, como el código, y llegan a producción con la próxima publicación. Una actualización puede borrar filas o archivos (una fuente que responde a medias, un archivo que el organismo reemplazó) y eso dejaría el sitio incongruente: el PR deja verlo antes. Hasta el 22/10/2026 se publicaban directo en `main`.

- `.github/workflows/actualizar-datos.yml` commitea en `datos/automatica` y abre un PR a `dev` (o suma el commit al que ya está abierto).
- `bun run actualizar` commitea en una rama `datos/…` que sale de `dev` y abre un PR a `dev`. En `main` no corre.
- El cuerpo del PR dice qué filas o archivos se borran. Cómo revisarlo: [Actualización de datos](actualizacion-de-datos.md#revisar-el-pr-de-datos).
- Un **scraper nuevo o cambiado** es código: va por una rama de trabajo y `dev` como cualquier cambio.

## Configuración en GitHub

Configurado por API el 17/10/2026 en `unllamas/mendoza-transparente`:

| Qué | Estado |
|---|---|
| Rama por defecto | `dev`: los PRs apuntan ahí sin pensarlo, y los workflows programados corren desde ahí |
| Merges permitidos | Squash y merge commit; rebase deshabilitado |
| Título del commit con squash | El título del PR (`squash_merge_commit_title: PR_TITLE`), para que el commit que queda en `dev` siga [Conventional Commits](#mensajes-de-commit-y-títulos-de-pr) aunque el PR tenga un solo commit |
| Ruleset «main: producción» | Prohíbe borrar la rama y el force push; pide PR y los checks obligatorios en verde |
| Ruleset «dev: integración» | Lo mismo |
| Checks obligatorios | `verificar` (CI) y `titulo` (Título del PR), en las dos reglas |
| Aprobaciones | Las reglas piden 0. Que los agentes no mergeen sin un pedido explícito es una regla de este documento ([Quién aprueba](#quién-aprueba)) |
| Excepciones (*bypass*) | Quien administra el repo y las deploy keys, en las dos reglas |
| Deploy key «Bot de GitHub Actions (datos y back merge)» | Clave SSH con escritura, guardada en el secreto **`DEPLOY_KEY`** |
| Etiqueta `datos-con-borrados` | La pone el bot en el PR de datos cuando se borran filas o archivos; la crea sola si no existe |

**Por qué una deploy key.** En un repo personal, GitHub no deja que GitHub Actions saltee las reglas (eso solo se puede en organizaciones), así que con el token del workflow el bot no podría hacer el back merge en `dev`. Una deploy key sí puede ser excepción, se crea por API y no vence. Además, a diferencia del token del workflow, sus push disparan otros workflows: por eso el back merge corre solo después de cada hotfix y la CI corre sola en los commits que se suman al PR de datos. Los dos workflows la usan en `actions/checkout` con `ssh-key: ${{ secrets.DEPLOY_KEY }}`.

**Rotar la clave** (si se filtra, o para cambiarla):

```bash
D=$(mktemp -d) && ssh-keygen -q -t ed25519 -N "" -C mendoza-transparente-bot -f $D/key
gh api -X POST repos/unllamas/mendoza-transparente/keys -f title="Bot de GitHub Actions (datos y back merge)" -f key="$(cat $D/key.pub)" -F read_only=false
gh secret set DEPLOY_KEY -R unllamas/mendoza-transparente < $D/key && rm -rf $D
gh api repos/unllamas/mendoza-transparente/keys            # borrar la vieja con -X DELETE …/keys/<id>
```

Para ver o cambiar las reglas: Settings → Rules → Rulesets, o `gh api repos/unllamas/mendoza-transparente/rulesets`.

**Opcional: que GitHub frene el merge de un agente.** Hoy los agentes usan la cuenta de quien administra el repo, que está en la lista de excepciones de las dos reglas: nada técnico les impide mergear, y la regla depende de que el agente la lea. Si se quiere un freno técnico, los agentes trabajan con una identidad propia:

1. Una cuenta de GitHub para los agentes (o un *fine-grained token* de otra cuenta), con acceso de escritura al repo y sin rol de administración.
2. En las dos reglas: pedir 1 aprobación, descartar las aprobaciones viejas cuando llega un commit nuevo, y dejar como excepción solo las deploy keys (no a quien administra).
3. Configurar `gh` de los agentes con ese token. El pedido explícito pasa a ser la aprobación en GitHub: la persona aprueba el PR y el agente (o ella) lo mergea.

## Agentes

- Un agente **nunca pushea a `main`**. Trabaja en una rama que sale de `dev` y abre el PR a `dev`, salvo que le pidan un hotfix.
- **No mergea un PR salvo que el usuario se lo pida explícitamente** para ese PR, en esa conversación: ni los suyos a `dev`, ni la publicación a `main`, ni un hotfix, ni un revert. La CI en verde o la tarea terminada no son permiso. Sin el pedido, deja el PR abierto y avisa con el link (ver [Quién aprueba](#quién-aprueba)). Nunca usa `--admin` ni el auto-merge de GitHub.
- Para comparar los cambios de una rama, la base es `origin/dev` (en un hotfix, `origin/main`).
- Lleva cada pedido hasta donde se pidió ([Hasta dónde llevar cada pedido](#hasta-dónde-llevar-cada-pedido)), por defecto un PR abierto con la CI en verde, sin cortar el turno mientras espera una CI.
