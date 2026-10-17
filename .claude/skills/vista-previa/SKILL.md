---
name: vista-previa
description: Armar una vista previa descartable de una pantalla o componente de Mendoza Transparente, con los datos y componentes reales, en /vista-previa/<nombre> (solo en desarrollo, nunca se commitea), capturarla en 375 y 1280 px contra la versión actual, revisarla y ajustarla antes de mostrarla, y pasarla al código real cuando se aprueba. Cargar cuando piden «quiero verlo antes», «armá una preview», comparar formas de mostrar algo, o ante un cambio de estructura de una página (orden de secciones, portada, ficha nueva).
---

# Vista previa de interfaz

Fuente completa: `docs/procesos/vista-previa.md`. Cargar también `diseno`; si el cambio viene de datos de uso, `analitica`.

## Armar

1. Levantar el sitio y dejarlo corriendo: `cd apps/web && bunx vite --port 5179`.
2. Crear `apps/web/src/previews/<nombre>.tsx`. La carpeta está en `.gitignore` y se ve sola en `/vista-previa/<nombre>`, sin tocar `main.tsx`:
   ```tsx
   export const loader = async () => ({ home: await loadTema<HomeTema>("home") }); // opcional
   export function Preview({ data }: { data: unknown }) {
     const { home } = data as Awaited<ReturnType<typeof loader>>;
     return …;
   }
   ```
3. Para cambiar una página existente, copiarla a `previews/` y cambiar la copia. Siempre con los componentes de `@mt/ui` y `src/components/`, nunca con HTML suelto.

## Revisar antes de mostrar

- **Capturas:** `bun run vista-previa /vista-previa/<nombre> --compare <ruta real>` (las deja en `/tmp/mt-vista-previa/`). Para un solo componente: `--selector "<css>" --widths 320,375,1280`. Para el modo oscuro: `--dark`.
- **Leer el resumen:**
  - Scroll horizontal en 0.
  - Consola sin errores.
  - La pantalla donde empieza cada sección: lo importante, en la 1.
- **Mirar cada corte:** una línea en cifras y títulos, acción visible sin hover, 44 px, nada cortado en 320 px. Corregir y volver a capturar; cada vuelta es una versión.

## Mostrar

- **Las capturas de la última versión,** con rutas absolutas en markdown, y la tabla de antes y después (alto, pantalla de cada sección).
- **Qué se corrigió en cada versión** y qué queda para decidir (pocas opciones, con una recomendada).
- **El link** `http://localhost:5179/vista-previa/<nombre>`, abierto en el panel de vista previa si está disponible.

## Al aprobarse

1. Pasar el código a `pages/` y `components/` (skill `arquitectura`), con sus eventos (skill `analitica`).
2. `--compare` entre la ruta real y la vista previa para confirmar que quedaron iguales.
3. Borrar `previews/<nombre>.tsx`.
4. `bunx tsc --noEmit` y `bun run verificar`.
5. Commit, push y PR a `dev` con las capturas (skill `ramas-y-releases`).

Nunca: commitear `previews/`, dejar rutas temporales en `main.tsx` o mostrar una versión sin revisarla.
