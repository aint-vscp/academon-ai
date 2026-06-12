import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateMap } from "../engine/mapgen";
import { search, planRoute, tileCost, type CostContext } from "../engine/search";
import type { Config } from "../engine/types";

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/config.json"), "utf8")
) as Config;

function ctx(map: ReturnType<typeof generateMap>, over: Partial<CostContext> = {}): CostContext {
  return {
    cfg,
    map,
    p: 0.7,
    hpNow: 100,
    timeLimit: 150,
    excludeMobs: false,
    ambushChance: 0,
    stepTimeEP: (cfg.ui.tween_ms / 1000) * (cfg.resources.energy_max / 150),
    ...over,
  };
}

describe("risk-cost A*", () => {
  const map = generateMap(cfg, 7, "class");

  it("finds a route from spawn to goal", () => {
    const r = search(ctx(map), map.spawn, map.goal);
    expect(r.found).toBe(true);
    expect(r.path[0]).toEqual(map.spawn);
    expect(r.path[r.path.length - 1]).toEqual(map.goal);
  });

  it("A* matches Dijkstra's optimal cost (admissible heuristic ⇒ optimal)", () => {
    for (const seed of [1, 2, 3, 11, 23]) {
      const m = generateMap(cfg, seed, "class");
      const a = search(ctx(m), m.spawn, m.goal, "astar");
      const d = search(ctx(m), m.spawn, m.goal, "dijkstra");
      expect(a.found).toBe(d.found);
      expect(a.cost).toBeCloseTo(d.cost, 6);
    }
  });

  it("A* explores no more nodes than Dijkstra", () => {
    const a = search(ctx(map), map.spawn, map.goal, "astar");
    const d = search(ctx(map), map.spawn, map.goal, "dijkstra");
    expect(a.explored.length).toBeLessThanOrEqual(d.explored.length);
  });

  it("mob tiles cost more when HP is low (V_HP scarcity scaling)", () => {
    const mob = map.mobs[0];
    const healthy = tileCost(ctx(map, { hpNow: 100 }), mob.pos.x, mob.pos.y);
    const dying = tileCost(ctx(map, { hpNow: 20 }), mob.pos.x, mob.pos.y);
    expect(dying).toBeGreaterThan(healthy);
  });

  it("excludeMobs makes mob tiles impassable", () => {
    const mob = map.mobs[0];
    const c = tileCost(ctx(map, { excludeMobs: true }), mob.pos.x, mob.pos.y);
    expect(c).toBe(Number.POSITIVE_INFINITY);
  });

  it("greedy explores fewer-or-equal nodes but may cost more", () => {
    const a = search(ctx(map), map.spawn, map.goal, "astar");
    const g = search(ctx(map), map.spawn, map.goal, "greedy");
    expect(g.found).toBe(true);
    expect(g.cost + 1e-9).toBeGreaterThanOrEqual(a.cost);
  });

  it("planRoute falls back to engage when avoidance is blocked (gatekeepers)", () => {
    const out = planRoute(
      ctx(map),
      map.spawn,
      map.goal,
      {
        energy: 100,
        timeLeftSec: 150,
        margin: 1.2,
        secPerStep: 0.24,
        questionSec: 15,
      },
      "astar"
    );
    expect(out.result.found).toBe(true);
    expect(out.plan).toBe("engage"); // mapgen guarantees no feasible mob-free path
  });
});
