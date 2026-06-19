# AcadéMon AI — Technical Documentation

*Pixel-style academic pathfinding game for **Intro to AI (Group 2)**. An A\* agent
autopilots a scholar across a procedurally generated campus while the player makes
only one decision per encounter — **FIGHT** or **RETREAT** — by answering review
questions.*

This document explains **how the system is built**: architecture, the AI/search
pipeline, the resource economy, data model, runtime flow, and the API. For the
Evaluation Lab specifically, see [`EVALUATION.md`](./EVALUATION.md).

---

## 1. Stack & layout

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Engine | **Pure TypeScript**, zero DOM/React imports (`engine/`) |
| Rendering | HTML5 Canvas (`components/GameCanvas.tsx`) + React HUD |
| Persistence | Upstash/Vercel KV (global) with `localStorage` fallback |
| Tests | Vitest (`tests/`, 36 tests) |
| Tooling | `tsx` for the headless eval script |

```
engine/        Pure-TS game core (no React) — the "brain"
  types.ts       Shared types + Config shape
  rng.ts         mulberry32 seeded PRNG (deterministic runs)
  grid.ts        Tile/neighbor/terrain helpers
  economy.ts     EP cost currency (κ_t, V_HP, E[fight], accuracy bands)
  search.ts      Risk-cost A* / Dijkstra / Greedy + planRoute + item detour
  mapgen.ts      Procedural maps with the 5-check contract
  quiz.ts        Question bank (no-repeat + shuffle) + EncounterDeck
  game.ts        Game state machine (tick loop, battles, scoring)
  sim.ts         Headless simulation + paired-seed batch (eval)
  index.ts       Barrel export

components/     React UI bound to the engine
  Game.tsx         Orchestrator: RAF loop, input, music, submit-on-end
  GameCanvas.tsx   Canvas renderer (centered-hero camera, ghost path)
  BattleScene.tsx  Pokémon-style battle (choice -> question, animations)
  Hud.tsx, StartFlow.tsx, Leaderboard.tsx, RewardEnding.tsx,
  IrisTransition.tsx, VolumeToggle.tsx

app/
  page.tsx              Mounts <Game/>
  eval/page.tsx         Evaluation Lab (see EVALUATION.md)
  api/leaderboard/      Global leaderboard route handler (KV)
  api/plays/            Global play-log route handler (KV)

lib/        Browser-side concerns: audio, sprites, tiles, heroFrames,
            redis (KV REST client), plays/leaderboard fetch helpers
data/       config.json, questions.json, encounters.json
public/     sprites, ui art, audio
```

**Design rule:** all game logic lives in `engine/` as pure functions/classes so it
is deterministic and unit-testable, and so the *same* code drives the interactive
game (`components/Game.tsx`) and the headless evaluator (`engine/sim.ts`).

---

## 2. The resource economy — one currency (EP)

Every decision is priced in a single currency: **Energy Points (EP)**. The key
idea (from the council-reviewed mechanics spec) is that exchange rates are
**derived from the starting budgets**, not hand-tuned. See `engine/economy.ts`.

| Quantity | Formula | Meaning |
|---|---|---|
| Time -> EP | `κ_t = E_max / T_limit` | one second is worth `κ_t` EP |
| HP loss -> EP | `V_HP(Δ) = (Δ / HP_now) × 100` | scarcity-scaled: losing 20 HP at 40 HP costs 50 EP |
| One battle round | `C_round = attack_energy + (timer/2)·κ_t` | attack cost + expected answer time |
| Expected fight | `E[fight] = hits·C_round + misses·V_HP(hpLoss)`, `misses = hits·(1−p)/p` | cost of fighting a mob tier |
| Expected retreat | `E[retreat] = retreat_time·κ_t + detourΔ` | lost time + extra path EP |
| Accuracy `p` | `(correct + prior·k)/(answered + k)` (Laplace) | running estimate of the player's answer rate |

**Three hard constraints (any hitting 0 = GAME OVER):**
- **HP** (100) — drained when a wrong answer lets a mob hit you (slime −10, goblin −18, wraith −25).
- **Energy** (100 EP) — spent on **every step** (terrain cost) and **every attack answer**.
- **Time** — `time_limit` per round (class 150 s, exhibit 90 s), counts down live, even during battles.

Fail reasons surfaced to the player: `OUT OF HP`, `OUT OF ENERGY`, `OUT OF TIME`,
`NO PATH AVAILABLE`.

---

## 3. The AI: risk-cost A\* and the decision pipeline

### 3.1 Search (`engine/search.ts`)
A\* over the tile grid with `f(n) = g(n) + h(n)`:
- `h = Manhattan(n, goal) × 1 EP` — the minimum possible edge cost is 1 EP (a path
  tile), so `h` never overestimates -> **admissible** -> A\* is optimal *per snapshot*.
- `g` accumulates **`tileCost`** per step, the single formula that prices everything:
  - terrain EP: `path 1 · grass 3 · mud 4 · bush 5` (walls/water/boulder = ∞, ledges one-way);
  - `+ stepTimeEP` — the EP value of the time a step takes (`secPerStep × κ_t`), so
    walking time and fighting time are in the **same currency** (without it the agent
    over-detours because fights pay time-EP but steps wouldn't);
  - `+ E[fight]` if an undefeated mob occupies the tile (or `∞` in "avoid" planning);
  - `+ ambushChance × E[fight(slime)]` on grass in non-deterministic modes;
  - `∞` if the player has **retreated** from that mob (permanently avoided).
- `dijkstra` (h=0) and `greedy` (f=h) are included for comparison/visualization.

### 3.2 Avoidance-first routing (`planRoute`)
Two searches each replan:
- **Plan A (avoid):** mob tiles cost ∞ (mob-free graph). Taken **iff** it exists, is
  *feasible*, and costs <= `avoidance_bias` (1.5) × Plan B — i.e. dodging a fight is
  worth a premium, but the agent won't march 5× farther to skip a cheap slime.
- **Plan B (engage):** mobs priced at `E[fight]`; route through the cheapest
  *unavoidable* mob. The map's **gatekeepers** guarantee at least one fight (the
  mob-free graph has no feasible path), so battles always happen.

`pathFeasible` checks the plan fits the remaining **energy** and **time** budgets with
a `feasibility_margin` (1.2) safety factor.

### 3.3 Item detours (`bestItemDetour`)
A two-leg search (`start->item->goal` vs `start->goal`): the detour is taken when the
restored budget in EP (`med_kit 45 HP`, `energy_drink 50 EP`, `time_charm 20 s`)
exceeds the extra path cost.

### 3.4 Fight-vs-retreat recommendation
When a mob is reached, the engine computes `E[fight]` vs `E[retreat]` (using the
live accuracy `p`, current HP, and the detour cost of going around) and recommends
**FIGHT** or **RETREAT** with a reason. The player makes the final call; if a fight
is **unavoidable** the recommendation says so.

### 3.5 Event-driven replanning (`game.ts -> replan`)
Replans are triggered by: route consumed, **pickup** consumed, blocked next tile,
**feasibility** check failing, HP **band** change (Confident >=70% -> Cautious >=40%
-> Defensive >=15% -> Survival, with `hysteresis_hp` to avoid flapping), and
stochastic **grass ambushes**. If a replan finds no path -> `NO PATH AVAILABLE`.

---

## 4. Maps (`engine/mapgen.ts`)
Every round generates a fresh, seeded map satisfying a **5-check contract**:
1. hero spawns at **map center**;
2. goal randomized each run (>= `min_goal_dist_pct` 60% of max-reach Manhattan distance, anti-repeat quadrant);
3. **winnable** with the 1.2 feasibility margin;
4. **gatekeeper** mob on every route family (no mob-free feasible path -> a fight is guaranteed);
5. 1–3 optional shortcut mobs (avoidable "prey").

Maps reject + regenerate until all checks pass. Three visual **themes** (nature /
water / fire) reskin identical terrain semantics across the 3 rounds.

---

## 5. Game state machine (`engine/game.ts`)
`Phase`: `idle -> running -> battle -> roundclear -> won | lost`.

- **`tick(dt)`** advances the live clock (fails on `timeLeft <= 0`), then either steps
  the hero along the route (paying terrain EP, handling pickups, ambushes,
  feasibility/band checks) or, in `battle`, counts down the question timer
  (timeout = wrong answer).
- **`answer(i)`** resolves a quiz round: correct -> mob loses a hit, streak++/combo
  bonus; wrong -> HP loss + re-evaluate fight/retreat. Energy is spent per answer.
- **`fightChosen()` / `retreat()`** resolve the battle "choice" stage.
- **`nextRound()`** carries HP & energy forward, **refills energy per level**, resets
  the clock, generates the next-quadrant map.
- **Scoring** (`get score`): `w_goal·won + w_round·roundsCleared + w_correct·correct
  + w_time·timeLeft + w_energy·energy + w_hp·hp + streakBonus`, clamped >= 0; graded
  S/A/B/C/F.

A `StatSample` is recorded per step (HP/energy/time/replan flag) for the live
dashboard and the evaluation charts.

---

## 6. Questions (`engine/quiz.ts`, `data/`)
- `questions.json` — banks keyed by name (`cs-review`, `trivia-easy`); the correct
  answer is the **first choice** in source, and the engine **shuffles** choices and
  remaps the correct index, so the answer isn't always in the same slot.
- **No-repeat draw:** each question is used at most once per run before the pool recycles.
- `encounters.json` — multi-round **EncounterSets**: a Goblin (2 rounds) or Wraith
  (3 rounds) asks the rounds of *one* coherent set sequentially, one per hit.

---

## 7. Rendering & UX
- **`GameCanvas`** — pixelated Canvas with a **centered-hero camera** (map scrolls,
  hero stays centered, ~480 ms step tween), themed autotiled terrain (`lib/tiles.ts`),
  PNG sprites with procedural fallbacks (`lib/sprites.ts`, `lib/heroFrames.ts`), the
  **ghost path** (naive shortest route, toggle `G`) and explored-node flash.
- **`BattleScene`** — Pokémon-style: "What will you do?" FIGHT/RUN -> a 2×2 question
  with a 15 s timer, hero lunge / mob hit / faint animations, and EP analysis +
  explanation on a miss.
- **`Hud`** — HP/Energy/Time bars, the live decision band, and `g/h/f` search values.
- **Audio** (`lib/audio.ts`) — looping context music (lobby / per-biome / battle /
  congrats) + SFX, persisted mute, autoplay-unlock on the first gesture, and a
  **watchdog** that keeps the desired track audible during autopilot (since the AI
  drives the game, the player may never click again to retry a blocked `play()`).

---

## 8. Persistence & API
Two route handlers back the global leaderboard and the Eval Lab play-log.

| Route | Method | Purpose |
|---|---|---|
| `/api/leaderboard` | GET / POST | best score per name (KV `ZADD GT` global dedupe) |
| `/api/plays` | GET / POST | per-run records for the Eval Lab (`LPUSH`/`LTRIM`, capped 1000) |

- Storage is **Upstash/Vercel KV** via a tiny REST client (`lib/redis.ts`), enabled
  by env vars (`KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_*`). See `.env.example`.
- **Graceful fallback:** with no KV configured the client returns `global:false` and
  the UI uses `localStorage` (per-device). Posts are **sanitized + clamped** and
  **per-IP rate-limited**.
- Client helpers: `lib/plays.ts`, `components/Leaderboard.tsx`. `clearLocalData()`
  only clears this device's cache — the shared KV dataset is never touched.

---

## 9. Build, test, run

```bash
npm install
npm run dev        # http://localhost:3000   (?mode=exhibit for the 90s booth build)
npm test           # 36 vitest engine tests
npm run eval       # 30 paired-seed naive-vs-adaptive batch -> eval-results.{json,csv}
npm run build      # production build (static + the two API routes)
```

Deterministic runs come from the seeded `mulberry32` PRNG, so a given seed
reproduces the same map, encounters, and (for a fixed answer policy) the same
result — which is what makes the evaluation in [`EVALUATION.md`](./EVALUATION.md)
fair and repeatable.
