import { redis, storeConfigured } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "academon:board";

function cleanName(raw: unknown): string {
  return String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 24);
}

function cleanScore(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.min(10_000_000, n));
}

/** Top scores, one row per name (best score) — globally shared. */
export async function GET() {
  if (!storeConfigured) return Response.json({ global: false, entries: [] });
  try {
    const flat = await redis<string[]>(["ZRANGE", KEY, "0", "9", "REV", "WITHSCORES"]);
    const entries: { name: string; score: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      entries.push({ name: flat[i], score: Number(flat[i + 1]) });
    }
    return Response.json({ global: true, entries });
  } catch {
    return Response.json({ global: false, entries: [] });
  }
}

/** Submit a score; ZADD GT keeps each player's best (member = name → deduped). */
export async function POST(req: Request) {
  if (!storeConfigured) return Response.json({ global: false, ok: false });
  try {
    const body = await req.json();
    const name = cleanName(body?.name);
    const score = cleanScore(body?.score);
    if (!name || !Number.isFinite(score)) {
      return Response.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    await redis(["ZADD", KEY, "GT", "CH", score, name]);
    return Response.json({ ok: true, global: true });
  } catch {
    return Response.json({ ok: false });
  }
}
