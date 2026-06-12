"use client";

// Game orchestrator: owns the engine instance, the RAF tick loop,
// keyboard input (1-4 answer, R retreat/restart, G ghost path), overlays.

import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/engine/game";
import { quadrantOf } from "@/engine/mapgen";
import type { Config, GameMode, Question } from "@/engine/types";
import configJson from "@/data/config.json";
import questionsJson from "@/data/questions.json";
import GameCanvas, { VIEW_H, VIEW_W } from "./GameCanvas";
import Hud from "./Hud";
import BattleScene from "./BattleScene";
import { preloadSprites } from "@/lib/sprites";

const cfg = configJson as unknown as Config;
const banks = questionsJson as unknown as Record<string, Question[]>;

interface LeaderEntry {
  name: string;
  score: number;
  goal: string;
}

function loadBoard(): LeaderEntry[] {
  try {
    return JSON.parse(localStorage.getItem("academon-board") ?? "[]");
  } catch {
    return [];
  }
}

function saveBoard(b: LeaderEntry[]) {
  localStorage.setItem("academon-board", JSON.stringify(b.slice(0, 10)));
}

function nextSeed(mode: GameMode): number {
  if (mode === "exhibit") {
    // deterministic-but-varied: rotating seed sequence — §II
    const n = Number(localStorage.getItem("academon-exhibit-run") ?? "0") + 1;
    localStorage.setItem("academon-exhibit-run", String(n));
    return 1000 + n * 17;
  }
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

export default function GameRoot() {
  const gameRef = useRef<Game | null>(null);
  const showGhostRef = useRef(true);
  const [, force] = useState(0);
  const [mode, setMode] = useState<GameMode>("class");
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [initials, setInitials] = useState("");
  const [savedScore, setSavedScore] = useState(false);
  const toastsSince = useRef(0);
  const [toasts, setToasts] = useState<{ t: number; msg: string }[]>([]);

  // mode from ?mode=exhibit
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "exhibit") setMode("exhibit");
    setBoard(loadBoard());
    preloadSprites();
  }, []);

  const newGame = useCallback(
    (m: GameMode) => {
      const bank = banks[cfg.modes[m].bank] ?? Object.values(banks)[0];
      // anti-repeat rule: never the same goal quadrant twice in a row (§II.2)
      const prevQuad = Number(localStorage.getItem("academon-last-quadrant") ?? "-1");
      const game = new Game(cfg, bank, {
        mode: m,
        seed: nextSeed(m),
        algo: "astar",
        avoidQuadrant: prevQuad,
      });
      localStorage.setItem("academon-last-quadrant", String(quadrantOf(game.map, game.map.goal)));
      gameRef.current = game;
      setSavedScore(false);
      setInitials("");
      toastsSince.current = 0;
      setToasts([]);
      game.start();
      force((v) => v + 1);
    },
    []
  );

  // main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      if (game && (game.phase === "running" || game.phase === "battle")) {
        game.tick(dt);
        // surface new toasts
        const fresh = game.toasts(toastsSince.current);
        if (fresh.length) {
          toastsSince.current = fresh[fresh.length - 1].t;
          setToasts((t) => [...t.slice(-2), ...fresh.map((e) => ({ t: e.t, msg: e.msg }))]);
        }
        setToasts((t) => t.filter((x) => game.elapsed - x.t < 4));
      }
      force((v) => v + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      if (game.phase === "battle" && game.battle) {
        if (e.key >= "1" && e.key <= "4") {
          const i = Number(e.key) - 1;
          if (i < game.battle.shuffledChoices.length) {
            game.fightChosen();
            game.answer(i);
            force((v) => v + 1);
          }
        } else if (e.key.toLowerCase() === "r") {
          game.retreat();
          force((v) => v + 1);
        }
      } else if (game.phase === "won" || game.phase === "lost") {
        if (e.key.toLowerCase() === "r") newGame(game.mode);
      }
      if (e.key.toLowerCase() === "g") showGhostRef.current = !showGhostRef.current;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newGame]);

  const game = gameRef.current;

  const submitScore = () => {
    if (!game || savedScore) return;
    const entry = {
      name: (initials || "AAA").slice(0, 3).toUpperCase(),
      score: game.score,
      goal: game.map.goalName,
    };
    const b = [...board, entry].sort((a, z) => z.score - a.score).slice(0, 10);
    setBoard(b);
    saveBoard(b);
    setSavedScore(true);
  };

  return (
    <div className="wrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <div className="title">ACADÉMON AI</div>
          <div className="subtitle">Gotta Pass &rsquo;Em All · Group 2 — Intro to AI · {mode.toUpperCase()} MODE</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/eval" className="chip" style={{ textDecoration: "none" }}>
            EVAL LAB →
          </a>
        </div>
      </div>

      {game && (game.phase === "running" || game.phase === "battle" || game.phase === "won" || game.phase === "lost") && (
        <Hud game={game} />
      )}

      <div className="game-stage scanlines" style={{ width: VIEW_W, height: VIEW_H }}>
        <GameCanvas gameRef={gameRef} showGhostRef={showGhostRef} />

        {/* toasts */}
        <div className="toasts">
          {toasts.map((t, i) => (
            <div className="toast" key={`${t.t}-${i}`}>
              {t.msg}
            </div>
          ))}
        </div>

        {/* start screen */}
        {(!game || game.phase === "idle") && (
          <div className="overlay">
            <div className="pixel-panel" style={{ width: 460, textAlign: "center" }}>
              <div className="title" style={{ fontSize: 16 }}>
                ACADÉMON AI
              </div>
              <p className="lead">
                The AI autopilots your scholar across campus — picking routes, dodging mobs, grabbing
                potions. <b style={{ color: "#ffd54f" }}>You only decide: FIGHT or RETREAT.</b>
              </p>
              <p className="lead">
                Goal is randomized every run. Beat the quiz goblins before HP, energy, or time runs out.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
                <button className="pixel-btn primary" onClick={() => newGame(mode)}>
                  ▶ Start ({mode})
                </button>
                <button
                  className="pixel-btn"
                  onClick={() => setMode((m) => (m === "class" ? "exhibit" : "class"))}
                >
                  Mode: {mode}
                </button>
              </div>
              <p className="subtitle" style={{ marginTop: 10 }}>
                <span className="kbd">1–4</span> answer · <span className="kbd">R</span> retreat/restart ·{" "}
                <span className="kbd">G</span> ghost path
              </p>
            </div>
          </div>
        )}

        {/* battle */}
        {game && game.phase === "battle" && game.battle && (
          <BattleScene
            game={game}
            onAnswer={(i) => {
              game.fightChosen();
              game.answer(i);
              force((v) => v + 1);
            }}
            onRetreat={() => {
              game.retreat();
              force((v) => v + 1);
            }}
          />
        )}

        {/* end screens */}
        {game && (game.phase === "won" || game.phase === "lost") && (
          <div className="overlay">
            <div className="pixel-panel" style={{ width: 480, textAlign: "center" }}>
              {game.phase === "won" ? (
                <>
                  <div className="end-grade">{game.grade}</div>
                  <div style={{ color: "#66bb6a", marginBottom: 6 }}>
                    REACHED {game.map.goalName.toUpperCase()}!
                  </div>
                </>
              ) : (
                <div style={{ color: "#ef5350", fontSize: 14, marginBottom: 6 }}>
                  GAME OVER — {game.failReason}
                </div>
              )}
              <div className="lead">
                Score <b style={{ color: "#ffd54f" }}>{game.score}</b> · correct {game.correct}/
                {game.answered} · fights {game.fights} · retreats {game.retreats} · replans {game.replans}
              </div>
              <div className="lead">
                followed AI {game.followed} · defied {game.defied}
              </div>

              {game.phase === "won" && !savedScore && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
                  <input
                    className="pixel-input"
                    maxLength={3}
                    placeholder="AAA"
                    value={initials}
                    onChange={(e) => setInitials(e.target.value)}
                  />
                  <button className="pixel-btn primary" onClick={submitScore}>
                    Save
                  </button>
                </div>
              )}

              {board.length > 0 && (
                <ol className="leaderboard" style={{ textAlign: "left", marginTop: 12 }}>
                  {board.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      <b>{e.name}</b> — {e.score} ({e.goal})
                    </li>
                  ))}
                </ol>
              )}

              <button className="pixel-btn primary" style={{ marginTop: 12 }} onClick={() => newGame(game.mode)}>
                ▶ Play again (R)
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="subtitle" style={{ marginTop: 10 }}>
        Orange = risk-aware route · dashed gray = naive shortest path (the difference IS the AI&rsquo;s
        judgment) · cyan flash = A* explored set · <span className="kbd">!</span> = gatekeeper mob
      </p>
    </div>
  );
}
