-- Consumo del asistente (Aco): de la entrada, cuántos tokens salieron de la caché de prompt, y de la salida, cuántos
-- fueron razonamiento que no se ve (docs/procesos/asistente.md#consumo). Los informa OpenRouter en `usage`. Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
-- Aplicarla antes de desplegar: sin las columnas, el consumo de cada respuesta no se guarda (queda el log).

ALTER TABLE assistant_calls ADD COLUMN cached_tokens INTEGER;
ALTER TABLE assistant_calls ADD COLUMN reasoning_tokens INTEGER;
