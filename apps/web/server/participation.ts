/**
 * Citizen participation API: error reports, data requests, and the access-to-information requests people
 * file with the Government (Ley 9070), with the State's answer. Pure logic over a `Store`, so the same code
 * runs as a Cloudflare Pages Function with D1 (functions/api/[[route]].ts) and as a Vite dev middleware with
 * an in-memory store (vite.config.ts). Documented in docs/procesos/participacion.md.
 *
 * Privacy: emails are optional and never returned; IPs are only kept as a salted hash for rate limiting.
 */

export type FeedbackKind = "error" | "dato" | "otro";
export type RequestStatus = "presentado" | "respondido" | "parcial" | "denegado" | "sin_respuesta";

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  page: string | null;
  email: string | null;
}

export interface RequestInput {
  itemId: string;
  agency: string | null;
  filedOn: string;
  filingNumber: string;
  detail: string | null;
  email: string | null;
}

export interface AnswerInput {
  filingNumber: string;
  status: Exclude<RequestStatus, "presentado">;
  answeredOn: string | null;
  summary: string | null;
  url: string | null;
}

export interface StoredRequest {
  itemId: string;
  filedOn: string;
  status: RequestStatus;
}

export interface Store {
  addFeedback(f: FeedbackInput & { ipHash: string; createdAt: string }): Promise<void>;
  /** Returns false if the same filing number was already registered for that item. */
  addRequest(r: RequestInput & { ipHash: string; createdAt: string }): Promise<boolean>;
  /** Returns how many requests were updated (0 if the filing number is unknown). */
  answerRequest(a: AnswerInput & { updatedAt: string }): Promise<number>;
  listRequests(): Promise<StoredRequest[]>;
  /** Submissions from this IP hash since the given ISO time (for rate limiting). */
  countRecent(ipHash: string, since: string): Promise<number>;
}

export interface Env {
  /** Cloudflare Turnstile secret; without it (development) the anti-spam check is skipped. */
  turnstileSecret?: string;
  /** Salt for hashing IPs. */
  ipSalt: string;
}

const MAX_PER_HOUR = 10;
/** Ley 9070: 15 business days to answer; ~21 calendar days, the threshold to count a request as overdue. */
const OVERDUE_DAYS = 21;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const email = (v: unknown): string | null => {
  const t = text(v, 200);
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
};
const url = (v: unknown): string | null => {
  const t = text(v, 500);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};
/** Filing numbers ("EX-2026-01234567-GDEMZA-MGTYJ", "12345/2026"): letters, digits and separators. */
const filingNumber = (v: unknown): string | null => {
  const t = text(v, 60)?.toUpperCase().replace(/\s+/g, "");
  return t && /^[A-Z0-9][A-Z0-9\-/._]{2,59}$/.test(t) ? t : null;
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: unknown, ip: string, env: Env): Promise<boolean> {
  if (!env.turnstileSecret) return true;
  if (typeof token !== "string" || !token) return false;
  const body = new FormData();
  body.set("secret", env.turnstileSecret);
  body.set("response", token);
  body.set("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && ((await r.json()) as { success?: boolean }).success === true;
}

export async function stats(store: Store, now = new Date()) {
  const rows = await store.listRequests();
  const overdueBefore = new Date(now.getTime() - OVERDUE_DAYS * 864e5).toISOString().slice(0, 10);
  const items: Record<string, { requests: number; answered: number; denied: number; overdue: number }> = {};
  for (const r of rows) {
    const s = (items[r.itemId] ??= { requests: 0, answered: 0, denied: 0, overdue: 0 });
    s.requests++;
    if (r.status === "respondido" || r.status === "parcial") s.answered++;
    else if (r.status === "denegado") s.denied++;
    else if (r.status === "sin_respuesta" || r.filedOn < overdueBefore) s.overdue++;
  }
  const total = Object.values(items).reduce(
    (t, s) => ({ requests: t.requests + s.requests, answered: t.answered + s.answered, denied: t.denied + s.denied, overdue: t.overdue + s.overdue }),
    { requests: 0, answered: 0, denied: 0, overdue: 0 },
  );
  return { items, total, updatedAt: now.toISOString() };
}

/** Handles /api/* requests. Returns null for paths it does not own. */
export async function handle(req: Request, store: Store, env: Env, ip: string): Promise<Response | null> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (!path.startsWith("/api/")) return null;

  if (req.method === "GET" && path === "/api/pedidos/stats") {
    const r = json(await stats(store));
    r.headers.set("cache-control", "public, max-age=60");
    return r;
  }
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "El formulario llegó vacío o mal armado." }, 400);
  }
  if (typeof body.website === "string" && body.website) return json({ ok: true }); // honeypot: bots fill every field
  if (!(await verifyTurnstile(body.token, ip, env))) return json({ error: "No pudimos verificar que no seas un robot. Probá de nuevo." }, 403);

  const now = new Date();
  const ipHash = await sha256(`${env.ipSalt}:${ip}`);
  if ((await store.countRecent(ipHash, new Date(now.getTime() - 3600e3).toISOString())) >= MAX_PER_HOUR)
    return json({ error: "Recibimos muchos envíos desde tu conexión. Probá de nuevo en una hora." }, 429);

  if (path === "/api/feedback") {
    const kind = (["error", "dato", "otro"] as const).find((k) => k === body.kind);
    const message = text(body.message, 2000);
    if (!kind || !message || message.length < 10) return json({ error: "Contanos un poco más (al menos 10 caracteres)." }, 400);
    await store.addFeedback({ kind, message, page: text(body.page, 300), email: email(body.email), ipHash, createdAt: now.toISOString() });
    return json({ ok: true }, 201);
  }

  if (path === "/api/pedidos") {
    const itemId = text(body.itemId, 80);
    const filedOn = isoDate(body.filedOn);
    const number = filingNumber(body.filingNumber);
    if (!itemId || !filedOn || !number) return json({ error: "Faltan el dato pedido, la fecha o el número de trámite (o el número no es válido)." }, 400);
    if (filedOn > now.toISOString().slice(0, 10) || filedOn < "2016-01-01") return json({ error: "La fecha de presentación no es válida." }, 400);
    const added = await store.addRequest({
      itemId,
      agency: text(body.agency, 200),
      filedOn,
      filingNumber: number,
      detail: text(body.detail, 1000),
      email: email(body.email),
      ipHash,
      createdAt: now.toISOString(),
    });
    return added ? json({ ok: true }, 201) : json({ error: "Ese número de trámite ya está registrado para este dato." }, 409);
  }

  if (path === "/api/pedidos/respuesta") {
    const number = filingNumber(body.filingNumber);
    const status = (["respondido", "parcial", "denegado", "sin_respuesta"] as const).find((s) => s === body.status);
    if (!number || !status) return json({ error: "Faltan el número de trámite o qué pasó con el pedido." }, 400);
    const updated = await store.answerRequest({
      filingNumber: number,
      status,
      answeredOn: isoDate(body.answeredOn),
      summary: text(body.summary, 2000),
      url: url(body.url),
      updatedAt: now.toISOString(),
    });
    return updated ? json({ ok: true }) : json({ error: "No encontramos ese número de trámite. ¿Lo registraste antes?" }, 404);
  }

  return json({ error: "No existe" }, 404);
}

/** In-memory store for development and tests. */
export function memoryStore(): Store {
  const feedback: (FeedbackInput & { ipHash: string; createdAt: string })[] = [];
  const requests: (RequestInput & { ipHash: string; createdAt: string; status: RequestStatus })[] = [];
  return {
    async addFeedback(f) {
      feedback.push(f);
    },
    async addRequest(r) {
      if (requests.some((x) => x.itemId === r.itemId && x.filingNumber === r.filingNumber)) return false;
      requests.push({ ...r, status: "presentado" });
      return true;
    },
    async answerRequest(a) {
      const matches = requests.filter((r) => r.filingNumber === a.filingNumber);
      for (const r of matches) r.status = a.status;
      return matches.length;
    },
    async listRequests() {
      return requests.map((r) => ({ itemId: r.itemId, filedOn: r.filedOn, status: r.status }));
    },
    async countRecent(ipHash, since) {
      return [...feedback, ...requests].filter((x) => x.ipHash === ipHash && x.createdAt >= since).length;
    },
  };
}
