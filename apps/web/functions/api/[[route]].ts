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

export const onRequest = async (ctx: { request: Request; env: PagesEnv }): Promise<Response> => {
  const ip = ctx.request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const res = await handlePublic(ctx.request, ctx.env.DB, { turnstileSecret: ctx.env.TURNSTILE_SECRET, ipSalt: ctx.env.IP_SALT }, ip);
  return res ?? new Response("No existe", { status: 404 });
};
