/**
 * Login to the panel: Cloudflare Access (Zero Trust, free up to 50 people). Access asks for the email,
 * sends a one-time code and, once in, adds a signed token (JWT) to every request that reaches the panel.
 *
 * Access alone is not enough: the same Pages project also answers on *.pages.dev and on preview
 * deployments, which may not be behind Access. So every panel API call verifies the token here, and the
 * email also has to be on our own list. Without a valid token the API answers 401, whatever the headers say.
 * Documented in docs/procesos/panel.md.
 */

export interface AccessConfig {
  /** "mendoza-transparente.cloudflareaccess.com" */
  teamDomain: string;
  /** Application Audience (AUD) tag of the Access application. */
  audience: string;
  /** Who can get in, besides passing Access. Lowercase emails. Empty means nobody. */
  allowedEmails: string[];
}

export interface Actor {
  email: string;
}

interface Jwk extends JsonWebKey {
  kid: string;
}

const CERTS_TTL = 3600e3;
let certsCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function certs(teamDomain: string, now: number, fetchImpl: typeof fetch, force = false): Promise<Jwk[]> {
  if (!force && certsCache?.domain === teamDomain && now - certsCache.fetchedAt < CERTS_TTL) return certsCache.keys;
  const r = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Access certs: ${r.status}`);
  const keys = ((await r.json()) as { keys?: Jwk[] }).keys ?? [];
  certsCache = { domain: teamDomain, keys, fetchedAt: now };
  return keys;
}

const b64url = (s: string) =>
  Uint8Array.from(
    atob(
      s
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(s.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
const parse = <T>(s: string) => JSON.parse(new TextDecoder().decode(b64url(s))) as T;

export const parseAllowedEmails = (v: string | undefined) =>
  (v ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

/** Returns who is calling, or null if the request does not carry a valid Access token for an allowed email. */
export async function verifyAccess(
  req: Request,
  config: AccessConfig,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Actor | null> {
  // Fail closed: a misconfigured panel lets nobody in.
  if (!config.teamDomain || !config.audience || !config.allowedEmails.length) return null;
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string; type?: string };
  try {
    header = parse(h);
    payload = parse(p);
  } catch {
    return null;
  }
  // Only RS256: never "none", never an algorithm chosen by whoever made the token.
  if (header.alg !== "RS256" || !header.kid) return null;

  let keys = await certs(config.teamDomain, now, fetchImpl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && now - (certsCache?.fetchedAt ?? 0) > 60e3) {
    // Access rotates its keys: refetch before giving up, at most once a minute (a made-up kid cannot flood it).
    keys = await certs(config.teamDomain, now, fetchImpl, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return null;

  const seconds = now / 1000;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${config.teamDomain}`) return null;
  if (!audiences.includes(config.audience)) return null;
  if (typeof payload.exp !== "number" || payload.exp < seconds) return null;
  if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return null;
  // Service tokens have no email: the panel is only for people.
  const email = payload.email?.toLowerCase();
  if (!email || !config.allowedEmails.includes(email)) return null;
  return { email };
}

/** For tests: forget the cached keys. */
export const resetAccessCache = () => {
  certsCache = null;
};
