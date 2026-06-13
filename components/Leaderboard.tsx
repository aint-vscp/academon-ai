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
  localStorage.setItem("academon-board", JSON.stringify(b.slice(0, 10)));
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
  const ranked = [...entries].sort((a, b) => b.score - a.score);
  return (
    <div className="lb-list">
      {Array.from({ length: slots }).map((_, i) => {
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
