import { readFileSync } from "node:fs";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parse } from "yaml";
import { loadModelPrices } from "../../packages/participation/src/assistant-usage.ts";
// Rutas relativas, no "@mt/participation": Vite deja los paquetes del workspace fuera del bundle de la configuración,
// y el Node del build de Cloudflare (22.16) no puede cargar archivos .ts desde node_modules.
import type { Db } from "../../packages/participation/src/db.ts";
import { openDevDb } from "../../packages/participation/src/local-db.ts";
import { handlePanel } from "../../packages/participation/src/panel-api.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** `virtual:item-titles`: el título de cada ítem de data/curado/no-publicado.yaml, para nombrar lo que se pidió. */
function itemTitles(): Plugin {
  const id = "virtual:item-titles";
  return {
    name: "mt-item-titles",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const file = join(ROOT, "data", "curado", "no-publicado.yaml");
      this.addWatchFile(file);
      const items = parse(readFileSync(file, "utf8")) as { id: string; titulo: string }[];
      return `export default ${JSON.stringify(Object.fromEntries(items.map((i) => [i.id, i.titulo])))};`;
    },
  };
}

/**
 * En desarrollo, la API del panel corre acá sobre la misma SQLite local que el sitio (`.dev/`), con una persona del
 * equipo inventada. El login se controla solo en producción (functions/api/[[route]].ts): este plugin no existe en el
 * build.
 */
function devApi(): Plugin {
  // Se abre al levantar el servidor de desarrollo, nunca durante el build.
  let db: Promise<Db> | null = null;
  return {
    name: "mt-panel-dev-api",
    apply: "serve",
    configureServer(server) {
      db = openDevDb(join(ROOT, ".dev", "participation.sqlite"));
      server.middlewares.use("/api", async (req, res, next) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const origin = `http://${req.headers.host}`;
        const request = new Request(`${origin}/api${req.url ?? ""}`, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] ?? "", origin: req.headers.origin ?? "" },
          body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        const response = await handlePanel(request, await db!, { email: "equipo@localhost" }, { modelPrices: () => loadModelPrices() });
        if (!response) return next();
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), itemTitles(), devApi()],
  server: { port: 5174 },
});
