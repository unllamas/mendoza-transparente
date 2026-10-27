/**
 * The "human pass" of the assistant: when Turnstile is on (ASSISTANT_TURNSTILE=on), the first message of a
 * conversation carries a Turnstile token and the answer brings back a pass, signed with HMAC-SHA256 and valid for
 * 30 minutes, that the following messages send instead. One Turnstile check per conversation, not per message.
 * The pass carries only its expiry: nothing about the person or the conversation.
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
  return `${exp}.${await sign(key, exp)}`;
}

export async function checkPass(key: string, pass: unknown, now = Date.now()): Promise<boolean> {
  if (typeof pass !== "string" || pass.length > 200) return false;
  const [exp, mac] = pass.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) <= now || Number(exp) > now + PASS_TTL_MS) return false;
  const expected = await sign(key, exp);
  // Same length always (hex of a SHA-256): compare every character so the time does not depend on where it differs.
  let diff = expected.length ^ mac.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (mac.charCodeAt(i) || 0);
  return diff === 0;
}
