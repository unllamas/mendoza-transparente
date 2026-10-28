-- Consumo del asistente (Aco): una fila por respuesta y una por cada llamada al modelo, para ver en el panel cuánto
-- gasta, qué modelos se usan y cuánto fallan los proveedores (docs/procesos/asistente.md#consumo). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- Sin texto de la conversación ni IP: solo modelo, tokens, costo, tiempo y el resultado de la respuesta. No se publica.
-- `cost_usd` es el costo que informa el proveedor; si viene vacío, el panel lo estima con los precios públicos.

CREATE TABLE IF NOT EXISTS assistant_answers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  -- "web" (el widget) o "evals" (bun run asistente:evals contra una vista previa).
  source TEXT NOT NULL DEFAULT 'web',
  ok INTEGER NOT NULL,
  outcome TEXT,
  flow TEXT,
  municipality TEXT,
  calls INTEGER NOT NULL,
  ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_answers_created ON assistant_answers (created_at);

CREATE TABLE IF NOT EXISTS assistant_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  task TEXT NOT NULL CHECK (task IN ('tools', 'answer')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_calls_created ON assistant_calls (created_at);
CREATE INDEX IF NOT EXISTS assistant_calls_answer ON assistant_calls (answer_id);
