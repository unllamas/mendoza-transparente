/**
 * Límites de uso propios de Aco, guardados en D1 (`assistant_quota`, migración 0008). No dependen de la regla del WAF,
 * que solo cubre mendoza-transparente.com: cada respuesta suma uno en cuatro contadores y, si alguno llegó a su tope,
 * no se llama al modelo.
 *   - por IP, cada 10 minutos: frena una ráfaga de un script;
 *   - por IP, por día: frena a quien reparte la ráfaga a lo largo del día;
 *   - por conversación (el pase de Turnstile, pass.ts): con el tope, Turnstile vuelve a aparecer;
 *   - del sitio, por día: el corte general. Llega antes que el tope mensual del proveedor, que apagaría a Aco el resto
 *     del mes para todos.
 * De la IP solo se guarda su hash con IP_SALT, y cada contador vence solo (`expires_at`). Detalle en
 * docs/procesos/asistente.md#límites-contra-el-abuso-y-el-gasto.
 */

/** Los topes de un host. `name` separa los contadores de producción de los de la vista previa, que comparten D1. */
export interface Limits {
  name: "production" | "preview";
  perIpWindow: number;
  perIpDay: number;
  perSiteDay: number;
  perPass: number;
}

/** Por qué se cortó: ráfaga por IP, día por IP, conversación (pide Turnstile de nuevo) o día del sitio. */
export type QuotaLimit = "burst" | "ip_day" | "session" | "site_day";

export const WINDOW_MS = 10 * 60 * 1000;

/**
 * Producción: una persona que hace un trámite pregunta entre 3 y 10 veces. Los topes por IP son holgados porque en
 * Argentina muchos celulares salen a internet por la misma IP (CGNAT). El del sitio (≈ USD 3 por día con Haiku 5.5)
 * se cambia con el secreto ASSISTANT_DAILY_LIMIT.
 */
export const PRODUCTION_LIMITS: Limits = { name: "production", perIpWindow: 20, perIpDay: 80, perSiteDay: 3000, perPass: 20 };

/** Vista previa de dev: una corrida de evals (≈ 52 casos desde una IP) tiene que entrar, y el total queda bajo. */
export const PREVIEW_LIMITS: Limits = { name: "preview", perIpWindow: 120, perIpDay: 400, perSiteDay: 600, perPass: 20 };

export const PRODUCTION_HOST = "mendoza-transparente.com";
export const PREVIEW_HOST = "dev.mendoza-transparente.pages.dev";

/**
 * Los topes según dónde llegó el pedido; null si ese host no atiende a Aco. Producción responde solo en el dominio
 * propio, que tiene la regla del WAF: mendoza-transparente.pages.dev y las direcciones de cada despliegue
 * (<hash>.mendoza-transparente.pages.dev) usan las claves de producción y no pasan por el WAF.
 */
export function limitsForHost(host: string, dailyLimit?: string): Limits | null {
  const h = host.toLowerCase().split(":")[0] ?? "";
  if (h === PRODUCTION_HOST) {
    const custom = Number(dailyLimit);
    return Number.isInteger(custom) && custom > 0 ? { ...PRODUCTION_LIMITS, perSiteDay: custom } : PRODUCTION_LIMITS;
  }
  if (h === PREVIEW_HOST || h === "localhost" || h === "127.0.0.1") return PREVIEW_LIMITS;
  return null;
}

/** El subconjunto de D1 que usan los límites. */
export interface QuotaDb {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results: T[] }> };
  };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** El hash de la IP: no se puede volver a la IP sin la sal, y no se cruza con el de los envíos del registro. */
export async function hashIp(ip: string, salt = "dev"): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aco:${salt}:${ip}`))).slice(0, 32);
}

/** El día en Mendoza (UTC-3), para que el tope diario se renueve a la medianoche de acá. */
const mendozaDay = (now: number) => new Date(now - 3 * 3600e3).toISOString().slice(0, 10);

interface Bucket {
  key: string;
  max: number;
  expires: number;
  limit: QuotaLimit;
}

/**
 * Cuenta una respuesta. Primero lee los contadores y, si alguno llegó al tope, corta sin escribir nada: así un
 * script que insiste gasta lecturas de D1 (5 millones por día) y no escrituras (100.000). Si no, suma uno en todos
 * con una sola escritura. Dos pedidos al mismo tiempo pueden pasarse por uno: alcanza.
 */
export async function takeQuota(
  db: QuotaDb,
  limits: Limits,
  who: { ipHash: string; passId?: string },
  now = Date.now(),
  log?: (message: string) => void,
): Promise<QuotaLimit | null> {
  const day = mendozaDay(now);
  const dayEnd = Date.parse(`${day}T03:00:00Z`) + 24 * 3600e3;
  const window = Math.floor(now / WINDOW_MS);
  const p = limits.name;
  const buckets: Bucket[] = [
    { key: `${p}:site:${day}`, max: limits.perSiteDay, expires: dayEnd, limit: "site_day" },
    { key: `${p}:ip:${who.ipHash}:${day}`, max: limits.perIpDay, expires: dayEnd, limit: "ip_day" },
    { key: `${p}:burst:${who.ipHash}:${window}`, max: limits.perIpWindow, expires: (window + 1) * WINDOW_MS, limit: "burst" },
    ...(who.passId ? [{ key: `${p}:pass:${who.passId}`, max: limits.perPass, expires: now + 2 * 3600e3, limit: "session" as const }] : []),
  ];
  try {
    const { results } = await db
      .prepare(`SELECT bucket, count FROM assistant_quota WHERE bucket IN (${buckets.map(() => "?").join(", ")})`)
      .bind(...buckets.map((b) => b.key))
      .all<{ bucket: string; count: number }>();
    const counts = new Map(results.map((r) => [r.bucket, r.count]));
    const hit = buckets.find((b) => (counts.get(b.key) ?? 0) >= b.max);
    if (hit) return hit.limit;
    await db
      .prepare(
        `INSERT INTO assistant_quota (bucket, count, expires_at) VALUES ${buckets.map(() => "(?, 1, ?)").join(", ")}
         ON CONFLICT(bucket) DO UPDATE SET count = count + 1`,
      )
      .bind(...buckets.flatMap((b) => [b.key, new Date(b.expires).toISOString()]))
      .run();
    // La primera respuesta del día limpia los contadores vencidos: una sola vez por día, sin cron.
    if (!counts.has(buckets[0]!.key))
      await db.prepare("DELETE FROM assistant_quota WHERE expires_at < ?").bind(new Date(now).toISOString()).run();
    return null;
  } catch (err) {
    // Sin la tabla (migración 0008 sin aplicar) o con D1 caído, Aco sigue respondiendo: quedan el WAF y el tope del
    // proveedor. Cortar acá apagaría a Aco por una falla de la base.
    log?.(`asistente: no se pudo contar el uso (${(err as Error).name})`);
    return null;
  }
}
