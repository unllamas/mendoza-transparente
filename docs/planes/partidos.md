# Plan: partidos políticos

Objetivo: que cada persona electa muestre a qué partido, frente o bloque pertenece, **según lo dice la fuente oficial**, y que cada uno tenga su página en `/partidos/<slug>`. Esa página junta a sus legisladores, intendentes y bancas ganadas por elección, y responde búsquedas como «UCR Mendoza» o «diputados de La Libertad Avanza Mendoza».

Fecha: 22/10/2026. Estado: etapas 1 a 3 hechas (normalización, páginas e insignia); logos y colores de los cinco partidos con más gente en funciones cargados el 25/10/2026; faltan los logos del resto (etapa 4) y medir (etapa 5). Los criterios que quedaron funcionando están en `docs/procesos/metodologia.md`, «Partidos, frentes y bloques», y la insignia en `docs/procesos/diseno.md`.

## Por qué

- **El partido hoy es texto suelto.** Está en la ficha («Partido o frente», «Bloque») y en las listas, pero no lleva a ningún lado. No hay forma de ver todos los legisladores de un bloque ni lo que ganó un frente en cada elección, aunque los datos ya están (`legislatura/legisladores.csv`, `autoridades/autoridades.csv`, `junta-electoral/electos.csv`).
- **Hay búsquedas con poca competencia y con datos.** «Cuántos diputados tiene X en Mendoza», «intendentes de Cambia Mendoza» o «bloque peronista Legislatura Mendoza» hoy las responden notas de diarios con fecha. Nosotros las podemos responder con la lista actual y la fuente.
- **Un mismo partido aparece escrito de muchas formas** («Cambia Mendoza», «Frente Cambia Mendoza», «Alianza Cambia Mendoza»). Sin unir esas formas, cada página quedaría partida en varias más flojas.

## Reglas (no se negocian)

1. **Nunca se infiere el partido.** Un cargo designado (ministro, director, Fiscal de Estado) no tiene partido en ninguna fuente oficial y no se le asigna el del gobierno que lo nombró. Tampoco se cruza con padrones de afiliados (Ley 25.326). Ya está escrito en `docs/procesos/metodologia.md`, «Quién ocupó cada cargo».
2. **Se unen formas de escribir el mismo nombre, nunca partidos distintos.** La Libertad Avanza, Mendocinos por la Libertad y PRO quedan separados. Partido Justicialista, Fuerza Patria y Unión por la Patria, también. Un frente no absorbe a los partidos que lo forman: Cambia Mendoza es una entidad propia, no «la UCR».
3. **Lo que no coincide con ningún alias queda como entidad propia**, con el nombre tal como lo dice la fuente. Nunca se agrupa en «otros».
4. **Se muestra lo que dice cada fuente, con su rótulo.** A los legisladores se les muestra el bloque («Bloque»). A los intendentes y los electos en las actas, el partido o frente («Partido o frente»). Son tres cosas distintas (frente electoral, partido y bloque legislativo) y el tipo de cada entidad lo dice.
5. **El partido de una elección es el de esa elección.** En el historial, cada cargo ganado lleva el partido del acta de ese año, no el actual.

## Normalización en dos capas

**Capa 1, automática:** minúsculas, sin tildes, sin signos y sin espacios repetidos. Une «Frente de Todos» con «Frente De Todos» y «Partido Demócrata» con «Partido Democrata». Ya existe en `apps/web/scripts/temas/history.ts` (`spellings`); se pasa a una función compartida para que la usen también funcionarios, municipios y el buscador.

**Capa 2, alias curados:** `data/curado/partidos.yaml`. Cada entidad lleva su lista de alias, y cada alias, el motivo por el que se une. Si no hay motivo escrito, no se une.

```yaml
- slug: cambia-mendoza
  nombre: Cambia Mendoza
  tipo: frente            # partido | frente | bloque
  sigla: null
  alias:
    - nombre: Frente Cambia Mendoza
      motivo: mismo nombre con el prefijo legal «Frente»
    - nombre: Alianza Cambia Mendoza
      motivo: mismo nombre con el prefijo legal «Alianza»
  logo: null              # archivo en apps/web/public/partidos/<slug>.svg
  logo_fuente: null       # URL oficial de donde salió
  wikidata: null
```

Propuesta inicial con los datos de hoy:

| Entidad | Alias que se unen | Motivo |
|---|---|---|
| Cambia Mendoza | Frente Cambia Mendoza, Alianza Cambia Mendoza | Prefijo legal |
| UCR | Unión Cívica Radical, UCR - Unión Cívica Radical, Partido Union Civica Radical | Sigla y prefijo legal |
| Partido Justicialista | Justicialista | Prefijo legal |
| La Unión Mendocina | Unión Mendocina | Artículo |
| PRO | PRO Propuesta Republicana | Sigla y nombre completo |
| Frente de Izquierda y de los Trabajadores | Alianza Frente de Izquierda y de los Trabajadores | Prefijo legal |
| Encuentro por San Carlos | Frente Encuentro por San Carlos, Alianza Encuentro por San Carlos | Prefijo legal |
| Nuevos Rumbos | Partido Nuevos Rumbos | Prefijo legal |
| Frente Libertario, Demócrata y Jubilados | Frente Libertario, Demócratas y Jubilados | Errata |
| Elegí Mendoza | Alianza Elegí Mendoza Frente Político y Social | Prefijo legal y subtítulo |

Separados aunque se parezcan: cada «Elegí» local (Elegí Gestión Lavalle, Elegí Santa Rosa, Frente Elegí Maipú Crece…), porque cada uno es un frente municipal distinto. También «Unión PRO» (fue un frente, no el partido) y «Cambia Mendoza - Nuevos Rumbos» (una lista que combina dos nombres).

Esto cambia una regla escrita: hoy `history.ts` y la metodología dicen que «Cambia Mendoza» y «Frente Cambia Mendoza» quedan separados «porque sería inferir». Con un alias que deja escrito el motivo deja de ser inferir: se actualiza la metodología en el mismo PR de la etapa 1.

## La insignia en la cara de cada persona

Un círculo chico abajo a la derecha de `PersonAvatar`, con una prop opcional `party`:

| Caso | Qué se ve |
|---|---|
| Electo con partido y logo | El logo |
| Electo con partido, sin logo | La sigla (o las iniciales del nombre) en gris neutro, con la misma forma |
| Electo cuyo acta no dice el partido (hoy, solo el vicegobernador 2015) | Círculo vacío con borde punteado gris. En la ficha: «No lo informa la fuente oficial» |
| Cargo designado | Nada: no es que falte el dato, es que el cargo no tiene partido |

- **Solo desde 40 px.** Abajo de eso el logo no se distingue: el buscador (36 px) lo dice en el texto y los firmantes de las leyes (28 px) no lo llevan.
- **La insignia no es un link.** Las filas ya son links (no se anida uno dentro de otro) y un círculo de 16 px no llega a los 44 px para tocar. El link al partido va en el campo «Partido o frente» o «Bloque» de la ficha, con el logo al lado. Es además el mejor link para el buscador, porque su texto es el nombre del partido.
- **Accesibilidad:** la insignia es `aria-hidden` cuando el nombre del partido está escrito en la fila; si no lo está, lleva `alt` con el nombre.

Dónde va:

| Lugar | Archivo | Insignia |
|---|---|---|
| Ficha del funcionario | `apps/web/src/pages/funcionarios.tsx` (64 px) | Sí, y el campo de partido o bloque pasa a ser link |
| Lista de funcionarios | `funcionarios.tsx` (40 px) | Sí |
| Intendente del municipio y ranking | `municipios.tsx` (56 y 40 px) | Sí |
| Legisladores de la sección | `municipios.tsx` (40 px) | Sí (bloque) |
| Historial, ficha y lista | `history.tsx` (56 y 40 px) | Sí, con el partido de la última elección ganada |
| Buscador | `search-dialog.tsx` (36 px) | No; el partido va en la línea de abajo |
| Firmantes de las leyes | `leyes.tsx` (28 px) | No |
| Organismos y designaciones | `gobierno.tsx` | No: son cargos designados |

## Las páginas

- **`/partidos`:** todas las entidades con bancas o cargos actuales, ordenadas por cantidad, y abajo las que solo aparecen en elecciones pasadas.
- **`/partidos/<slug>`:**
  - h1 «<Nombre> en Mendoza» y una línea con el dato («21 diputados y senadores provinciales, 9 intendentes»);
  - en ejercicio: legisladores provinciales, intendentes y legisladores nacionales, con su cara;
  - bancas y cargos ganados por elección desde 2015 (`electos.csv`, solo titulares);
  - ex funcionarios elegidos por esa entidad (de `/funcionarios/historial`);
  - las formas en que lo escriben las fuentes («También figura como Frente Cambia Mendoza o Alianza Cambia Mendoza»), con el motivo de cada unión a un toque;
  - fuentes y fecha de corte.
- **Enlaces en los dos sentidos:** ficha → partido y partido → ficha; también desde la «Composición por bloque» de `/funcionarios` y desde los totales por partido de cada elección en `/funcionarios/historial`.

## SEO y GEO

- **Registro en `apps/web/scripts/paginas.ts`:**
  - `title` con el nombre que se busca, «Mendoza» y el dato, en hasta 60 caracteres: «UCR en Mendoza: diputados, senadores e intendentes».
  - `description` con las cifras reales.
  - `og` con la cantidad de bancas.
- **JSON-LD:**
  - página del partido: `PoliticalParty` con `@id` (su URL), `name`, `alternateName` (sigla y alias), `logo`, `sameAs` (Wikidata o Wikipedia, si existe), `BreadcrumbList` y `FAQPage` («¿Cuántos diputados tiene X en Mendoza?», «¿Qué intendentes son de X?»);
  - ficha de la persona: hoy declara `affiliation` como un `Organization` con solo el nombre (`paginas.ts`, `filiacion`); pasa a apuntar al `@id` del `PoliticalParty`. Así los buscadores unen las dos páginas como una sola entidad.
- **Los alias en el texto de la página**, no en páginas aparte: cada forma de buscarlo cae en la misma URL.
- **Buscador:** tipo nuevo «Partido» en `writeSearchIndex` (`scripts/temas/guide.ts`), con la cantidad de bancas en `s`.
- **`llms.txt`, sitemap y `PAGES`/`NAV`** como cualquier sección nueva (skill `seo-y-geo`).
- **Logos** en SVG o WebP liviano, con nombre propio (`/partidos/ucr.svg`) y `alt` «Logo de UCR» en la página del partido.

## Los logos

Solo de fuentes oficiales, con la URL guardada en `logo_fuente`:

1. **Boletas oficializadas por la Junta Electoral de Mendoza**, que traen el logo de cada lista. Es la fuente preferida porque la publica el Estado.
2. **El sitio oficial del partido**, si no está en las boletas.

Se bajan con `fetchAndArchive()` (el original queda en `data/raw/partidos/`) y se recortan a mano una sola vez. Lo que no tenga logo usa la sigla: un logo faltante es un pendiente, como las fotos.

## Etapas

Cada etapa es un PR a `dev`.

1. **Normalización.**
   - `data/curado/partidos.yaml` con la tabla de arriba;
   - la función compartida que aplica las dos capas (en `apps/web/scripts/`, o en `@mt/core` si la necesita un scraper);
   - `history.ts` pasa a usarla;
   - un test con los casos que tienen que quedar separados (LLA y PRO, PJ y Fuerza Patria, los «Elegí» locales);
   - la regla nueva en `docs/procesos/metodologia.md`.
2. **Páginas `/partidos` y `/partidos/<slug>`**, sin logos: datos (`scripts/temas/partidos.ts`), páginas, SEO, buscador y enlaces de ida y vuelta. Antes, vista previa en 375 y 1280 px (skill `vista-previa`). Esta etapa ya se puede publicar sola.
3. **Insignia en `PersonAvatar`** (`@mt/ui`) en los lugares de la tabla, con la sigla mientras no haya logos. Se prueba con `estresar-interfaz`: siglas largas, sin dato, 320 px.
4. **Logos:** relevamiento de las boletas de la Junta Electoral y carga en `partidos.yaml`.
5. **Medir** a las dos semanas de publicado: impresiones y clics de las consultas con nombres de partido en Search Console, y visitas a `/partidos/*` y clics en el campo de partido de la ficha en PostHog (eventos nuevos en el catálogo, skill `analitica`).

## Costo

Cero. Son páginas estáticas del build, sin funciones ni servicios nuevos. Suma unas 40 páginas al sitemap y unos KB de logos.

## Qué se hizo y qué falta

- **Hecho (22/10/2026):**
  - `data/curado/partidos.yaml` y `scripts/temas/parties.ts`, con sus tests. 40 entidades con los datos de hoy, 25 con alguien en funciones.
  - `/partidos` y `/partidos/<slug>`, con `PoliticalParty` en JSON-LD, preguntas frecuentes, imagen para compartir, sitemap, `llms.txt` y el tipo «Partido» en el buscador. La ficha de cada persona apunta al `@id` de su partido.
  - Insignia en `PersonAvatar` (con `PartyAvatar` de `@mt/ui`) en funcionarios, municipios e historial. Link al partido desde la ficha, la composición por bloque, las elecciones ganadas y el reparto de cada elección.
- **Hecho (25/10/2026): logos y colores.** Logos de los sitios oficiales de Cambia Mendoza, UCR, PJ y PRO, y de la cuenta oficial de La Libertad Avanza (su sitio no tiene contenido), archivados en `data/raw/partidos/`. Color propio en `color` (también el FIT, que se reconoce mejor por la sigla). La insignia ya no es gris: logo, o sigla sobre el color del partido.
- **Falta: logos del resto (etapa 4).** Los frentes municipales («Elegí Maipú Crece», «Elegí San Rafael Avanza»…), La Unión Mendocina, Fuerza Patria y el Partido Demócrata siguen con las iniciales en gris; cada uno necesita su entrada en `partidos.yaml` con logo o color de fuente oficial. La Junta Electoral publica las boletas de cada elección (por ejemplo, https://jusmendoza.gob.ar/estas-son-las-boletas-que-se-usaran-en-las-elecciones-del-26-de-octubre/), pero son la Boleta Única Papel: una sola imagen con todas las listas. Hay que recortar cada logo, revisarlo a mano y cargarlo en `partidos.yaml` con `logo` y `logo_fuente`. Mientras tanto, la insignia muestra la sigla.
- **Falta: medir (etapa 5)** cerca del 5/11/2026.

## Preguntas abiertas (resueltas)

Se decidieron así, con el motivo escrito en `partidos.yaml` y en la metodología:

1. «UCR-Cambia Mendoza» va con la UCR; la ficha muestra el nombre del bloque tal cual.
2. «Frente para la Victoria 2» y «Alianza Frente para la Victoria 2» son una; «Alianza Frente para la Victoria» (noviembre de 2015) queda aparte.
3. «Frente Elegí» queda aparte de «Elegí Mendoza»: en 2019 figuran las dos en la misma elección.
4. Logos: de las boletas de la Junta Electoral; el sitio oficial del partido solo si no está en las boletas.
