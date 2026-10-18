# Plan: difusión en video

Objetivo: llevar los datos del sitio a las redes (X, Instagram, TikTok, YouTube Shorts) con **videos cortos de un solo dato**, hechos con código a partir de los mismos datos que publica la web. Así cada video se puede comprobar y se vuelve a generar cuando los datos cambian.

Fecha: 17/10/2026. Estado: prueba 1 hecha (un video para X). Falta decidir las preguntas abiertas del final.

## Por qué

- **La gente no entra al sitio a buscar un dato:** se lo cruza en el feed. De cara a 2027, lo que no circula en redes no llega a la mayoría.
- **Las imágenes para compartir ya existen** (`dist/og/*.png`, ver `docs/procesos/web.md`), pero solo aparecen cuando alguien comparte un link. Un video puede circular solo.
- **Un video hecho a mano no escala ni se puede comprobar.** Hecho con código, la cifra sale del mismo JSON que arma `apps/web/scripts/build-data.ts`, queda escrita en el código con su fuente y su fecha, y se vuelve a renderizar en un minuto cuando cambia el dato.

## La herramienta: cinetic

[cinetic](https://github.com/Leonxlnx/cinetic) (licencia MIT) es una skill para agentes que dirige un video corto escrito en código: idea, guion por fragmentos, una grilla de tiempo única para imagen y sonido, render con [Remotion](https://www.remotion.dev) (React) y un control de calidad con scripts (cuadros que saltan, texto ilegible o que se mueve rápido, sincronía del sonido, márgenes seguros para redes).

- **Lo que suma:** disciplina para que el video se lea sin sonido (los textos llegan de a 2 o 3 palabras y se turnan con la imagen), una lista de prohibiciones parecida a nuestro «Lo que no hacemos» (sin brillos, sin degradés, sin violeta, sin emojis) y controles que encuentran errores que a ojo no se ven.
- **Lo que pide:** Node 22+, ffmpeg, Python 3.11+ con varias librerías y, para el sonido, [earshot](https://github.com/Leonxlnx/earshot) (con PyTorch). En total, unos 2 GB fuera del repo.
- **Licencia de Remotion:** gratis para personas y para organizaciones de hasta 3 personas. Si el equipo pasa de 3, hay que revisar si aplica la licencia de empresa o pasar a HyperFrames (Apache 2.0), el otro motor que soporta cinetic.
- **Costo:** cero. Todo se renderiza en una computadora del equipo; no usa CI ni servicios pagos (ver [Costo cero](../procesos/arquitectura.md#costo-cero)).

## Reglas para los videos

Las mismas del sitio (`docs/procesos/metodologia.md` y `docs/procesos/diseno.md`), más lo propio del formato:

- **Un dato por video**, verificable y con su matiz. Señales, no acusaciones. Sin adjetivos.
- **Fuente y fecha a la vista** en el cuadro donde está la cifra («Relevado el 16/10/2026»), no solo en el texto de la publicación.
- **Sin rankings de municipios ni de personas.** Se muestra la lista verificable, como en la web.
- **La cifra sale de los datos, nunca a mano:** el módulo `data.ts` del video copia lo que arma `build-data.ts` y verifica con asserts lo que dice el texto («15 de 18»). Si el dato cambia, el video no compila hasta corregir el texto.
- **Se lee sin sonido.** El sonido es un extra (efectos suaves, sin música).
- **La identidad del sitio:** fondo blanco, azul de la marca (`#1F6DB5`) para lo que se publica, celeste de la bandera en el logo, Inter y el logo del racimo. Para cinetic son «marca provista» (`BRIEF.md`).
- **Cierra con el logo y la dirección** (`mendoza-transparente.com`). El link a la página exacta va en el texto de la publicación.

## Prueba 1: sueldos de las autoridades municipales (hecha)

Video para X, cuadrado (1080 × 1080, porque en el celular ocupa más pantalla que un 16:9), 18,8 s, 60 cuadros por segundo, con efectos de sonido.

- **El dato:** de las 9 cosas que piden las leyes a cada municipio, la que más falta es el sueldo de las autoridades: **15 de 18 municipios no lo publican** (Rivadavia lo tiene al día; Capital y Godoy Cruz, atrasado). Sale de `data/curado/transparencia-municipal.yaml`, calculado con `apps/web/scripts/temas/transparency.ts`, y coincide con la entrada `sueldos-autoridades-municipales` de `no-publicado.yaml`.
- **La historia:** la tabla «Qué publica cada municipio» del sitio se arma y se llena de azul. Un resaltado recorre las columnas y se detiene en la única casi vacía, «Sueldos de las autoridades». La columna sale de la tabla como 18 puntos grandes: «15 de 18 / no los publican.». Los puntos se juntan en uno, que es la uva de abajo del logo, y el logo se arma alrededor.
- **Resultado del control de calidad:** grilla de tiempo, lint de prohibiciones, márgenes y velocidad del texto sin errores. La sincronía del sonido da 25 de 25 efectos a ±2 cuadros y el video final pasa el análisis cuadro a cuadro sin fallas. La pausa sobre la cifra quedó declarada como pausa buscada; quedan solo advertencias de que la tabla se mueve poco mientras se lee.
- **Lo que costó:** una sesión de agente, contando la instalación. El render de la vista previa tarda un minuto en una MacBook M1 de 8 GB; el final, con desenfoque de movimiento, 5 minutos y medio (4,5 MB).
- **Lo que aprendimos:**
  - El zoom lento de cámara sobre texto chico hace que Chromium vuelva a dibujar las letras y aparecen saltos de un cuadro. En tablas, la cámara va quieta y el movimiento sale de la geometría (los puntos, la franja). Si hay que escalar algo, se hace sobre una capa con `will-change: transform` desde el primer cuadro.
  - Un estado intermedio («atrasado») en un video de 18 s necesita una leyenda que no entra. Se usó la regla del sitio, «publica» cuenta al día, atrasado y sin fecha, y el matiz va en el texto de la publicación.
  - El texto de interfaz de la web (título de la tabla, nombres de los municipios, etiqueta de la columna) no cuenta como texto del guion. Eso deja el guion en 8 palabras.

El proyecto de la prueba está en `~/Documents/MVPs/mendoza-videos/films/sueldos-municipales` (fuera del monorepo, todavía sin repo). Ahí están `BRIEF.md` (pedido, dato y reglas), `src/data.ts` (datos con asserts), `src/timeline.ts` (la grilla) y `out/` (videos y control de calidad; el video para publicar es `out/deliver/sueldos-municipales-x.mp4`).

## Formatos candidatos

| Formato | Para qué | Ejemplos |
|---|---|---|
| Un dato (12–20 s, 1:1 o 9:16) | La pieza de todos los días en X, Reels y TikTok | Qué publica cada municipio, cuánto debe Mendoza, cargos del Estado por habitante |
| Recorrido del sitio (20–45 s, con subtítulos) | Enseñar a usar la web | Cómo buscar a un proveedor, cómo leer una señal, cómo pedir un dato que no se publica |
| Firma del logo (3–6 s) | Inicio o cierre de cualquier video, también para quien haga notas con nuestros datos | |
| Lanzamiento (20–30 s) | Una sección nueva o la apertura del período electoral | `/leyes`, `/registro` |

## Etapas

1. ~~Prueba con un video para X~~ (hecha, arriba).
2. **Publicarla y medir:** subirla a X con el link a `/municipios` y ver reproducciones, guardados y visitas que llegan (PostHog, con `utm_source=x`).
3. **Decidir dónde vive el código** (preguntas abiertas) y pasar la prueba ahí, con un script que copie los datos desde `apps/web/public/data/` en vez de pegarlos.
4. **Plantilla «un dato»:** el mismo video con otra cifra cambiando solo `data.ts` y el guion. Probarla con 2 o 3 datos distintos.
5. **Versión 9:16** para Reels, TikTok y Shorts, armada desde la misma grilla de tiempo (cinetic no recorta: vuelve a componer).
6. Si funciona, pasar a `docs/procesos/videos.md` con su skill y su fila en `AGENTS.md`.

## Preguntas abiertas

- **¿Dónde vive el código de los videos?** Opciones: un repo aparte (`mendoza-transparente-videos`), que deja Remotion, Python y los renders fuera del monorepo, o una carpeta `videos/` en este repo fuera de los workspaces de Bun, que deja los datos a mano pero suma dependencias pesadas. La recomendación es un repo aparte que lea los JSON publicados del sitio.
- **¿Quién publica y desde qué cuenta?** ¿Hay cuenta del proyecto en X, Instagram y TikTok?
- **¿Cada cuánto?** Un video por semana alcanza para probar sin que el armado se coma el tiempo de los datos.
- **¿Sonido sí o no?** El feed reproduce sin sonido; los efectos suman poco y piden earshot (con PyTorch) instalado. Se puede dejar sin sonido y sacar earshot del proceso.
