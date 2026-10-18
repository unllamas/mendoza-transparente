import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { resetAccessCache, verifyAccess } from "./access.ts";
import type { Db } from "./db.ts";
import { localDb } from "./local-db.ts";
import { handlePanel } from "./panel-api.ts";
import { privacyWarnings } from "./privacy.ts";
import { handlePublic } from "./public-api.ts";
import { normalizeCode } from "./secrets.ts";
import { text } from "./validation.ts";

const env = { development: true };
let db: Db;
let ipCounter = 0;
beforeEach(() => {
  db = localDb(new Database(":memory:") as never);
});

const post = (path: string, body: unknown, ip = `10.0.0.${++ipCounter % 250}`) =>
  handlePublic(new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) }), db, env, ip);
const get = (path: string) => handlePublic(new Request(`http://localhost${path}`), db, env, "1.1.1.1");
const admin = { email: "equipo@example.com" };
const panel = (path: string, init: { method?: string; body?: unknown; origin?: string | null } = {}) =>
  handlePanel(
    new Request(`https://panel.example.com${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(init.origin === null ? {} : { origin: init.origin ?? "https://panel.example.com" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    db,
    admin,
  );

async function registerRequest(extra: Record<string, unknown> = {}) {
  const r = await post("/api/pedidos", {
    itemId: "cuenta-general",
    agency: "Contaduría",
    filedOn: "2026-01-10",
    filingNumber: "EX-2026-01234567-GDEMZA",
    email: "persona@example.com",
    detail: "Mi DNI es 30.123.456",
    ...extra,
  });
  return (await r!.json()) as { code: string; key: string; error?: string };
}

describe("public API", () => {
  test("registering a request returns a code and a key once, and stores only the key hash", async () => {
    const { code, key } = await registerRequest();
    expect(normalizeCode(code)).toBe(code);
    expect(key).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const row = await db.prepare("SELECT edit_key_hash FROM pedidos WHERE code = ?").bind(code).first<{ edit_key_hash: string }>();
    expect(row?.edit_key_hash).toHaveLength(64);
    expect(row?.edit_key_hash).not.toContain(key);
  });

  test("the same filing number for the same item is rejected", async () => {
    await registerRequest();
    const r = await post("/api/pedidos", { itemId: "cuenta-general", filedOn: "2026-01-10", filingNumber: "ex-2026-01234567-gdemza" });
    expect(r!.status).toBe(409);
  });

  test("an answer with code and key applies; with a wrong key it is rejected", async () => {
    const { code, key } = await registerRequest();
    const wrong = await post("/api/pedidos/respuesta", { code, key: "AAAAA-AAAAA-AAAAA-AAAAA", status: "denegado" });
    expect(wrong!.status).toBe(403);
    const ok = await post("/api/pedidos/respuesta", { code, key: key.toLowerCase(), status: "respondido", answeredOn: "2026-02-01" });
    expect(ok!.status).toBe(200);
    const row = await db.prepare("SELECT estado FROM pedidos WHERE code = ?").bind(code).first<{ estado: string }>();
    expect(row?.estado).toBe("respondido");
  });

  test("an answer before the filing date is rejected", async () => {
    const { code, key } = await registerRequest();
    const r = await post("/api/pedidos/respuesta", { code, key, status: "respondido", answeredOn: "2025-12-01" });
    expect(r!.status).toBe(400);
  });

  test("an answer with only the filing number waits for review and does not change the request", async () => {
    const { code } = await registerRequest();
    const r = await post("/api/pedidos/respuesta", { filingNumber: "EX-2026-01234567-GDEMZA", status: "denegado" });
    expect(r!.status).toBe(202);
    const row = await db.prepare("SELECT estado FROM pedidos WHERE code = ?").bind(code).first<{ estado: string }>();
    expect(row?.estado).toBe("presentado");
  });

  test("the registry only shows published items, with public fields only", async () => {
    const { code } = await registerRequest();
    let registry = (await (await get("/api/registro"))!.json()) as { requests: unknown[] };
    expect(registry.requests).toHaveLength(0);
    expect((await get(`/api/registro/${code}`))!.status).toBe(404);

    await panel(`/api/panel/items/${code}`, { method: "PATCH", body: { isPublic: true, reviewStatus: "resolved" } });
    registry = (await (await get("/api/registro"))!.json()) as { requests: Record<string, unknown>[] };
    expect(registry.requests).toHaveLength(1);
    const published = JSON.stringify(registry);
    for (const secret of ["persona@example.com", "EX-2026", "30.123.456", "edit_key", "ip_hash"]) expect(published).not.toContain(secret);
    expect(Object.keys(registry.requests[0]!).sort()).toEqual(
      ["agency", "answerUrl", "answeredOn", "code", "days", "filedOn", "itemId", "overdue", "status", "summary"].sort(),
    );
  });

  test("spam does not count in the stats", async () => {
    const { code } = await registerRequest();
    await registerRequest({ filingNumber: "EX-2026-99999999-GDEMZA" });
    await panel(`/api/panel/items/${code}`, { method: "PATCH", body: { reviewStatus: "spam" } });
    const stats = (await (await get("/api/pedidos/stats"))!.json()) as { total: { requests: number } };
    expect(stats.total.requests).toBe(1);
  });

  test("without secrets outside development, submissions stop instead of skipping the checks", async () => {
    const r = await handlePublic(
      new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify({ kind: "error", message: "un error largo" }) }),
      db,
      {},
      "1.1.1.1",
    );
    expect(r!.status).toBe(503);
  });

  test("rate limit: the eleventh submission in an hour from the same connection is refused", async () => {
    for (let i = 0; i < 10; i++) await post("/api/feedback", { kind: "dato", message: `sugerencia número ${i}` }, "9.9.9.9");
    const r = await post("/api/feedback", { kind: "dato", message: "una más de la cuenta" }, "9.9.9.9");
    expect(r!.status).toBe(429);
  });

  test("the panel paths are not handled by the public API", async () => {
    expect(await get("/api/panel/inbox")).toBeNull();
  });
});

describe("panel API", () => {
  test("writes need the panel's own origin (CSRF)", async () => {
    const { code } = await registerRequest();
    expect(
      (await panel(`/api/panel/items/${code}`, { method: "PATCH", body: { reviewStatus: "resolved" }, origin: "https://evil.example" }))!
        .status,
    ).toBe(403);
    expect((await panel(`/api/panel/items/${code}`, { method: "PATCH", body: { reviewStatus: "resolved" }, origin: null }))!.status).toBe(
      403,
    );
  });

  test("a report is published only resolved and with a public summary, and personal data needs confirmation", async () => {
    const r = await post("/api/feedback", {
      kind: "error",
      message: "El dato está mal, escribime a yo@example.com",
      page: "/deuda?q=algo",
    });
    const { code } = (await r!.json()) as { code: string };
    const patch = (body: unknown) => panel(`/api/panel/items/${code}`, { method: "PATCH", body });
    expect((await patch({ isPublic: true }))!.status).toBe(409);
    expect((await patch({ isPublic: true, reviewStatus: "resolved" }))!.status).toBe(409);
    const warn = await patch({ isPublic: true, reviewStatus: "resolved", publicSummary: "Corregido, gracias a yo@example.com" });
    expect(warn!.status).toBe(409);
    expect(((await warn!.json()) as { warnings: string[] }).warnings).toContain("email");
    expect(
      (await patch({ isPublic: true, reviewStatus: "resolved", publicSummary: "La deuda de 2025 estaba duplicada; corregido." }))!.status,
    ).toBe(200);
    const registry = (await (await get("/api/registro"))!.json()) as { corrections: { page: string }[] };
    expect(registry.corrections[0]?.page).toBe("/deuda");
    expect(JSON.stringify(registry)).not.toContain("yo@example.com");
  });

  test("every change is audited", async () => {
    const { code } = await registerRequest();
    await panel(`/api/panel/items/${code}`, {
      method: "PATCH",
      body: { reviewStatus: "in_review", tags: ["Hacienda", "hacienda", "<script>"] },
    });
    const item = (await (await panel(`/api/panel/items/${code}`))!.json()) as {
      tags: string[];
      audit: { actor: string; action: string }[];
    };
    expect(item.tags).toEqual(["hacienda"]);
    expect(item.audit[0]).toMatchObject({ actor: admin.email, action: "update" });
  });

  test("a pending answer is applied from the panel", async () => {
    const { code } = await registerRequest();
    await post("/api/pedidos/respuesta", { filingNumber: "EX-2026-01234567-GDEMZA", status: "parcial", answeredOn: "2026-02-01" });
    const item = (await (await panel(`/api/panel/items/${code}`))!.json()) as { answers: { id: number }[] };
    const r = await panel(`/api/panel/answers/${item.answers[0]!.id}`, { method: "POST", body: { action: "apply" } });
    expect(((await r!.json()) as { request: { status: string } }).request.status).toBe("parcial");
    expect((await panel(`/api/panel/answers/${item.answers[0]!.id}`, { method: "POST", body: { action: "apply" } }))!.status).toBe(404);
  });

  test("anonymizing needs the code typed back and erases personal data", async () => {
    const { code } = await registerRequest();
    expect((await panel(`/api/panel/items/${code}/anonymize`, { method: "POST", body: { confirm: "P-XXXXXXXX" } }))!.status).toBe(400);
    const r = await panel(`/api/panel/items/${code}/anonymize`, { method: "POST", body: { confirm: code.toLowerCase() } });
    const item = (await r!.json()) as { email: string | null; request: { detail: string | null; filingNumber: string } };
    expect(item.email).toBeNull();
    expect(item.request.detail).toBeNull();
    expect(item.request.filingNumber).toStartWith("ANONIMIZADO-");
  });

  test("the inbox searches every word, counts by status and the export neutralizes formulas", async () => {
    await registerRequest();
    await post("/api/feedback", { kind: "dato", message: '=HYPERLINK("http://x") falta la deuda' });
    const list = (await (await panel("/api/panel/inbox?q=deuda falta"))!.json()) as { items: unknown[]; counts: { all: number } };
    expect(list.items).toHaveLength(1);
    expect(list.counts.all).toBe(1);
    const csv = await (await panel("/api/panel/export.csv"))!.text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("persona@example.com");
  });
});

describe("security findings", () => {
  const newFinding = {
    title: "Planilla de beneficiarios abierta",
    kind: "personal_data",
    exposesPersonalData: true,
    severity: "high",
    location: "https://municipio.example.gob.ar/uploads/",
    description: "La carpeta de subidas lista planillas con nombres y documentos de beneficiarios. No se descargó nada.",
    acknowledgeWarnings: true,
  };
  const create = async (body: Record<string, unknown> = newFinding) => {
    const r = await panel("/api/panel/security", { method: "POST", body });
    return { status: r!.status, data: (await r!.json()) as { code: string; error?: string; warnings?: string[] } };
  };

  test("a finding is created from the panel, with an S- code, and needs the panel's own origin", async () => {
    const { status, data } = await create();
    expect(status).toBe(201);
    expect(data.code).toMatch(/^S-[0-9A-Z]{8}$/);
    const forged = await panel("/api/panel/security", { method: "POST", body: newFinding, origin: "https://evil.example.com" });
    expect(forged!.status).toBe(403);
    const list = (await (await panel("/api/panel/security"))!.json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  test("it never reaches the public API, the registry or the export", async () => {
    const { data } = await create();
    expect((await get(`/api/registro/${data.code}`))!.status).toBe(404);
    const registry = await (await get("/api/registro"))!.text();
    expect(registry).not.toContain(data.code);
    expect(registry).not.toContain("beneficiarios");
    expect(await handlePublic(new Request("http://localhost/api/panel/security"), db, env, "1.1.1.1")).toBeNull();
    const csv = await (await panel("/api/panel/export.csv"))!.text();
    expect(csv).not.toContain(data.code);
    expect((await panel(`/api/panel/items/${data.code}`))!.status).toBe(404);
  });

  test("text that looks like personal data needs confirmation, and the audit keeps fields, not text", async () => {
    const leaked = { ...newFinding, description: "Aparece Juan Pérez, DNI 30.123.456", acknowledgeWarnings: undefined };
    const refused = await create(leaked);
    expect(refused.status).toBe(409);
    expect(refused.data.warnings).toContain("dni");
    const { data } = await create();
    const log = await (await panel("/api/panel/audit"))!.text();
    expect(log).toContain("security.create");
    expect(log).toContain(data.code);
    expect(log).not.toContain("beneficiarios");
  });

  test("marking it as reported needs who and when", async () => {
    const { data } = await create();
    const path = `/api/panel/security/${data.code}`;
    expect((await panel(path, { method: "PATCH", body: { status: "reported" } }))!.status).toBe(409);
    const ok = await panel(path, {
      method: "PATCH",
      body: { status: "reported", reportedTo: "CERT.ar", reportedOn: "2026-10-18", reportReference: "Ticket 123" },
    });
    expect(ok!.status).toBe(200);
    expect(((await ok!.json()) as { status: string }).status).toBe("reported");
    expect((await panel(path, { method: "PATCH", body: { location: "javascript:alert(1)" } }))!.status).toBe(400);
    const reportedAtOnce = await create({ ...newFinding, status: "reported", reportedTo: "AAIP", reportedOn: "2026-10-18" });
    const saved = (await (await panel(`/api/panel/security/${reportedAtOnce.data.code}`))!.json()) as {
      status: string;
      reportedTo: string;
    };
    expect(saved).toMatchObject({ status: "reported", reportedTo: "AAIP" });
  });
});

describe("access", () => {
  const config = { teamDomain: "equipo.cloudflareaccess.com", audience: "aud-123", allowedEmails: ["equipo@example.com"] };
  let keys: CryptoKeyPair;
  let fetchCerts: typeof fetch;
  const b64 = (b: Uint8Array | string) =>
    Buffer.from(typeof b === "string" ? new TextEncoder().encode(b) : b)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  async function token(
    payload: Record<string, unknown>,
    header: Record<string, unknown> = { alg: "RS256", kid: "k1" },
    key = keys.privateKey,
  ) {
    const data = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
    return `${data}.${b64(sig)}`;
  }
  const req = (t: string | null) =>
    new Request("https://panel.example.com/api/panel/me", { headers: t ? { "cf-access-jwt-assertion": t } : {} });
  const good = () => ({
    iss: `https://${config.teamDomain}`,
    aud: [config.audience],
    exp: Date.now() / 1000 + 600,
    email: "Equipo@example.com",
  });

  beforeEach(async () => {
    resetAccessCache();
    keys = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" };
    fetchCerts = (async () => Response.json({ keys: [jwk] })) as unknown as typeof fetch;
  });

  test("a valid token for an allowed email gets in", async () => {
    expect(await verifyAccess(req(await token(good())), config, fetchCerts)).toEqual({ email: "equipo@example.com" });
  });

  test("no token, a forged one, another audience, expired, alg none or an email off the list: nobody gets in", async () => {
    const other = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const cases = [
      null,
      await token(good(), undefined, other.privateKey),
      await token({ ...good(), aud: ["otra-app"] }),
      await token({ ...good(), iss: "https://otro.cloudflareaccess.com" }),
      await token({ ...good(), exp: Date.now() / 1000 - 10 }),
      await token({ ...good(), email: "intruso@example.com" }),
      `${b64(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64(JSON.stringify(good()))}.`,
      "no.es.un-token",
    ];
    for (const t of cases) expect(await verifyAccess(req(t), config, fetchCerts)).toBeNull();
  });

  test("an empty allow list or missing configuration lets nobody in", async () => {
    const t = await token(good());
    expect(await verifyAccess(req(t), { ...config, allowedEmails: [] }, fetchCerts)).toBeNull();
    expect(await verifyAccess(req(t), { ...config, audience: "" }, fetchCerts)).toBeNull();
  });
});

describe("validation and privacy", () => {
  test("invisible characters and bidirectional overrides are removed", () => {
    expect(text("hola‮mundo​ ", 50)).toBe("holamundo");
  });
  test("personal data is flagged", () => {
    expect(privacyWarnings("llamame al 261 555-1234")).toContain("telefono");
    expect(privacyWarnings("mi DNI 30.123.456")).toContain("dni");
    expect(privacyWarnings("CUIL 20-30123456-7")).toContain("cuil");
    expect(privacyWarnings("La deuda creció 12% en 2025")).toEqual([]);
  });
  test("codes typed by hand are understood", () => {
    expect(normalizeCode(" p-ab1o23ki ")).toBe("P-AB1023K1");
  });
});
