# Piezas sociales

Videos cortos para redes (X primero) que muestran el sitio en uso: un celular con Mendoza Transparente adentro, un dedo que busca y toca, y el dato que aparece. Se arman como escenas en React con el kit de [Stageshow](https://github.com/benjitaylor/skills) y se graban a MP4 cuadro por cuadro. La primera es `clisa-buyers`: buscar «clisa» y ver quién le compra a CLISA INTERIOR S.A.

Todo corre en local: no se publica en ningún lado, no tiene CI propia ni gasta cupo. Lo único que suma es el chequeo de tipos y el lint de `apps/social` en la CI de cada PR, unos segundos.

## Comandos

```bash
bun run piezas                                   # el estudio en http://127.0.0.1:5391 (lista de escenas)
bun run pieza:grabar <escena> [segundos]         # graba tmp/piezas/<escena>.mp4 y la imagen fija .png
bun run pieza:filmar "<url de la escena>" --states  # hoja de cuadros para revisar (con el estudio corriendo)
```

Necesita Google Chrome y `ffmpeg` (`brew install ffmpeg`). Grabar 16 segundos tarda unos 2 minutos.

- **El estudio** muestra cada escena a tiempo real en `/?scene=<escena>`.
- **El grabador** (`apps/social/scripts/record.ts`) levanta el estudio solo, abre `/?record=<escena>` con el reloj virtual del kit y avanza la escena de a un cuadro, a 30 por segundo. Cada cuadro sale igual en cada grabación y nada se saltea aunque la máquina esté ocupada. El video sale al doble del tamaño de diseño: una escena de 540 × 675 da 1080 × 1350.
- **La imagen fija** es el cuadro que está al 62 % de la vuelta. Si en la escena nueva ese cuadro no es el resultado, se elige otro a mano.
- **Lo que se graba** queda en `tmp/piezas/`, que no se commitea.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Escenas | `apps/social/src/scenes/<escena>/index.tsx` y su `scene.css` (aparecen solas en el estudio) |
| Lo que comparten las escenas | `apps/social/src/site/`: el encabezado del sitio, los tokens con nombres cortos (`--mt-accent-600`…), el fondo celeste y los toques visibles (`tap()`) |
| El kit de Stageshow | `apps/social/vendor/stageshow/`: `kit/` (escenario, celular, cursor, movimiento), `scripts/` (revisión) y `references/` (las reglas del autor, en inglés) |
| Grabador | `apps/social/scripts/record.ts` |

**El kit no se edita.** Es código de terceros (licencia MIT, en `vendor/stageshow/LICENSE` y `NOTICE.md`), copiado tal cual del commit `8020574` del 2026-10-31. Para actualizarlo se vuelve a copiar entero. Por eso Biome lo saltea y `apps/social/tsconfig.json` apaga `noUncheckedIndexedAccess` y `noUnusedLocals`.

**Las escenas usan CSS propio, no Tailwind.** Es la excepción a la regla de la web: el kit está hecho en CSS y sus partes se ajustan con clases. Los colores salen igual de `@mt/ui`. `src/styles.css` importa sus tokens, y `site.css` les da nombres cortos.

## Armar una pieza nueva

1. **La historia, antes que el código.** Una sola cosa que pasa, en 3 a 5 tiempos, de 12 a 16 segundos. Por ejemplo: buscar algo, tocar el resultado y ver el dato. Anotar qué cuadro cuenta la historia solo, sin el resto del video: ese es el resultado.
2. **Datos reales del sitio**, copiados de la página en vivo, con la fecha y la URL en el comentario de cabecera de la escena. Nada inventado ni redondeado distinto de como lo muestra el sitio. Los criterios de [Metodología](metodologia.md) valen igual: señales, no acusaciones; el dato habla solo.
3. **Copiar `clisa-buyers`** a `src/scenes/<escena>/` y cambiar las pantallas y el guion (`script`). Las pantallas del sitio son capas `.mt-layer` que se muestran con `data-show`.
4. **Grabar y revisar** (ver abajo). Mostrar el video antes de darlo por bueno.

### Reglas del formato

- **4:5 y legible en el celular.** Escena de 540 × 675 y celular `Phone width={440}`, casi a tamaño real, con texto de 15 a 17 px. Quien lo mira en X lo ve en un teléfono: lo que no se lee ahí, sobra.
- **El sitio tal cual, simplificado.** Mismos colores, textos y orden que la web. Se saca lo que no hace a la historia (secciones, pestañas, gráficos) y se anota en la cabecera de la escena qué se sacó y por qué. Nunca se agrega lo que el sitio no tiene.
- **Sin personas que no son la historia.** Si el buscador del sitio devuelve personas, la pieza muestra solo la sección que se usa.
- **Toques visibles.** Cada toque usa `tap()` de `src/site/touch.ts`: el dedo baja con un punto oscuro de borde blanco y una onda celeste (`cursor={{ style: "touch", ripple: true }}`), lo tocado se marca con `data-touched` durante 260 ms y recién ahí cambia la pantalla. Sin esa pausa, la pantalla nueva tapa el toque.
- **Nunca dos páginas a medias.** La página nueva aparece debajo y la vieja se va encima de ella.
- **El resultado se sostiene.** Unos 4 segundos quieto, con las barras o los números ya llenos.
- **Se repite sin corte.** La vuelta termina como empezó y vuelve por una causa que se ve, por ejemplo un toque en «Mendoza Transparente». X repite los videos solos.
- **Sin sonido y sin texto encima.** Lo cuenta el posteo. El fondo es el celeste de la bandera (`.mt-ground`).

## Revisar

- **Hoja de estados.** Con el estudio corriendo, `bun run pieza:filmar "http://127.0.0.1:5391/?scene=<escena>" --states --states-for 17000` arma una hoja con cada tiempo del guion (`a.mark()`). Avisa lo que se corta, lo que salta y lo que se toca. Hay que leer cada aviso. Uno conocido no importa: el campo del buscador tiene el texto más cerca de un lado que del otro.
- **El toque, de cerca.** Sacar los cuadros del video alrededor de cada toque: `ffmpeg -i tmp/piezas/<escena>.mp4 -vf "select='between(n\,40\,60)',tile=5x4" -frames:v 1 toque.png`. Se tiene que ver el punto, la onda y lo tocado marcado.
- **Las reglas del autor.** Para algo que no está acá, consultar `vendor/stageshow/references/`: `craft.md` para el cuadro quieto, `motion.md` para el movimiento y `framing.md` para el encuadre.
