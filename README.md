# Mendoza Transparente

Datos públicos de la provincia de Mendoza y sus 18 municipios, recopilados, normalizados y explicados para la ciudadanía.

El Estado provincial publica mucha información: presupuesto, deuda, compras, Boletín Oficial, declaraciones juradas, coparticipación. Pero está dispersa en decenas de sitios, muchas veces en PDF, desactualizada o difícil de comparar. Este proyecto la junta, la guarda, la ordena y la muestra de forma clara, con la fuente original siempre a mano.

## Principios

- **Cada número tiene fuente.** Todo dato publicado enlaza al archivo original del que sale, con la fecha en que se descargó.
- **Nada se pierde.** Los archivos originales se archivan tal cual se descargaron, aunque el organismo después los borre o los modifique.
- **La misma vara para todos.** Se usa la misma metodología para todas las gestiones y partidos.
- **Señales, no acusaciones.** Las anomalías se presentan como preguntas que merecen explicación, no como conclusiones.
- **Abierto.** El código y los datos son públicos.

## Estructura

Monorepo con Bun workspaces y Turborepo, en TypeScript.

```
apps/                   aplicaciones (por ejemplo, el sitio web)
packages/core/          @mt/core: descarga, archivado, CSV, municipios
packages/scrapers/      @mt/scrapers: un recolector por fuente en src/sources/<id>.ts
docs/                   relevamiento de fuentes y documentación
sources.yaml            catálogo de fuentes (id, organismo, url, formato, estado)
data/raw/<id>/          archivos originales, por fecha de descarga, más un manifest.jsonl
data/processed/<id>/    datos normalizados (CSV) listos para analizar
```

## Uso

```bash
bun install
bun run scrape <id> [args...]   # por ejemplo: bun run scrape boletin-oficial
bun run typecheck
```

## Actualización automática

Los datos se actualizan solos con GitHub Actions (`.github/workflows/actualizar-datos.yml`):

| Frecuencia | Fuentes |
|---|---|
| Diaria | Boletín Oficial |
| Semanal (lunes) | Compras, transferencias de Nación, Ética Pública, índices e IPC |
| Mensual (día 3) | Hacienda, energía, población, Legislatura, autoridades y proveedores |

Cada fuente corre por separado y al final se hace un único commit, después de comprobar que la web compila. Si una fuente falla, se abre un issue con la etiqueta `scraper-roto`, que se cierra solo cuando vuelve a funcionar. Para correrlo a mano: pestaña Actions → «Actualizar datos» → «Run workflow».

**Proxy con IP argentina.** Dos sitios del Gobierno rechazan conexiones desde servidores en la nube: el Boletín Oficial no responde a la red de GitHub y el Senado de Mendoza solo responde a IPs de Argentina. Los pedidos a esos sitios (lista en `HOSTS_CON_PROXY`, `packages/core/src/fetch.ts`) salen por el proxy definido en el secreto `PROXY_AR` del repositorio (`http://usuario:clave@host:puerto`). Sin el secreto, el Boletín se saltea sin abrir issues y la Legislatura actualiza solo Diputados.

Las fotos de funcionarios y el mapa se actualizan a mano (`bun run scrape fotos`, `bun run scrape geo`), porque cambian poco.

## Licencia

Código: MIT. Datos procesados: CC BY 4.0. Los datos originales pertenecen a sus organismos de origen.
