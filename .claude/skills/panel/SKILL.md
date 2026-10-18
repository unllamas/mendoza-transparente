---
name: panel
description: Panel interno de Mendoza Transparente (apps/panel) y registro público (/registro). Cubre login con Cloudflare Access y verificación del token, qué se publica y qué nunca, revisión de envíos, respuestas sin clave, anonimizar, auditoría y las amenazas cubiertas. Cargar al tocar apps/panel, packages/participation, la página /registro, la base D1 de participación o el acceso del equipo.
---

# Panel interno y registro público

Fuente completa: `docs/procesos/panel.md` (y `participacion.md` para la API pública).

## Reglas que no se negocian

1. **Nada se publica solo.** Lo publica alguien del equipo desde el panel (`is_public`), y el texto que mandó la persona no sale nunca tal cual: sale el `public_summary` que escribe el equipo.
2. **Lo público se elige campo por campo** en `publicRegistry` y `publicSubmission` (`packages/participation/src/store.ts`). Nunca `SELECT *` ni pasar una fila entera a una respuesta pública. Si se agrega un campo público, se suma a la prueba de claves de `participation.test.ts`.
3. **Nunca públicos:** correo, número de trámite, hash de IP, clave, notas, auditoría y el texto original.
4. **La API del panel solo recibe un `Actor`** que viene de `verifyAccess` (producción) o del plugin de desarrollo. No se agrega ningún otro camino de entrada ni un «modo sin login» en las funciones.
5. **Escrituras del panel:** mismo `Origin` y JSON (CSRF). Cada una deja una fila en `audit_log`.
6. **Links de terceros:** solo http(s), con `rel="noreferrer noopener nofollow"`. Nunca `dangerouslySetInnerHTML`.
7. **Hallazgos de seguridad** (`security_findings`, pantalla Seguridad): nunca públicos. Ninguna consulta pública ni el CSV los leen, y la auditoría guarda qué campos cambiaron, no el texto. Los agentes los cargan con `bun run hallazgo` (`report-finding.ts`, sobre la API de D1), que no corre en CI. Proceso completo, límites legales y a quién se reporta: `docs/procesos/seguridad.md`.
8. **Fallar cerrado:** sin configuración de Access no entra nadie, y sin los secretos de Turnstile o de la sal no se aceptan envíos.

## Antes de terminar

- Tipos: `bunx tsc --noEmit` en `packages/participation`, `apps/panel` y `apps/web`.
- `bun run lint:arch`: el sitio y el panel no se importan entre sí, y `local-db.ts` no llega al navegador.
- Pruebas: `bun test packages/participation`. Piden permiso; si no se pueden correr, decirlo.
- Interfaz: capturas del panel en 375 px y 1280 px (`bun run panel`) y de `/registro`.
- Cambio de esquema: migración nueva en `packages/participation/migrations/` (nunca editar una aplicada) y avisar que hay que aplicarla con `wrangler d1 migrations apply`.
