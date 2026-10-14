/**
 * Public participation API (/api/*), the one the site calls: error reports, data requests, the
 * access-to-information requests people file with the Government (Ley 9070) and the State's answer, and the
 * public registry of what the team reviewed and published. Runs as a Cloudflare Pages Function over D1
 * (apps/web/functions/api/[[route]].ts) and as a Vite dev middleware over SQLite (apps/web/vite.config.ts).
 * Documented in docs/procesos/participacion.md.
 *
 * Privacy: emails, filing numbers and free text are never returned. IPs are kept only as a salted hash, for
 * the hourly rate limit, and erased after 30 days.
 */

import type { Db } from "./db.ts";
import { error, json, pathOf, readBody } from "./http.ts";
import { newEditKey, normalizeCode, normalizeEditKey, sameHash, sha256 } from "./secrets.ts";
import {
  ANSWER_STATUSES,
  addAnswer,
  addFeedback,
  addRequest,
  countRecent,
  publicRegistry,
  publicSubmission,
  requestByCode,
  requestStats,
  requestsByFilingNumber,
} from "./store.ts";
import { email, filingNumber, isoDate, longText, pick, text, url } from "./validation.ts";

export interface PublicEnv {
  /** Cloudflare Turnstile secret. */
  turnstileSecret?: string;
  /** Salt for hashing IPs. */
  ipSalt?: string;
  /**
   * Only the Vite dev server sets this. Without it, a missing secret stops every submission instead of
   * silently skipping the anti-spam check (fail closed).
   */
  development?: boolean;
}

const MAX_PER_HOUR = 10;

async function verifyTurnstile(token: unknown, ip: string, env: PublicEnv): Promise<boolean> {
  if (!env.turnstileSecret) return env.development === true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new FormData();
  body.set("secret", env.turnstileSecret);
  body.set("response", token);
  body.set("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && ((await r.json()) as { success?: boolean }).success === true;
}

/** Handles /api/* requests. Returns null for paths it does not own (the panel's, for instance). */
export async function handlePublic(req: Request, db: Db, env: PublicEnv, ip: string): Promise<Response | null> {
  const path = pathOf(req);
  if (!path.startsWith("/api/") || path.startsWith("/api/panel")) return null;
  const now = new Date();

  if (req.method === "GET") {
    if (path === "/api/pedidos/stats") return json(await requestStats(db, now), 200, "public, max-age=60");
    if (path === "/api/registro") return json(await publicRegistry(db, now), 200, "public, max-age=60");
    if (path.startsWith("/api/registro/")) {
      const code = normalizeCode(decodeURIComponent(path.slice("/api/registro/".length)));
      const found = code ? await publicSubmission(db, code, now) : null;
      // Same answer for "does not exist" and "not published": a code cannot be used to learn what is pending.
      return found ? json(found, 200, "public, max-age=60") : error("No hay ningún envío publicado con ese código.", 404);
    }
    return error("No existe", 404);
  }
  if (req.method !== "POST") return error("Método no permitido", 405);

  if (!env.development && (!env.turnstileSecret || !env.ipSalt))
    return error("Los envíos están en pausa por mantenimiento. Probá de nuevo en un rato.", 503);

  const body = await readBody(req);
  if (!body) return error("El formulario llegó vacío o mal armado.", 400);
  if (typeof body.website === "string" && body.website) return json({ ok: true }); // honeypot: bots fill every field
  if (!(await verifyTurnstile(body.token, ip, env))) return error("No pudimos verificar que no seas un robot. Probá de nuevo.", 403);

  const ipHash = await sha256(`${env.ipSalt ?? "dev"}:${ip}`);
  if ((await countRecent(db, ipHash, new Date(now.getTime() - 3600e3).toISOString())) >= MAX_PER_HOUR)
    return error("Recibimos muchos envíos desde tu conexión. Probá de nuevo en una hora.", 429);
  const createdAt = now.toISOString();
  const today = createdAt.slice(0, 10);

  if (path === "/api/feedback") {
    const kind = pick(body.kind, ["error", "dato", "otro"] as const);
    const message = longText(body.message, 2000);
    if (!kind || !message || message.length < 10) return error("Contanos un poco más (al menos 10 caracteres).", 400);
    const code = await addFeedback(db, { kind, message, page: text(body.page, 300), email: email(body.email), ipHash, createdAt });
    return json({ ok: true, code }, 201);
  }

  if (path === "/api/pedidos") {
    const itemId = text(body.itemId, 80);
    const filedOn = isoDate(body.filedOn);
    const number = filingNumber(body.filingNumber);
    if (!itemId || !/^[a-z0-9-]+$/.test(itemId) || !filedOn || !number)
      return error("Faltan el dato pedido, la fecha o el número de trámite (o el número no es válido).", 400);
    if (filedOn > today || filedOn < "2016-01-01") return error("La fecha de presentación no es válida.", 400);
    const key = newEditKey();
    const code = await addRequest(db, {
      itemId,
      agency: text(body.agency, 200),
      filedOn,
      filingNumber: number,
      detail: longText(body.detail, 1000),
      email: email(body.email),
      editKeyHash: await sha256(normalizeEditKey(key) ?? key),
      ipHash,
      createdAt,
    });
    // The key is returned only here, once. Only its hash is stored.
    return code ? json({ ok: true, code, key }, 201) : error("Ese número de trámite ya está registrado para este dato.", 409);
  }

  if (path === "/api/pedidos/respuesta") {
    const status = pick(body.status, ANSWER_STATUSES);
    if (!status) return error("Contanos qué pasó con el pedido.", 400);
    const answeredOn = isoDate(body.answeredOn);
    if (answeredOn && (answeredOn > today || answeredOn < "2016-01-01")) return error("La fecha de la respuesta no es válida.", 400);
    const answer = { status, answeredOn, summary: longText(body.summary, 2000), url: url(body.url), ipHash, createdAt };

    // With the code and the key the request was registered with, the answer counts right away.
    const code = normalizeCode(body.code);
    if (code) {
      const key = normalizeEditKey(body.key);
      const ref = await requestByCode(db, code);
      if (!key || !ref?.editKeyHash || !sameHash(await sha256(key), ref.editKeyHash))
        return error("El código o la clave no coinciden. Revisalos o contanos la respuesta con el número de trámite.", 403);
      if (answeredOn && answeredOn < ref.filedOn) return error("La respuesta no puede ser anterior a la presentación del pedido.", 400);
      await addAnswer(db, ref.id, { ...answer, verified: true });
      return json({ ok: true, applied: true });
    }

    // Only the filing number (requests registered before the keys, or a lost key): the team checks it first.
    // Before, this changed the status directly, so anyone who knew a filing number could rewrite it.
    const number = filingNumber(body.filingNumber);
    if (!number) return error("Falta el código del pedido o el número de trámite.", 400);
    const refs = await requestsByFilingNumber(db, number);
    if (!refs.length) return error("No encontramos ese número de trámite. ¿Lo registraste antes?", 404);
    for (const ref of refs) await addAnswer(db, ref.id, { ...answer, verified: false });
    return json({ ok: true, applied: false }, 202);
  }

  return error("No existe", 404);
}
