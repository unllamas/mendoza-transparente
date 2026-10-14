/** Responses of the participation API. Nothing is cached unless the caller says so. */

export const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff" },
  });

export const error = (message: string, status: number) => json({ error: message }, status);

/** Reads a JSON object body; null if it is missing, too big or not an object. */
export async function readBody(req: Request, maxBytes = 16_000): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > maxBytes) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const pathOf = (req: Request) => new URL(req.url).pathname.replace(/\/+$/, "");
