# Vista previa de interfaz

Para decidir rápido cómo va a quedar algo antes de tocar el código real: se arma una página descartable con los componentes y los datos de verdad, se mira en el celular y en la computadora, se ajusta con quien pidió el cambio y, cuando dice que sí, se pasa a la página real. Así se discute sobre algo que se ve, no sobre una descripción.

## Cuándo usarla

- **Sí:**
  - Un cambio de orden o de estructura de una página (la portada, una ficha).
  - Un componente nuevo, o dos o más formas posibles de mostrar un mismo dato.
  - Cuando la persona dice «quiero verlo antes».
- **No:**
  - Un arreglo chico y claro (un texto, un color, un margen): se hace directo con la skill `mejoras`.
  - Algo que no se ve.

## Cómo funciona

- **La ruta solo existe en desarrollo:** `/vista-previa/<nombre>` muestra `apps/web/src/previews/<nombre>.tsx`. La define `apps/web/src/main.tsx` con `import.meta.env.DEV`, así que nunca llega a producción.
- **`apps/web/src/previews/` está en `.gitignore`:** lo que se arma ahí nunca se commitea. No hace falta registrar nada ni tocar `main.tsx`: alcanza con crear el archivo.
- **Cada vista previa exporta dos cosas:**

```tsx
// apps/web/src/previews/portada.tsx
export const loader = async () => ({ home: await loadTema<HomeTema>("home") }); // opcional: los mismos datos que la página real

export function Preview({ data }: { data: unknown }) {
  const { home } = data as Awaited<ReturnType<typeof loader>>;
  return <section>…</section>;
}
```

- **Para un cambio sobre una página que ya existe,** se copia la página a `previews/` y se cambia ahí. La página real sigue igual en su ruta, y las dos se comparan lado a lado.
- **Se usan los componentes de `@mt/ui` y de `src/components/`,** igual que en la página real. Así lo aprobado se pasa sin rehacerlo.

## Paso a paso

1. **Leer el pedido** y, si viene de datos de uso, tener a mano los números (skill `analitica`, MCP `posthog-mendoza`).
2. **Levantar el sitio** y dejarlo corriendo: `cd apps/web && bunx vite --port 5179`. En T3 Code se abre en el panel de vista previa.
3. **Armar `previews/<nombre>.tsx`**, con las reglas de la skill `diseno`.
4. **Capturar:** `bun run vista-previa /vista-previa/<nombre> --compare <ruta real>`. Deja en `/tmp/mt-vista-previa/` la primera pantalla y la página en cortes, en 375 y 1280 px. Además imprime el scroll horizontal, el alto, la pantalla donde empieza cada sección y los errores de consola. Para un solo componente: `--selector "<css>" --widths 320,375,1280`. Para el modo oscuro: `--dark`.
5. **Revisar las capturas** antes de mostrarlas: una línea en cifras y títulos, acción visible, 44 px, nada cortado en 320 px y nada de scroll horizontal. Corregir y volver a capturar hasta que no quede nada; cada vuelta es una versión (v1, v2…).
6. **Mostrar** las capturas de la última versión y la tabla de antes y después. Contar qué se corrigió en cada vuelta y qué queda para decidir.
7. **Iterar** con lo que diga la persona (en el chat o con notas de Agentation), con el mismo archivo y la misma ruta.
8. **Pasar a la página real** cuando lo apruebe: mover el código a `pages/` y `components/`, y sumar los eventos de analítica que haga falta. Comparar la ruta real contra la vista previa con `--compare` para confirmar que quedaron iguales, borrar `previews/<nombre>.tsx` y correr `bun run verificar`.
9. **Cerrar** con commit, push y PR a `dev` (skill `ramas-y-releases`). Las capturas de la última versión van en el PR.

## Qué no hacer

- **No usar maquetas en HTML aparte ni capturas de otro sitio:** la vista previa usa los datos y los componentes reales, y eso es lo que la hace útil.
- **No commitear nada de `previews/`** ni dejar rutas temporales en `main.tsx`.
- **No mostrar una versión sin haberla revisado antes:** la primera mirada de QA la hace el agente.
