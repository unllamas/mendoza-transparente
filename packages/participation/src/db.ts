/**
 * The database the participation API talks to: the subset of Cloudflare D1 we use. In production it is D1
 * itself; in development and tests, a local SQLite (node:sqlite or bun:sqlite) wrapped by `fromSyncSqlite`, so
 * every query runs against the real schema in `migrations/`.
 */

export interface DbResult<T> {
  results: T[];
  meta: { changes: number; last_row_id?: number };
}
export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  run(): Promise<DbResult<unknown>>;
  all<T>(): Promise<DbResult<T>>;
  first<T>(): Promise<T | null>;
}
export interface Db {
  prepare(sql: string): DbStatement;
}

/** What node:sqlite's DatabaseSync and bun:sqlite's Database have in common. */
export interface SyncSqlite {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: never[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    all(...params: never[]): unknown[];
    get(...params: never[]): unknown;
  };
}

/** D1 accepts undefined and booleans; SQLite drivers do not. */
const toSqlite = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v) as never;

export function fromSyncSqlite(sqlite: SyncSqlite): Db {
  return {
    prepare(sql) {
      const make = (params: unknown[]): DbStatement => ({
        bind: (...values) => make(values),
        async run() {
          const r = sqlite.prepare(sql).run(...params.map(toSqlite));
          return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...params.map(toSqlite)) as T[], meta: { changes: 0 } };
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...params.map(toSqlite)) ?? null) as T | null;
        },
      });
      return make([]);
    },
  };
}

/**
 * Applies the migrations a local database has not seen yet, in name order. Production uses
 * `wrangler d1 migrations apply`; this is only for development and tests.
 */
export function migrateSyncSqlite(sqlite: SyncSqlite, migrations: { name: string; sql: string }[]) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS dev_migrations (name TEXT PRIMARY KEY)");
  const done = new Set((sqlite.prepare("SELECT name FROM dev_migrations").all() as { name: string }[]).map((r) => r.name));
  for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(m.name)) continue;
    sqlite.exec(m.sql);
    sqlite.prepare("INSERT INTO dev_migrations (name) VALUES (?)").run(m.name as never);
  }
}
