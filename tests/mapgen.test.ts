import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contractReport, generateMap } from "../engine/mapgen";
import { manhattan } from "../engine/grid";
import type { Config } from "../engine/types";

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/config.json"), "utf8")
) as Config;

describe("mapgen contract (§II — all five checks)", () => {
  const seeds = [1, 7, 42, 99, 1234, 5555, 80808, 31337];

  it.each(seeds)("seed %i satisfies the contract", (seed) => {
    const map = generateMap(cfg, seed, "class");
    const rep = contractReport(cfg, map, "class");

    expect(rep.centerSpawn).toBe(true); // 1. center spawn
    expect(rep.goalFar).toBe(true); // 2. randomized far goal
    expect(rep.winnable).toBe(true); // 3. reachable & winnable
    expect(rep.mobFreeBlocked).toBe(true); // 4. guaranteed encounters
    expect(rep.gatekeepers).toBeGreaterThanOrEqual(1);
    const [minF, maxF] = cfg.mapgen.fights.class;
    expect(rep.fightsOnRoute).toBeGreaterThanOrEqual(Math.min(minF, rep.gatekeepers));
    expect(rep.fightsOnRoute).toBeLessThanOrEqual(maxF);
  });

  it("same seed reproduces the same map (determinism)", () => {
    const a = generateMap(cfg, 4242, "exhibit");
    const b = generateMap(cfg, 4242, "exhibit");
    expect(a.terrain).toEqual(b.terrain);
    expect(a.goal).toEqual(b.goal);
    expect(a.mobs.map((m) => ({ ...m }))).toEqual(b.mobs.map((m) => ({ ...m })));
  });

  it("different seeds give different goals (randomized goal)", () => {
    const goals = new Set(
      [3, 17, 29, 53, 71].map((s) => {
        const m = generateMap(cfg, s, "class");
        return `${m.goal.x},${m.goal.y}`;
      })
    );
    expect(goals.size).toBeGreaterThan(1);
  });

  it("goal distance respects min_goal_dist_pct", () => {
    const m = generateMap(cfg, 7, "class");
    const corners = [
      { x: 1, y: 1 },
      { x: m.w - 2, y: 1 },
      { x: 1, y: m.h - 2 },
      { x: m.w - 2, y: m.h - 2 },
    ];
    const maxReach = Math.max(...corners.map((c) => manhattan(m.spawn, c)));
    expect(manhattan(m.spawn, m.goal)).toBeGreaterThanOrEqual(
      cfg.mapgen.min_goal_dist_pct * maxReach
    );
  });
});
