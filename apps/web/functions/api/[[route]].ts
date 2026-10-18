/**
 * Cloudflare Pages Function for /api/*: the public participation API (@mt/participation/public-api) over D1.
 * Bindings (wrangler.toml and the Pages dashboard): DB (D1), TURNSTILE_SECRET and IP_SALT (secrets). Without
 * the secrets, submissions answer 503 instead of skipping the checks. The panel API is not served here.
 */

import type { Db } from "@mt/participation/db";
import { handlePublic } from "@mt/participation/public-api";

interface PagesEnv {
  DB: Db;
  TURNSTILE_SECRET?: string;
  IP_SALT?: string;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

// Workers runtime only: Bun and the tests have no `caches.default`.
const edgeCache = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;

export const onRequest = async (ctx: {
  request: Request;
  env: PagesEnv;
  waitUntil(promise: Promise<unknown>): void;
}): Promise<Response> => {
  const { request } = ctx;
  // Public GETs carry "public, max-age=60": keep them in this data center's cache so a crawler or a spike
  // reads D1 once a minute instead of once per request (docs/planes/consumo-de-cloudflare.md, etapa 6).
  const cacheable = request.method === "GET" && edgeCache !== undefined;
  if (cacheable) {
    const hit = await edgeCache.match(request);
    if (hit) return hit;
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const res =
    (await handlePublic(request, ctx.env.DB, { turnstileSecret: ctx.env.TURNSTILE_SECRET, ipSalt: ctx.env.IP_SALT }, ip)) ??
    new Response("No existe", { status: 404 });
  if (cacheable && res.ok && res.headers.get("cache-control")?.startsWith("public")) ctx.waitUntil(edgeCache.put(request, res.clone()));
  return res;
};
