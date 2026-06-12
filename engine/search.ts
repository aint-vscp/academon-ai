// Risk-cost A* — §V/§VI of the mechanics doc.
// h = Manhattan × min edge cost (1 EP) → admissible → optimal per snapshot.
// Mob tiles are priced at E[fight]; Plan A excludes mobs entirely.

import { itemAt, manhattan, mobAt, neighbors, terrainAt } from "./grid";
import { eFight } from "./economy";
import type { Config, MapData, MobTier, Vec } from "./types";

export interface CostContext {
  cfg: Config;
  map: MapData;
  /** Estimated answer accuracy p (Laplace). */
  p: number;
  hpNow: number;
  timeLimit: number;
  /** When true, undefeated mob tiles cost Infinity (Plan A / avoidance). */
  excludeMobs: boolean;
  /** Naive agent ignores risk: mob tiles cost flat +2 like v1. */
  naive?: boolean;
  /** Grass ambush pricing is skipped in deterministic (exhibit) mode. */
  ambushChance: number;
  /**
   * EP value of the time one step takes (secPerStep × κ_t). Pricing step time
   * keeps fights and walking in the SAME currency — without it the agent
   * over-detours (fights pay time-EP, steps don't). Symmetry, not a knob.
   */
  stepTimeEP: number;
}

export function terrainEnergy(cfg: Config, t: string): number {
  switch (t) {
    case "path":
    case "ledge":
      return cfg.costs.path;
    case "grass":
      return cfg.costs.grass;
    case "mud":
      return cfg.costs.mud;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/** EP cost of stepping ONTO tile (x,y). One formula powers everything (§VI). */
export function tileCost(ctx: CostContext, x: number, y: number): number {
  const t = terrainAt(ctx.map, x, y);
  let cost = terrainEnergy(ctx.cfg, t);
  if (!Number.isFinite(cost)) return cost;
  cost += ctx.stepTimeEP; // step time priced in the same currency as fight time

  const mob = mobAt(ctx.map, x, y);
  if (mob && mob.retreatedFrom) return Number.POSITIVE_INFINITY; // player said no
  if (mob) {
    if (ctx.excludeMobs) return Number.POSITIVE_INFINITY;
    cost += ctx.naive
      ? 2 // v1 flat encounter penalty — kept as the naive baseline
      : eFight(ctx.cfg, mob.tier, ctx.p, ctx.hpNow, ctx.timeLimit);
  } else if (t === "grass" && !ctx.naive && ctx.ambushChance > 0) {
    cost +=
      ctx.ambushChance * eFight(ctx.cfg, "slime", ctx.p, ctx.hpNow, ctx.timeLimit);
  }
  return cost;
}

interface Node {
  v: Vec;
  g: number;
  f: number;
  parent?: Node;
}

class MinHeap {
  arr: Node[] = [];
  push(n: Node) {
    this.arr.push(n);
    let i = this.arr.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.arr[p].f <= this.arr[i].f) break;
      [this.arr[p], this.arr[i]] = [this.arr[i], this.arr[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const top = this.arr[0];
    const last = this.arr.pop();
    if (this.arr.length && last) {
      this.arr[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < this.arr.length && this.arr[l].f < this.arr[s].f) s = l;
        if (r < this.arr.length && this.arr[r].f < this.arr[s].f) s = r;
        if (s === i) break;
        [this.arr[s], this.arr[i]] = [this.arr[i], this.arr[s]];
        i = s;
      }
    }
    return top;
  }
  get size() {
    return this.arr.length;
  }
}

export interface SearchResult {
  path: Vec[]; // includes start and goal
  cost: number; // total EP of edges (excludes start tile)
  explored: Vec[]; // closed set, for the search visualization
  found: boolean;
}

export type Algo = "astar" | "greedy" | "dijkstra";

export function search(
  ctx: CostContext,
  start: Vec,
  goal: Vec,
  algo: Algo = "astar"
): SearchResult {
  const m = ctx.map;
  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const closed = new Set<number>();
  const explored: Vec[] = [];
  const key = (v: Vec) => v.y * m.w + v.x;

  const h = (v: Vec) =>
    algo === "dijkstra" ? 0 : manhattan(v, goal) * 1; // min edge cost = 1 EP (admissible)

  const startNode: Node = { v: start, g: 0, f: algo === "greedy" ? h(start) : h(start) };
  open.push(startNode);
  gScore.set(key(start), 0);

  while (open.size) {
    const cur = open.pop()!;
    const ck = key(cur.v);
    if (closed.has(ck)) continue;
    closed.add(ck);
    explored.push(cur.v);

    if (cur.v.x === goal.x && cur.v.y === goal.y) {
      const path: Vec[] = [];
      let n: Node | undefined = cur;
      while (n) {
        path.push(n.v);
        n = n.parent;
      }
      path.reverse();
      return { path, cost: cur.g, explored, found: true };
    }

    for (const nb of neighbors(m, cur.v)) {
      const nk = key(nb);
      if (closed.has(nk)) continue;
      const c = tileCost(ctx, nb.x, nb.y);
      if (!Number.isFinite(c)) continue;
      const ng = cur.g + c;
      const prev = gScore.get(nk);
      if (prev !== undefined && prev <= ng) continue;
      gScore.set(nk, ng);
      const f = algo === "greedy" ? h(nb) : ng + h(nb);
      open.push({ v: nb, g: ng, f, parent: cur });
    }
  }
  return { path: [], cost: Number.POSITIVE_INFINITY, explored, found: false };
}

export interface PlanOutcome {
  result: SearchResult;
  /** "avoid" = mob-free Plan A; "engage" = Plan B through cheapest mob(s). */
  plan: "avoid" | "engage";
  feasible: boolean;
}

export interface FeasibilityInput {
  energy: number;
  timeLeftSec: number;
  margin: number;
  /** seconds the hero needs per step (tween) */
  secPerStep: number;
  questionSec: number;
}

/** Pure-energy cost of a path (terrain only — what the battery actually pays). */
export function pathEnergy(cfg: Config, map: MapData, path: Vec[]): number {
  let e = 0;
  for (let i = 1; i < path.length; i++) {
    e += terrainEnergy(cfg, terrainAt(map, path[i].x, path[i].y));
  }
  return e;
}

export function countMobsOnPath(map: MapData, path: Vec[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    if (mobAt(map, path[i].x, path[i].y)) n++;
  }
  return n;
}

export function pathFeasible(
  cfg: Config,
  map: MapData,
  path: Vec[],
  fi: FeasibilityInput
): boolean {
  if (!path.length) return false;
  const energyNeed = pathEnergy(cfg, map, path);
  const fights = countMobsOnPath(map, path);
  const timeNeed = (path.length - 1) * fi.secPerStep + fights * fi.questionSec;
  return (
    energyNeed * fi.margin <= fi.energy && timeNeed * fi.margin <= fi.timeLeftSec
  );
}

/**
 * Avoidance-first planning — §VI:
 * Plan A: mob-free graph; take it if it exists, is feasible, AND costs no more
 * than avoidance_bias × Plan B (dodging a fight is worth a premium, but the
 * agent won't march 5× farther to skip a cheap slime — playtest finding).
 * Plan B: price mobs at E[fight]; route through the cheapest unavoidable mob.
 */
export function planRoute(
  base: Omit<CostContext, "excludeMobs">,
  start: Vec,
  goal: Vec,
  fi: FeasibilityInput,
  algo: Algo = "astar"
): PlanOutcome {
  const engage = search({ ...base, excludeMobs: false }, start, goal, algo);
  if (base.cfg.agent.avoidance_first && !base.naive) {
    const avoid = search({ ...base, excludeMobs: true }, start, goal, algo);
    const bias = base.cfg.agent.avoidance_bias ?? 1.5;
    if (
      avoid.found &&
      pathFeasible(base.cfg, base.map, avoid.path, fi) &&
      (!engage.found || avoid.cost <= engage.cost * bias)
    ) {
      return { result: avoid, plan: "avoid", feasible: true };
    }
  }
  return {
    result: engage,
    plan: "engage",
    feasible: engage.found && pathFeasible(base.cfg, base.map, engage.path, fi),
  };
}

/**
 * Multi-goal item detour — §VIII: two searches, compare
 * f(start→item→goal) vs f(start→goal); take the detour when the restored
 * budget (in EP) beats the extra path cost.
 */
export function bestItemDetour(
  base: Omit<CostContext, "excludeMobs">,
  start: Vec,
  goal: Vec,
  kinds: ("medkit" | "energydrink" | "timecharm")[],
  valueEP: (kind: string) => number
): { itemId: number; path: Vec[]; gain: number } | null {
  const direct = search({ ...base, excludeMobs: false }, start, goal);
  if (!direct.found) return null;
  let best: { itemId: number; path: Vec[]; gain: number } | null = null;
  for (const it of base.map.items) {
    if (it.taken || !kinds.includes(it.kind)) continue;
    const leg1 = search({ ...base, excludeMobs: false }, start, it.pos);
    if (!leg1.found) continue;
    const leg2 = search({ ...base, excludeMobs: false }, it.pos, goal);
    if (!leg2.found) continue;
    const detourCost = leg1.cost + leg2.cost;
    const gain = valueEP(it.kind) - (detourCost - direct.cost);
    if (gain > 0 && (!best || gain > best.gain)) {
      best = { itemId: it.id, path: leg1.path.concat(leg2.path.slice(1)), gain };
    }
  }
  return best;
}
