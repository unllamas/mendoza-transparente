-- Participación ciudadana (docs/procesos/participacion.md). Aplicar con:
--   wrangler d1 migrations apply mendoza-transparente --remote

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('error', 'dato', 'otro')),
  message TEXT NOT NULL,
  page TEXT,
  email TEXT,
  ip_hash TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  item_id TEXT NOT NULL,
  organismo TEXT,
  fecha_presentacion TEXT NOT NULL,
  tramite TEXT NOT NULL,
  detalle TEXT,
  email TEXT,
  ip_hash TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'presentado' CHECK (estado IN ('presentado', 'respondido', 'parcial', 'denegado', 'sin_respuesta')),
  fecha_respuesta TEXT,
  respuesta_resumen TEXT,
  respuesta_url TEXT,
  updated_at TEXT,
  UNIQUE (item_id, tramite)
);

CREATE INDEX IF NOT EXISTS pedidos_tramite ON pedidos (tramite);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS pedidos_ip ON pedidos (ip_hash, created_at);
