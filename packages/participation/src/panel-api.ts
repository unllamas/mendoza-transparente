/**
 * Panel API (/api/panel/*): the team's inbox. Only reachable with an `Actor`, which the Pages Function gets
 * from `verifyAccess` (access.ts) and the Vite dev server makes up locally; this module never decides who
 * is logged in. Documented in docs/procesos/panel.md.
 */

import type { Actor } from "./access.ts";
import type { Db } from "./db.ts";
import { error, json, pathOf, readBody } from "./http.ts";
import { privacyWarnings } from "./privacy.ts";
import { normalizeCode } from "./secrets.ts";
import {
  addNote,
  anonymize,
  audit,
  auditLog,
  inbox,
  panelStats,
  purgeOldIpHashes,
  REVIEW_STATUSES,
  reviewAnswer,
  SUBMISSION_TYPES,
  type SubmissionPatch,
  submission,
  updateSubmission,
} from "./store.ts";
import { isoDate, longText, pick, tags, text } from "./validation.ts";

const REQUEST_STATUSES = ["presentado", "respondido", "parcial", "denegado", "sin_respuesta"] as const;

/**
 * Writes need a same-origin JSON request. The Access cookie travels with any request to the panel, so
 * without this a page elsewhere could make a logged-in browser change things (CSRF). A cross-site form
 * cannot send `application/json`, and the browser always sends `Origin` on these methods.
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin && (req.headers.get("content-type") ?? "").startsWith("application/json");
}

/** Spreadsheets run cells that start with = + - @ as formulas: prefix them so an export cannot run anything. */
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function handlePanel(req: Request, db: Db, actor: Actor): Promise<Response | null> {
  const path = pathOf(req);
  if (!path.startsWith("/api/panel")) return null;
  const now = new Date();
  const at = now.toISOString();
  const params = new URL(req.url).searchParams;

  if (req.method !== "GET" && !sameOrigin(req)) return error("Pedido rechazado: tiene que salir del panel.", 403);

  if (req.method === "GET") {
    if (path === "/api/panel/me") return json({ email: actor.email });

    if (path === "/api/panel/inbox" || path === "/api/panel/export.csv") {
      const filter = {
        reviewStatus: pick(params.get("status"), REVIEW_STATUSES) ?? ("all" as const),
        type: pick(params.get("type"), SUBMISSION_TYPES) ?? ("all" as const),
        q: text(params.get("q"), 100),
        from: isoDate(params.get("from")),
        to: isoDate(params.get("to")),
      };
      if (path === "/api/panel/inbox") {
        await purgeOldIpHashes(db, now);
        return json(await inbox(db, filter, now));
      }
      // The export leaves the panel: it carries no emails and no filing numbers, and it is audited.
      const { items } = await inbox(db, filter, now);
      await audit(db, actor.email, "export", null, { ...filter, rows: items.length }, at);
      const columns = [
        "code",
        "type",
        "createdAt",
        "reviewStatus",
        "isPublic",
        "itemId",
        "context",
        "requestStatus",
        "filedOn",
        "overdue",
        "preview",
      ] as const;
      const csv = [columns.join(","), ...items.map((i) => columns.map((c) => csvCell(i[c])).join(","))].join("\n");
      return new Response(`﻿${csv}\n`, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="envios-${at.slice(0, 10)}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    if (path.startsWith("/api/panel/items/")) {
      const code = normalizeCode(path.slice("/api/panel/items/".length));
      const item = code ? await submission(db, code, now) : null;
      return item ? json(item) : error("No existe ese envío.", 404);
    }
    if (path === "/api/panel/stats") return json(await panelStats(db, now));
    if (path === "/api/panel/audit") return json(await auditLog(db, 300));
    return error("No existe", 404);
  }

  const body = await readBody(req);
  if (!body) return error("El pedido llegó vacío o mal armado.", 400);

  const answerMatch = path.match(/^\/api\/panel\/answers\/(\d+)$/);
  if (answerMatch && req.method === "POST") {
    const action = pick(body.action, ["apply", "reject"] as const);
    if (!action) return error("Falta qué hacer con la respuesta.", 400);
    const code = await reviewAnswer(db, Number(answerMatch[1]), action, actor.email, at);
    if (!code) return error("Esa respuesta no existe o ya se revisó.", 404);
    await audit(db, actor.email, action === "apply" ? "answer.apply" : "answer.reject", code, { answerId: Number(answerMatch[1]) }, at);
    return json(await submission(db, code, now));
  }

  const itemMatch = path.match(/^\/api\/panel\/items\/([^/]+)(\/notes|\/anonymize)?$/);
  const code = itemMatch ? normalizeCode(itemMatch[1]) : null;
  if (!itemMatch || !code) return error("No existe", 404);
  const current = await submission(db, code, now);
  if (!current) return error("No existe ese envío.", 404);

  if (itemMatch[2] === "/notes" && req.method === "POST") {
    const note = longText(body.body, 4000);
    if (!note) return error("La nota está vacía.", 400);
    await addNote(db, code, actor.email, note, at);
    await audit(db, actor.email, "note", code, {}, at);
    return json(await submission(db, code, now), 201);
  }

  if (itemMatch[2] === "/anonymize" && req.method === "POST") {
    // Irreversible: the client has to send the code back, typed, as confirmation.
    if (normalizeCode(body.confirm) !== code) return error("Para anonimizar, escribí el código del envío.", 400);
    await anonymize(db, code, at);
    await audit(db, actor.email, "anonymize", code, {}, at);
    return json(await submission(db, code, now));
  }

  if (!itemMatch[2] && req.method === "PATCH") {
    const patch: SubmissionPatch = {};
    if ("reviewStatus" in body) {
      const v = pick(body.reviewStatus, REVIEW_STATUSES);
      if (!v) return error("Estado de revisión no válido.", 400);
      patch.reviewStatus = v;
    }
    if ("isPublic" in body) {
      if (typeof body.isPublic !== "boolean") return error("Publicar tiene que ser sí o no.", 400);
      patch.isPublic = body.isPublic;
    }
    if ("publicSummary" in body) patch.publicSummary = longText(body.publicSummary, 600);
    if ("tags" in body) {
      const t = tags(body.tags);
      if (!t) return error("Etiquetas no válidas.", 400);
      patch.tags = t;
    }
    if (current.request) {
      if ("agencyNormalized" in body) patch.agencyNormalized = text(body.agencyNormalized, 200);
      if ("requestStatus" in body) {
        const v = pick(body.requestStatus, REQUEST_STATUSES);
        if (!v) return error("Estado del pedido no válido.", 400);
        patch.requestStatus = v;
      }
      if ("answeredOn" in body) patch.answeredOn = isoDate(body.answeredOn);
    }

    // What the item would look like after the change, to check the publishing rules on the final state.
    const next = {
      reviewStatus: patch.reviewStatus ?? current.reviewStatus,
      isPublic: patch.isPublic ?? current.isPublic,
      publicSummary: patch.publicSummary !== undefined ? patch.publicSummary : current.publicSummary,
    };
    let warnings: string[] = [];
    if (next.isPublic) {
      if (next.reviewStatus === "spam" || next.reviewStatus === "discarded")
        return error("Lo descartado o marcado como spam no se publica.", 409);
      if (current.feedback) {
        if (current.type !== "error" && current.type !== "data") return error("Solo se publican errores y sugerencias de datos.", 409);
        if (next.reviewStatus !== "resolved") return error("Un reporte se publica cuando está resuelto.", 409);
      }
      if (!next.publicSummary && (current.feedback || current.request?.itemId === "otro"))
        return error("Escribí el resumen público antes de publicar: el texto original no se publica nunca.", 409);
      warnings = privacyWarnings(next.publicSummary);
      if (warnings.length && body.acknowledgeWarnings !== true)
        return json(
          { error: "El resumen público parece tener datos personales. Revisalo o confirmá que se puede publicar.", warnings },
          409,
        );
    }

    const changed = await updateSubmission(db, code, patch, actor.email, at);
    if (changed)
      await audit(db, actor.email, "update", code, { ...patch, ...(warnings.length ? { acknowledgedWarnings: warnings } : {}) }, at);
    return json(await submission(db, code, now));
  }

  return error("Método no permitido", 405);
}
