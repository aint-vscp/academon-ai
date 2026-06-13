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
