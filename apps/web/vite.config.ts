import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * En desarrollo, regenera public/data cuando cambian los datos procesados, el catálogo
 * o los scripts de temas, y recarga el navegador. Así lo que dejan los scrapers aparece solo.
 */
function liveData(): Plugin {
  const watched = [
    join(ROOT, "data", "processed"),
    join(ROOT, "data", "curado"),
    join(ROOT, "sources.yaml"),
    join(import.meta.dirname, "scripts"),
  ];
  return {
    name: "mt-live-data",
    apply: "serve",
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let pending = false;

      const rebuild = () => {
        if (running) {
          pending = true;
          return;
        }
        running = true;
        const child = spawn("bun", ["scripts/build-data.ts"], { cwd: import.meta.dirname, stdio: "inherit" });
        child.on("exit", (code) => {
          running = false;
          if (code === 0) server.ws.send({ type: "full-reload" });
          if (pending) {
            pending = false;
            rebuild();
          }
        });
      };

      // public/data se sirve directo del disco: Vite cachea la lista de archivos públicos
      // y no vería los datasets que aparecen después de arrancar.
      const dataDir = join(import.meta.dirname, "public", "data");
      server.middlewares.use("/data", async (req, res, next) => {
        const path = normalize(join(dataDir, decodeURIComponent((req.url ?? "/").split("?")[0]!)));
        if (!path.startsWith(dataDir)) return next();
        try {
          const body = await readFile(path);
          const type = path.endsWith(".json") ? "application/json" : path.endsWith(".csv") ? "text/csv" : "application/octet-stream";
          res.setHeader("Content-Type", `${type}; charset=utf-8`);
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch {
          next();
        }
      });

      // `bun run verificar` turns this off: scrapers writing data mid-run would reload the pages under test.
      if (process.env.MT_NO_DATA_WATCH) return;
      server.watcher.add(watched);
      server.watcher.on("all", (_event, path) => {
        if (!watched.some((w) => path.startsWith(w))) return;
        // Los scrapers escriben muchos archivos seguidos: se espera a que terminen.
        clearTimeout(timer);
        timer = setTimeout(rebuild, 800);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), liveData()],
  server: {
    // public/data se regenera entero: que Vite no recargue por cada archivo que escribe el script.
    watch: { ignored: ["**/public/data/**"] },
  },
});
