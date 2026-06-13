"use client";

// Themed tile renderer — Level 1 "Nature" / Level 2 "Water" / Level 3 "Fire"
// PNG tilesets (public/ui/tiles/*) with dirt-path autotiling. Terrain semantics
// live in the engine; THIS file is purely visual. Until a PNG loads, tiles fall
// back to flat theme colors so the canvas never flashes empty.
//
// Path autotile pieces (orientation decoded from the source art):
//   *_straight = N–S corridor   *_turn = N–E corner   *_tee = N+E+W (closed S)
// Rotated variants are baked once at load; 4-way crossings are synthesized from
// the straight tile's interior. Nature uses the "path_*" set, Fire the "fire_*"
// set; Water uses a single uniform path_water texture.

import { terrainAt } from "@/engine/grid";
import type { MapData, MapTheme } from "@/engine/types";

type Drawable = HTMLCanvasElement | HTMLImageElement;

const TILE_FILES = [
  // nature path autotile bases
  "path_straight",
  "path_turn",
  "path_tee",
  // fire path autotile bases
  "fire_straight",
  "fire_turn",
  "fire_tee",
  // nature ground & decor
  "grass1",
  "grass2",
  "mud1",
  "mud2",
  "mud3",
  "wall1",
  "bush1",
  "bush2",
  "grass_detail",
  "boulder",
  "stones",
  "tree1",
  "tree2",
  "tree3",
  "tree4",
  // water
  "water",
  "path_water",
  "lily1",
  "lily2",
  "water_boulder1",
  "water_boulder2",
  "wall2",
  // fire ground & decor
  "fire_grass",
  "fire_mud",
  "fire_bush",
  "fire_grass_detail",
] as const;

// reg keys include the static files above plus baked rotation/cross variants.
type TileName = string;

const reg = new Map<TileName, Drawable>();
let loadKicked = false;

function rotated(img: Drawable, deg: 90 | 180 | 270): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.translate(32, 32);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(img, -32, -32, 64, 64);
  return c;
}

/** Plain 4-way tile: stretch the straight tile's interior (no edges). */
function crossFrom(straight: Drawable): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const sw = "naturalWidth" in straight ? straight.naturalWidth : straight.width;
  const sh = "naturalHeight" in straight ? straight.naturalHeight : straight.height;
  g.drawImage(straight, sw * 0.2, 0, sw * 0.6, sh, 0, 0, 64, 64);
  return c;
}

/** Kick off PNG loading + bake rotation variants. Safe to call repeatedly. */
export function preloadTiles() {
  if (loadKicked || typeof document === "undefined") return;
  loadKicked = true;
  for (const name of TILE_FILES) {
    const img = new Image();
    img.onload = () => {
      reg.set(name, img);
      const m = /^(path|fire)_(straight|turn|tee)$/.exec(name);
      if (m) {
        const base = m[1];
        const piece = m[2];
        if (piece === "straight") {
          reg.set(`${base}_straight_90`, rotated(img, 90));
          reg.set(`${base}_cross`, crossFrom(img));
        } else {
          reg.set(`${base}_${piece}_90`, rotated(img, 90));
          reg.set(`${base}_${piece}_180`, rotated(img, 180));
          reg.set(`${base}_${piece}_270`, rotated(img, 270));
        }
      }
    };
    img.src = `/ui/tiles/${name}.png`;
  }
}

/** Deterministic per-tile hash for variant picking. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  h = (h ^ (h >>> 13)) * 0x5bd1e995;
  return (h ^ (h >>> 15)) >>> 0;
}

const FALLBACK: Record<MapTheme, Record<string, string>> = {
  nature: {
    path: "#caa56e",
    grass: "#6aa32a",
    mud: "#6d4c33",
    bush: "#2e7d32",
    wall: "#39434a",
    water: "#69b4a0",
    boulder: "#5e6b73",
    ledge: "#caa56e",
  },
  water: {
    path: "#3f7d6e",
    grass: "#4a9d86",
    mud: "#5d9e8c",
    bush: "#4f8f80",
    wall: "#2f3b35",
    water: "#244f86",
    boulder: "#6a7a72",
    ledge: "#3f7d6e",
  },
  fire: {
    path: "#7a4a2c",
    grass: "#8a5a2a",
    mud: "#5a3318",
    bush: "#b3431d",
    wall: "#3a2418",
    water: "#d63a14",
    boulder: "#4a3326",
    ledge: "#7a4a2c",
  },
};

function pathConnected(m: MapData, x: number, y: number): boolean {
  const t = terrainAt(m, x, y);
  return t === "path" || t === "ledge";
}

/** Autotile suffix for the path cell at (x,y): "straight" | "turn_90" | "tee" | "cross" … */
function pathSuffix(m: MapData, x: number, y: number): string {
  const n = pathConnected(m, x, y - 1);
  const e = pathConnected(m, x + 1, y);
  const s = pathConnected(m, x, y + 1);
  const w = pathConnected(m, x - 1, y);
  const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
  switch (mask) {
    case 5:
    case 1:
    case 4:
      return "straight";
    case 10:
    case 2:
    case 8:
      return "straight_90";
    case 3:
      return "turn";
    case 6:
      return "turn_90";
    case 12:
      return "turn_180";
    case 9:
      return "turn_270";
    case 11:
      return "tee";
    case 7:
      return "tee_90";
    case 14:
      return "tee_180";
    case 13:
      return "tee_270";
    default:
      return "cross";
  }
}

function blit(
  ctx: CanvasRenderingContext2D,
  name: TileName,
  px: number,
  py: number,
  size: number
): boolean {
  const d = reg.get(name);
  if (!d) return false;
  ctx.drawImage(d, px, py, size, size);
  return true;
}

function tint(ctx: CanvasRenderingContext2D, color: string, px: number, py: number, size: number) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
}

/**
 * Draw the terrain tile at map cell (x,y) for the given theme.
 * px/py = top-left pixel position; size = tile pixels.
 */
export function drawTerrainTile(
  ctx: CanvasRenderingContext2D,
  m: MapData,
  theme: MapTheme,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number
) {
  const t = terrainAt(m, x, y);
  const h = hash(x, y, m.seed);
  const fallback = () => tint(ctx, FALLBACK[theme][t] ?? "#222", px, py, size);
  const ledgeLip = () => {
    ctx.fillStyle = "rgba(74,52,28,0.85)";
    ctx.fillRect(px, py + size - 5, size, 5);
  };

  if (theme === "nature") {
    switch (t) {
      case "path":
      case "ledge": {
        if (!blit(ctx, `path_${pathSuffix(m, x, y)}`, px, py, size)) fallback();
        if (t === "ledge") ledgeLip();
        return;
      }
      case "grass": {
        if (!blit(ctx, h % 2 ? "grass1" : "grass2", px, py, size)) fallback();
        if (h % 100 < 18) blit(ctx, "grass_detail", px, py, size);
        return;
      }
      case "mud": {
        if (!blit(ctx, (["mud1", "mud2", "mud3"] as const)[h % 3], px, py, size)) fallback();
        return;
      }
      case "bush": {
        if (!blit(ctx, h % 2 ? "grass1" : "grass2", px, py, size)) fallback();
        blit(ctx, h % 3 === 0 ? "bush2" : "bush1", px, py, size);
        return;
      }
      case "boulder": {
        if (!blit(ctx, h % 2 ? "grass1" : "grass2", px, py, size)) fallback();
        blit(ctx, "boulder", px, py, size);
        if (h % 5 === 0) blit(ctx, "stones", px, py, size);
        return;
      }
      case "wall": {
        const border = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1;
        if (border) {
          if (!blit(ctx, "wall1", px, py, size)) fallback();
        } else {
          // interior wall blob → tree cluster (decorative blocking forest)
          if (!blit(ctx, h % 2 ? "grass1" : "grass2", px, py, size)) fallback();
          blit(ctx, (["tree1", "tree2", "tree3", "tree4"] as const)[h % 4], px, py, size);
        }
        return;
      }
      case "water": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        tint(ctx, "rgba(8,40,80,0.22)", px, py, size);
        return;
      }
    }
  } else if (theme === "water") {
    // WATER theme: lilies = walkable base ("grass"), shallow water = mid ("mud"),
    // path_water = corridor, deep water = blocking.
    switch (t) {
      case "path":
      case "ledge": {
        if (!blit(ctx, "path_water", px, py, size)) fallback();
        if (t === "ledge") ledgeLip();
        return;
      }
      case "grass": {
        if (!blit(ctx, h % 2 ? "lily1" : "lily2", px, py, size)) fallback();
        return;
      }
      case "mud": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        return;
      }
      case "bush": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        tint(ctx, "rgba(10,40,70,0.30)", px, py, size); // deeper wade — higher cost
        return;
      }
      case "boulder": {
        if (!blit(ctx, h % 2 ? "water_boulder1" : "water_boulder2", px, py, size)) fallback();
        return;
      }
      case "wall": {
        if (!blit(ctx, "wall2", px, py, size)) fallback();
        return;
      }
      case "water": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        tint(ctx, "rgba(4,28,52,0.50)", px, py, size); // deep water — blocking
        return;
      }
    }
  } else {
    // FIRE theme (Level 3). No dedicated wall/boulder/lava art — tint nature pieces warm.
    switch (t) {
      case "path":
      case "ledge": {
        if (!blit(ctx, `fire_${pathSuffix(m, x, y)}`, px, py, size)) fallback();
        if (t === "ledge") ledgeLip();
        return;
      }
      case "grass": {
        if (!blit(ctx, "fire_grass", px, py, size)) fallback();
        if (h % 100 < 22) blit(ctx, "fire_grass_detail", px, py, size);
        return;
      }
      case "mud": {
        if (!blit(ctx, "fire_mud", px, py, size)) fallback();
        return;
      }
      case "bush": {
        if (!blit(ctx, "fire_grass", px, py, size)) fallback();
        blit(ctx, "fire_bush", px, py, size);
        return;
      }
      case "boulder": {
        if (!blit(ctx, "fire_grass", px, py, size)) fallback();
        blit(ctx, "boulder", px, py, size);
        tint(ctx, "rgba(120,30,8,0.30)", px, py, size); // charred warm cast
        return;
      }
      case "wall": {
        if (!blit(ctx, "wall1", px, py, size)) fallback();
        tint(ctx, "rgba(150,40,10,0.34)", px, py, size); // scorched obsidian wall
        return;
      }
      case "water": {
        // "lava" — molten blocking pool
        if (!blit(ctx, "fire_mud", px, py, size)) fallback();
        tint(ctx, "rgba(214,58,20,0.55)", px, py, size);
        return;
      }
    }
  }
  fallback();
}
