-- Opiniones sobre las respuestas del asistente de la guía de trámites (docs/procesos/asistente.md). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- Un voto por respuesta, con el motivo del 👎 y una nota opcional que escribe la persona. La nota es texto libre y
-- puede traer datos personales: nunca se publica ni va a la analítica; se revisa desde el panel antes de usarla.
-- No se guarda la IP ni el texto de la conversación.

CREATE TABLE IF NOT EXISTS assistant_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  reason TEXT CHECK (reason IN ('dato', 'respuesta', 'falta')),
  note TEXT,
  flow TEXT,
  municipality TEXT,
  outcome TEXT
);
CREATE INDEX IF NOT EXISTS assistant_feedback_created ON assistant_feedback (created_at);
