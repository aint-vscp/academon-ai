// Server-only store helper — talks to an Upstash Redis REST endpoint (the same
// one Vercel KV provisions). When no store is configured the API routes degrade
// gracefully and the client falls back to localStorage, so the game never breaks.
//
// Enable global sync by adding a (free) Vercel KV / Upstash store — it injects
// KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN). No code
// changes needed; see README.

const REST_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

export const storeConfigured = Boolean(REST_URL && REST_TOKEN);

type Cmd = (string | number)[];

/** Run a single Redis command over the Upstash REST protocol. */
export async function redis<T = unknown>(cmd: Cmd): Promise<T> {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const json = (await res.json()) as { result: T };
  return json.result;
}

/** Best-effort fixed-window rate limit per client (fails OPEN on store errors so
 *  real players are never blocked by a transient hiccup). */
export async function rateLimit(ip: string, limit = 40, windowSec = 60): Promise<boolean> {
  if (!storeConfigured) return true;
  try {
    const key = `academon:rl:${ip}`;
    const n = await redis<number>(["INCR", key]);
    if (n === 1) await redis(["EXPIRE", key, windowSec]);
    return n <= limit;
  } catch {
    return true;
  }
}

/** Client IP from the proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
}
