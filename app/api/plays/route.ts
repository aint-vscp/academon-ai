import { redis, storeConfigured, rateLimit, clientIp } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "academon:plays";
const MAX_STORED = 1000;
const MAX_RETURN = 500;

function str(raw: unknown, max: number): string {
  return String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function num(raw: unknown, lo: number, hi: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Whitelist + clamp a posted play record so we never store arbitrary/abusive data. */
function sanitizePlay(body: Record<string, unknown>) {
  return {
    id: str(body.id, 40) || `${Date.now()}`,
    ts: num(body.ts, 0, 1e15) || Date.now(),
    name: str(body.name, 24) || "Player",
    hero: body.hero === "iska" ? "iska" : "isko",
    mode: body.mode === "exhibit" ? "exhibit" : "class",
    seed: num(body.seed, 0, 0xffffffff),
    steps: num(body.steps, 0, 100000),
    score: num(body.score, 0, 100_000),
    won: Boolean(body.won),
    failReason: body.failReason == null ? null : str(body.failReason, 40),
    correct: num(body.correct, 0, 100000),
    answered: num(body.answered, 0, 100000),
    fights: num(body.fights, 0, 100000),
    retreats: num(body.retreats, 0, 100000),
    replans: num(body.replans, 0, 100000),
    elapsed: num(body.elapsed, 0, 1e7),
    roundsCleared: num(body.roundsCleared, 0, 100),
    finalHp: num(body.finalHp, 0, 100000),
    finalEnergy: num(body.finalEnergy, 0, 100000),
    energyCost: num(body.energyCost, 0, 10_000_000),
  };
}

/** Recent play records merged across every player — powers the Eval Lab. */
export async function GET() {
  if (!storeConfigured) return Response.json({ global: false, plays: [] });
  try {
    const raw = await redis<string[]>(["LRANGE", KEY, "0", String(MAX_RETURN - 1)]);
    const plays = raw
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // oldest → newest for the charts
    return Response.json({ global: true, plays });
  } catch {
    return Response.json({ global: false, plays: [] });
  }
}

export async function POST(req: Request) {
  if (!storeConfigured) return Response.json({ global: false, ok: false });
  if (!(await rateLimit(clientIp(req)))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const rec = sanitizePlay(body as Record<string, unknown>);
    await redis(["LPUSH", KEY, JSON.stringify(rec)]);
    await redis(["LTRIM", KEY, "0", String(MAX_STORED - 1)]);
    return Response.json({ ok: true, global: true });
  } catch {
    return Response.json({ ok: false });
  }
}
