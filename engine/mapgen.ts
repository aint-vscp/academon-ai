// Procedural campus mapgen with the 5-check contract (§II):
// 1. center spawn  2. randomized far goal (anti-repeat quadrant)
// 3. winnable within budgets  4. gatekeepers: NO feasible mob-free path
// 5. optional avoidable mobs on shortcuts.

import { idx, manhattan, mobAt, terrainAt, walkable } from "./grid";
import { mulberry32, pick, randInt, type Rng } from "./rng";
import {
  countMobsOnPath,
  pathEnergy,
  pathFeasible,
  planRoute,
  search,
  type CostContext,
  type FeasibilityInput,
} from "./search";
import type { Config, GameMode, Item, MapData, Mob, MobTier, Terrain, Vec } from "./types";

const GOAL_NAMES = [
  "Auditorium",
  "Library",
  "Gymnasium",
  "Computer Lab",
  "Registrar",
  "Canteen",
  "Science Hall",
  "Oval Stage",
];

export function quadrantOf(m: { w: number; h: number }, v: Vec): number {
  return (v.x >= m.w / 2 ? 1 : 0) + (v.y >= m.h / 2 ? 2 : 0);
}

function carveBase(w: number, h: number, rng: Rng): Terrain[] {
  const t: Terrain[] = new Array(w * h).fill("path");
  // border walls
  for (let x = 0; x < w; x++) {
    t[x] = "wall";
    t[(h - 1) * w + x] = "wall";
  }
  for (let y = 0; y < h; y++) {
    t[y * w] = "wall";
    t[y * w + w - 1] = "wall";
  }
  // building blobs (walls)
  const blobs = randInt(rng, 5, 7);
  for (let i = 0; i < blobs; i++) {
    const bw = randInt(rng, 2, 4);
    const bh = randInt(rng, 2, 3);
    const bx = randInt(rng, 2, w - bw - 2);
    const by = randInt(rng, 2, h - bh - 2);
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++) t[y * w + x] = "wall";
  }
  // a pond
  const px = randInt(rng, 3, w - 5);
  const py = randInt(rng, 3, h - 4);
  for (let y = py; y < Math.min(h - 2, py + 2); y++)
    for (let x = px; x < Math.min(w - 2, px + 3); x++) t[y * w + x] = "water";
  // grass fields
  const patches = randInt(rng, 4, 6);
  for (let i = 0; i < patches; i++) {
    const gw = randInt(rng, 3, 6);
    const gh = randInt(rng, 2, 4);
    const gx = randInt(rng, 1, w - gw - 1);
    const gy = randInt(rng, 1, h - gh - 1);
    for (let y = gy; y < gy + gh; y++)
      for (let x = gx; x < gx + gw; x++)
        if (t[y * w + x] === "path") t[y * w + x] = "grass";
  }
  // bush thickets — walkable but the costliest soft terrain (§II)
  const thickets = randInt(rng, 2, 4);
  for (let i = 0; i < thickets; i++) {
    const bw2 = randInt(rng, 2, 3);
    const bh2 = randInt(rng, 1, 2);
    const bx2 = randInt(rng, 1, w - bw2 - 1);
    const by2 = randInt(rng, 1, h - bh2 - 1);
    for (let y = by2; y < by2 + bh2; y++)
      for (let x = bx2; x < bx2 + bw2; x++)
        if (t[y * w + x] === "path" || t[y * w + x] === "grass")
          t[y * w + x] = "bush";
  }
  // scattered boulders — single-tile hard blockers on any soft terrain
  const boulders = randInt(rng, 3, 6);
  for (let i = 0; i < boulders; i++) {
    const bx3 = randInt(rng, 2, w - 3);
    const by3 = randInt(rng, 2, h - 3);
    const cur = t[by3 * w + bx3];
    if (cur === "path" || cur === "grass" || cur === "mud" || cur === "bush")
      t[by3 * w + bx3] = "boulder";
  }
  // mud strips
  const muds = randInt(rng, 2, 4);
  for (let i = 0; i < muds; i++) {
    const mw = randInt(rng, 2, 4);
    const mh = randInt(rng, 1, 2);
    const mx = randInt(rng, 1, w - mw - 1);
    const my = randInt(rng, 1, h - mh - 1);
    for (let y = my; y < my + mh; y++)
      for (let x = mx; x < mx + mw; x++)
        if (t[y * w + x] === "path" || t[y * w + x] === "grass")
          t[y * w + x] = "mud";
  }
  // a couple of one-way ledges on path tiles
  const ledges = randInt(rng, 1, 3);
  for (let i = 0; i < ledges; i++) {
    const lx = randInt(rng, 2, w - 3);
    const ly = randInt(rng, 2, h - 3);
    if (t[ly * w + lx] === "path") t[ly * w + lx] = "ledge";
  }
  return t;
}

function nearestWalkable(m: MapData, from: Vec): Vec {
  if (walkable(m, from.x, from.y) && terrainAt(m, from.x, from.y) !== "ledge") return from;
  for (let r = 1; r < Math.max(m.w, m.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = from.x + dx;
        const y = from.y + dy;
        if (walkable(m, x, y) && terrainAt(m, x, y) !== "ledge") return { x, y };
      }
    }
  }
  return from;
}

function baseCtx(cfg: Config, map: MapData, mode: GameMode): Omit<CostContext, "excludeMobs"> {
  const deterministic = cfg.modes[mode].deterministic;
  const timeLimit = cfg.modes[mode].time_limit;
  return {
    cfg,
    map,
    p: cfg.agent.accuracy_prior,
    hpNow: cfg.resources.hp_max,
    timeLimit,
    ambushChance: deterministic ? 0 : cfg.mapgen.grass_encounter_chance,
    stepTimeEP: (cfg.ui.tween_ms / 1000) * (cfg.resources.energy_max / timeLimit),
  };
}

function feasInput(cfg: Config, mode: GameMode): FeasibilityInput {
  return {
    energy: cfg.resources.energy_max,
    timeLeftSec: cfg.modes[mode].time_limit,
    margin: cfg.agent.feasibility_margin,
    secPerStep: cfg.ui.tween_ms / 1000,
    questionSec: cfg.mapgen.question_timer_sec,
  };
}

/**
 * Generate a map that satisfies the full §II contract. Tries seeds until it does.
 * `avoidQuadrant` (optional) implements the anti-repeat rule: the caller passes
 * the previous run's goal quadrant — generation itself stays pure & deterministic.
 */
export function generateMap(
  cfg: Config,
  seed: number,
  mode: GameMode,
  avoidQuadrant = -1
): MapData {
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const m = tryGenerate(cfg, s, mode, avoidQuadrant);
    if (m) return m;
  }
  throw new Error("mapgen: could not satisfy contract after 60 attempts");
}

function tryGenerate(
  cfg: Config,
  seed: number,
  mode: GameMode,
  avoidQuadrant: number
): MapData | null {
  const rng = mulberry32(seed);
  const [w, h] = cfg.mapgen.grid;
  const terrain = carveBase(w, h, rng);

  const map: MapData = {
    w,
    h,
    terrain,
    spawn: { x: 0, y: 0 },
    goal: { x: 0, y: 0 },
    goalName: "",
    mobs: [],
    items: [],
    seed,
  };

  // Check 1 — center spawn
  map.spawn = nearestWalkable(map, { x: Math.floor(w / 2), y: Math.floor(h / 2) });

  // Check 2 — randomized far goal with anti-repeat quadrant
  const maxReach = Math.max(
    ...[
      { x: 1, y: 1 },
      { x: w - 2, y: 1 },
      { x: 1, y: h - 2 },
      { x: w - 2, y: h - 2 },
    ].map((c) => manhattan(map.spawn, c))
  );
  const minDist = cfg.mapgen.min_goal_dist_pct * maxReach;
  const candidates: Vec[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = { x, y };
      if (!walkable(map, x, y) || terrainAt(map, x, y) === "ledge") continue;
      if (manhattan(map.spawn, v) < minDist) continue;
      if (
        cfg.mapgen.anti_repeat_quadrant &&
        avoidQuadrant >= 0 &&
        quadrantOf(map, v) === avoidQuadrant
      )
        continue;
      candidates.push(v);
    }
  }
  if (!candidates.length) return null;
  map.goal = pick(rng, candidates);
  map.goalName = pick(rng, GOAL_NAMES);

  const ctx = baseCtx(cfg, map, mode);
  const fi = feasInput(cfg, mode);

  // must be reachable at all before mobs
  const bare = search({ ...ctx, excludeMobs: true }, map.spawn, map.goal);
  if (!bare.found || !pathFeasible(cfg, map, bare.path, fi)) return null;

  // Check 4 — gatekeepers: block EVERY mob-free route family
  const [minFights, maxFights] = cfg.mapgen.fights[mode];
  let mobId = 1;
  let guard = 0;
  for (;;) {
    const free = search({ ...ctx, excludeMobs: true }, map.spawn, map.goal);
    const blocked =
      !free.found || !pathFeasible(cfg, map, free.path, fi);
    if (blocked) break;
    if (++guard > maxFights + 4) return null; // too many families to gate — regen

    // place a gatekeeper mid-path on a tile that isn't spawn/goal/adjacent-to-spawn
    const path = free.path;
    const candidatesOnPath = path.slice(2, -1).filter(
      (v) => !mobAt(map, v.x, v.y) && terrainAt(map, v.x, v.y) !== "ledge"
    );
    if (!candidatesOnPath.length) return null;
    const spot = candidatesOnPath[Math.floor(candidatesOnPath.length / 2)];
    // §VII: the WRAITH guards the best (shortest) route family; later,
    // longer families get easier gatekeepers. This is what differentiates
    // agents: naive barrels into the wraith, risk-aware routes around it.
    const tier: MobTier = guard === 1 ? "wraith" : guard === 2 ? "goblin" : "slime";
    map.mobs.push(mkMob(mobId++, tier, spot, cfg, true));
  }
  if (map.mobs.length < 1) return null;

  // Check 3 — winnable with mobs priced in
  const priced = planRoute(ctx, map.spawn, map.goal, fi);
  if (!priced.result.found || !priced.feasible) return null;
  const fightsOnRoute = countMobsOnPath(map, priced.result.path);
  if (fightsOnRoute < Math.min(minFights, map.mobs.length) || fightsOnRoute > maxFights)
    return null;

  // Check 5 — optional avoidable prey near (not on) the route
  const route = new Set(priced.result.path.map((v) => v.y * w + v.x));
  let placed = 0;
  for (let tries = 0; tries < 80 && placed < cfg.mapgen.optional_mobs; tries++) {
    const x = randInt(rng, 1, w - 2);
    const y = randInt(rng, 1, h - 2);
    if (!walkable(map, x, y) || terrainAt(map, x, y) === "ledge") continue;
    if (route.has(y * w + x)) continue;
    if (mobAt(map, x, y)) continue;
    if (manhattan({ x, y }, map.spawn) < 3) continue;
    if (manhattan({ x, y }, map.goal) < 2) continue;
    map.mobs.push(mkMob(mobId++, pick(rng, ["slime", "slime", "goblin"]), { x, y }, cfg, false));
    // optional mobs must never make the run unwinnable
    const still = planRoute(baseCtx(cfg, map, mode), map.spawn, map.goal, fi);
    if (!still.result.found || !still.feasible) {
      map.mobs.pop();
      continue;
    }
    placed++;
  }

  // items: 1 medkit, 1-2 energy drinks, 0-1 time charm — off the main route when possible
  let itemId = 1;
  const wantItems: { kind: Item["kind"]; n: number }[] = [
    { kind: "medkit", n: 1 },
    { kind: "energydrink", n: randInt(rng, 1, 2) },
    { kind: "timecharm", n: randInt(rng, 0, 1) },
  ];
  for (const spec of wantItems) {
    for (let k = 0; k < spec.n; k++) {
      for (let tries = 0; tries < 60; tries++) {
        const x = randInt(rng, 1, w - 2);
        const y = randInt(rng, 1, h - 2);
        if (!walkable(map, x, y) || terrainAt(map, x, y) === "ledge") continue;
        if (mobAt(map, x, y)) continue;
        if (map.items.some((it) => it.pos.x === x && it.pos.y === y)) continue;
        if ((x === map.spawn.x && y === map.spawn.y) || (x === map.goal.x && y === map.goal.y))
          continue;
        map.items.push({ id: itemId++, kind: spec.kind, pos: { x, y }, taken: false });
        break;
      }
    }
  }

  return map;
}

function mkMob(id: number, tier: MobTier, pos: Vec, cfg: Config, gatekeeper: boolean): Mob {
  return {
    id,
    tier,
    pos: { ...pos },
    hitsLeft: cfg.mobs[tier].hits,
    defeated: false,
    retreatedFrom: false,
    gatekeeper,
  };
}

/** Test hook: verify the §II contract on a generated map. */
export function contractReport(cfg: Config, map: MapData, mode: GameMode) {
  const ctx = baseCtx(cfg, map, mode);
  const fi = feasInput(cfg, mode);
  const free = search({ ...ctx, excludeMobs: true }, map.spawn, map.goal);
  const priced = planRoute(ctx, map.spawn, map.goal, fi);
  return {
    centerSpawn:
      manhattan(map.spawn, { x: Math.floor(map.w / 2), y: Math.floor(map.h / 2) }) <= 3,
    goalFar:
      manhattan(map.spawn, map.goal) >=
      cfg.mapgen.min_goal_dist_pct *
        Math.max(
          manhattan(map.spawn, { x: 1, y: 1 }),
          manhattan(map.spawn, { x: map.w - 2, y: map.h - 2 }),
          manhattan(map.spawn, { x: map.w - 2, y: 1 }),
          manhattan(map.spawn, { x: 1, y: map.h - 2 })
        ),
    winnable: priced.result.found && priced.feasible,
    mobFreeBlocked: !free.found || !pathFeasible(cfg, map, free.path, fi),
    fightsOnRoute: countMobsOnPath(map, priced.result.path),
    gatekeepers: map.mobs.filter((m) => m.gatekeeper).length,
    optionals: map.mobs.filter((m) => !m.gatekeeper).length,
    pathEnergy: pathEnergy(cfg, map, priced.result.path),
  };
}
