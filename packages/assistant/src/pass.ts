/**
 * El «pase» de Aco: con Turnstile prendido (ASSISTANT_TURNSTILE=on), el primer mensaje de una conversación lleva un
 * token de Turnstile y la respuesta devuelve un pase firmado con HMAC-SHA256 que los mensajes siguientes mandan en su
 * lugar. Un Turnstile por conversación, no por mensaje.
 *
 * El pase vence a los 30 minutos de emitido y no se renueva: antes se emitía uno nuevo en cada respuesta, así que
 * quien pasaba Turnstile una vez quedaba adentro para siempre. Lleva un id al azar para contar sus mensajes
 * (quota.ts): con el tope, se pide Turnstile de nuevo. Nada de la persona ni de la conversación.
 */

export const PASS_TTL_MS = 30 * 60 * 1000;

const encoder = new TextEncoder();

async function sign(key: string, payload: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(`aco-pass:${payload}`)));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issuePass(key: string, now = Date.now()): Promise<string> {
  const exp = String(now + PASS_TTL_MS);
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return `${exp}.${id}.${await sign(key, `${exp}.${id}`)}`;
}

/** El id del pase si es válido y no venció; null si no. */
export async function checkPass(key: string, pass: unknown, now = Date.now()): Promise<string | null> {
  if (typeof pass !== "string" || pass.length > 200) return null;
  const [exp, id, mac] = pass.split(".");
  if (!exp || !id || !mac || !/^\d+$/.test(exp) || !/^[0-9a-f]{16}$/.test(id)) return null;
  if (Number(exp) <= now || Number(exp) > now + PASS_TTL_MS) return null;
  const expected = await sign(key, `${exp}.${id}`);
  // Siempre el mismo largo (el hex de un SHA-256): se comparan todos los caracteres para que el tiempo no dependa de
  // dónde difieren.
  let diff = expected.length ^ mac.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (mac.charCodeAt(i) || 0);
  return diff === 0 ? id : null;
}
