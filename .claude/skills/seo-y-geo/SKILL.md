---
name: seo-y-geo
description: SEO y GEO de Mendoza Transparente (buscadores y motores de IA). Cubre registro de páginas, títulos y descripciones, JSON-LD, HTML prerenderizado, imágenes para compartir, sitemap, robots, llms.txt, índice del buscador y enlaces internos. Cargar al crear una página o tipo de entidad nuevo, al cambiar títulos o rutas, o cuando algo no se ve bien al compartir o buscar.
---

# SEO y GEO

Fuente completa: `docs/procesos/web.md` (sección "SEO y GEO" y "La portada como guía").

## Cada página nueva

1. **Registrarla en `apps/web/scripts/paginas.ts`:**
   - `title`: hasta 60 caracteres, con la palabra que la gente busca.
   - `description`: hasta 160, armada con el dato real.
   - `og`: la cifra principal para la imagen para compartir.
   - `ld`: JSON-LD de schema.org (`Person`, `Organization`, `GovernmentOrganization`, `AdministrativeArea`, `Legislation`, `Dataset`, `DefinedTermSet`, siempre `BreadcrumbList`, y `FAQPage` con las preguntas que hace la gente).
   - `html`: el contenido escrito (h1, resumen, datos y links).
2. **Si es una sección:** su entrada en `PAGES` (`src/seo.ts`) y en `NAV` (`paginas.ts`).
3. **Enlaces internos en los dos sentidos,** por ejemplo de funcionario a municipio y de vuelta, y su lugar en el mapa de la portada si corresponde.
4. **Buscador:** si es un tipo de entidad nuevo, darle tipo y una línea útil en `writeSearchIndex` (`scripts/temas/guide.ts`): nombre en `t`, lo que importa en `s` y nunca el nombre repetido.

## Qué genera el build

- **Un HTML por ruta:** `dist/<ruta>.html`, con meta, canonical, hreflang, OG, Twitter, JSON-LD y el contenido dentro de `#root` (lo leen los robots sin ejecutar JS).
- **`404.html`** con `noindex`: devuelve código 404 y React igual resuelve la ruta.
- **Imágenes para compartir:** `og/*.png`, con `?v=<hash>` en la URL para que WhatsApp y Facebook vuelvan a pedirlas cuando cambian.
- **Archivos para robots:**
  - `sitemap.xml`, con las fechas reales.
  - `robots.txt`, que permite los robots de IA.
  - `llms.txt`.
- **Para la web:** `meta.json`, que actualiza los metadatos al navegar, y `search.json`, el índice del buscador.
- **Control:** el build se corta si una página sale con "undefined", "NaN" o "null".

## Verificar

```bash
cd apps/web && bunx vite build && bun scripts/seo.ts
grep -o '<title>[^<]*' dist/<ruta>.html
```

- **Al compartir:** WhatsApp guarda la previsualización vieja. Probar con `?v=1` o refrescar en https://developers.facebook.com/tools/debug/.
- **Search Console:** está verificado con `public/google9fb9587f2a5c020a.html`, que se sirve con la función homónima en `functions/` porque Pages redirige `.html`. No borrar ninguno de los dos.
