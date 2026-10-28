-- La conversación que votó la persona, para revisar las respuestas de Aco y sumar casos a las evals
-- (docs/procesos/asistente.md#opiniones). Aplicar con:
--   cd apps/web && wrangler d1 migrations apply mendoza-transparente --remote
--
-- JSON con los mensajes hasta la respuesta votada ({ role, content }), los mismos que ya viajaron al modelo: hasta 12,
-- de 500 caracteres. En los mensajes de la persona se tapan antes de guardar los correos, los CUIT y los números
-- largos (DNI, teléfonos). Como la nota, nunca se publica ni va a la analítica: el panel la abre de a una y lo audita.

ALTER TABLE assistant_feedback ADD COLUMN conversation TEXT;
