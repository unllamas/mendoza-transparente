# Mendoza Transparente

**Mendoza, con los números sobre la mesa.**

En qué se gasta la plata de Mendoza, quién decide y qué falta publicar. Todos los datos oficiales de la provincia y sus 18 municipios en un solo lugar, explicados en simple y con la fuente de cada número.

[**mendoza-transparente.com**](https://mendoza-transparente.com) · [Cómo leer los datos](https://mendoza-transparente.com/como-leer) · [Fuentes](https://mendoza-transparente.com/fuentes) · [Lo que el Estado no publica](https://mendoza-transparente.com/no-publicado) · [Participar](https://mendoza-transparente.com/participar)

---

## Por qué existe

El Estado de Mendoza publica mucho: presupuesto, deuda, compras, Boletín Oficial, declaraciones juradas, coparticipación, planta de personal. El problema no es que no publique, es *cómo*: decenas de sitios, PDFs escaneados, planillas que cambian de formato cada año, series que se cortan y archivos que un día dejan de estar.

Mendoza Transparente hace el trabajo pesado una sola vez, para que nadie más tenga que hacerlo: descarga cada archivo, lo guarda tal cual, lo ordena y lo muestra de forma que se entienda. Si un vecino quiere saber cuánto debe la Provincia, a quién le compra o qué ley lo afecta, no debería necesitar un contador ni un abogado para averiguarlo.

Lo construimos de cara a las elecciones de 2027, para que la discusión pública arranque desde los mismos datos.

## Qué vas a encontrar

| Sección | La pregunta que contesta |
|---|---|
| [Deuda](https://mendoza-transparente.com/deuda) | ¿Cuánto debe la Provincia, a quién y en qué moneda? |
| [Coparticipación](https://mendoza-transparente.com/coparticipacion) | ¿Cuánta plata recibe cada municipio, mes a mes desde 1997? |
| [Compras](https://mendoza-transparente.com/compras) y [proveedores](https://mendoza-transparente.com/proveedores) | ¿Qué compra el Estado, a quién y cómo lo contrata? |
| [Empleo público](https://mendoza-transparente.com/empleo-publico) | ¿Cuánta gente trabaja en el Estado provincial y en cada municipio? |
| [Funcionarios](https://mendoza-transparente.com/funcionarios) y [gobierno](https://mendoza-transparente.com/gobierno) | ¿Quién ocupa cada cargo, cuándo lo designaron y qué patrimonio declaró? |
| [Leyes](https://mendoza-transparente.com/leyes) | ¿Qué cambia en la práctica con cada ley y a quién le toca? |
| [Municipios](https://mendoza-transparente.com/municipios) | ¿Qué publica, cuánto gasta y cuánta gente emplea cada departamento? |
| [Señales](https://mendoza-transparente.com/senales) | ¿Qué patrones en los datos merecen una explicación? |
| [Lo que no se publica](https://mendoza-transparente.com/no-publicado) | ¿Qué debería ser público y no está, y cómo pedirlo por la Ley 9070? |
| [Registro](https://mendoza-transparente.com/registro) | ¿Qué pedidos de información hizo la gente y qué respondió el Estado? |

## Cómo trabajamos

El activo principal del proyecto es la credibilidad. Por eso hay reglas que no se negocian:

- **Cada número tiene fuente.** Todo dato enlaza al archivo oficial del que sale, con la fecha en que se descargó.
- **Nada se pierde.** Los originales se archivan tal cual llegaron, con su huella sha256, y se copian en [archive.org](https://archive.org). Si el organismo después los borra o los cambia, la prueba sigue ahí.
- **La misma vara para todos.** Las mismas fórmulas y los mismos cortes para cada gestión y cada partido.
- **Señales, no acusaciones.** Un patrón raro es una pregunta que merece respuesta, no una conclusión. Cada señal dice cómo se calculó, lista los casos y trae su matiz al lado.
- **Nunca inferir.** Si la fuente oficial no lo dice, mostramos que no lo dice. Si dos fuentes no coinciden, mostramos las dos.
- **Datos institucionales, no personales.** Nombre, cargo y patrimonio declarado, sí. DNI, CUIL, domicilios y familiares, nunca: se quitan antes de archivar.
- **Abierto.** El código, los datos y la metodología son públicos. Cualquiera puede revisar cómo llegamos a cada cifra.

El detalle de los cálculos (pesos de hoy, por habitante, deuda en dólares, comparación por mandato) está en [Metodología y criterios](docs/procesos/metodologia.md).

## Cómo funciona por dentro

```mermaid
flowchart TD
    A[Sitio oficial] --> B[Recolector]
    B --> C[(Archivo original)]
    C --> D[(Copia en archive.org)]
    C --> E[Datos normalizados]
    F[Contenido curado] --> G
    E --> G[mendoza-transparente.com]
```

1. **Recolector.** Un script por fuente descarga cada archivo del sitio oficial.
2. **Archivo original.** Se guarda tal cual llegó en `data/raw/<fuente>/<fecha>/`, con su sha256 en un `manifest.jsonl`.
3. **Copia en archive.org.** El archivo se sube a archive.org y la Wayback Machine captura la URL oficial: si el organismo lo borra, la prueba queda afuera del repo.
4. **Datos normalizados.** CSV limpios y comparables en `data/processed/<fuente>/`.
5. **Contenido curado.** Lo escrito o revisado a mano en `data/curado/`: resúmenes de leyes, correcciones y lo que no se publica.
6. **La web.** Páginas prerenderizadas, cada cifra con su fuente.

Cada fuente tiene su propio recolector, que es idempotente (correrlo dos veces no duplica nada) y amable con los servidores del Estado (pedidos en secuencia, con pausas). El catálogo completo de fuentes está en [`sources.yaml`](sources.yaml) y el relevamiento, en [`docs/relevamiento-fuentes.md`](docs/relevamiento-fuentes.md). Las columnas de cada CSV se explican en el [diccionario de datos](docs/diccionario-de-datos.md).

## Estructura

Monorepo con Bun workspaces y Turborepo, en TypeScript estricto.

**Apps**

| Carpeta | Qué es |
|---|---|
| [`apps/web`](apps/web) | El sitio (mendoza-transparente.com) y su API pública de participación |
| [`apps/panel`](apps/panel) | Panel interno del equipo, detrás de Cloudflare Access |

**Paquetes**

| Carpeta | Qué es |
|---|---|
| [`packages/ui`](packages/ui) | `@mt/ui`: componentes y tokens de diseño |
| [`packages/core`](packages/core) | `@mt/core`: descarga, archivado, CSV y municipios |
| [`packages/scrapers`](packages/scrapers) | `@mt/scrapers`: un recolector por fuente, en `src/sources/<id>.ts` |
| [`packages/participation`](packages/participation) | `@mt/participation`: API de participación y del panel, y migraciones de D1 |

**Datos**

| Carpeta | Qué es |
|---|---|
| [`sources.yaml`](sources.yaml) | Catálogo de fuentes: id, organismo, URL, formato y estado |
| [`data/raw`](data/raw) | Archivos originales por fecha de descarga, con su `manifest.jsonl` |
| [`data/processed`](data/processed) | Datos normalizados en CSV, listos para analizar |
| [`data/curado`](data/curado) | Contenido escrito o revisado a mano |

**Documentación**

| Carpeta | Qué es |
|---|---|
| [`docs/procesos`](docs/procesos/README.md) | Cómo se trabaja: fuentes, datos, web, diseño, metodología y releases |
| [`docs/planes`](docs/planes/README.md) | La hoja de ruta: lo que todavía no funciona del todo |

## Para empezar

Hace falta [Bun](https://bun.sh).

```bash
bun install
bun run dev                      # la web en desarrollo
bun run scrape <fuente> [args]   # correr un recolector, por ejemplo: bun run scrape boletin-oficial
bun run typecheck                # tipos de todo el monorepo
bun run verificar                # controles de la web (scroll horizontal, consola limpia)
```

Los datos ya procesados están en el repo, así que la web levanta sin correr ningún recolector.

## Datos siempre al día

Los datos se actualizan solos con GitHub Actions ([`actualizar-datos.yml`](.github/workflows/actualizar-datos.yml)):

| Frecuencia | Fuentes |
|---|---|
| Semanal (lunes) | Boletín Oficial, compras, transferencias de Nación, Ética Pública, índices e IPC |
| Mensual (día 3) | Hacienda, energía, población, Legislatura, autoridades y proveedores |

Cada fuente corre por separado y al final se hace un único commit, después de comprobar que la web compila. Si una fuente falla, se abre un issue con la etiqueta `scraper-roto`, que se cierra solo cuando vuelve a funcionar. Para correrlo a mano: pestaña Actions → «Actualizar datos» → «Run workflow», o `bun run actualizar` desde una máquina en Argentina.

**Proxy con IP argentina.** Dos sitios del Gobierno rechazan conexiones desde servidores en la nube: el Boletín Oficial no responde a la red de GitHub y el Senado de Mendoza solo responde a IPs de Argentina. Los pedidos a esos sitios (lista en `HOSTS_CON_PROXY`, `packages/core/src/fetch.ts`) salen por el proxy definido en el secreto `PROXY_AR` del repositorio (`http://usuario:clave@host:puerto`). Sin el secreto, el Boletín se saltea sin abrir issues y la Legislatura actualiza solo Diputados.

Las fotos de funcionarios y el mapa se actualizan a mano (`bun run scrape fotos`, `bun run scrape geo`), porque cambian poco. El proceso completo está en [Actualización de datos](docs/procesos/actualizacion-de-datos.md).

## Cómo sumarte

- **¿Encontraste un error o falta un dato?** Contalo en [/participar](https://mendoza-transparente.com/participar). Cada envío lo revisa una persona del equipo.
- **¿Pediste información por la Ley 9070?** Registrá el pedido en [/participar](https://mendoza-transparente.com/participar): así sabemos cuánto responde el Estado y lo publicamos en el [registro](https://mendoza-transparente.com/registro).
- **¿Querés programar?** Empezá por [`docs/procesos/`](docs/procesos/README.md): ahí está cómo se agrega una fuente, cómo se arma una página y las reglas de diseño. Las ramas salen de `dev` y vuelven a `dev` con un PR ([Ramas y releases](docs/procesos/ramas-y-releases.md)).
- **¿Trabajás con agentes de IA?** [`AGENTS.md`](AGENTS.md) es la guía para Claude Code, Codex o Cursor, con las skills que corresponde cargar según la tarea.

## Licencia

Código: [MIT](LICENSE). Datos procesados: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es). Los datos originales pertenecen a sus organismos de origen.
