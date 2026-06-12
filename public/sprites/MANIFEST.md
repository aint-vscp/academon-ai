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
| `hero.png` | AcadéMon — the scholar hero |
| `mob_slime.png` | Pop-Quiz Slime (easy, 1 hit) |
| `mob_goblin.png` | Quiz Goblin (medium, 2 hits) |
| `mob_wraith.png` | Essay Wraith (hard, 3 hits) |
| `item_medkit.png` | Med Kit (+45 HP) |
| `item_energydrink.png` | Energy Drink (+50 energy) |
| `item_timecharm.png` | Time Charm (+20 s) |
| `goal_building.png` | the randomized goal building |

## Planned (full-PNG maps later)

When map art is ready, per-map tile sheets can replace procedural terrain:
add `map_<name>_tileset.png` here and extend `lib/sprites.ts` with a tileset
lookup — the engine's terrain grid stays unchanged.
