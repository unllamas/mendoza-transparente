/**
 * API del panel (/api/panel/*): la bandeja del equipo. Solo se llega con un `Actor`, que la Pages Function saca
 * de `verifyAccess` (access.ts) y el servidor de desarrollo de Vite inventa en local; este módulo nunca decide quién
 * entró. Documentado en docs/procesos/panel.md.
 */

import type { Actor } from "./access.ts";
import { assistantFeedback, assistantFeedbackNote, assistantGaps } from "./assistant.ts";
import { assistantUsage, type ModelPrices } from "./assistant-usage.ts";
import type { Db } from "./db.ts";
import { error, json, pathOf, readBody } from "./http.ts";
import { privacyWarnings } from "./privacy.ts";
import { normalizeCode, normalizeFindingCode } from "./secrets.ts";
import {
  addFinding,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type FindingInput,
  finding,
  findings,
  updateFinding,
} from "./security.ts";
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
import { isoDate, longText, pick, tags, text, url } from "./validation.ts";

const REQUEST_STATUSES = ["presentado", "respondido", "parcial", "denegado", "sin_respuesta"] as const;

/**
 * Las escrituras piden un JSON del mismo origen. La cookie de Access viaja con cualquier pedido al panel, así que
 * sin esto una página de otro sitio podría hacer que un navegador con sesión cambie cosas (CSRF). Un formulario de
 * otro sitio no puede mandar `application/json`, y el navegador siempre manda `Origin` en estos métodos.
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

/**
 * Lee los campos de un hallazgo de seguridad que vienen en `body`. Un campo vacío lo borra; uno que no viene queda
 * como estaba. Devuelve un mensaje si algo no es válido.
 */
export function findingInput(body: Record<string, unknown>): FindingInput | string {
  const f: FindingInput = {};
  if ("title" in body) {
    const v = text(body.title, 200);
    if (!v) return "Falta el título.";
    f.title = v;
  }
  if ("description" in body) {
    const v = longText(body.description, 4000);
    if (!v) return "Falta la descripción.";
    f.description = v;
  }
  if ("kind" in body) {
    const v = pick(body.kind, FINDING_KINDS);
    if (!v) return "Tipo de problema no válido.";
    f.kind = v;
  }
  if ("severity" in body) {
    const v = pick(body.severity, FINDING_SEVERITIES);
    if (!v) return "Gravedad no válida.";
    f.severity = v;
  }
  if ("status" in body) {
    const v = pick(body.status, FINDING_STATUSES);
    if (!v) return "Estado no válido.";
    f.status = v;
  }
  if ("exposesPersonalData" in body) {
    if (typeof body.exposesPersonalData !== "boolean") return "«Expone datos personales» tiene que ser sí o no.";
    f.exposesPersonalData = body.exposesPersonalData;
  }
  if ("location" in body) {
    f.location = url(body.location);
    if (body.location && !f.location) return "La dirección tiene que empezar con http:// o https://.";
  }
  if ("agency" in body) f.agency = text(body.agency, 200);
  if ("reportedTo" in body) f.reportedTo = text(body.reportedTo, 200);
  if ("reportReference" in body) f.reportReference = text(body.reportReference, 100);
  if ("reportedOn" in body) f.reportedOn = isoDate(body.reportedOn);
  if ("fixedOn" in body) f.fixedOn = isoDate(body.fixedOn);
  return f;
}

/** Hallazgos de seguridad (/api/panel/security). Nunca se publican; la auditoría guarda qué campos cambiaron, no el texto. */
async function handleSecurity(req: Request, db: Db, actor: Actor, path: string, at: string): Promise<Response> {
  const code = path === "/api/panel/security" ? null : normalizeFindingCode(path.slice("/api/panel/security/".length));
  if (path !== "/api/panel/security" && !code) return error("No existe", 404);

  if (req.method === "GET") {
    if (!code) return json(await findings(db));
    const f = await finding(db, code);
    return f ? json(f) : error("No existe ese hallazgo.", 404);
  }

  const body = await readBody(req);
  if (!body) return error("El pedido llegó vacío o mal armado.", 400);
  const input = findingInput(body);
  if (typeof input === "string") return error(input, 400);
  const current = code ? await finding(db, code) : null;
  if (code && !current) return error("No existe ese hallazgo.", 404);

  const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  if (!next.title || !next.description || !next.kind) return error("Faltan el título, el tipo o la descripción.", 400);
  if ((next.status === "reported" || next.status === "acknowledged") && (!next.reportedTo || !next.reportedOn))
    return error("Para marcarlo como reportado, cargá a quién se reportó y en qué fecha.", 409);

  // El hallazgo describe dónde está el problema, nunca los datos expuestos.
  const warnings = privacyWarnings(input.title, input.description);
  if (warnings.length && body.acknowledgeWarnings !== true)
    return json(
      {
        error: "El texto parece tener datos personales. Describí qué tipo de dato queda expuesto, sin copiarlo, o confirmá que no lo es.",
        warnings,
      },
      409,
    );

  const fields = Object.keys(input).filter((k) => input[k as keyof FindingInput] !== undefined);
  const detail = {
    fields,
    ...(input.status ? { status: input.status } : {}),
    ...(warnings.length ? { acknowledgedWarnings: warnings } : {}),
  };
  if (!code && req.method === "POST") {
    const created = await addFinding(db, { ...input, title: next.title, kind: next.kind, description: next.description }, actor.email, at);
    await audit(db, actor.email, "security.create", created, detail, at);
    return json(await finding(db, created), 201);
  }
  if (code && req.method === "PATCH") {
    if (await updateFinding(db, code, input, actor.email, at)) await audit(db, actor.email, "security.update", code, detail, at);
    return json(await finding(db, code));
  }
  return error("Método no permitido", 405);
}

export interface PanelOptions {
  /** Precios públicos de los modelos, para estimar el costo de Aco que el proveedor no informa. */
  modelPrices?: () => Promise<ModelPrices>;
}

export async function handlePanel(req: Request, db: Db, actor: Actor, options: PanelOptions = {}): Promise<Response | null> {
  const path = pathOf(req);
  if (!path.startsWith("/api/panel")) return null;
  const now = new Date();
  const at = now.toISOString();
  const params = new URL(req.url).searchParams;

  if (req.method !== "GET" && !sameOrigin(req)) return error("Pedido rechazado: tiene que salir del panel.", 403);
  if (path === "/api/panel/security" || path.startsWith("/api/panel/security/")) return handleSecurity(req, db, actor, path, at);

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
      // La exportación sale del panel: no lleva correos ni números de trámite, y queda en la auditoría.
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
    if (path === "/api/panel/assistant") return json({ feedback: await assistantFeedback(db), gaps: await assistantGaps(db) });
    if (path === "/api/panel/assistant/usage") {
      const prices = (await options.modelPrices?.().catch(() => ({}))) ?? {};
      return json(await assistantUsage(db, now, prices));
    }
    const voteMatch = path.match(/^\/api\/panel\/assistant\/votes\/(\d+)$/);
    if (voteMatch) {
      // La nota y la conversación son texto de la persona y pueden traer datos personales: leerlas queda en la auditoría,
      // como las otras lecturas sensibles.
      const vote = await assistantFeedbackNote(db, Number(voteMatch[1]));
      if (!vote) return error("No existe ese voto.", 404);
      if (vote.note || vote.conversation.length) await audit(db, actor.email, "assistant.note.read", null, { voteId: vote.id }, at);
      return json(vote);
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
    // Irreversible: el cliente tiene que devolver el código, tipeado, como confirmación.
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

    // Cómo quedaría el envío después del cambio, para controlar las reglas de publicación sobre el estado final.
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
