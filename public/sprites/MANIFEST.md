# Sprite Manifest — PNG drop-in contract

The renderer resolves **every** visual through `lib/sprites.ts`. To re-skin the
game, drop PNG files with these exact names into this folder
(`public/sprites/`). No code changes needed — PNGs override the built-in
pixel placeholders automatically at load time.

## Rules

- **Native size: 16×16 px** (any square power-of-two works; 16 recommended).
- Transparent background (PNG alpha).
- Keep it pixel-art: the canvas scales with nearest-neighbor (no smoothing),
  so chunky pixels stay crisp.

## File names

| File | What it skins |
|---|---|
| `terrain_path.png` | walkway / hallway tile |
| `terrain_grass.png` | grass field tile (ambush zone) |
| `terrain_mud.png` | mud / flooded tile (cost 4) |
| `terrain_water.png` | water (impassable) |
| `terrain_wall.png` | building wall (impassable) |
| `terrain_ledge.png` | one-way ledge (enter downward only) |
| `terrain_bush.png` | bush (walkable, +energy cost 5) |
| `terrain_boulder.png` | boulder (impassable) |
| `hero.png` | AcadéMon — the scholar hero |
| `mob_slime.png` | Pop-Quiz Slime (easy, 1 hit) — flat fallback |
| `mob_goblin.png` | Quiz Goblin (medium, 2 hits) — flat fallback |
| `mob_wraith.png` | Essay Wraith / "Ghost" (hard, 3 hits) — flat fallback |
| `mob_<tier>_<theme>.png` | per-theme mob art; `tier` = slime/goblin/wraith, `theme` = nature/water/fire. Falls back to the flat `mob_<tier>.png`. |
| `item_medkit.png` | Med Kit / Health (+45 HP) |
| `item_energydrink.png` | Energy Drink / Potion (+50 energy) |
| `item_timecharm.png` | Time Charm (+20 s) |
| `goal_building.png` | the randomized goal building |

`getMobSprite(tier, theme)` in `lib/sprites.ts` resolves the 9 per-theme mob
PNGs (`mob_slime_nature`, `mob_goblin_water`, `mob_wraith_fire`, …) and falls
back to the flat sprite when a themed file is missing.

## Themed tilesets — `public/ui/tiles/` (ACTIVE, overrides this folder)

`lib/tiles.ts` renders the map with the themed tileset below **before** falling
back to `public/sprites/terrain_*.png` or procedural colors. Tiles are 64×64,
full-bleed (no alpha). Round 1 = **nature**, round 2 = **water**, round 3 = **fire**.

| File | Used as |
|---|---|
| `path_straight/turn/tee.png` | nature path autotile (rotated + cross synthesized) |
| `fire_straight/turn/tee.png` | fire path autotile (same logic) |
| `grass1.png` / `grass2.png` | grass field variants (hash-picked) |
| `grass_detail.png` | sprinkled decoration overlay (alpha) |
| `bush1.png` / `bush2.png` | bush variants (walkable, +5 EP) |
| `mud1.png` / `mud2.png` / `mud3.png` | mud variants |
| `wall1.png` | nature wall (border); interior walls render as trees |
| `tree1..tree4.png` | tree cluster decals on interior nature walls (alpha) |
| `boulder.png` + `stones.png` | boulder (impassable) + detail overlay |
| `water.png` | water theme: shallow water (mud-like, mid cost) + deep tint |
| `path_water.png` | water theme corridor (path) |
| `lily1.png` / `lily2.png` | water theme walkable base (grass-like) |
| `water_boulder1.png` / `water_boulder2.png` | water theme boulders |
| `wall2.png` | water theme wall |
| `fire_grass.png` + `fire_grass_detail.png` | fire theme ground (grass-like) + detail |
| `fire_mud.png` | fire theme mud-like terrain (also tinted as lava for blocking water) |
| `fire_bush.png` | fire theme bush overlay (alpha) |

Water ponds and fire walls/boulders/lava get a tint overlay; fire reuses
nature's `wall1`/`boulder` warmed with a scorched cast (no dedicated fire art).
Missing files fall back per-tile.

## Reward badges & HUD icons — `public/ui/`

| File | Used as |
|---|---|
| `badge_nature.png` | Level 1 reward (Certificate) — round-clear + congrats + reward |
| `badge_water.png` | Level 2 reward (Trophy) |
| `badge_fire.png` | Level 3 reward (Pylon Torch) |
| `icon_health/energy/time/goal.png` | small HUD label icons |

## Hero walk cycles — `public/ui/hero/` (ACTIVE)

`lib/heroFrames.ts` maps facing → frames (decoded from the art, filenames lie):

| Facing | Iska frames | Isko frames |
|---|---|---|
| front (down) | `iska_front` + walk1/2 | `isko_front` + walk1/2 |
| back (up) | walk7/8 | walk7/8 |
| right | `iska_right` + walk3/5 | `isko_right` + walk3/6 |
| left | `iska_left` + walk4/6 | mirrored right + walk4/5 |

Drop replacement frames with the same names — alpha-trimmed, ≤192 px tall.
`front` frames also serve as the character-select portraits.

## Re-skinning further

All three theme blocks live in `lib/tiles.ts` (`drawTerrainTile`); the engine's
terrain grid stays unchanged across themes. Per-theme mobs resolve through
`getMobSprite(tier, theme)` in `lib/sprites.ts`.
