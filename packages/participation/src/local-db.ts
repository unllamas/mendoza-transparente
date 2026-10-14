/**
 * Local database for development and tests: SQLite with the same migrations as D1. Never imported by the
 * Pages Functions (it reads files from disk).
 */

import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Db, fromSyncSqlite, migrateSyncSqlite, type SyncSqlite } from "./db.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

export function localDb(sqlite: SyncSqlite): Db {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
  migrateSyncSqlite(sqlite, migrations);
  return fromSyncSqlite(sqlite);
}

/**
 * Opens (or creates) the shared development database: the site and the panel point to the same file, so
 * what you submit in one shows up in the other. node:sqlite under Node (Vite), bun:sqlite under Bun.
 */
export async function openDevDb(file: string): Promise<Db> {
  mkdirSync(dirname(file), { recursive: true });
  let sqlite: SyncSqlite;
  if (typeof Bun !== "undefined") {
    const { Database } = await import("bun:sqlite");
    sqlite = new Database(file) as unknown as SyncSqlite;
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    sqlite = new DatabaseSync(file) as unknown as SyncSqlite;
  }
  const db = localDb(sqlite);
  seedDevData(sqlite);
  return db;
}

/**
 * Example submissions so the panel and /registro have something to show in development. Only when the
 * database is empty; the texts are made up and say so.
 */
export function seedDevData(sqlite: SyncSqlite) {
  const n = (sqlite.prepare("SELECT (SELECT COUNT(*) FROM pedidos) + (SELECT COUNT(*) FROM feedback) AS n").get() as { n: number }).n;
  if (n > 0) return;
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const requests: [string, string, string, number, string, string | null, number, string | null][] = [
    [
      "P-DEV00001",
      "cuenta-general",
      "Contaduría General de la Provincia",
      40,
      "respondido",
      "Entregaron la cuenta de inversión 2025 en PDF.",
      1,
      "resolved",
    ],
    ["P-DEV00002", "nomina-sueldos", "Ministerio de Hacienda y Finanzas", 30, "presentado", null, 1, "in_review"],
    ["P-DEV00003", "ejecucion-detallada", "Min. Hacienda", 10, "presentado", null, 0, "new"],
    [
      "P-DEV00004",
      "otro",
      "Municipalidad de Godoy Cruz",
      25,
      "denegado",
      "Pedido de contratos de recolección de residuos. Lo negaron por «información reservada».",
      1,
      "resolved",
    ],
  ].map((r) => r as never);
  for (const [code, item, agency, ago, status, summary, isPublic, review] of requests)
    sqlite
      .prepare(
        `INSERT INTO pedidos (code, created_at, item_id, organismo, fecha_presentacion, tramite, detalle, email, ip_hash, estado, fecha_respuesta, public_summary, is_public, review_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dev', ?, ?, ?, ?, ?)`,
      )
      .run(
        ...([
          code,
          day(ago),
          item,
          agency,
          day(ago).slice(0, 10),
          `EX-2026-0${ago}123456-GDEMZA`,
          item === "otro" ? "Contratos de recolección de residuos 2024 y 2025 (texto de ejemplo)" : null,
          ago === 10 ? "vecina@example.com" : null,
          status,
          status === "presentado" ? null : day(ago - 12).slice(0, 10),
          summary,
          isPublic,
          review,
        ] as never[]),
      );
  const feedback: [string, string, string, string, string, string | null, number, string][] = [
    [
      "R-DEV00001",
      "error",
      "Ejemplo: el intendente de Rivadavia no es el que figura. Llamame al 261 555-1234",
      "/municipios/rivadavia",
      "resolved",
      "El intendente de Rivadavia figuraba según el acta de 2023; ahora se toma el sitio oficial del municipio.",
      1,
      "otro@example.com",
    ],
    ["R-DEV00002", "dato", "Ejemplo: falta la deuda flotante de los municipios", "/deuda", "new", null, 0, ""],
    ["R-DEV00003", "otro", "https://example.com/foto-aconcagua.jpg\nEjemplo de foto propuesta", "foto", "new", null, 0, ""],
    ["R-DEV00004", "error", "Ejemplo de spam: compre seguidores baratos", "/", "spam", null, 0, ""],
  ].map((r) => r as never);
  for (const [code, kind, message, page, review, summary, isPublic, mail] of feedback)
    sqlite
      .prepare(
        "INSERT INTO feedback (code, created_at, kind, message, page, email, ip_hash, review_status, public_summary, is_public, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, 'dev', ?, ?, ?, ?)",
      )
      .run(
        ...([code, day(3), kind, message, page, mail || null, review, summary, isPublic, review === "resolved" ? day(1) : null] as never[]),
      );
  sqlite
    .prepare(
      "INSERT INTO answers (created_at, request_id, status, answered_on, summary, ip_hash, verified, review_status) VALUES (?, (SELECT id FROM pedidos WHERE code = 'P-DEV00002'), 'parcial', ?, 'Mandaron solo la planta permanente (ejemplo)', 'dev', 0, 'pending')",
    )
    .run(...([day(1), day(1).slice(0, 10)] as never[]));
}
