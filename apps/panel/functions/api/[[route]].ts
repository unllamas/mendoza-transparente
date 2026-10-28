/**
 * Pages Function de Cloudflare para /api/*: la API del panel (@mt/participation/panel-api) sobre D1, solo para quien
 * trae un token válido de Cloudflare Access de un correo de PANEL_EMAILS. Sin configuración, no entra nadie.
 * Bindings: DB (D1); secretos ACCESS_TEAM_DOMAIN, ACCESS_AUD y PANEL_EMAILS.
 */

import { parseAllowedEmails, verifyAccess } from "@mt/participation/access";
import { loadModelPrices, type PriceFetcher } from "@mt/participation/assistant-usage";
import type { Db } from "@mt/participation/db";
import { error } from "@mt/participation/http";
import { handlePanel } from "@mt/participation/panel-api";

interface PagesEnv {
  DB: Db;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  PANEL_EMAILS?: string;
}

/**
 * El catálogo de precios de OpenRouter, guardado un día en el caché del borde: se pide al abrir el consumo de Aco,
 * no en cada carga del panel.
 */
const cachedFetch: PriceFetcher = async (url, init) => {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(url);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = await fetch(url, init);
  if (res.ok && cache) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set("cache-control", "public, max-age=86400");
    await cache.put(key, copy);
  }
  return res;
};

export const onRequest = async (ctx: { request: Request; env: PagesEnv }): Promise<Response> => {
  const actor = await verifyAccess(ctx.request, {
    teamDomain: ctx.env.ACCESS_TEAM_DOMAIN ?? "",
    audience: ctx.env.ACCESS_AUD ?? "",
    allowedEmails: parseAllowedEmails(ctx.env.PANEL_EMAILS),
  }).catch(() => null);
  if (!actor) return error("Tu sesión no es válida o no tenés acceso al panel. Volvé a entrar.", 401);
  const res = await handlePanel(ctx.request, ctx.env.DB, actor, { modelPrices: () => loadModelPrices(cachedFetch) });
  return res ?? error("No existe", 404);
};
