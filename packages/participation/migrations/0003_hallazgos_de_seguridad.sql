-- Hallazgos de seguridad (docs/procesos/seguridad.md). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- Problemas de seguridad en sitios del Estado que el equipo encuentra mientras releva fuentes, para
-- reportarlos a quien corresponde. Nunca se publican: esta tabla no tiene is_public, ninguna consulta
-- pública la lee y no sale en el CSV exportado.
-- La descripción dice dónde está el problema y cómo se ve, sin copiar los datos expuestos.

CREATE TABLE IF NOT EXISTS security_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL,
  agency TEXT,
  location TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('personal_data', 'vulnerability', 'misconfiguration', 'compromised_site', 'other')),
  exposes_personal_data INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reported', 'acknowledged', 'fixed', 'discarded')),
  reported_to TEXT,
  reported_on TEXT,
  report_reference TEXT,
  fixed_on TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS security_findings_status ON security_findings (status, created_at);
