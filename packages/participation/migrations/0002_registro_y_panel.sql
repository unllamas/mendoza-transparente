-- Registro público y panel interno (docs/procesos/panel.md). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- Las columnas nuevas van en inglés (son código); las viejas quedan como estaban.
-- Nada se publica sin revisión: is_public arranca en 0 y solo lo cambia alguien del equipo desde el panel.

-- Pedidos de acceso a la información (Ley 9070)
ALTER TABLE pedidos ADD COLUMN code TEXT;
-- sha256 de la clave que recibe quien registra el pedido; sin ella, la respuesta queda para revisar.
ALTER TABLE pedidos ADD COLUMN edit_key_hash TEXT;
ALTER TABLE pedidos ADD COLUMN review_status TEXT NOT NULL DEFAULT 'new'
  CHECK (review_status IN ('new', 'in_review', 'resolved', 'discarded', 'spam'));
ALTER TABLE pedidos ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN public_summary TEXT;
ALTER TABLE pedidos ADD COLUMN agency_normalized TEXT;
ALTER TABLE pedidos ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE pedidos ADD COLUMN reviewed_at TEXT;
ALTER TABLE pedidos ADD COLUMN reviewed_by TEXT;
ALTER TABLE pedidos ADD COLUMN anonymized_at TEXT;

-- Errores, sugerencias y fotos
ALTER TABLE feedback ADD COLUMN code TEXT;
ALTER TABLE feedback ADD COLUMN review_status TEXT NOT NULL DEFAULT 'new'
  CHECK (review_status IN ('new', 'in_review', 'resolved', 'discarded', 'spam'));
ALTER TABLE feedback ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback ADD COLUMN public_summary TEXT;
ALTER TABLE feedback ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE feedback ADD COLUMN reviewed_at TEXT;
ALTER TABLE feedback ADD COLUMN reviewed_by TEXT;
ALTER TABLE feedback ADD COLUMN anonymized_at TEXT;

-- Códigos públicos aleatorios para lo que ya estaba cargado (los nuevos los genera la API).
UPDATE pedidos SET code = 'P-' || hex(randomblob(4)) WHERE code IS NULL;
UPDATE feedback SET code = 'R-' || hex(randomblob(4)) WHERE code IS NULL;
UPDATE feedback SET review_status = 'resolved' WHERE reviewed = 1;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_code ON pedidos (code);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_code ON feedback (code);
CREATE INDEX IF NOT EXISTS pedidos_public ON pedidos (is_public, fecha_presentacion);
CREATE INDEX IF NOT EXISTS feedback_public ON feedback (is_public, created_at);

-- Respuestas que cuenta la gente. Con la clave correcta se aplican al pedido; sin ella, esperan revisión.
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  request_id INTEGER NOT NULL REFERENCES pedidos (id),
  status TEXT NOT NULL CHECK (status IN ('respondido', 'parcial', 'denegado', 'sin_respuesta')),
  answered_on TEXT,
  summary TEXT,
  url TEXT,
  ip_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'applied', 'rejected')),
  reviewed_at TEXT,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS answers_request ON answers (request_id);
CREATE INDEX IF NOT EXISTS answers_pending ON answers (review_status);
CREATE INDEX IF NOT EXISTS answers_ip ON answers (ip_hash, created_at);

-- Notas internas del equipo sobre un envío. Nunca se publican.
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  author TEXT NOT NULL,
  target_code TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_target ON notes (target_code);

-- Auditoría: quién cambió qué. Solo se agrega; el panel no tiene forma de borrar.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_code TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_target ON audit_log (target_code);
