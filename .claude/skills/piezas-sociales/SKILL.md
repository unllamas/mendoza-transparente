---
name: piezas-sociales
description: Piezas para redes de Mendoza Transparente (videos 4:5 para X con un celular que muestra el sitio en uso), armadas como escenas en apps/social con el kit de Stageshow y grabadas a MP4 cuadro por cuadro. Cubre el estudio, el grabador, las reglas del formato (legible en el celular, datos reales, toques visibles, resultado sostenido, vuelta sin corte) y cómo revisarlas. Cargar cuando piden un video, una pieza, un posteo animado o una imagen del sitio para redes.
---

# Piezas sociales

Fuente completa: `docs/procesos/piezas-sociales.md`. Cargar también `contenido-y-metodologia` (la pieza interpreta datos) y `diseno` (es el sitio en chico).

## Comandos

```bash
bun run piezas                                       # estudio en http://127.0.0.1:5391
bun run pieza:grabar <escena> [segundos]             # tmp/piezas/<escena>.mp4 + .png (Chrome y ffmpeg)
bun run pieza:filmar "http://127.0.0.1:5391/?scene=<escena>" --states --states-for 17000
```

## Checklist de una pieza nueva

1. **Historia primero:** una sola cosa que pasa, 3 a 5 tiempos, 12 a 16 s. ¿Qué cuadro la cuenta solo?
2. **Datos reales** copiados del sitio en vivo, con fecha y URL en la cabecera de la escena. Nada inventado. Señales, no acusaciones.
3. **Copiar** `apps/social/src/scenes/clisa-buyers/` a `src/scenes/<escena>/` (nombre en inglés, kebab-case) y cambiar pantallas y guion. Reusar `SiteHeader`, `tap()` y los tokens `--mt-*` de `src/site/`.
4. **Formato:**
   - 540 × 675 y `Phone width={440}`, con texto de 15 a 17 px;
   - el sitio tal cual, simplificado, con lo que se sacó anotado en la cabecera;
   - sin personas que no son la historia;
   - cada toque con `tap()` (punto, onda y `data-touched`);
   - nunca dos páginas a medias;
   - el resultado quieto unos 4 s;
   - la vuelta termina como empezó, por una causa visible;
   - sin sonido ni texto encima.
5. **Revisar:**
   - la hoja de `pieza:filmar --states`, leyendo cada aviso;
   - los cuadros del video alrededor de cada toque;
   - la imagen fija, que tiene que ser el resultado.
6. **Mostrar el video antes** de darlo por bueno. Las piezas no se commitean (`tmp/piezas/`); las escenas sí.

## No tocar

- `apps/social/vendor/stageshow/` es de terceros (MIT): no se edita, se vuelve a copiar entero para actualizarlo.
- Las escenas usan CSS propio (el kit es CSS), con los colores de `@mt/ui`. La regla de «solo Tailwind» es de `apps/web`.
