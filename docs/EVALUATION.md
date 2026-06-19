# AcadéMon AI — Evaluation Lab Explained

There are **two different evaluations** in this project, and it's important not to
confuse them:

1. **The in-app Eval Lab** (`/eval`) — a live **exhibition dashboard** that charts
   **real player runs** against a **simulated naive baseline**. This is what booth
   visitors see.
2. **The headless batch eval** (`npm run eval`) — a rigorous, reproducible
   **A/B experiment** that runs the *actual engine* hundreds of times to prove the
   adaptive agent beats a naive one. This is the scientific result.

This document explains both, how to read every chart, and exactly which numbers are
real vs simulated (the honesty disclosure).

---

## Part A — The in-app Eval Lab (`/eval`)

### A.1 What it is
A dashboard that answers one question for an audience: **"Does the AI actually play
better than a dumb fixed-route agent?"** It pulls **every real run** that has been
played (globally, from `/api/plays`, or from this device if no KV is configured) and
puts each one side-by-side with a simulated **Fixed-Path** agent.

> **Header badge:** `🌐 Global` means data is shared across all players (server KV).
> `This device` means it's only your local cache. Click **Refresh** after playing.

### A.2 Two data sources — read this carefully
This is the single most important thing to understand about the page:

| Series | Source | Real or simulated? |
|---|---|---|
| **AcadéMon AI** (blue) | actual recorded runs (`PlayRecord`: `finalEnergy`, `finalHp`, `elapsed`, `won`, …) | **REAL** — every point is a game someone actually played |
| **Fixed-Path / FP** (red) | `buildPairs()` in `app/eval/page.tsx` generates it with seeded `RANDBETWEEN` ranges (Energy 300–500, HP 20–50, Time 180–300, ~20% goal success) | **SIMULATED** baseline |

The Fixed-Path numbers are **seeded by each run's map seed**, so they stay *stable*
across refreshes (they don't flicker). The baseline models a naive agent that walks
one rigid shortest-tile route ignoring all risk, so it predictably burns more
energy/time and dies more often. This lets us show a measurable comparison *before*
we have collected a huge real-world dataset. The page states this in plain text under
the raw table.

### A.3 "Why are there duplicate names?" (not a bug)
The **RAW COMPARISON DATA (paired per run)** table shows **one row per run**. If a
player completes several games, their name appears on several rows — each with
different Energy/HP/Time, because **each row is a distinct run**, not a duplicate.
Submission is guarded so each finished game is saved exactly once
(`endSavedRef` in `Game.tsx`), and the API sanitizes/caps each record, so nothing is
double-written. (The global *leaderboard* is different — it keeps only each name's
**best** score via `ZADD GT`.)

### A.4 "Does 'Clear local' delete the data we gathered?" (no)
`Clear this device cache` only removes this browser's `localStorage`
(`academon-plays`, `academon-board`). The shared dataset lives in Upstash/Vercel KV
on the server and is **never** touched — Refresh re-pulls it. To avoid confusion the
button is **hidden entirely while in 🌐 Global mode** (where clearing a local cache
does nothing useful) and only appears in offline/local-fallback mode.

### A.5 The charts
| Panel | X / Y | How to read it |
|---|---|---|
| **Efficiency — energy per run** | run # / energy (EP), lower better | AI spends far less by routing around mobs and detouring to drinks; FP brute-forces every fight |
| **Summarized Reliability — goal success %** | bar (AI vs FP) | share of runs that reached the goal across all 3 rounds |
| **Resource Preservation — HP per run** | run # / HP remaining | AI keeps HP high by avoiding unnecessary fights; FP bleeds HP on forced wrong answers |
| **Computation Efficiency — time per run** | run # / seconds, lower better | replanning lets the AI finish sooner; FP wastes time stuck on gatekeepers |
| **Steps vs Score** (scatter) | steps / score; ■ win, ✕ loss | up-left is best (high score, short walk); detours push points right — the risk-cost trade-off |
| **Steps per session vs shortest-possible** (line) | run # / steps; dashed = baseline | the dashed line is the *theoretical mob-free shortest path* recomputed for that exact seed via `optimalSteps()`; a gap above = avoidance-detour overhead, below = the player died early |
| **Answer accuracy distribution** | bucketed % correct | wrong answers cost HP and trigger a fresh fight/retreat re-evaluation |
| **Recent sessions** (table) | newest 15 real runs | player, hero, result, score, steps, correct/answered, fights, retreats |

The page also restates the **constraints & objective** (resource budgets, terrain
edge weights, mob tiers, and the scoring weights) read live from `data/config.json`,
so the exhibit always matches the running build.

---

## Part B — The headless batch evaluation (`npm run eval`)

This is the **scientific** evaluation. It runs the *real* engine — same `engine/`
code as the live game — with no rendering, so it is fast, deterministic, and fair.

### B.1 Design (`scripts/eval.ts`, `engine/sim.ts`)
- **Paired seeds.** The same 30 seeds (`4242 + i·101`) are used for **both** agents,
  so any difference is the agent, not luck (a clean A/B).
- **Two agents.**
  - `naive` — always fights; prices mob tiles at a flat `+2` (the v1 baseline).
  - `adaptive` — the full risk-cost A\*, avoidance-first routing, item detours, and
    the fight/retreat utility comparison.
- **Bot answer profiles** (the player model is *not* the agent's own assumption — this
  kills evaluation circularity):
  | Profile | Behaviour |
  |---|---|
  | `fixed50` / `fixed70` / `fixed90` | constant 50% / 70% / 90% answer accuracy |
  | `fatigue` | starts sharp, tires: 0.9 -> 0.4 over ~12 questions |
  | `subject_skew` | strong in CS fundamentals (~0.9), weak elsewhere (~0.55) |
- Each run is simulated at a fixed `dt = 0.1 s` timestep through the real state
  machine (movement, battles, replanning, scoring).

### B.2 Metrics (`BatchSummary`)
Per condition (agent × profile, 30 runs): **survival rate** (won all rounds),
**avg rounds cleared**, **avg HP / energy / time left**, **avg fights**, **avg
replans**. Written to `eval-results.json` and `eval-results.csv`, and printed as a
table.

### B.3 Result (the demo thesis)
Across profiles the adaptive agent dramatically out-survives the naive one on the
*same* maps — e.g. on the multi-round `class` config the adaptive agent clears far
more sessions than naive (which gets stuck brute-forcing gatekeeper fights and runs
out of HP/energy/time). The per-run figures live in `eval-results.csv`; regenerate
anytime with:

```bash
npm run eval            # 30 paired seeds per condition (default)
RUNS=100 npm run eval   # tighter estimates
```

The same `simulate()`/`batch()` functions are unit-tested in `tests/sim.test.ts`, so
the claim "adaptive survives at least as well as naive" is a CI-checked invariant.

---

## Part C — Honesty / disclosure

Keeping the two evaluations clearly separated is deliberate and is stated in the
product itself:

- In the **in-app Eval Lab**, the **AcadéMon AI columns are real** recorded plays;
  the **Fixed-Path columns are simulated** (seeded RANDBETWEEN), labelled as such on
  the page.
- In the **batch eval**, the script prints: *"Disclosure: batch results use simulated
  answer profiles; booth/human results reported separately."* The bot profiles are a
  **stand-in player model**, intentionally different from the agent's internal Laplace
  accuracy estimate, so the agent is never evaluated against its own assumptions.

In short: the **batch eval** proves the algorithm is better under controlled,
reproducible conditions; the **in-app Eval Lab** shows that advantage live against a
naive baseline using the real plays gathered at the booth.
