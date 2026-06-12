"use client";

// Evaluation lab (§XII): paired-seed batches, naive vs adaptive agents,
// bot answer profiles the agent did NOT assume. Runs fully in-browser
// (the engine is pure TS). For the full 30-run CSV use `npm run eval`.

import { useRef, useState } from "react";
import { batch, type BatchSummary } from "@/engine/sim";
import type { BotProfile, Config, Question } from "@/engine/types";
import configJson from "@/data/config.json";
import questionsJson from "@/data/questions.json";

const cfg = configJson as unknown as Config;
const banks = questionsJson as unknown as Record<string, Question[]>;
const PROFILES: BotProfile[] = ["fixed50", "fixed70", "fixed90", "fatigue", "subject_skew"];

export default function EvalPage() {
  const [runs, setRuns] = useState(10);
  const [rows, setRows] = useState<BatchSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);

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

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

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
        <a href="/" className="chip" style={{ textDecoration: "none" }}>
          ← back to game
        </a>
      </div>

      {rows.length > 0 && (
        <div className="pixel-panel">
          <table className="eval">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Agent</th>
                <th>Survival</th>
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
