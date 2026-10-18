# Plan: agentes sobre los datos

Objetivo: que periodistas, equipos de campaña, investigadores y cualquier persona puedan **consultar los datos de Mendoza Transparente desde su propio asistente de IA** (Claude, ChatGPT, Cursor…), con cada respuesta atada a una fila, una fuente oficial y una fecha de corte. Recién después, y solo si eso funciona bien, evaluar un asistente propio dentro de la web.

Fecha: 16/10/2026. Estado: propuesta, sin empezar. Falta decidir las preguntas abiertas del final.

## Por qué así y no un chat en la web

- **La responsabilidad de la respuesta.** Si el modelo inventa o adjetiva dentro de nuestra web, la frase queda atribuida a Mendoza Transparente. Con un servidor MCP, nosotros entregamos datos verificables y el asistente de cada persona redacta. Es el mismo criterio de "señales, no acusaciones" (`docs/procesos/metodologia.md`), llevado a la IA.
- **Costo y abuso.** Un servidor MCP no paga tokens de modelo: solo lee datos. Un chat público paga cada consulta y es un blanco fácil para el abuso.
- **El stack.** Todo vive en Cloudflare (Pages, Functions, D1). Un MCP sobre Workers con el Agents SDK de Cloudflare no suma otra plataforma.

### Por qué no eve de Vercel

eve compila cada agente a Vercel Functions: sumaría una segunda plataforma, con otros secretos y otro despliegue, para resolver algo que Cloudflare ya cubre. Además está en vista previa pública. Se vuelve a mirar si el día de mañana necesitamos agentes de larga duración con aprobaciones humanas que no entren en Workers.

## Etapas

1. **MCP de solo lectura** (`mcp.mendoza-transparente.com` o `/mcp`, a decidir):
   - Herramientas, con nombres en inglés porque son código:
     - `list_sources`: fuentes disponibles, qué cubren, fecha de corte y link a `/datos`.
     - `describe_source`: columnas y significado, tomados de `docs/diccionario-de-datos.md`.
     - `query_source`: filas de una fuente con filtros (organismo, municipio, período, monto) y un límite de filas.
     - `search_entities`: funcionarios, organismos, proveedores, leyes y municipios por nombre, con su página en la web.
     - `list_unpublished`: lo que el Estado no publica (`data/curado/no-publicado.yaml`), para que el asistente diga "no está" en vez de suponer.
   - Cada resultado lleva `fuente`, `url_oficial`, `copia_archivada`, `fecha_corte` y `url_en_el_sitio`.
   - Los montos salen en pesos nominales, igual que en los CSV. Si se piden pesos de hoy, se informa el deflactor y su referencia, como en la web.
   - Sin escritura, sin datos que la web no publique y sin datos personales (`metodologia.md#datos-personales`).
2. **Instrucciones para el modelo** (prompt del servidor MCP): citar siempre la fuente, no adjetivar, distinguir dato de señal y decir "no se publica" cuando corresponde. Es un texto corto, versionado en el repo y revisado con los mismos criterios que los textos de la web.
3. **Evals:** un set de preguntas con respuesta conocida y otro de preguntas trampa (datos que no existen, pedidos de DNI, "¿quién es el más corrupto?", comparaciones injustas entre gestiones). Se corre antes de cada cambio en las herramientas o en el prompt.
4. **Lanzamiento:** página `/datos/ia` (o una sección en `/datos`) con cómo conectarlo a cada asistente, ejemplos de preguntas y sus límites. Mención en `llms.txt`. Eventos en PostHog de uso por herramienta, sin guardar las preguntas (ver `docs/procesos/analitica.md`).
5. **Asistente en la web (condicional).** Solo si el MCP tiene uso real y pasa las evals con holgura. Se evalúa con el Agents SDK de Cloudflare sobre el mismo MCP, con Turnstile, límite por IP y un tope de gasto mensual. Si se hace, cada respuesta se presenta como "respuesta generada con IA" y con sus fuentes a la vista.

Cuando una etapa quede funcionando, su proceso pasa a `docs/procesos/` con su skill, como cualquier otro.

## Criterios

- **Solo lo publicado:** el MCP lee lo mismo que se descarga en `/datos`. Nada que no esté en la web sale por acá.
- **Siempre con fuente:** una fila sin fuente, fecha de corte o link no se devuelve.
- **La misma vara:** las herramientas no ordenan ni puntúan personas ni partidos. Las señales se devuelven con su explicación, como en `/senales`.
- **Amable con los servidores:** el MCP no consulta sitios del gobierno en vivo, solo nuestros datos ya procesados.

## Preguntas abiertas

- **De dónde lee el MCP:** de los CSV estáticos que ya publica el sitio (más simple, pero los filtros se hacen en memoria) o de una copia en D1 que se carga en cada build (filtra rápido, pero hay que mantener otra copia). `data/processed` pesa hoy unos 43 MB.
- **Dónde corre:** una ruta dentro de las Pages Functions de `apps/web` o un Worker aparte (`apps/mcp`), que aísla el riesgo y los límites del sitio.
- **Acceso:** abierto sin registro (más alcance) o con una clave gratuita (permite cortar abusos y saber quién lo usa).
- **Qué fuentes entran primero:** se propone empezar por las más consultadas en PostHog y por las que tienen página de entidad (funcionarios, organismos, proveedores, compras).
