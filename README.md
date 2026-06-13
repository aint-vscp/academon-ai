# AcadéMon AI — *Gotta Pass 'Em All* 🎓

A pixel-style academic adventure for **Intro to AI (Group 2)**: an **A\* agent
autopilots** the scholar across a procedurally generated campus — picking routes,
dodging mobs, detouring for potions — while **you only make one decision: FIGHT
or RETREAT** when a Quiz Goblin blocks the way. Answer review questions to win
battles. Reach the randomized goal building before HP, Energy, or Time hits zero.

Next.js + TypeScript port of the pygame v1, implementing the council-reviewed
**Enhanced Game Mechanics** spec (see `AcadeMon-AI-Enhanced-Mechanics.docx`).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 36 engine tests (vitest)
npm run eval       # 30 paired-seed batch eval → eval-results.{json,csv}
npm run build      # production build
```

- **Exhibit mode** (90s, easy trivia, deterministic): `http://localhost:3000/?mode=exhibit`
- **Eval lab** (naive-vs-adaptive comparison in the browser): `http://localhost:3000/eval`

## Controls

| Key | Action |
|---|---|
| `1–4` | answer the quiz question |
| `R` | retreat from battle / restart after game over |
| `G` | toggle the ghost path (naive shortest route) |

Everything else is the AI: routing, potion detours, mob avoidance, replanning.

## What the agent does (the demo thesis)

- **Risk-cost A\***: `f = g + h` with an admissible heuristic (`h = Manhattan × 1 EP`)
  — optimal per snapshot. Mob tiles are priced at the expected battle cost.
- **One currency (EP)** with *derived* exchange rates: `κ_t = E_max/T_limit`,
  `V_HP(Δ) = (Δ/HP_now)×100` — danger scales with scarcity, no magic numbers.
- **One formula powers everything**: `E[fight] = hits×C_round + misses×V_HP` is
  the mob tile's edge cost, the FIGHT/RETREAT recommendation, and the replan input.
- **Avoidance-first (Plan A/B)**: route around mobs while a feasible mob-free path
  exists; fight only when the map's **gatekeeper mobs** make it unavoidable.
- **Event-driven replanning**: wrong answer, band crossing (±5 HP hysteresis),
  energy/time feasibility (1.2× margin), ambush, pickup, retreat → instant reroute
  with a plain-language toast.
- **Mapgen contract**: center spawn · randomized far goal (anti-repeat quadrant) ·
  winnable · ≥1 guaranteed fight · 2–3 avoidable "prey" mobs. Rejected layouts regenerate.

## Evaluation (§XII)

`npm run eval` runs **30 paired seeds × {naive, adaptive} × 5 bot profiles**
(fixed 50/70/90%, fatigue, subject-skew — profiles the agent does *not* assume,
so the experiment isn't rigged). Naive = flat-cost A\*, always fights, never
replans strategy. Output: survival %, avg HP/Energy/Time at goal.
Disclosure: batch results use simulated answer profiles; booth/human results
are reported separately.

## PNG re-skin (planned art pipeline)

**Every visual resolves through `lib/sprites.ts`.** Drop correctly named 16×16
PNGs into `public/sprites/` and they override the built-in pixel placeholders —
zero code changes. Names and rules: `public/sprites/MANIFEST.md`.
Rendering is nearest-neighbor everywhere (`image-rendering: pixelated`), so
pixel art stays crisp at any scale.

## Architecture

```
engine/   pure TS, zero DOM imports — grid, A*, EP economy, quiz, mapgen,
          game state machine, headless sim (powers eval + tests)
app/      Next.js App Router — / (game), /eval (evaluation lab)
components/  GameCanvas (pixelated, centered-hero camera), Hud, BattleScene, Game
lib/      sprite registry (PNG-first, procedural fallback)
data/     config.json (single source of truth), questions.json (tagged banks)
scripts/  eval.ts (batch harness)
tests/    vitest — admissibility/optimality, mapgen contract, economy, sim
```

## Config

All tuning lives in `data/config.json` — resources, terrain costs, mob tiers,
EP/agent parameters, mapgen contract bounds, scoring. Balance target: a
70%-accuracy player wins ~60–70% of runs.

## Mobile & audio

- **Fully responsive / touch-ready** — one full screen with no page scroll (only
  the leaderboard scrolls); the battle FIGHT/RETREAT and answer choices are
  tap-friendly, so it plays on a phone. Add it to your home screen for fullscreen.
- **Music & SFX** — context-aware looping music (lobby, Nature/Water/Fire biomes,
  battle, win jingle) plus button/menu/item sound effects, all under a
  **🔊 volume toggle** (top-right / in the in-game header). Drop-in audio lives in
  `public/audio/`.

## Global leaderboard & Eval Lab sync

The leaderboard **and** the Eval Lab play-records sync **globally across all
players** when a key-value store is connected; otherwise they fall back to
per-device `localStorage` (the game never breaks either way).

Enable global sync (free, ~2 min):

1. In your Vercel project → **Storage** → **Create Database** → **Upstash for
   Redis** (or **KV**) → connect it to the project. This auto-injects
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` (also accepts
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
2. **Redeploy.** Done — every device now shares one leaderboard (best score per
   name) and one merged Eval Lab dataset.

Implemented by the `/api/leaderboard` and `/api/plays` route handlers
(`app/api/**`) over the Upstash REST protocol; the client (`components/Leaderboard.tsx`,
`lib/plays.ts`) fetches global with a local cache/fallback. Submitted data is
sanitized and capped server-side.

## Deploy on Vercel

This is a standard Next.js 15 app — zero config to get running:

1. Push to GitHub (already done).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import this repo.
3. Framework preset **Next.js** is auto-detected; click **Deploy**.
4. (Optional) Add a KV/Upstash store for the global leaderboard + Eval Lab sync
   (see above). Without it, those stay per-device — everything else works.

---

Group 2 · Polytechnic University of the Philippines · Intro to AI
