/**
 * Cloudflare Pages Function para /api/*: la API pública de participación (@mt/participation/public-api) sobre D1, y
 * el asistente (@mt/assistant/http) en /api/asistente, que lee /data/asistente.json desde ASSETS.
 * Bindings (wrangler.toml y el panel de Pages): DB (D1), TURNSTILE_SECRET e IP_SALT (secretos). Sin los
 * secretos, los envíos responden 503 en vez de saltearse los controles. La API del panel no se sirve acá.
 * Secretos del asistente: AI_GATEWAY_API_KEY y OPENROUTER_API_KEY (con cualquiera se enciende;
 * docs/procesos/asistente.md); ASSISTANT_TURNSTILE=on reutiliza TURNSTILE_SECRET para verificar a la gente una vez
 * por conversación.
 */

import { handleAssistant } from "@mt/assistant/http";
import type { Knowledge } from "@mt/assistant/knowledge";
import knowledge from "@mt/assistant/knowledge.json";
import type { AssistantEnv } from "@mt/assistant/providers";
import type { SiteData } from "@mt/assistant/site-data";
import type { Db } from "@mt/participation/db";
import { handlePublic, verifyTurnstile } from "@mt/participation/public-api";

interface PagesEnv extends AssistantEnv {
  DB: Db;
  /** Los archivos estáticos del sitio: Aco lee /data/asistente.json de acá (sin pedido extra, sin cupo). */
  ASSETS?: { fetch(request: Request | string): Promise<Response> };
  TURNSTILE_SECRET?: string;
  IP_SALT?: string;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

// Solo en el runtime de Workers: Bun y los tests no tienen `caches.default`.
const edgeCache = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;

/**
 * Lo que Aco sabe del sitio, leído una vez por isolate de los archivos estáticos del propio deploy. Una lectura
 * fallida no se guarda, así que la próxima pregunta lo intenta de nuevo.
 */
let siteData: Promise<SiteData | null> | null = null;
function loadSiteData(env: PagesEnv, url: string): Promise<SiteData | null> {
  if (!env.ASSETS) return Promise.resolve(null);
  siteData ??= env.ASSETS.fetch(new URL("/data/asistente.json", url).toString())
    .then((r) => (r.ok ? (r.json() as Promise<SiteData>) : null))
    .catch(() => null)
    .then((d) => {
      if (!d) siteData = null;
      return d;
    });
  return siteData;
}

export const onRequest = async (ctx: {
  request: Request;
  env: PagesEnv;
  waitUntil(promise: Promise<unknown>): void;
}): Promise<Response> => {
  const { request } = ctx;
  // Los GET públicos llevan "public, max-age=60": se guardan en el caché de este centro de datos para que un crawler o
  // un pico lea D1 una vez por minuto en vez de una por pedido (docs/planes/consumo-de-cloudflare.md, etapa 6).
  const cacheable = request.method === "GET" && edgeCache !== undefined;
  if (cacheable) {
    const hit = await edgeCache.match(request);
    if (hit) return hit;
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const res =
    (await handleAssistant(request, {
      knowledge: knowledge as unknown as Knowledge,
      env: ctx.env,
      db: ctx.env.DB,
      siteData: () => loadSiteData(ctx.env, request.url),
      log: console.log,
      verifyHuman: (token) => verifyTurnstile(token, ip, { turnstileSecret: ctx.env.TURNSTILE_SECRET }),
      passKey: ctx.env.TURNSTILE_SECRET,
      waitUntil: (p) => ctx.waitUntil(p),
    })) ??
    (await handlePublic(request, ctx.env.DB, { turnstileSecret: ctx.env.TURNSTILE_SECRET, ipSalt: ctx.env.IP_SALT }, ip)) ??
    new Response("No existe", { status: 404 });
  if (cacheable && res.ok && res.headers.get("cache-control")?.startsWith("public")) ctx.waitUntil(edgeCache.put(request, res.clone()));
  return res;
};
