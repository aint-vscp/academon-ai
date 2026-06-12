"use client";

// Directional hero walk frames (public/ui/hero/*). Facing assignments were
// decoded from the art itself (skin-pixel offset analysis), NOT from
// filenames — several uploads were mislabeled:
//   isko: front=[walk1,walk2] back=[walk7,walk8] right=[walk3,walk6] left=[walk4,walk5]
//   iska: front=[walk1,walk2] back=[walk7,walk8] right=[walk3,walk5] left=[walk4,walk6]
// Isko has no left STANDING frame — his right stand is baked mirrored.

import { getSprite, type HeroVariant, type SpriteName } from "./sprites";

export type Facing = "front" | "back" | "left" | "right";

type Drawable = HTMLCanvasElement | HTMLImageElement;

interface FrameSpec {
  stand: string;
  walk: [string, string];
  /** Mirror the standing frame horizontally (missing art). */
  mirrorStand?: boolean;
}

const SPECS: Record<HeroVariant, Record<Facing, FrameSpec>> = {
  isko: {
    front: { stand: "isko_front", walk: ["isko_walk1", "isko_walk2"] },
    back: { stand: "isko_back", walk: ["isko_walk7", "isko_walk8"] },
    right: { stand: "isko_right", walk: ["isko_walk3", "isko_walk6"] },
    left: { stand: "isko_right", walk: ["isko_walk4", "isko_walk5"], mirrorStand: true },
  },
  iska: {
    front: { stand: "iska_front", walk: ["iska_walk1", "iska_walk2"] },
    back: { stand: "iska_back", walk: ["iska_walk7", "iska_walk8"] },
    right: { stand: "iska_right", walk: ["iska_walk3", "iska_walk5"] },
    left: { stand: "iska_left", walk: ["iska_walk4", "iska_walk6"] },
  },
};

const frames = new Map<string, Drawable>();
const kicked = new Set<string>();

function mirrored(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  return c;
}

function kick(file: string, key: string, mirror = false) {
  if (kicked.has(key)) return;
  kicked.add(key);
  const img = new Image();
  img.onload = () => frames.set(key, mirror ? mirrored(img) : img);
  img.src = `/ui/hero/${file}.png`;
}

/** Start loading every frame for a variant (call at game start). */
export function preloadHeroFrames(v: HeroVariant) {
  const spec = SPECS[v];
  (Object.keys(spec) as Facing[]).forEach((f) => {
    const s = spec[f];
    kick(s.stand, `${v}|${f}|stand`, s.mirrorStand);
    kick(s.walk[0], `${v}|${f}|w0`);
    kick(s.walk[1], `${v}|${f}|w1`);
  });
}

/**
 * Resolve the current frame. `phase` is a continuous step counter
 * (steps + tween progress); each tile step swaps the two walk frames twice.
 * Falls back to the legacy single hero sprite until PNGs arrive.
 */
export function getHeroFrame(
  v: HeroVariant,
  facing: Facing,
  walking: boolean,
  phase: number
): Drawable {
  const key = walking
    ? `${v}|${facing}|w${Math.floor(phase * 2) % 2}`
    : `${v}|${facing}|stand`;
  return frames.get(key) ?? getSprite(`hero_${v}` as SpriteName);
}
