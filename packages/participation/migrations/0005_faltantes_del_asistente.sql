-- Lo que la gente le pide al asistente de la guía de trámites y todavía no tenemos (docs/procesos/asistente.md).
-- Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- Una fila por faltante: un municipio sin relevar, un rubro que no está en la lista de ese municipio o un trámite que no
-- cubrimos. `value` es el rubro o el trámite en pocas palabras, normalizado y cortado a 60 caracteres. No se guarda la
-- IP ni el texto de la conversación. Sirve para decidir qué relevar primero; no se publica.

CREATE TABLE IF NOT EXISTS assistant_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('municipio', 'rubro', 'tramite')),
  municipality TEXT,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_gaps_created ON assistant_gaps (created_at);
