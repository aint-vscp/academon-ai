"use client";

import { tierLabel, type Game } from "@/engine/game";
import { getSprite } from "@/lib/sprites";
import { useEffect, useRef, useState } from "react";

/** Pokémon-style battle overlay: sprites, recommendation, question, FIGHT/RETREAT. */
export default function BattleScene({
  game,
  onAnswer,
  onRetreat,
}: {
  game: Game;
  onAnswer: (i: number) => void;
  onRetreat: () => void;
}) {
  const b = game.battle!;
  const mob = game.map.mobs.find((m) => m.id === b.mobId);
  const heroRef = useRef<HTMLCanvasElement>(null);
  const mobRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lastQ = useRef(b.question.id);

  // repaint the big sprites
  useEffect(() => {
    const paint = (cv: HTMLCanvasElement | null, name: Parameters<typeof getSprite>[0]) => {
      if (!cv) return;
      const g = cv.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(getSprite(name), 0, 0, cv.width, cv.height);
    };
    paint(heroRef.current, "hero");
    paint(
      mobRef.current,
      mob?.tier === "slime" ? "mob_slime" : mob?.tier === "goblin" ? "mob_goblin" : "mob_wraith"
    );
  }, [mob?.tier]);

  // show miss explanations between questions
  useEffect(() => {
    if (b.question.id !== lastQ.current) {
      lastQ.current = b.question.id;
      setFeedback(null);
    }
  }, [b.question.id]);

  const answer = (i: number) => {
    const correct = i === b.correctIndex;
    const explain = b.question.explain;
    const right = b.shuffledChoices[b.correctIndex];
    if (!correct) setFeedback(`✗ Correct answer: ${right} — ${explain}`);
    else setFeedback(null);
    onAnswer(i);
  };

  const timerPct = (game.questionTimer / game.cfg.mapgen.question_timer_sec) * 100;
  const hitsMax = mob ? game.cfg.mobs[mob.tier].hits : 1;

  return (
    <div className="overlay">
      <div className="pixel-panel battle-card">
        <div className="battle-head">
          <div>
            A wild <b style={{ color: "#ffd54f" }}>{tierLabel(mob?.tier ?? "slime")}</b>
            {b.ambush ? " ambushed you in the grass!" : " blocks the path!"}
            {mob?.gatekeeper ? " (gatekeeper)" : ""}
          </div>
          <div className="subtitle">
            HITS {mob ? hitsMax - mob.hitsLeft : 0}/{hitsMax}
          </div>
        </div>

        <div className="battle-sprites">
          <canvas ref={heroRef} width={16} height={16} />
          <div style={{ fontSize: 18, color: "#8a91b4" }}>VS</div>
          <canvas ref={mobRef} width={16} height={16} />
        </div>

        <div className={`reco ${b.recommendation === "RETREAT" ? "retreat" : ""}`}>
          AI RECOMMENDS: <b>{b.recommendation}</b> — {b.reason}
          <br />
          E[fight] {Number.isFinite(b.eFight) ? b.eFight.toFixed(0) : "∞"} EP · E[retreat]{" "}
          {Number.isFinite(b.eRetreat) ? b.eRetreat.toFixed(0) : "∞ (unavoidable)"} EP
        </div>

        <div style={{ fontSize: 10 }}>{b.question.q}</div>
        <div className="qtimer">
          <i style={{ width: `${timerPct}%` }} />
        </div>

        <div className="choices">
          {b.shuffledChoices.map((c, i) => (
            <button key={i} className="pixel-btn" onClick={() => answer(i)}>
              [{i + 1}] {c}
            </button>
          ))}
        </div>

        {feedback && (
          <div className="reco" style={{ borderColor: "#ef5350", color: "#ff8a80", background: "#2a1010" }}>
            {feedback}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <span className="subtitle">
            answer with <span className="kbd">1–4</span> · retreat with <span className="kbd">R</span>
          </span>
          <button
            className={`pixel-btn danger ${b.recommendation === "RETREAT" ? "recommended" : ""}`}
            onClick={onRetreat}
          >
            Retreat (−{game.cfg.costs.retreat_time}s)
          </button>
        </div>
      </div>
    </div>
  );
}
