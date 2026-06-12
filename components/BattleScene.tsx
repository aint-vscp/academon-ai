"use client";

// Pokémon-style FULL-SCREEN battle per the mockups: arena background with a
// slight black wash, mob info box top-left, hero info box right, hero
// back-sprite + mob on the dirt circles, and a bottom panel that flows
// "What will you do?" (FIGHT / RUN) → "QUESTION N" + 2×2 choices.

import { tierLabel, type Game } from "@/engine/game";
import { getHeroVariant, getSprite } from "@/lib/sprites";
import { useEffect, useRef, useState } from "react";

export interface BattleApi {
  fight: () => void;
  run: () => void;
  answer: (i: number) => void;
}

function Pills({ frac }: { frac: number }) {
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.ceil(frac * total)));
  return (
    <span className="hp-pills">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < filled ? "on" : ""} />
      ))}
    </span>
  );
}

export default function BattleScene({
  game,
  apiRef,
  heroLabel,
  onFight,
  onAnswer,
  onRetreat,
}: {
  game: Game;
  apiRef?: React.MutableRefObject<BattleApi | null>;
  heroLabel: string;
  onFight: () => void;
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
  const [qNo, setQNo] = useState(0);
  const prevStage = useRef(b.stage);
  const prevMob = useRef(b.mobId);

  // paint the mob sprite (registry: PNG drop-in or procedural fallback).
  // animKey is a dep: the canvas remounts on every answer (CSS anim restart),
  // so the fresh element must be repainted or the mob vanishes mid-battle.
  useEffect(() => {
    const cv = mobRef.current;
    if (!cv || !mob) return;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const spr = getSprite(
      mob.tier === "slime" ? "mob_slime" : mob.tier === "goblin" ? "mob_goblin" : "mob_wraith"
    );
    // letterbox to preserve the sprite's aspect ratio
    const sw = spr.width || 16;
    const sh = spr.height || 16;
    const k = Math.min(cv.width / sw, cv.height / sh);
    const dw = sw * k;
    const dh = sh * k;
    g.drawImage(spr, (cv.width - dw) / 2, cv.height - dh, dw, dh);
  }, [mob, mob?.tier, animKey]);

  // new mob → reset the per-battle question counter
  useEffect(() => {
    if (b.mobId !== prevMob.current) {
      prevMob.current = b.mobId;
      setQNo(0);
      setFeedback(null);
      setLocked(false);
    }
  }, [b.mobId]);

  // FIGHT chosen → next question number
  useEffect(() => {
    if (prevStage.current !== b.stage) {
      if (b.stage === "question") setQNo((n) => n + 1);
      prevStage.current = b.stage;
    }
  }, [b.stage]);

  const fight = () => {
    if (locked || b.stage !== "choice") return;
    setFeedback(null);
    onFight();
  };
  const run = () => {
    if (locked || b.stage !== "choice") return;
    onRetreat();
  };
  const answer = (i: number) => {
    if (locked || b.stage !== "question") return;
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

  // expose to the keyboard handler
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { fight, run, answer };
    return () => {
      apiRef.current = null;
    };
  });

  const v = getHeroVariant();
  const hpFrac = game.hp / game.cfg.resources.hp_max;
  const mobFrac = mob ? mob.hitsLeft / game.cfg.mobs[mob.tier].hits : 0;
  const timerPct = (game.questionTimer / game.cfg.mapgen.question_timer_sec) * 100;
  const eF = Number.isFinite(b.eFight) ? b.eFight.toFixed(0) : "∞";
  const eR = Number.isFinite(b.eRetreat) ? b.eRetreat.toFixed(0) : "∞";

  return (
    <div className="battle-screen">
      {/* mob info — top-left */}
      <div className="binfo binfo-mob">
        <div className="binfo-name">
          <span>
            {tierLabel(mob?.tier ?? "slime")}
            {mob?.gatekeeper ? " ⚑" : ""}
            {b.ambush ? " (ambush!)" : ""}
          </span>
        </div>
        <div className="binfo-hp">
          <b>HP</b>
          <Pills frac={mobFrac} />
        </div>
      </div>

      {/* hero info — right */}
      <div className="binfo binfo-hero">
        <div className="binfo-name">
          <span>{heroLabel}</span>
          <span className="hp-num">
            {Math.ceil(game.hp)}/{game.cfg.resources.hp_max}
          </span>
        </div>
        <div className="binfo-hp">
          <b>HP</b>
          <Pills frac={hpFrac} />
        </div>
      </div>

      {/* combatants on the arena circles */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`h${animKey}`}
        src={`/ui/hero/${v}_back.png`}
        alt=""
        className={`battle-hero-sprite ${heroAnim}`}
      />
      <canvas
        key={`m${animKey}`}
        ref={mobRef}
        width={128}
        height={128}
        className={`battle-mob-sprite ${mobAnim}`}
      />

      {/* bottom panel: choice → question */}
      <div className="battle-bottom">
        {b.stage === "choice" ? (
          <div className="battle-prompt-row">
            <div className="battle-prompt-info">
              <div className="battle-prompt">What will you do?</div>
              <div className="ai-line">
                AI recommends <b className={b.recommendation === "FIGHT" ? "ai-fight" : "ai-run"}>{b.recommendation === "FIGHT" ? "FIGHT" : "RUN"}</b>{" "}
                — {b.reason} · E[fight] {eF} EP · E[run] {eR} EP
              </div>
              {feedback && <div className="battle-feedback">{feedback}</div>}
            </div>
            <div className="battle-actions">
              <button
                className={`fight-btn ${b.recommendation === "FIGHT" ? "recommended" : ""}`}
                onClick={fight}
              >
                FIGHT
              </button>
              <button
                className={`run-btn ${b.recommendation === "RETREAT" ? "recommended" : ""}`}
                onClick={run}
              >
                RUN
              </button>
            </div>
          </div>
        ) : (
          <div className="battle-qa">
            <div className="q-left">
              <div className="q-head">QUESTION {qNo || 1}</div>
              <div className="q-text">{b.question.q}</div>
              <div className="qtimer">
                <i style={{ width: `${timerPct}%` }} />
              </div>
            </div>
            <div className="q-choices">
              {b.shuffledChoices.map((c, i) => (
                <button key={i} className="q-choice" disabled={locked} onClick={() => answer(i)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
