/**
 * Cloudflare Pages Function for /api/*: the participation API (server/participation.ts) over D1.
 * Bindings (wrangler.toml and the Pages dashboard): DB (D1), TURNSTILE_SECRET and IP_SALT (secrets).
 */

import { handle, type Store } from "../../server/participation.ts";

// Minimal D1 types, to avoid a dependency on @cloudflare/workers-types.
interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<D1Result<unknown>>;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
}
interface PagesEnv {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  IP_SALT?: string;
}

function d1Store(db: D1Database): Store {
  return {
    async addFeedback(f) {
      await db
        .prepare("INSERT INTO feedback (created_at, kind, message, page, email, ip_hash) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(f.createdAt, f.kind, f.message, f.page, f.email, f.ipHash)
        .run();
    },
    async addRequest(r) {
      const res = await db
        .prepare(
          "INSERT OR IGNORE INTO pedidos (created_at, item_id, organismo, fecha_presentacion, tramite, detalle, email, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(r.createdAt, r.itemId, r.agency, r.filedOn, r.filingNumber, r.detail, r.email, r.ipHash)
        .run();
      return res.meta.changes > 0;
    },
    async answerRequest(a) {
      const res = await db
        .prepare(
          "UPDATE pedidos SET estado = ?, fecha_respuesta = ?, respuesta_resumen = ?, respuesta_url = ?, updated_at = ? WHERE tramite = ?",
        )
        .bind(a.status, a.answeredOn, a.summary, a.url, a.updatedAt, a.filingNumber)
        .run();
      return res.meta.changes;
    },
    async listRequests() {
      const { results } = await db
        .prepare("SELECT item_id AS itemId, fecha_presentacion AS filedOn, estado AS status FROM pedidos")
        .all<{ itemId: string; filedOn: string; status: "presentado" }>();
      return results;
    },
    async countRecent(ipHash, since) {
      const row = await db
        .prepare(
          "SELECT (SELECT COUNT(*) FROM feedback WHERE ip_hash = ?1 AND created_at >= ?2) + (SELECT COUNT(*) FROM pedidos WHERE ip_hash = ?1 AND created_at >= ?2) AS n",
        )
        .bind(ipHash, since)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },
  };
}

export const onRequest = async (ctx: { request: Request; env: PagesEnv }): Promise<Response> => {
  const ip = ctx.request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const res = await handle(
    ctx.request,
    d1Store(ctx.env.DB),
    { turnstileSecret: ctx.env.TURNSTILE_SECRET, ipSalt: ctx.env.IP_SALT ?? "mt" },
    ip,
  );
  return res ?? new Response("No existe", { status: 404 });
};
