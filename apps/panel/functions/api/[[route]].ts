/**
 * Cloudflare Pages Function for /api/*: the panel API (@mt/participation/panel-api) over D1, only for
 * whoever carries a valid Cloudflare Access token for an email on PANEL_EMAILS. Without configuration,
 * nobody gets in. Bindings: DB (D1); secrets ACCESS_TEAM_DOMAIN, ACCESS_AUD and PANEL_EMAILS.
 */

import { parseAllowedEmails, verifyAccess } from "@mt/participation/access";
import type { Db } from "@mt/participation/db";
import { error } from "@mt/participation/http";
import { handlePanel } from "@mt/participation/panel-api";

interface PagesEnv {
  DB: Db;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  PANEL_EMAILS?: string;
}

export const onRequest = async (ctx: { request: Request; env: PagesEnv }): Promise<Response> => {
  const actor = await verifyAccess(ctx.request, {
    teamDomain: ctx.env.ACCESS_TEAM_DOMAIN ?? "",
    audience: ctx.env.ACCESS_AUD ?? "",
    allowedEmails: parseAllowedEmails(ctx.env.PANEL_EMAILS),
  }).catch(() => null);
  if (!actor) return error("Tu sesión no es válida o no tenés acceso al panel. Volvé a entrar.", 401);
  const res = await handlePanel(ctx.request, ctx.env.DB, actor);
  return res ?? error("No existe", 404);
};
