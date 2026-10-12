# Actualización de datos

Los datos se mantienen al día solos en la nube (GitHub Actions). Una actualización manual desde una computadora en Argentina sirve de respaldo y de doble confirmación.

## En la nube: GitHub Actions

Workflow: `.github/workflows/actualizar-datos.yml`.

| Calendario (hora de Mendoza) | Fuentes |
|---|---|
| Todos los días, 07:00 | Boletín Oficial (últimos 3 días) |
| Lunes, 08:00 | Compras (OCDS), transferencias de Nación (DNAP), Ética Pública, índices, IPC de la DEIE |
| Día 3 de cada mes, 09:00 | Hacienda (deuda y coparticipación), energía, población, Legislatura, autoridades, proveedores, personal por organismo (anexo 19 de Responsabilidad Fiscal), planta del Presupuesto |

Cómo funciona:

1. **plan** decide qué fuentes corren según el calendario (o las elegidas a mano).
2. **scrape** corre cada fuente en su propio job; si una falla, las demás siguen. Empaqueta los cambios de `data/`.
3. **commit** junta todos los cambios, comprueba que la web compile con ellos (`bun run data`, tipos, build y SEO) y hace **un único commit**. Si la web no compila, no publica y abre un issue.
   Antes, si se actualizó el Boletín Oficial, extrae las designaciones de las normas nuevas (`designaciones`, fuente derivada que no descarga nada) y escribe los resúmenes en lenguaje simple de las leyes nuevas (`apps/web/scripts/resumir-leyes.ts`). Necesita el secreto **`ANTHROPIC_API_KEY`**: sin él, las leyes nuevas se publican igual, sin resumen. Si ese paso falla, no frena la publicación. Ver [Metodología](metodologia.md#resumenes-de-leyes).
4. **frescura** controla que el Boletín Oficial no pase más de 4 días sin actualizarse (solo si hay proxy configurado).

Correrlo a mano: pestaña **Actions → Actualizar datos → Run workflow**, con las fuentes separadas por coma (vacío = todas).

### Avisos

- `scraper-roto`: una fuente falló. El issue trae el link al registro; si vuelve a fallar se comenta en el mismo, y **se cierra solo** cuando la fuente vuelve a funcionar.
- `datos-viejos`: el Boletín Oficial lleva más de 4 días sin datos nuevos.
- No hace falta revisar nada a diario: solo atender los issues que aparezcan.

### Sitios que bloquean a la nube

Verificado el 12/10/2026 con check-host.net (consultas desde Brasil, Alemania y EE.UU.):

| Sitio | Comportamiento |
|---|---|
| Boletín Oficial (`portalgateway.mendoza.gov.ar`) | No responde a la red de GitHub (Azure). Desde otros proveedores, sí. |
| Senado de Mendoza (`senadomendoza.gob.ar`, `senadomza.gov.ar`) | Responde 403 a cualquier conexión de fuera de Argentina. |

Esos hosts están en `HOSTS_CON_PROXY` (`packages/core/src/fetch.ts`). Si el repositorio tiene el secreto **`PROXY_AR`** (`http://usuario:clave@host:puerto`, un proxy con salida en Argentina), los pedidos a esos sitios pasan por ahí y todo lo demás va directo. Sin el secreto:

- El Boletín Oficial se saltea, sin abrir issues.
- La Legislatura actualiza Diputados y el Senado conserva sus datos anteriores.

Para activarlo: contratar un proxy argentino de pago por uso (el consumo es de unos 20 MB por mes) y cargarlo en **Settings → Secrets and variables → Actions → New repository secret** con el nombre `PROXY_AR`.

## A mano: `bun run actualizar`

Respaldo para cuando la nube no llega (sitios bloqueados) o para confirmar un dato. Se corre desde una computadora en Argentina, en la copia de trabajo del repo:

```bash
bun run actualizar                     # Boletín Oficial y Legislatura (las bloqueadas en la nube)
bun run actualizar compras-ocds dnap   # fuentes puntuales
bun run actualizar --todas             # todas las del workflow
bun run actualizar --sin-publicar      # solo descargar y ver el resumen
bun run actualizar --si                # publicar sin preguntar
```

Qué hace (`scripts/actualizar.ts`):

1. Corre cada scraper con los mismos argumentos que el workflow.
2. Muestra un resumen: estado, archivos nuevos y tiempo por fuente.
3. Comprueba que la web compile con los datos nuevos.
4. **Pregunta antes de publicar** y hace commit y push **solo de `data/`**: nunca sube código que se esté editando.

## Qué hacer cuando falla una fuente

1. Abrir el issue y el registro del job.
2. Causas habituales:
   - **El sitio cambió de estructura** (otra URL, otra tabla): ajustar el scraper.
   - **El sitio estuvo caído o limitó los pedidos** (HTTP 429, timeouts): suele resolverse solo en la próxima corrida.
   - **El sitio bloquea a la nube**: agregar el host a `HOSTS_CON_PROXY` y configurar `PROXY_AR`, o actualizar a mano mientras tanto.
3. Probar localmente: `bun run scrape <fuente>`.
4. Si el dato cambió de verdad (no es un error), revisar que los diccionarios y las páginas sigan siendo correctos.

## Lo que no es automático

- **Fotos de funcionarios** (`bun run scrape fotos`): usan `sips`, que solo existe en macOS. Cambian poco.
- **Mapa** (`bun run scrape geo`): los límites de los departamentos no cambian.
- **Resúmenes de leyes sin la clave de la API:** `bun run resumir-leyes` con `ANTHROPIC_API_KEY` en el entorno.
- **Contenido curado** (`data/curado/`): se edita a mano (ver [Datos y archivo](datos-y-archivo.md#contenido-curado)).
