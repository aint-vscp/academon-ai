// Sprite registry — the PNG drop-in contract.
//
// EVERY visual element resolves through this registry by name. The loader
// tries /sprites/<name>.png first; if the file doesn't exist it falls back
// to a procedurally drawn 16×16 pixel-art placeholder. To re-skin the game
// later, drop correctly named PNGs into /public/sprites — zero code changes.
// See public/sprites/MANIFEST.md for the full naming contract.

"use client";

export type SpriteName =
  | "terrain_path"
  | "terrain_grass"
  | "terrain_mud"
  | "terrain_water"
  | "terrain_wall"
  | "terrain_ledge"
  | "hero"
  | "hero_isko"
  | "hero_iska"
  | "mob_slime"
  | "mob_goblin"
  | "mob_wraith"
  | "mob_slime_nature"
  | "mob_slime_water"
  | "mob_slime_fire"
  | "mob_goblin_nature"
  | "mob_goblin_water"
  | "mob_goblin_fire"
  | "mob_wraith_nature"
  | "mob_wraith_water"
  | "mob_wraith_fire"
  | "item_medkit"
  | "item_energydrink"
  | "item_timecharm"
  | "goal_building";

export const SPRITE_NAMES: SpriteName[] = [
  "terrain_path",
  "terrain_grass",
  "terrain_mud",
  "terrain_water",
  "terrain_wall",
  "terrain_ledge",
  "hero",
  "hero_isko",
  "hero_iska",
  "mob_slime",
  "mob_goblin",
  "mob_wraith",
  "mob_slime_nature",
  "mob_slime_water",
  "mob_slime_fire",
  "mob_goblin_nature",
  "mob_goblin_water",
  "mob_goblin_fire",
  "mob_wraith_nature",
  "mob_wraith_water",
  "mob_wraith_fire",
  "item_medkit",
  "item_energydrink",
  "item_timecharm",
  "goal_building",
];

// ---- chosen playable character (Isko / Iska) ----
export type HeroVariant = "isko" | "iska";
let heroVariant: HeroVariant = "isko";
export function setHeroVariant(v: HeroVariant) {
  heroVariant = v;
}
export function getHeroVariant(): HeroVariant {
  return heroVariant;
}
/** Portrait art for the chosen character (start flow + map fallback). */
export function heroPortraitSrc(v: HeroVariant = heroVariant): string {
  return `/ui/hero/${v}_front.png`;
}

export const SPRITE_SIZE = 16; // native pixels; renderer scales with nearest-neighbor

type Drawable = HTMLCanvasElement | HTMLImageElement;
const cache = new Map<SpriteName, Drawable>();

/** 16×16 pixel placeholder painter. px(x,y,w,h,color) on a tiny canvas. */
function paint(draw: (px: (x: number, y: number, w: number, h: number, c: string) => void) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  draw(px);
  return c;
}

function paintSlime(): HTMLCanvasElement {
  return paint((px) => {
    px(3, 7, 10, 6, "#42a5f5");
    px(2, 9, 12, 4, "#42a5f5");
    px(4, 5, 8, 3, "#64b5f6");
    px(5, 8, 2, 2, "#0d2c4f");
    px(9, 8, 2, 2, "#0d2c4f");
    px(7, 11, 2, 1, "#0d2c4f");
    px(4, 6, 2, 1, "#bbdefb");
  });
}

function paintGoblin(): HTMLCanvasElement {
  return paint((px) => {
    px(5, 3, 6, 5, "#43a047"); // head
    px(2, 3, 3, 2, "#43a047"); // ears
    px(11, 3, 3, 2, "#43a047");
    px(6, 5, 1, 1, "#ff1744");
    px(9, 5, 1, 1, "#ff1744");
    px(6, 7, 4, 1, "#1b5e20");
    px(5, 8, 6, 5, "#2e7d32"); // body
    px(3, 9, 2, 3, "#43a047");
    px(11, 9, 2, 3, "#43a047");
    px(5, 13, 2, 2, "#1b5e20");
    px(9, 13, 2, 2, "#1b5e20");
    px(12, 7, 2, 4, "#8d6e63"); // little quiz scroll
  });
}

function paintWraith(): HTMLCanvasElement {
  return paint((px) => {
    px(4, 2, 8, 9, "#6a1b9a");
    px(3, 5, 10, 6, "#6a1b9a");
    px(5, 11, 2, 3, "#4a148c");
    px(8, 11, 2, 2, "#4a148c");
    px(11, 11, 1, 3, "#4a148c");
    px(5, 5, 2, 2, "#e1bee7"); // hollow glowing eyes
    px(9, 5, 2, 2, "#e1bee7");
    px(6, 9, 4, 1, "#4a148c");
    px(2, 3, 1, 4, "#9c4dcc");
    px(13, 3, 1, 4, "#9c4dcc");
  });
}

const placeholders: Record<SpriteName, () => HTMLCanvasElement> = {
  terrain_path: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#d8c290");
      px(2, 3, 1, 1, "#c4ae7c");
      px(9, 7, 1, 1, "#c4ae7c");
      px(5, 12, 1, 1, "#c4ae7c");
      px(13, 2, 1, 1, "#e6d2a4");
      px(12, 13, 1, 1, "#c4ae7c");
    }),
  terrain_grass: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#4caf50");
      px(1, 2, 1, 3, "#2e7d32");
      px(5, 6, 1, 3, "#2e7d32");
      px(9, 1, 1, 3, "#2e7d32");
      px(13, 8, 1, 3, "#2e7d32");
      px(3, 11, 1, 3, "#66bb6a");
      px(11, 12, 1, 3, "#2e7d32");
      px(7, 13, 1, 2, "#66bb6a");
    }),
  terrain_mud: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#6d4c33");
      px(2, 2, 4, 2, "#5a3d27");
      px(9, 5, 4, 2, "#5a3d27");
      px(4, 9, 5, 2, "#7d5a3d");
      px(10, 12, 4, 2, "#5a3d27");
    }),
  terrain_water: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#2f6fb3");
      px(1, 3, 5, 1, "#5b96d6");
      px(8, 6, 6, 1, "#5b96d6");
      px(3, 10, 5, 1, "#5b96d6");
      px(9, 13, 4, 1, "#244f86");
    }),
  terrain_wall: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#8a8a8a");
      px(0, 0, 16, 1, "#a5a5a5");
      px(0, 4, 16, 1, "#6f6f6f");
      px(0, 9, 16, 1, "#6f6f6f");
      px(0, 14, 16, 1, "#5c5c5c");
      px(4, 1, 1, 3, "#6f6f6f");
      px(11, 5, 1, 4, "#6f6f6f");
      px(6, 10, 1, 4, "#6f6f6f");
    }),
  terrain_ledge: () =>
    paint((px) => {
      px(0, 0, 16, 16, "#d8c290");
      px(0, 6, 16, 2, "#8a6d45");
      px(0, 8, 16, 1, "#6e5535");
      px(7, 10, 2, 3, "#8a6d45"); // arrow down
      px(5, 12, 6, 1, "#8a6d45");
      px(6, 13, 4, 1, "#6e5535");
    }),
  hero: () =>
    paint((px) => {
      // AcadéMon scholar: graduation cap + gold tassel
      px(4, 1, 8, 2, "#1a1a2e"); // cap
      px(2, 2, 12, 1, "#1a1a2e");
      px(12, 2, 1, 3, "#ffd54f"); // tassel
      px(5, 4, 6, 4, "#ffcc9c"); // face
      px(6, 5, 1, 1, "#222");
      px(9, 5, 1, 1, "#222");
      px(4, 8, 8, 5, "#7e3ff2"); // robe
      px(7, 8, 2, 4, "#ffd54f");
      px(4, 13, 3, 2, "#1a1a2e");
      px(9, 13, 3, 2, "#1a1a2e");
    }),
  hero_isko: () =>
    paint((px) => {
      // Isko: brown hair, blue jacket, red tie, jeans
      px(4, 1, 8, 3, "#6d4c2f"); // hair
      px(3, 2, 2, 2, "#6d4c2f");
      px(11, 2, 2, 2, "#6d4c2f");
      px(5, 4, 6, 3, "#ffcc9c"); // face
      px(6, 5, 1, 1, "#222");
      px(9, 5, 1, 1, "#222");
      px(4, 7, 8, 5, "#2457c5"); // jacket
      px(7, 7, 2, 3, "#fff"); // shirt
      px(7, 8, 2, 2, "#d32f2f"); // tie
      px(4, 12, 8, 2, "#27365c"); // jeans
      px(4, 14, 3, 1, "#fff"); // shoes
      px(9, 14, 3, 1, "#fff");
    }),
  hero_iska: () =>
    paint((px) => {
      // Iska: brown bob, white blouse, red bow, yellow skirt
      px(4, 1, 8, 3, "#7d5838"); // hair
      px(3, 2, 2, 3, "#7d5838");
      px(11, 2, 2, 3, "#7d5838");
      px(10, 1, 2, 1, "#ffd54f"); // hair clip
      px(5, 4, 6, 3, "#ffd2a8"); // face
      px(6, 5, 1, 1, "#1c3aa9");
      px(9, 5, 1, 1, "#1c3aa9");
      px(4, 7, 8, 4, "#fafafa"); // blouse
      px(7, 7, 2, 2, "#d32f2f"); // bow
      px(4, 11, 8, 2, "#f5b81c"); // skirt
      px(5, 13, 2, 1, "#fff"); // socks
      px(9, 13, 2, 1, "#fff");
      px(4, 14, 3, 1, "#e8e8e8"); // shoes
      px(9, 14, 3, 1, "#e8e8e8");
    }),
  mob_slime: paintSlime,
  mob_goblin: paintGoblin,
  mob_wraith: paintWraith,
  mob_slime_nature: paintSlime,
  mob_slime_water: paintSlime,
  mob_slime_fire: paintSlime,
  mob_goblin_nature: paintGoblin,
  mob_goblin_water: paintGoblin,
  mob_goblin_fire: paintGoblin,
  mob_wraith_nature: paintWraith,
  mob_wraith_water: paintWraith,
  mob_wraith_fire: paintWraith,
  item_medkit: () =>
    paint((px) => {
      px(2, 4, 12, 9, "#fafafa");
      px(2, 4, 12, 2, "#e53935");
      px(7, 7, 2, 5, "#e53935");
      px(5, 9, 6, 2, "#e53935") ;
      px(2, 12, 12, 1, "#bdbdbd");
    }),
  item_energydrink: () =>
    paint((px) => {
      px(5, 2, 6, 3, "#9e9e9e"); // cap
      px(4, 5, 8, 9, "#ffb300"); // can
      px(6, 6, 4, 7, "#ffd54f");
      px(7, 6, 2, 3, "#f57f17"); // bolt
      px(6, 9, 2, 3, "#f57f17");
    }),
  item_timecharm: () =>
    paint((px) => {
      px(5, 1, 6, 2, "#8d6e63");
      px(3, 3, 10, 10, "#eceff1");
      px(4, 4, 8, 8, "#fafafa");
      px(7, 5, 1, 4, "#37474f"); // hands
      px(8, 8, 3, 1, "#37474f");
      px(2, 6, 1, 4, "#b0bec5");
      px(13, 6, 1, 4, "#b0bec5");
    }),
  goal_building: () =>
    paint((px) => {
      px(1, 7, 14, 8, "#ffe082"); // glowing building
      px(0, 6, 16, 1, "#ffb300");
      px(2, 3, 12, 4, "#ffca28"); // roof
      px(7, 1, 2, 3, "#ffb300"); // flag pole
      px(9, 1, 4, 2, "#e53935"); // flag
      px(3, 9, 3, 6, "#6d4c33"); // door
      px(8, 9, 2, 2, "#4fc3f7"); // windows
      px(11, 9, 2, 2, "#4fc3f7");
    }),
};

/**
 * Resolve a sprite: PNG from /sprites/<name>.png when available,
 * procedural placeholder otherwise. Synchronous fallback, async upgrade.
 * Hero variants additionally fall back to the extracted /ui portraits.
 */
export function getSprite(name: SpriteName): Drawable {
  const hit = cache.get(name);
  if (hit) return hit;
  const ph = placeholders[name]();
  cache.set(name, ph);
  // async PNG upgrade — swaps into the cache when it loads
  const img = new Image();
  img.onload = () => cache.set(name, img);
  img.onerror = () => {
    if (name === "hero_isko" || name === "hero_iska") {
      const portrait = new Image();
      portrait.onload = () => cache.set(name, portrait);
      portrait.onerror = () => {};
      portrait.src = heroPortraitSrc(name.slice(5) as HeroVariant);
    }
  };
  img.src = `/sprites/${name}.png`;
  return ph;
}

/** Kick off PNG probing for everything (call once at game mount). */
export function preloadSprites() {
  for (const n of SPRITE_NAMES) getSprite(n);
}

/** Per-theme mob art: tries mob_<tier>_<theme>.png, falls back to the flat mob sprite. */
export function getMobSprite(
  tier: "slime" | "goblin" | "wraith",
  theme: "nature" | "water" | "fire"
): Drawable {
  const themed = `mob_${tier}_${theme}` as SpriteName;
  const flat = `mob_${tier}` as SpriteName;
  const cached = cache.get(themed);
  if (cached) return cached;
  // seed the themed cache from the flat sprite so it never flashes empty,
  // then async-upgrade to the themed PNG when it loads.
  const seed = getSprite(flat);
  cache.set(themed, seed);
  const img = new Image();
  img.onload = () => cache.set(themed, img);
  img.onerror = () => {}; // keep the flat fallback
  img.src = `/sprites/${themed}.png`;
  return cache.get(themed) ?? seed;
}
