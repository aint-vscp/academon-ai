"use client";

// Shared leaderboard: persistence + the styled row list used by both the lobby's
// dedicated LEADERBOARD screen and the end-of-game stats panel.

export interface LeaderEntry {
  name: string;
  score: number;
  goal: string;
}

export function loadBoard(): LeaderEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("academon-board") ?? "[]");
  } catch {
    return [];
  }
}

export function saveBoard(b: LeaderEntry[]) {
  const deduped = dedupeByName(b);
  try {
    localStorage.setItem("academon-board", JSON.stringify(deduped.slice(0, 10)));
  } catch {}
}

/** Global leaderboard (shared across all players) with a localStorage fallback. */
export async function fetchGlobalBoard(): Promise<{ entries: LeaderEntry[]; global: boolean }> {
  try {
    const r = await fetch("/api/leaderboard", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { global?: boolean; entries?: { name: unknown; score: unknown }[] };
      if (j.global && Array.isArray(j.entries)) {
        const entries = j.entries.map((e) => ({
          name: String(e.name ?? ""),
          score: Number(e.score) || 0,
          goal: "",
        }));
        return { entries, global: true };
      }
    }
  } catch {}
  return { entries: loadBoard(), global: false };
}

/** Submit a score to the global board (and keep a local cache as a fallback). */
export async function submitScore(name: string, score: number) {
  saveBoard(dedupeByName([...loadBoard(), { name, score, goal: "" }]));
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score }),
    });
  } catch {}
}

/** Collapse duplicate names, keeping each player's best score; sorted high→low. */
export function dedupeByName(entries: LeaderEntry[]): LeaderEntry[] {
  const best = new Map<string, LeaderEntry>();
  for (const e of entries) {
    const k = e.name.trim().toLowerCase();
    const cur = best.get(k);
    if (!cur || e.score > cur.score) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Styled ranking rows: gold-highlighted #1 with crown, then ranked rows, then
 *  empty slots up to `slots`. Matches the leaderboard mockup. */
export function LeaderboardList({
  entries,
  currentName,
  slots = 5,
}: {
  entries: LeaderEntry[];
  currentName?: string;
  slots?: number;
}) {
  const ranked = dedupeByName(entries);
  const rowCount = Math.max(slots, ranked.length);
  return (
    <div className="lb-list">
      {Array.from({ length: rowCount }).map((_, i) => {
        const e = ranked[i];
        const cls = ["lb-row"];
        if (!e) cls.push("lb-empty");
        if (e && i === 0) cls.push("lb-gold");
        if (e && currentName && e.name === currentName) cls.push("lb-mine");
        return (
          <div key={i} className={cls.join(" ")}>
            {e ? (
              <>
                <span className="lb-left">
                  {i === 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/ui/crown.png" alt="#1" className="lb-crown" />
                  ) : (
                    <span className="lb-rank">{i + 1}</span>
                  )}
                  <span className="lb-name">{e.name}</span>
                </span>
                <span className="lb-score">{e.score}</span>
              </>
            ) : (
              <span className="lb-rank lb-dim">{i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
