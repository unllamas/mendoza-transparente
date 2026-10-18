/**
 * The production D1 database over Cloudflare's HTTP API, for scripts that run on a team member's machine
 * (`bun run hallazgo`). The Pages Functions use their binding instead. Every value travels as a query
 * parameter, never inside the SQL.
 */

import type { Db, DbResult, DbStatement } from "./db.ts";

export interface RemoteD1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

interface QueryResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: { results: unknown[]; meta: { changes?: number; last_row_id?: number } }[];
}

export function remoteD1(config: RemoteD1Config): Db {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  async function query(sql: string, params: unknown[]): Promise<DbResult<unknown>> {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params: params.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)) }),
    });
    const data = (await r.json().catch(() => null)) as QueryResponse | null;
    const first = data?.result?.[0];
    // Only Cloudflare's message: never the token or the parameters.
    if (!r.ok || !data?.success || !first)
      throw new Error(`D1 respondió ${r.status}: ${data?.errors?.map((e) => e.message).join("; ") ?? "sin detalle"}`);
    return { results: first.results, meta: { changes: first.meta.changes ?? 0, last_row_id: first.meta.last_row_id } };
  }
  return {
    prepare(sql) {
      const make = (params: unknown[]): DbStatement => ({
        bind: (...values) => make(values),
        run: () => query(sql, params),
        async all<T>() {
          return (await query(sql, params)) as DbResult<T>;
        },
        async first<T>() {
          return ((await query(sql, params)).results[0] ?? null) as T | null;
        },
      });
      return make([]);
    },
  };
}
