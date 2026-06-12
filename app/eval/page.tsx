"use client";

// Evaluation lab (§XII): paired-seed batches, naive vs adaptive agents,
// bot answer profiles the agent did NOT assume. Runs fully in-browser
// (the engine is pure TS). For the full 30-run CSV use `npm run eval`.
//
// EXHIBITION OPTIMIZATION ANALYSIS: per-run scatter (path length vs score)
// and line chart (steps per run vs the mob-free shortest-path lower bound)
// across deterministic exhibit-mode runs, plus the full constraint sheet.

import { useRef, useState } from "react";
import { batch, type BatchSummary } from "@/engine/sim";
import { generateMap, quadrantOf } from "@/engine/mapgen";
import { search, type CostContext } from "@/engine/search";
import type { BotProfile, Config, Question, RunResult } from "@/engine/types";
import configJson from "@/data/config.json";
import questionsJson from "@/data/questions.json";

const cfg = configJson as unknown as Config;
const banks = questionsJson as unknown as Record<string, Question[]>;
const PROFILES: BotProfile[] = ["fixed50", "fixed70", "fixed90", "fatigue", "subject_skew"];

const GREEN = "#66bb6a";
const RED = "#ef5350";
const GRAY = "#8a91b4";

interface ExhibitData {
  seeds: number[];
  naive: RunResult[];
  adaptive: RunResult[];
  optimal: number[]; // mob-free shortest-path steps per seed (all rounds)
}

/** Theoretical lower bound: shortest mob-free walk across the run's 3 maps. */
function optimalSteps(seed: number): number {
  let total = 0;
  let map = generateMap(cfg, seed, "exhibit", -1);
  for (let round = 1; round <= cfg.session.rounds; round++) {
    if (round > 1) {
      const avoid = quadrantOf(map, map.goal);
      map = generateMap(cfg, seed + round * 9973, "exhibit", avoid);
    }
    const ctx: CostContext = {
      cfg,
      map,
      p: 1,
      hpNow: cfg.resources.hp_max,
      timeLimit: cfg.modes.exhibit.time_limit,
      excludeMobs: true,
      ambushChance: 0,
      stepTimeEP: 0,
    };
    const r = search(ctx, map.spawn, map.goal, "astar");
    total += r.found ? r.path.length - 1 : 0;
  }
  return total;
}

/* ---------- hand-rolled pixel SVG charts (no chart lib) ---------- */

function Axes({
  W,
  H,
  P,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
}: {
  W: number;
  H: number;
  P: number;
  xLabel: string;
  yLabel: string;
  xTicks: { v: number; x: number }[];
  yTicks: { v: number; y: number }[];
}) {
  return (
    <g shapeRendering="crispEdges" fontSize={7} fill={GRAY}>
      <line x1={P} y1={H - P} x2={W - 8} y2={H - P} stroke={GRAY} strokeWidth={2} />
      <line x1={P} y1={H - P} x2={P} y2={10} stroke={GRAY} strokeWidth={2} />
      {xTicks.map((t, i) => (
        <g key={i}>
          <line x1={t.x} y1={H - P} x2={t.x} y2={H - P + 4} stroke={GRAY} strokeWidth={2} />
          <text x={t.x} y={H - P + 14} textAnchor="middle">
            {t.v}
          </text>
        </g>
      ))}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={P - 4} y1={t.y} x2={P} y2={t.y} stroke={GRAY} strokeWidth={2} />
          <text x={P - 7} y={t.y + 3} textAnchor="end">
            {t.v}
          </text>
        </g>
      ))}
      <text x={(W + P) / 2} y={H - 4} textAnchor="middle">
        {xLabel}
      </text>
      <text x={10} y={10} textAnchor="start">
        {yLabel}
      </text>
    </g>
  );
}

function ticksFor(max: number, n: number): number[] {
  const step = Math.max(1, Math.ceil(max / n / 10) * 10);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

/** Scatter: path length (steps) vs final score, per run. ✕ = run died. */
function ScatterChart({ naive, adaptive }: { naive: RunResult[]; adaptive: RunResult[] }) {
  const W = 470;
  const H = 280;
  const P = 48;
  const all = [...naive, ...adaptive];
  const maxX = Math.max(20, ...all.map((r) => r.steps)) * 1.1;
  const maxY = Math.max(500, ...all.map((r) => r.score)) * 1.1;
  const sx = (v: number) => P + (v / maxX) * (W - P - 16);
  const sy = (v: number) => H - P - (v / maxY) * (H - P - 18);

  const mark = (r: RunResult, color: string, i: number) => {
    const x = sx(r.steps);
    const y = sy(r.score);
    return r.won ? (
      <rect key={`${color}${i}`} x={x - 3.5} y={y - 3.5} width={7} height={7} fill={color}>
        <title>{`seed ${r.seed}: ${r.steps} steps, score ${r.score} (won)`}</title>
      </rect>
    ) : (
      <text key={`${color}${i}`} x={x} y={y + 4} textAnchor="middle" fontSize={10} fill={color} fontWeight="bold">
        ✕<title>{`seed ${r.seed}: ${r.steps} steps, score ${r.score} (${r.failReason ?? "lost"})`}</title>
      </text>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", imageRendering: "pixelated" }}>
      <Axes
        W={W}
        H={H}
        P={P}
        xLabel="path length (steps)"
        yLabel="score"
        xTicks={ticksFor(maxX, 5).map((v) => ({ v, x: sx(v) }))}
        yTicks={ticksFor(maxY, 4).map((v) => ({ v, y: sy(v) }))}
      />
      {naive.map((r, i) => mark(r, RED, i))}
      {adaptive.map((r, i) => mark(r, GREEN, i))}
      <g fontSize={7}>
        <rect x={W - 150} y={16} width={7} height={7} fill={GREEN} />
        <text x={W - 138} y={23} fill={GREEN}>
          adaptive (■=won)
        </text>
        <rect x={W - 150} y={30} width={7} height={7} fill={RED} />
        <text x={W - 138} y={37} fill={RED}>
          naive (✕=died)
        </text>
      </g>
    </svg>
  );
}

/** Line chart: steps per run vs the shortest-possible baseline. */
function LineChart({
  optimal,
  naive,
  adaptive,
}: {
  optimal: number[];
  naive: RunResult[];
  adaptive: RunResult[];
}) {
  const W = 470;
  const H = 280;
  const P = 48;
  const n = optimal.length;
  const maxY =
    Math.max(...optimal, ...naive.map((r) => r.steps), ...adaptive.map((r) => r.steps), 10) * 1.15;
  const sx = (i: number) => P + (n <= 1 ? 0 : (i / (n - 1)) * (W - P - 16));
  const sy = (v: number) => H - P - (v / maxY) * (H - P - 18);
  const pts = (vals: number[]) => vals.map((v, i) => `${sx(i)},${sy(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", imageRendering: "pixelated" }}>
      <Axes
        W={W}
        H={H}
        P={P}
        xLabel="exhibition run #"
        yLabel="steps"
        xTicks={optimal.map((_, i) => ({ v: i + 1, x: sx(i) }))}
        yTicks={ticksFor(maxY, 4).map((v) => ({ v, y: sy(v) }))}
      />
      <polyline
        points={pts(optimal)}
        fill="none"
        stroke={GRAY}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <polyline points={pts(naive.map((r) => r.steps))} fill="none" stroke={RED} strokeWidth={2} />
      <polyline
        points={pts(adaptive.map((r) => r.steps))}
        fill="none"
        stroke={GREEN}
        strokeWidth={2}
      />
      {adaptive.map((r, i) => (
        <rect key={`a${i}`} x={sx(i) - 3} y={sy(r.steps) - 3} width={6} height={6} fill={GREEN}>
          <title>{`run ${i + 1} adaptive: ${r.steps} steps${r.won ? "" : " (died)"}`}</title>
        </rect>
      ))}
      {naive.map((r, i) => (
        <rect key={`n${i}`} x={sx(i) - 3} y={sy(r.steps) - 3} width={6} height={6} fill={RED}>
          <title>{`run ${i + 1} naive: ${r.steps} steps${r.won ? "" : " (died)"}`}</title>
        </rect>
      ))}
      <g fontSize={7}>
        <line x1={W - 158} y1={20} x2={W - 144} y2={20} stroke={GRAY} strokeWidth={2} strokeDasharray="5 4" />
        <text x={W - 138} y={23} fill={GRAY}>
          shortest possible
        </text>
        <line x1={W - 158} y1={34} x2={W - 144} y2={34} stroke={GREEN} strokeWidth={2} />
        <text x={W - 138} y={37} fill={GREEN}>
          adaptive
        </text>
        <line x1={W - 158} y1={48} x2={W - 144} y2={48} stroke={RED} strokeWidth={2} />
        <text x={W - 138} y={51} fill={RED}>
          naive
        </text>
      </g>
    </svg>
  );
}

/* ---------- page ---------- */

export default function EvalPage() {
  const [runs, setRuns] = useState(10);
  const [rows, setRows] = useState<BatchSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);
  const [exhibit, setExhibit] = useState<ExhibitData | null>(null);
  const [exBusy, setExBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setRows([]);
    cancelRef.current = false;
    const questions = banks["cs-review"];
    const seeds = Array.from({ length: runs }, (_, i) => 4242 + i * 101);
    const out: BatchSummary[] = [];
    for (const profile of PROFILES) {
      for (const agent of ["naive", "adaptive"] as const) {
        if (cancelRef.current) break;
        setProgress(`${profile} / ${agent}…`);
        await new Promise((r) => setTimeout(r, 10)); // let the UI breathe
        out.push(batch(cfg, questions, "class", agent, profile, seeds));
        setRows([...out]);
      }
    }
    setProgress("");
    setBusy(false);
  };

  const runExhibit = async () => {
    setExBusy(true);
    setExhibit(null);
    await new Promise((r) => setTimeout(r, 10));
    const questions = banks[cfg.modes.exhibit.bank] ?? Object.values(banks)[0];
    const seeds = Array.from({ length: 10 }, (_, i) => 1000 + (i + 1) * 17); // booth seed sequence
    const naive = batch(cfg, questions, "exhibit", "naive", "fixed70", seeds).results;
    await new Promise((r) => setTimeout(r, 10));
    const adaptive = batch(cfg, questions, "exhibit", "adaptive", "fixed70", seeds).results;
    const optimal = seeds.map(optimalSteps);
    setExhibit({ seeds, naive, adaptive, optimal });
    setExBusy(false);
  };

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const stepEP = ((cfg.ui.tween_ms / 1000) * (cfg.resources.energy_max / cfg.modes.class.time_limit)).toFixed(2);

  return (
    <div className="wrap">
      <div className="title" style={{ fontSize: 16 }}>
        EVAL LAB
      </div>
      <p className="lead">
        Claim under test: <i>&ldquo;dynamic replanning + risk-aware routing keeps the hero alive.&rdquo;</i>{" "}
        Paired seeds across agents; bot answer profiles differ from the agent&rsquo;s Laplace assumption
        (no evaluation circularity). Disclosure: batch results use simulated answer profiles — booth/human
        results are reported separately.
      </p>

      {/* ---------- exhibition optimization analysis ---------- */}
      <div className="title" style={{ fontSize: 12, marginTop: 18 }}>
        1 · EXHIBITION OPTIMIZATION &amp; SHORTEST PATH
      </div>
      <p className="lead">
        Deterministic exhibit-mode runs (the booth seed sequence). Every run is one full
        3-round session. The dashed line is the <b>mob-free shortest path</b> the maps allow —
        an agent can only beat it by dying early.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
        <button className="pixel-btn primary" onClick={runExhibit} disabled={exBusy}>
          {exBusy ? "Simulating…" : "▶ Run exhibition analysis (10 runs × 2 agents)"}
        </button>
        <a href="/" className="chip" style={{ textDecoration: "none" }}>
          ← back to game
        </a>
      </div>

      {exhibit && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14 }}>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom: 6 }}>
              OPTIMIZATION FRONTIER — path length vs score
            </div>
            <ScatterChart naive={exhibit.naive} adaptive={exhibit.adaptive} />
            <p className="subtitle" style={{ marginTop: 6 }}>
              Up-left is better (high score, short walk). The adaptive agent trades a few extra
              steps (detours around the Essay Wraith, item pickups) for surviving with budget left;
              the naive shortest-path agent walks less but dies into ✕s.
            </p>
          </div>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom: 6 }}>
              SHORTEST PATH TRACKING — steps per run
            </div>
            <LineChart optimal={exhibit.optimal} naive={exhibit.naive} adaptive={exhibit.adaptive} />
            <p className="subtitle" style={{ marginTop: 6 }}>
              The adaptive line hugs the lower bound when fights are cheap and lifts above it when
              the EP economy prices a detour as cheaper than a wraith fight — that gap IS the
              risk-cost optimization at work. Survival:{" "}
              <b style={{ color: GREEN }}>
                {pct(exhibit.adaptive.filter((r) => r.won).length / exhibit.adaptive.length)} adaptive
              </b>{" "}
              vs{" "}
              <b style={{ color: RED }}>
                {pct(exhibit.naive.filter((r) => r.won).length / exhibit.naive.length)} naive
              </b>
              .
            </p>
          </div>
        </div>
      )}

      {/* ---------- constraints & objective ---------- */}
      <div className="title" style={{ fontSize: 12, marginTop: 22 }}>
        2 · CONSTRAINTS &amp; OBJECTIVE (what the AI optimizes)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 14,
          marginTop: 10,
        }}
      >
        <div className="pixel-panel">
          <div className="hud-label">RESOURCE BUDGETS (hard constraints)</div>
          <ul className="leaderboard" style={{ marginTop: 8 }}>
            <li>HP {cfg.resources.hp_max} — wrong answers only (slime −{cfg.mobs.slime.hp_loss} / goblin −{cfg.mobs.goblin.hp_loss} / wraith −{cfg.mobs.wraith.hp_loss})</li>
            <li>Energy {cfg.resources.energy_max} EP — every step + every attack drains it</li>
            <li>Clock — class {cfg.modes.class.time_limit}s / exhibit {cfg.modes.exhibit.time_limit}s per round, {cfg.session.rounds} rounds</li>
            <li>Any budget at 0 ⇒ GAME OVER; HP &amp; energy carry across rounds</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">TERRAIN COSTS (edge weights, EP)</div>
          <ul className="leaderboard" style={{ marginTop: 8 }}>
            <li>path {cfg.costs.path} · grass {cfg.costs.grass} (+{(cfg.mapgen.grass_encounter_chance * 100).toFixed(0)}% ambush) · mud {cfg.costs.mud} · bush {cfg.costs.bush}</li>
            <li>+{stepEP} EP/step time-pricing (κ_t) — fights &amp; walking share one currency</li>
            <li>BLOCKING: walls, boulders, deep water · ledges are one-way drops</li>
            <li>L2 Water skin: lilies = soft obstacles, rock outcrops = boulders</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">MOBS (blockage, not loot)</div>
          <ul className="leaderboard" style={{ marginTop: 8 }}>
            <li>Pop-Quiz Slime: {cfg.mobs.slime.hits} hit · Quiz Goblin: {cfg.mobs.goblin.hits} · Essay Wraith: {cfg.mobs.wraith.hits}</li>
            <li>Each answer costs {cfg.costs.attack_energy} EP; question timer {cfg.mapgen.question_timer_sec}s</li>
            <li>RUN costs {cfg.costs.retreat_time}s + the detour; the mob tile stays blocked</li>
            <li>Defeat ONLY removes the blockage — no HP/energy reward (§VII)</li>
            <li>Mapgen guarantees ≥1 gatekeeper fight; wraith guards the shortest route family</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">AGENT PARAMETERS</div>
          <ul className="leaderboard" style={{ marginTop: 8 }}>
            <li>Avoidance-first: mob-free Plan A wins if cost ≤ {cfg.agent.avoidance_bias}× engage Plan B</li>
            <li>Feasibility margin {cfg.agent.feasibility_margin}× on energy/time before detouring to items</li>
            <li>Accuracy estimate: Laplace prior {cfg.agent.accuracy_prior} (k={cfg.agent.prior_strength_class} class / {cfg.agent.prior_strength_exhibit} exhibit)</li>
            <li>HP bands {cfg.agent.bands.map(([v, n]) => `${n}≥${v}`).join(" · ")} (hysteresis {cfg.agent.hysteresis_hp})</li>
            <li>6 replan triggers: defeat, retreat, pickup, band-cross, energy/time infeasible</li>
          </ul>
        </div>
      </div>
      <div className="pixel-panel" style={{ marginTop: 14 }}>
        <div className="hud-label">OBJECTIVE</div>
        <p className="lead" style={{ marginTop: 8 }}>
          Per snapshot the agent runs A* over edge costs c(tile) = terrain EP + step-time EP +
          E[fight] on mob tiles, where E[fight] = hits·C_round + hits·(1−p)/p·V_HP prices expected
          retries against scarcity-scaled HP value. It minimizes total expected EP subject to the
          three budgets staying positive (with the {cfg.agent.feasibility_margin}× safety margin) —
          i.e. <i>&ldquo;shortest path&rdquo; in RISK-ADJUSTED cost, not in tiles</i>. The charts above show
          exactly where those two notions of &ldquo;shortest&rdquo; diverge — and that diverging is what keeps
          the hero alive.
        </p>
      </div>

      {/* ---------- profile stress test ---------- */}
      <div className="title" style={{ fontSize: 12, marginTop: 22 }}>
        3 · ANSWER-PROFILE STRESS TEST (class mode)
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
        <span className="chip">
          runs/condition{" "}
          <input
            className="pixel-input"
            style={{ width: 56, fontSize: 9, padding: 4 }}
            type="number"
            min={3}
            max={50}
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
          />
        </span>
        <button className="pixel-btn primary" onClick={run} disabled={busy}>
          {busy ? `Running ${progress}` : "▶ Run evaluation"}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="pixel-panel">
          <table className="eval">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Agent</th>
                <th>Survival</th>
                <th>avg Rounds</th>
                <th>avg HP</th>
                <th>avg Energy</th>
                <th>avg Time left</th>
                <th>avg Fights</th>
                <th>avg Replans</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  style={{
                    background: r.agent === "adaptive" ? "rgba(102,187,106,0.08)" : undefined,
                  }}
                >
                  <td>{r.profile}</td>
                  <td style={{ color: r.agent === "adaptive" ? "#66bb6a" : "#ef9a9a" }}>{r.agent}</td>
                  <td>
                    <b>{pct(r.survival)}</b>
                  </td>
                  <td>{r.avgRounds.toFixed(1)}</td>
                  <td>{r.avgHp.toFixed(0)}</td>
                  <td>{r.avgEnergy.toFixed(0)}</td>
                  <td>{r.avgTimeLeft.toFixed(0)}s</td>
                  <td>{r.avgFights.toFixed(1)}</td>
                  <td>{r.avgReplans.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtitle" style={{ marginTop: 8 }}>
            naive = flat-cost A*, never replans strategy, always fights · adaptive = EP-priced
            avoidance-first agent with event-driven replanning (this build)
          </p>
        </div>
      )}
    </div>
  );
}
