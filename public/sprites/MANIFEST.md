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
| `mob_slime.png` | Pop-Quiz Slime (easy, 1 hit) |
| `mob_goblin.png` | Quiz Goblin (medium, 2 hits) |
| `mob_wraith.png` | Essay Wraith (hard, 3 hits) |
| `item_medkit.png` | Med Kit (+45 HP) |
| `item_energydrink.png` | Energy Drink (+50 energy) |
| `item_timecharm.png` | Time Charm (+20 s) |
| `goal_building.png` | the randomized goal building |

## Themed tilesets — `public/ui/tiles/` (ACTIVE, overrides this folder)

`lib/tiles.ts` renders the map with the themed tileset below **before** falling
back to `public/sprites/terrain_*.png` or procedural colors. Tiles are 64×64,
full-bleed (no alpha). Round 1/3 = **nature** theme, round 2 = **water**.

| File | Used as |
|---|---|
| `path_straight.png` | N–S walkway (auto-rotated for E–W) |
| `path_turn.png` | N–E corner (auto-rotated ×4) |
| `path_tee.png` | N+E+W tee (auto-rotated ×4; 4-way cross synthesized) |
| `grass1.png` / `grass2.png` | grass field variants (hash-picked) |
| `grass_detail.png` | sprinkled decoration overlay (alpha) |
| `bush1.png` / `bush2.png` | bush variants (walkable, +5 EP) |
| `mud1.png` / `mud2.png` / `mud3.png` | mud variants |
| `wall1.png` | nature wall (impassable) |
| `boulder.png` + `stones.png` | boulder (impassable) + detail overlay |
| `water.png` | water-theme base tile (replaces path/grass) |
| `lily1.png` / `lily2.png` | water theme: mud→plain pad, bush→flowered pad |
| `water_boulder1.png` / `water_boulder2.png` | water theme boulders |
| `wall2.png` | water theme wall |

Water ponds get a dark overlay tint; missing files fall back per-tile.

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

## Planned (full-PNG maps later)

When Level 3 art is ready, add a third theme block to `lib/tiles.ts`
(`THEMES` map) — the engine's terrain grid stays unchanged. Round 3 currently
reuses the nature tileset.
