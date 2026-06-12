"use client";

// Themed tile renderer — Level 1 "Nature" / Level 2 "Water" PNG tilesets
// (public/ui/tiles/*) with dirt-path autotiling. Terrain semantics live in the
// engine; THIS file is purely visual. Until a PNG loads, tiles fall back to
// flat theme colors so the canvas never flashes empty.
//
// Path autotile pieces (orientation decoded from the source art):
//   path_straight = N–S corridor   path_turn = N–E corner   path_tee = N+E+W (closed S)
// Rotated variants are baked once at load; 4-way crossings are synthesized
// from the straight tile's interior (no cross asset exists).

import { terrainAt } from "@/engine/grid";
import type { MapData, MapTheme } from "@/engine/types";

type Drawable = HTMLCanvasElement | HTMLImageElement;

const TILE_FILES = [
  "path_straight",
  "path_turn",
  "path_tee",
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
  "water",
  "lily1",
  "lily2",
  "water_boulder1",
  "water_boulder2",
  "wall2",
] as const;

type TileName =
  | (typeof TILE_FILES)[number]
  | "path_straight_90"
  | "path_turn_90"
  | "path_turn_180"
  | "path_turn_270"
  | "path_tee_90"
  | "path_tee_180"
  | "path_tee_270"
  | "path_cross";

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

/** Plain-dirt 4-way tile: stretch the straight tile's interior (no edges). */
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
      if (name === "path_straight") {
        reg.set("path_straight_90", rotated(img, 90));
        reg.set("path_cross", crossFrom(img));
      } else if (name === "path_turn") {
        reg.set("path_turn_90", rotated(img, 90));
        reg.set("path_turn_180", rotated(img, 180));
        reg.set("path_turn_270", rotated(img, 270));
      } else if (name === "path_tee") {
        reg.set("path_tee_90", rotated(img, 90));
        reg.set("path_tee_180", rotated(img, 180));
        reg.set("path_tee_270", rotated(img, 270));
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
    path: "#69b4a0",
    grass: "#69b4a0",
    mud: "#5d9e8c",
    bush: "#5d9e8c",
    wall: "#2f3b35",
    water: "#3f7d6e",
    boulder: "#6a7a72",
    ledge: "#69b4a0",
  },
};

function pathConnected(m: MapData, x: number, y: number): boolean {
  const t = terrainAt(m, x, y);
  return t === "path" || t === "ledge";
}

function pathTileName(m: MapData, x: number, y: number): TileName {
  const n = pathConnected(m, x, y - 1);
  const e = pathConnected(m, x + 1, y);
  const s = pathConnected(m, x, y + 1);
  const w = pathConnected(m, x - 1, y);
  const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
  switch (mask) {
    case 5: // N+S
    case 1:
    case 4:
      return "path_straight";
    case 10: // E+W
    case 2:
    case 8:
      return "path_straight_90";
    case 3:
      return "path_turn"; // N+E
    case 6:
      return "path_turn_90"; // E+S
    case 12:
      return "path_turn_180"; // S+W
    case 9:
      return "path_turn_270"; // W+N
    case 11:
      return "path_tee"; // N+E+W (closed S)
    case 7:
      return "path_tee_90"; // N+E+S (closed W)
    case 14:
      return "path_tee_180"; // E+S+W (closed N)
    case 13:
      return "path_tee_270"; // N+S+W (closed E)
    default:
      return "path_cross"; // 4-way or isolated
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
  const fallback = () => {
    ctx.fillStyle = FALLBACK[theme][t] ?? "#222";
    ctx.fillRect(px, py, size, size);
  };

  if (theme === "nature") {
    switch (t) {
      case "path":
      case "ledge": {
        if (!blit(ctx, pathTileName(m, x, y), px, py, size)) fallback();
        if (t === "ledge") {
          // one-way drop marker: dark lip along the bottom edge
          ctx.fillStyle = "rgba(74,52,28,0.85)";
          ctx.fillRect(px, py + size - 5, size, 5);
        }
        return;
      }
      case "grass": {
        if (!blit(ctx, h % 2 ? "grass1" : "grass2", px, py, size)) fallback();
        if (h % 100 < 18) blit(ctx, "grass_detail", px, py, size);
        return;
      }
      case "mud": {
        const v = (["mud1", "mud2", "mud3"] as const)[h % 3];
        if (!blit(ctx, v, px, py, size)) fallback();
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
        if (h % 5 === 0) blit(ctx, "stones", px, py, size); // extra rubble detail
        return;
      }
      case "wall": {
        if (!blit(ctx, "wall1", px, py, size)) fallback();
        return;
      }
      case "water": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        ctx.fillStyle = "rgba(8,40,80,0.22)"; // pond = slightly deeper hue
        ctx.fillRect(px, py, size, size);
        return;
      }
    }
  } else {
    // WATER theme: open water is the walkable "path"; lilies are the soft obstacles.
    switch (t) {
      case "path":
      case "grass":
      case "ledge": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        if (t === "grass" && h % 100 < 14) {
          // sparkle variance on "grass"-cost water (reeds current)
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(px + (h % 32), py + ((h >> 5) % 48), 6, 3);
        }
        return;
      }
      case "mud": {
        if (!blit(ctx, "lily1", px, py, size)) fallback(); // plain pad — mid cost
        return;
      }
      case "bush": {
        if (!blit(ctx, "lily2", px, py, size)) fallback(); // flowered pad — high cost
        return;
      }
      case "boulder": {
        const v = h % 2 ? "water_boulder1" : "water_boulder2";
        if (!blit(ctx, v as TileName, px, py, size)) fallback();
        return;
      }
      case "wall": {
        if (!blit(ctx, "wall2", px, py, size)) fallback();
        return;
      }
      case "water": {
        if (!blit(ctx, "water", px, py, size)) fallback();
        ctx.fillStyle = "rgba(4,28,52,0.45)"; // deep water — blocking
        ctx.fillRect(px, py, size, size);
        return;
      }
    }
  }
  fallback();
}
