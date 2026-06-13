"use client";

// Evaluation Lab: real play data from every user session on this device.
// No simulations — every chart point is an actual game run by a real player.

import { useEffect, useState } from "react";
import type { PlayRecord } from "@/components/Game";
import { generateMap, quadrantOf } from "@/engine/mapgen";
import { search, type CostContext } from "@/engine/search";
import type { Config } from "@/engine/types";
import configJson from "@/data/config.json";

const cfg = configJson as unknown as Config;

const BLUE  = "#4fc3f7"; // isko
const PINK  = "#f48fb1"; // iska
const GREEN = "#66bb6a"; // won
const RED   = "#ef5350"; // lost
const GRAY  = "#8a91b4";

function loadPlays(): PlayRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("academon-plays") ?? "[]"); }
  catch { return []; }
}

function clearPlays() {
  localStorage.removeItem("academon-plays");
  localStorage.removeItem("academon-board");
}

const optimalCache = new Map<number, number>();
function optimalSteps(seed: number): number {
  if (optimalCache.has(seed)) return optimalCache.get(seed)!;
  let total = 0;
  let map = generateMap(cfg, seed, "class", -1);
  for (let round = 1; round <= cfg.session.rounds; round++) {
    if (round > 1) {
      const avoid = quadrantOf(map, map.goal);
      map = generateMap(cfg, seed + round * 9973, "class", avoid);
    }
    const ctx: CostContext = {
      cfg, map, p: 1, hpNow: cfg.resources.hp_max,
      timeLimit: cfg.modes.class.time_limit,
      excludeMobs: true, ambushChance: 0, stepTimeEP: 0,
    };
    const r = search(ctx, map.spawn, map.goal, "astar");
    total += r.found ? r.path.length - 1 : 0;
  }
  optimalCache.set(seed, total);
  return total;
}

function ticksFor(max: number, n: number): number[] {
  const step = Math.max(1, Math.ceil(max / n / 10) * 10);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function Axes({ W, H, P, xLabel, yLabel, xTicks, yTicks }: {
  W: number; H: number; P: number;
  xLabel: string; yLabel: string;
  xTicks: { v: number | string; x: number }[];
  yTicks: { v: number; y: number }[];
}) {
  return (
    <g shapeRendering="crispEdges" fontSize={7} fill={GRAY}>
      <line x1={P} y1={H-P} x2={W-8} y2={H-P} stroke={GRAY} strokeWidth={2}/>
      <line x1={P} y1={H-P} x2={P} y2={10} stroke={GRAY} strokeWidth={2}/>
      {xTicks.map((t,i) => (
        <g key={i}>
          <line x1={t.x} y1={H-P} x2={t.x} y2={H-P+4} stroke={GRAY} strokeWidth={1.5}/>
          <text x={t.x} y={H-P+13} textAnchor="middle" fontSize={6}>{t.v}</text>
        </g>
      ))}
      {yTicks.map((t,i) => (
        <g key={i}>
          <line x1={P-4} y1={t.y} x2={P} y2={t.y} stroke={GRAY} strokeWidth={1.5}/>
          <text x={P-6} y={t.y+3} textAnchor="end">{t.v}</text>
        </g>
      ))}
      <text x={(W+P)/2} y={H-3} textAnchor="middle" fontSize={7}>{xLabel}</text>
      <text x={10} y={12} textAnchor="start" fontSize={7}>{yLabel}</text>
    </g>
  );
}

function ScatterChart({ plays }: { plays: PlayRecord[] }) {
  const W=480, H=280, P=52;
  const maxX = Math.max(20, ...plays.map(p=>p.steps)) * 1.12;
  const maxY = Math.max(500, ...plays.map(p=>p.score)) * 1.12;
  const sx = (v: number) => P + (v/maxX)*(W-P-16);
  const sy = (v: number) => H - P - (v/maxY)*(H-P-20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", imageRendering:"pixelated" }}>
      <Axes W={W} H={H} P={P}
        xLabel="steps walked" yLabel="score"
        xTicks={ticksFor(maxX,5).map(v=>({v, x:sx(v)}))}
        yTicks={ticksFor(maxY,4).map(v=>({v, y:sy(v)}))}
      />
      {plays.map((p,i) => {
        const x=sx(p.steps), y=sy(p.score);
        const col = p.hero==="isko" ? BLUE : PINK;
        return p.won ? (
          <rect key={i} x={x-4} y={y-4} width={8} height={8} fill={col} opacity={0.85}>
            <title>{p.name} · {p.steps} steps · score {p.score} · {p.hero} · won</title>
          </rect>
        ) : (
          <text key={i} x={x} y={y+4} textAnchor="middle" fontSize={11} fill={col} fontWeight="bold" opacity={0.7}>
            ✕<title>{p.name} · {p.steps} steps · score {p.score} · {p.hero} · {p.failReason ?? "lost"}</title>
          </text>
        );
      })}
      <g fontSize={7}>
        <rect x={W-122} y={14} width={7} height={7} fill={BLUE}/>
        <text x={W-111} y={21} fill={BLUE}>Isko ■=won ✕=lost</text>
        <rect x={W-122} y={28} width={7} height={7} fill={PINK}/>
        <text x={W-111} y={35} fill={PINK}>Iska ■=won ✕=lost</text>
      </g>
    </svg>
  );
}

function LineChart({ plays }: { plays: PlayRecord[] }) {
  const W=480, H=280, P=52;
  const baselines = plays.map(p => optimalSteps(p.seed));
  const maxY = Math.max(...plays.map(p=>p.steps), ...baselines, 10) * 1.15;
  const n = plays.length;
  const sx = (i:number) => P + (n<=1 ? (W-P-16)/2 : (i/(n-1))*(W-P-16));
  const sy = (v:number) => H - P - (v/maxY)*(H-P-20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", imageRendering:"pixelated" }}>
      <Axes W={W} H={H} P={P}
        xLabel="session #" yLabel="steps"
        xTicks={plays.map((_,i)=>({v:i+1, x:sx(i)}))}
        yTicks={ticksFor(maxY,4).map(v=>({v, y:sy(v)}))}
      />
      <polyline points={baselines.map((v,i)=>`${sx(i)},${sy(v)}`).join(" ")}
        fill="none" stroke={GRAY} strokeWidth={1.5} strokeDasharray="5 4"/>
      <polyline points={plays.map((p,i)=>`${sx(i)},${sy(p.steps)}`).join(" ")}
        fill="none" stroke={GREEN} strokeWidth={2}/>
      {plays.map((p,i) => (
        <rect key={i} x={sx(i)-3} y={sy(p.steps)-3} width={6} height={6} fill={p.won ? GREEN : RED}>
          <title>{`#${i+1} ${p.name} (${p.hero}) — ${p.steps} steps, score ${p.score}${p.won ? ", won" : ", "+(p.failReason??"lost")}`}</title>
        </rect>
      ))}
      <g fontSize={7}>
        <line x1={W-150} y1={20} x2={W-138} y2={20} stroke={GRAY} strokeWidth={1.5} strokeDasharray="5 4"/>
        <text x={W-132} y={23} fill={GRAY}>shortest possible</text>
        <rect x={W-150} y={28} width={8} height={8} fill={GREEN}/>
        <text x={W-138} y={35} fill={GREEN}>won</text>
        <rect x={W-150} y={42} width={8} height={8} fill={RED}/>
        <text x={W-138} y={49} fill={RED}>lost</text>
      </g>
    </svg>
  );
}

function AccuracyBar({ plays }: { plays: PlayRecord[] }) {
  const buckets = [0,0,0,0];
  for (const p of plays) {
    const r = p.answered>0 ? p.correct/p.answered : 0;
    buckets[Math.min(3, Math.floor(r*4))]++;
  }
  const labels = ["<25%","25-50%","50-75%","75%+"];
  const colors = [RED,"#ffb300","#aed581",GREEN];
  const max = Math.max(...buckets,1);
  const W=320, H=140, P=36, BAR_W=40;
  const barGap = (W-P-16-BAR_W*4)/3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", imageRendering:"pixelated" }}>
      <g fontSize={7} fill={GRAY}>
        <line x1={P} y1={H-P} x2={W-8} y2={H-P} stroke={GRAY} strokeWidth={2}/>
        <line x1={P} y1={H-P} x2={P} y2={10} stroke={GRAY} strokeWidth={2}/>
        <text x={10} y={12} textAnchor="start">plays</text>
        <text x={(W+P)/2} y={H-3} textAnchor="middle">correct %</text>
      </g>
      {buckets.map((n,i) => {
        const bx = P + i*(BAR_W+barGap);
        const bh = (n/max)*(H-P-20);
        const by = H-P-bh;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={BAR_W} height={bh} fill={colors[i]} opacity={0.85}/>
            {n>0 && <text x={bx+BAR_W/2} y={by-2} textAnchor="middle" fontSize={7} fill={colors[i]}>{n}</text>}
            <text x={bx+BAR_W/2} y={H-P+12} textAnchor="middle" fontSize={6} fill={GRAY}>{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function EvalPage() {
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setPlays(loadPlays()); setLoaded(true); }, []);

  const refresh = () => setPlays(loadPlays());
  const clearAll = () => {
    if (confirm("Clear all recorded play data and leaderboard? This cannot be undone.")) {
      clearPlays(); setPlays([]);
    }
  };

  const wins = plays.filter(p=>p.won).length;
  const avgScore = plays.length ? Math.round(plays.reduce((a,p)=>a+p.score,0)/plays.length) : 0;
  const avgSteps = plays.length ? Math.round(plays.reduce((a,p)=>a+p.steps,0)/plays.length) : 0;
  const stepEP = ((cfg.ui.tween_ms/1000)*(cfg.resources.energy_max/cfg.modes.class.time_limit)).toFixed(2);

  return (
    <div className="wrap">
      <div className="title" style={{ fontSize:16 }}>EVAL LAB</div>
      <p className="lead">
        Real play data from every game session on this device — no simulations or dummy data.
        Each chart point is an actual run. Play a game, come back, click Refresh.
      </p>

      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", margin:"10px 0 18px" }}>
        <button className="pixel-btn primary" onClick={refresh}>↻ Refresh</button>
        <a href="/" className="chip" style={{ textDecoration:"none" }}>← back to game</a>
        <span className="chip">{plays.length} session{plays.length!==1?"s":""} recorded</span>
        {plays.length>0 && <>
          <span className="chip">{wins}/{plays.length} wins ({Math.round(wins/plays.length*100)}%)</span>
          <span className="chip">avg score {avgScore}</span>
          <span className="chip">avg steps {avgSteps}</span>
        </>}
        {plays.length>0 && (
          <button className="pixel-btn" style={{ marginLeft:"auto", color:RED }} onClick={clearAll}>
            ✕ Clear data
          </button>
        )}
      </div>

      {!loaded ? (
        <p className="lead">Loading…</p>
      ) : plays.length===0 ? (
        <div className="pixel-panel" style={{ textAlign:"center", padding:32 }}>
          <div className="title" style={{ fontSize:14, color:"var(--dim)", marginBottom:8 }}>No play data yet</div>
          <p className="lead">
            Finish a game session (win or lose) and every run is recorded automatically —
            no action needed in-game. Then come back here.
          </p>
          <a href="/" className="pixel-btn primary" style={{ textDecoration:"none", display:"inline-block", marginTop:12 }}>
            ▶ Play now
          </a>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(380px, 1fr))", gap:14 }}>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom:6 }}>STEPS vs SCORE — optimization frontier</div>
            <ScatterChart plays={plays}/>
            <p className="subtitle" style={{ marginTop:6 }}>
              Up-left is better (high score, short walk). ■ = win, ✕ = loss.
              Detours around the Wraith or to pick up items push points right —
              that gap is the risk-cost trade-off in action.
            </p>
          </div>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom:6 }}>STEPS PER SESSION vs SHORTEST-POSSIBLE BASELINE</div>
            <LineChart plays={plays}/>
            <p className="subtitle" style={{ marginTop:6 }}>
              Dashed = theoretical mob-free shortest path for that map seed.
              Green = win, red = loss. A gap above the baseline shows the avoidance-detour overhead;
              falling below means the player died and walked fewer total steps.
            </p>
          </div>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom:6 }}>ANSWER ACCURACY DISTRIBUTION</div>
            <AccuracyBar plays={plays}/>
            <p className="subtitle" style={{ marginTop:6 }}>
              Correct answer rate per session. Wrong answers cost HP; the AI re-evaluates
              fight vs retreat after each wrong answer based on updated accuracy estimate.
            </p>
          </div>
          <div className="pixel-panel">
            <div className="hud-label" style={{ marginBottom:6 }}>RECENT SESSIONS (newest first)</div>
            <div style={{ overflowX:"auto" }}>
              <table className="eval" style={{ width:"100%", minWidth:400 }}>
                <thead>
                  <tr>
                    <th>Player</th><th>Hero</th><th>Result</th>
                    <th>Score</th><th>Steps</th><th>Correct</th>
                    <th>Fights</th><th>Retreats</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plays].reverse().slice(0,15).map((p,i) => (
                    <tr key={i} style={{ background: p.won ? "rgba(102,187,106,0.07)" : "rgba(239,83,80,0.06)" }}>
                      <td>{p.name}</td>
                      <td style={{ color: p.hero==="isko" ? BLUE : PINK }}>{p.hero}</td>
                      <td style={{ color: p.won ? GREEN : RED }}>{p.won ? "WIN" : p.failReason ?? "LOSS"}</td>
                      <td><b>{p.score}</b></td>
                      <td>{p.steps}</td>
                      <td>{p.correct}/{p.answered}</td>
                      <td>{p.fights}</td>
                      <td>{p.retreats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── constraints & objective ─────────────────────────────────────────── */}
      <div className="title" style={{ fontSize:12, marginTop:26 }}>
        CONSTRAINTS &amp; OBJECTIVE (what the AI optimizes)
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:14, marginTop:10 }}>
        <div className="pixel-panel">
          <div className="hud-label">RESOURCE BUDGETS (hard constraints)</div>
          <ul style={{ paddingLeft:"1.4em", marginTop:8 }}>
            <li className="subtitle">HP {cfg.resources.hp_max} — wrong answers (slime −{cfg.mobs.slime.hp_loss} / goblin −{cfg.mobs.goblin.hp_loss} / wraith −{cfg.mobs.wraith.hp_loss})</li>
            <li className="subtitle">Energy {cfg.resources.energy_max} EP — every step + every attack answer</li>
            <li className="subtitle">Clock — {cfg.modes.class.time_limit}s per round · {cfg.session.rounds} rounds · HP &amp; energy carry</li>
            <li className="subtitle">Any budget at 0 → GAME OVER</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">TERRAIN COSTS (edge weights, EP)</div>
          <ul style={{ paddingLeft:"1.4em", marginTop:8 }}>
            <li className="subtitle">path {cfg.costs.path} · grass {cfg.costs.grass} (+{(cfg.mapgen.grass_encounter_chance*100).toFixed(0)}% ambush) · mud {cfg.costs.mud} · bush {cfg.costs.bush}</li>
            <li className="subtitle">+{stepEP} EP/step time-pricing (κ_t)</li>
            <li className="subtitle">BLOCKING: walls, boulders, water · ledges one-way</li>
            <li className="subtitle">Round 2 (Water): lilies = soft, outcrops = boulders</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">MOBS (blockage, not loot)</div>
          <ul style={{ paddingLeft:"1.4em", marginTop:8 }}>
            <li className="subtitle">Slime: {cfg.mobs.slime.hits} hit · Goblin: {cfg.mobs.goblin.hits} · Wraith: {cfg.mobs.wraith.hits} — no energy/HP reward on defeat</li>
            <li className="subtitle">Each answer costs {cfg.costs.attack_energy} EP; timer {cfg.mapgen.question_timer_sec}s</li>
            <li className="subtitle">RUN costs {cfg.costs.retreat_time}s; mob tile stays blocked</li>
            <li className="subtitle">Mapgen ensures ≥1 gatekeeper; wraith guards shortest route</li>
          </ul>
        </div>
        <div className="pixel-panel">
          <div className="hud-label">AGENT PARAMETERS</div>
          <ul style={{ paddingLeft:"1.4em", marginTop:8 }}>
            <li className="subtitle">Avoidance-first: mob-free Plan A if cost ≤ {cfg.agent.avoidance_bias}× engage Plan B</li>
            <li className="subtitle">Feasibility margin {cfg.agent.feasibility_margin}× on EP/time before detouring for items</li>
            <li className="subtitle">Accuracy: Laplace prior {cfg.agent.accuracy_prior} (k={cfg.agent.prior_strength_class})</li>
            <li className="subtitle">HP bands: {cfg.agent.bands.map(([v,n])=>`${n}≥${v}`).join(" · ")}</li>
            <li className="subtitle">6 replan triggers: defeat, retreat, pickup, band-cross, infeasible</li>
          </ul>
        </div>
      </div>
      <div className="pixel-panel" style={{ marginTop:14 }}>
        <div className="hud-label">OBJECTIVE</div>
        <p className="lead" style={{ marginTop:8 }}>
          Each tick, the agent runs A* over edge costs c(tile) = terrain EP + step-time EP + E[fight]
          on mob tiles, where E[fight] = hits&middot;C_round + hits&middot;(1−p)/p&middot;V_HP prices
          expected retries against scarcity-scaled HP value. It minimizes total expected EP subject to
          the three budgets staying positive (with the {cfg.agent.feasibility_margin}× safety margin) —
          i.e. <i>&ldquo;shortest path&rdquo; in RISK-ADJUSTED cost, not in tiles</i>.
          The scatter chart above shows exactly where the two notions of &ldquo;shortest&rdquo; diverge —
          and that divergence is what keeps the hero alive.
        </p>
      </div>
    </div>
  );
}
