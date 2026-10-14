import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDevDb } from "@mt/participation/local-db";
import { handlePanel } from "@mt/participation/panel-api";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parse } from "yaml";

const ROOT = join(import.meta.dirname, "..", "..");

/** `virtual:item-titles`: the title of each item in data/curado/no-publicado.yaml, to name what was requested. */
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
 * In development, the panel API runs here over the same local SQLite as the site (`.dev/`), as a made-up
 * team member. The login is only checked in production (functions/api/[[route]].ts): this plugin does not
 * exist in the build.
 */
function devApi(): Plugin {
  const db = openDevDb(join(ROOT, ".dev", "participation.sqlite"));
  return {
    name: "mt-panel-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res, next) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const origin = `http://${req.headers.host}`;
        const request = new Request(`${origin}/api${req.url ?? ""}`, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] ?? "", origin: req.headers.origin ?? "" },
          body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
        });
        const response = await handlePanel(request, await db, { email: "equipo@localhost" });
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
