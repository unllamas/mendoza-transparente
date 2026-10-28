-- Límites de uso del asistente (Aco): un contador por ventana (ráfaga por IP, día por IP, conversación y día del
-- sitio), para cortar antes de llamar al modelo (packages/assistant/src/quota.ts,
-- docs/procesos/asistente.md#límites-contra-el-abuso-y-el-gasto). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- De la IP solo queda su hash con IP_SALT, dentro de `bucket`. Cada fila vence (`expires_at`) y la primera respuesta
-- de cada día borra las vencidas. No se publica.

CREATE TABLE IF NOT EXISTS assistant_quota (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_quota_expires ON assistant_quota (expires_at);
