import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// Relative paths, not "@mt/participation": Vite leaves workspace packages out of the config bundle, and the Node
// of Cloudflare's build (22.16) cannot load .ts files from node_modules.
import { handleAssistant } from "../../packages/assistant/src/http.ts";
import knowledge from "../../packages/assistant/src/knowledge.json";
import type { Knowledge } from "../../packages/assistant/src/knowledge.ts";
import type { AssistantEnv } from "../../packages/assistant/src/providers.ts";
import type { Db } from "../../packages/participation/src/db.ts";
import { openDevDb } from "../../packages/participation/src/local-db.ts";
import { handlePublic } from "../../packages/participation/src/public-api.ts";

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

/**
 * In development, the participation API (/api/*) runs here over a local SQLite in `.dev/`, shared with the
 * panel (apps/panel), with example submissions. Delete the file to start over. The assistant (/api/asistente) too.
 */
function devApi(): Plugin {
  // Opened when the dev server starts, never during the build.
  let db: Promise<Db> | null = null;
  return {
    name: "mt-dev-api",
    apply: "serve",
    configureServer(server) {
      db = openDevDb(join(ROOT, ".dev", "participation.sqlite"));
      server.middlewares.use("/api", async (req, res, next) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const request = new Request(`http://localhost/api${req.url ?? ""}`, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] ?? "application/json" },
          body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        // The assistant answers here too: without keys in the environment it says it is off; with them
        // (AI_GATEWAY_API_KEY or OPENROUTER_API_KEY, for example `bun --env-file=../../.env.asistente run dev`) it works locally.
        const response =
          (await handleAssistant(request, {
            knowledge: knowledge as unknown as Knowledge,
            env: process.env as AssistantEnv,
            db: await db!,
            log: console.log,
          })) ?? (await handlePublic(request, await db!, { development: true }, req.socket.remoteAddress ?? "127.0.0.1"));
        if (!response) return next();
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), liveData(), devApi()],
  // `@/…` is apps/web/src (same alias as tsconfig.json): imports do not break when a file moves.
  resolve: { alias: { "@": join(import.meta.dirname, "src") } },
  // Source maps: the repo is public, and they let anyone (and Lighthouse) read the production code.
  // manifest: which chunks each page imports, for the preloads that scripts/seo.ts writes in each page's HTML.
  build: { sourcemap: true, manifest: true },
  server: {
    // public/data se regenera entero: que Vite no recargue por cada archivo que escribe el script.
    watch: { ignored: ["**/public/data/**"] },
  },
});
