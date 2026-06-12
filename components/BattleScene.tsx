"use client";

// Pokémon-style battle overlay with attack/hurt/faint animations.
// Hero side uses the chosen Isko/Iska portrait; mob side uses the sprite registry.

import { tierLabel, type Game } from "@/engine/game";
import { getSprite, heroPortraitSrc } from "@/lib/sprites";
import { useEffect, useRef, useState } from "react";

export default function BattleScene({
  game,
  answerApiRef,
  onAnswer,
  onRetreat,
}: {
  game: Game;
  answerApiRef?: React.MutableRefObject<((i: number) => void) | null>;
  onAnswer: (i: number) => void;
  onRetreat: () => void;
}) {
  const b = game.battle!;
  const mob = game.map.mobs.find((m) => m.id === b.mobId);
  const mobRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [heroAnim, setHeroAnim] = useState("battle-walk-in");
  const [mobAnim, setMobAnim] = useState("battle-walk-in");
  const [animKey, setAnimKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const lastQ = useRef(b.question.id);

  // paint the mob sprite
  useEffect(() => {
    const cv = mobRef.current;
    if (!cv || !mob) return;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(
      getSprite(mob.tier === "slime" ? "mob_slime" : mob.tier === "goblin" ? "mob_goblin" : "mob_wraith"),
      0,
      0,
      cv.width,
      cv.height
    );
  }, [mob, mob?.tier]);

  useEffect(() => {
    if (b.question.id !== lastQ.current) {
      lastQ.current = b.question.id;
      setLocked(false);
    }
  }, [b.question.id]);

  const answer = (i: number) => {
    if (locked) return;
    setLocked(true);
    const correct = i === b.correctIndex;
    const right = b.shuffledChoices[b.correctIndex];
    const willFaint = correct && mob && mob.hitsLeft <= 1;

    // play the exchange before the engine resolves it
    setAnimKey((k) => k + 1);
    if (correct) {
      setHeroAnim("anim-hero-attack");
      setMobAnim(willFaint ? "anim-mob-faint" : "anim-mob-hit");
      setFeedback(null);
    } else {
      setHeroAnim("anim-hero-hurt");
      setMobAnim("anim-mob-attack");
      setFeedback(`✗ Correct answer: ${right} — ${b.question.explain}`);
    }
    window.setTimeout(() => {
      onAnswer(i);
      setHeroAnim("");
      setMobAnim("");
      setLocked(false);
    }, 470);
  };

  const timerPct = (game.questionTimer / game.cfg.mapgen.question_timer_sec) * 100;
  const hitsMax = mob ? game.cfg.mobs[mob.tier].hits : 1;

  // expose the animated answer path to the keyboard handler
  useEffect(() => {
    if (!answerApiRef) return;
    answerApiRef.current = answer;
    return () => {
      answerApiRef.current = null;
    };
  });

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`h${animKey}`}
            src={heroPortraitSrc()}
            alt="hero"
            className={`battle-hero ${heroAnim}`}
            style={{ height: 120 }}
          />
          <div style={{ fontSize: 18, color: "#8a91b4" }}>VS</div>
          <canvas
            key={`m${animKey}`}
            ref={mobRef}
            width={16}
            height={16}
            className={`battle-mob ${mobAnim}`}
            style={{ width: 96, height: 96 }}
          />
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
            <button key={i} className="pixel-btn" disabled={locked} onClick={() => answer(i)}>
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
            disabled={locked}
            onClick={onRetreat}
          >
            Retreat (−{game.cfg.costs.retreat_time}s)
          </button>
        </div>
      </div>
    </div>
  );
}
