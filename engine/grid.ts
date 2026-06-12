import type { MapData, Terrain, Vec } from "./types";

export const idx = (m: { w: number }, x: number, y: number) => y * m.w + x;

export function terrainAt(m: MapData, x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return "wall";
  return m.terrain[idx(m, x, y)];
}

export function walkable(m: MapData, x: number, y: number): boolean {
  const t = terrainAt(m, x, y);
  return t !== "wall" && t !== "water" && t !== "boulder";
}

/**
 * 4-connected neighbors honoring one-way ledges: a ledge tile can only be
 * ENTERED moving downward (+y), and can only be LEFT moving downward too —
 * you hop down a ledge, never climb back up through it.
 */
export function neighbors(m: MapData, p: Vec): Vec[] {
  const out: Vec[] = [];
  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  const here = terrainAt(m, p.x, p.y);
  for (const d of dirs) {
    const nx = p.x + d.x;
    const ny = p.y + d.y;
    if (!walkable(m, nx, ny)) continue;
    const nt = terrainAt(m, nx, ny);
    if (nt === "ledge" && d.y !== 1) continue; // enter ledge only from above
    if (here === "ledge" && d.y !== 1) continue; // leave ledge only downward
    out.push({ x: nx, y: ny });
  }
  return out;
}

export function manhattan(a: Vec, b: Vec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function sameVec(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function mobAt(m: MapData, x: number, y: number) {
  return m.mobs.find((mob) => !mob.defeated && mob.pos.x === x && mob.pos.y === y);
}

export function itemAt(m: MapData, x: number, y: number) {
  return m.items.find((it) => !it.taken && it.pos.x === x && it.pos.y === y);
}
