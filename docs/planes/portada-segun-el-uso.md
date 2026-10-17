# Portada según el uso

Reordenar y achicar la portada a partir de lo que la gente usa de verdad, medido en PostHog del 12 al 17 de octubre de 2026 (558 visitas a la portada, 261 personas, 37 % desde el celular).

## Qué encontramos

- **Casi nadie baja.** La mitad de las personas no pasa del 15 % de la página; en el celular, el 72 % se va antes del 25 %. El 40 % de las visitas termina en la portada.
- **Lo más usado está debajo de la primera pantalla.** «Empezá por una pregunta» (37 personas, la sección más usada) arranca en la pantalla 1,1, tanto en el celular como en la computadora.
- **Lo que más interesa está al final.** Unas 30 llegadas a `/senales` salen de la portada, casi todas por el link del menú; la sección «Para mirar de cerca» está en la pantalla 10,7 del celular.
- **Elegir el departamento funciona** (21 personas, una vez cada una): es personal y concreto.
- **El buscador se abre pero no se usa:** 37 aperturas en la portada y 6 resultados elegidos en todo el sitio.
- **«¿Primera vez? Empezá por acá» no se usa** (1 clic), aunque está en el lugar más visible.
- **Las cifras de «Mendoza en números» casi no se tocan**, y en el celular ocupan 2,3 pantallas.
- **Hay elementos sin medir:** cifras, mapa, lista de lo que no se publica, botón de señales y links principales del menú.

## Etapas

### 1. Medir lo que falta (hecho)

Evento propio para cada cosa que hoy solo se deduce por la página siguiente, sumado al catálogo y a PostHog:

| Elemento | Evento |
|---|---|
| Cada cifra de «Mendoza en números» | `home.figure.open` (`figure`) |
| Botón «Ver todas las señales» | `home.signals.open` |
| Fila de «Lo que el Estado no publica» | `home.missing_data.open` (`item`) |
| Departamento en el mapa | `home.map_department.open` (`municipality`) |
| Links principales del menú | `nav.link.open` (`to`) |

### 2. Nueva portada (hecho)

Orden nuevo, de lo más usado a lo menos usado:

1. **Portada más baja:** foto de 96 px en el celular y 128 px en la computadora (antes, 208 y 320), bajada de una oración, buscador y «¿Dónde vivís?». Sale «¿Primera vez? Empezá por acá» (la guía sigue en «Cómo leer estos datos»).
2. **Empezá por una pregunta,** ordenadas por uso: compras, departamento, deuda, señales (nueva, reemplaza a leyes, que tuvo 4 clics y ya aparece en «Lo nuevo»), personal y lo que no se publica. En el celular, lista compacta (las seis entran en la primera pantalla); desde `sm`, tarjetas sin «Ver la respuesta» y con la flecha a la vista.
3. **Para mirar de cerca** (antes, última).
4. **Lo nuevo**, con 5 filas (antes, 8).
5. **Tu departamento** (mapa), junto a lo personal.
6. **Mendoza en números:** en el celular, una fila por cifra; en la computadora, las tarjetas de siempre. Inflación y dólar, en dos tarjetas lado a lado con la cifra en grande (antes, una franja de texto).
7. **Lo que el Estado no publica**, con 4 filas y botón secundario.
8. **Todo lo que hay** (título más corto: el largo se partía en el celular).
9. **Cómo leer estos datos.**

Resultado en la vista previa: la página del celular baja de 10.136 a 6.891 px, las preguntas empiezan en la pantalla 0,7 y «Para mirar de cerca» en la 1,4.

Se decidió con una vista previa (`docs/procesos/vista-previa.md`): cuatro vueltas de revisión visual y el visto bueno del equipo. La pregunta de señales reemplaza a la de leyes.

### 3. Buscador

Revisar las búsquedas sin resultados (`search.no_results`) y por qué se abre sin elegir nada. Es un trabajo aparte de la portada.

### 4. Volver a medir

Dos semanas después de publicar, comparar con la línea de base de arriba: profundidad de scroll, personas por sección y visitas que terminan en la portada.

## Qué falta decidir

- Si el mapa de «Tu departamento» se achica en la computadora (hoy mide unos 600 px de alto).
- Si se aprovecha la mitad derecha de la portada en la computadora, que hoy queda vacía.
