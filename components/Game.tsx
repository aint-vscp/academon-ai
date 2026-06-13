"use client";

// Game orchestrator: full-viewport app shell, engine instance + RAF tick loop,
// keyboard input (1-4 answer, R retreat/restart, G ghost, F fullscreen),
// 3-round sessions, overlays. Eval Lab link lives ONLY on the start screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/engine/game";
import { quadrantOf } from "@/engine/mapgen";
import GameCanvas from "./GameCanvas";
import Hud from "./Hud";
import BattleScene, { type BattleApi } from "./BattleScene";
import IrisTransition from "./IrisTransition";
import StartFlow, { type StartChoice } from "./StartFlow";
import { preloadSprites, setHeroVariant } from "@/lib/sprites";
import RewardEnding from "./RewardEnding";
import type { Config, EncounterSet, GameMode, Question } from "@/engine/types";
import configJson from "@/data/config.json";
import questionsJson from "@/data/questions.json";
import encountersJson from "@/data/encounters.json";

const cfg = configJson as unknown as Config;
const banks = questionsJson as unknown as Record<string, Question[]>;
const encounterSets = encountersJson as unknown as EncounterSet[];

/** Reward badge per cleared level (Certificate → Trophy → Pylon Torch). */
const BADGE_BY_ROUND = ["/ui/badge_nature.png", "/ui/badge_water.png", "/ui/badge_fire.png"];

interface LeaderEntry {
  name: string;
  score: number;
  goal: string;
}

/** Persisted record of a single play session — powers the Eval Lab real-data charts. */
export interface PlayRecord {
  id: string;
  ts: number;
  name: string;
  hero: "isko" | "iska";
  mode: "class" | "exhibit";
  seed: number;
  steps: number;
  score: number;
  won: boolean;
  failReason?: string | null;
  correct: number;
  answered: number;
  fights: number;
  retreats: number;
  replans: number;
  elapsed: number;
  roundsCleared: number;
  /** Final HP at game end (0–100). */
  finalHp: number;
  /** Final energy reserve at game end (0–100). */
  finalEnergy: number;
  /** Cumulative energy points consumed across the whole session (steps + attacks). */
  energyCost: number;
}

/** Post-game taglines by share of questions answered correctly. */
function sayingFor(correct: number, answered: number): string {
  const r = answered > 0 ? correct / answered : 0;
  if (r >= 0.75) return "SANA ALL ACADEMIC WEAPON! KEEP UP THE GOOD WORK, BES!";
  if (r >= 0.45) return "ARAL PA MUNA. MALAYO NA PERO MALAYO PA.";
  return "BAWI KA NALANG NEXT SCHOOL YEAR, MAG FILE KA NA NG LOA!";
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} MINS`;
}

interface TransSpec {
  label: string;
  color: string;
  mid: () => void;
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

function recordPlay(game: Game, name: string, hero: "isko" | "iska") {
  try {
    const plays: PlayRecord[] = JSON.parse(localStorage.getItem("academon-plays") ?? "[]");
    plays.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      name,
      hero,
      mode: game.mode,
      seed: game.seed,
      steps: game.steps,
      score: game.score,
      won: game.phase === "won",
      failReason: game.failReason,
      correct: game.correct,
      answered: game.answered,
      fights: game.fights,
      retreats: game.retreats,
      replans: game.replans,
      elapsed: game.elapsed,
      roundsCleared: game.roundsCleared,
      finalHp: Math.max(0, Math.round(game.hp)),
      finalEnergy: Math.max(0, Math.round(game.energy)),
      energyCost: Math.round(game.energySpent),
    });
    localStorage.setItem("academon-plays", JSON.stringify(plays.slice(-100)));
  } catch {}
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
  const endSavedRef = useRef(false); // guard: save once per session on game end
  const toastsSince = useRef(0);
  const [toasts, setToasts] = useState<{ t: number; msg: string }[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const roundClearAt = useRef(0);
  const [choice, setChoice] = useState<StartChoice | null>(null);
  const battleApiRef = useRef<BattleApi | null>(null);
  const [trans, setTrans] = useState<TransSpec | null>(null);
  const transRef = useRef(false);
  const [showStats, setShowStats] = useState(false);
  const [showReward, setShowReward] = useState(false);

  const startTrans = useCallback((label: string, color: string, mid: () => void) => {
    transRef.current = true;
    setTrans({ label, color, mid });
  }, []);

  // mode from ?mode=exhibit · ?autostart=isko|iska boots straight into a run (dev/booth)
  const newGame = useCallback(
    (m: GameMode, c: StartChoice) => {
      setChoice(c);
      setHeroVariant(c.hero);
      const bank = banks[cfg.modes[m].bank] ?? Object.values(banks)[0];
      // anti-repeat rule: never the same goal quadrant twice in a row (§II.2)
      const prevQuad = Number(localStorage.getItem("academon-last-quadrant") ?? "-1");
      const game = new Game(cfg, bank, {
        mode: m,
        seed: nextSeed(m),
        algo: "astar",
        avoidQuadrant: prevQuad,
        sets: encounterSets,
      });
      localStorage.setItem("academon-last-quadrant", String(quadrantOf(game.map, game.map.goal)));
      gameRef.current = game;
      endSavedRef.current = false;
      setShowStats(false);
      setShowReward(false);
      toastsSince.current = 0;
      setToasts([]);
      // iris in over the title, reveal Level 1 behind the curtain
      startTrans(game.levelLabel, "#ffffff", () => {
        game.start();
        force((v) => v + 1);
      });
      force((v) => v + 1);
    },
    [startTrans]
  );

  /** Round-clear → iris to the next level (fires once per roundclear). */
  const fireRoundTransition = useCallback(
    (game: Game) => {
      if (transRef.current || game.phase !== "roundclear") return;
      roundClearAt.current = 0;
      const nr = game.round + 1;
      const label = nr === 2 ? "WATER" : nr === 3 ? "FIRE" : "NATURE";
      const color = nr === 2 ? "#46e0d4" : nr === 3 ? "#ff7a3c" : "#ffffff";
      startTrans(`LEVEL ${nr}: ${label}`, color, () => {
        game.nextRound();
        force((v) => v + 1);
      });
    },
    [startTrans]
  );

  const backToTitle = useCallback(() => {
    gameRef.current = null;
    force((v) => v + 1);
  }, []);

  // mode from ?mode=exhibit · ?autostart=isko|iska boots straight into a run (dev/booth)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m: GameMode = q.get("mode") === "exhibit" ? "exhibit" : "class";
    if (m === "exhibit") setMode("exhibit");
    setBoard(loadBoard());
    preloadSprites();
    const auto = q.get("autostart");
    if ((auto === "isko" || auto === "iska") && !gameRef.current) {
      newGame(m, { hero: auto, name: auto === "isko" ? "Isko" : "Iska" });
    }
  }, [newGame]);

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current ?? document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      const frozen = transRef.current; // world paused behind the iris curtain
      if (game && !frozen && (game.phase === "running" || game.phase === "battle")) {
        game.tick(dt);
        const fresh = game.toasts(toastsSince.current);
        if (fresh.length) {
          toastsSince.current = fresh[fresh.length - 1].t;
          setToasts((t) => [...t.slice(-2), ...fresh.map((e) => ({ t: e.t, msg: e.msg }))]);
        }
        setToasts((t) => t.filter((x) => game.elapsed - x.t < 4));
      }
      // show the round-clear banner briefly, then iris into the next level
      if (game && game.phase === "roundclear" && !frozen) {
        if (!roundClearAt.current) roundClearAt.current = now;
        if (now - roundClearAt.current > 1500) fireRoundTransition(game);
      } else if (game && game.phase !== "roundclear") {
        roundClearAt.current = 0;
      }
      force((v) => v + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fireRoundTransition]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (transRef.current) return; // ignore input mid-transition
      if (game && game.phase === "battle" && game.battle) {
        const api = battleApiRef.current;
        if (game.battle.stage === "choice") {
          if (e.key.toLowerCase() === "f" || e.key === "Enter") {
            if (api) api.fight();
            else game.fightChosen();
            force((v) => v + 1);
            return; // F is FIGHT here, not fullscreen
          }
          if (e.key.toLowerCase() === "r") {
            if (api) api.run();
            else game.retreat();
            force((v) => v + 1);
            return;
          }
        } else if (e.key >= "1" && e.key <= "4") {
          const i = Number(e.key) - 1;
          if (i < game.battle.shuffledChoices.length) {
            // route through the battle scene so the animation plays
            if (api) api.answer(i);
            else game.answer(i);
            force((v) => v + 1);
          }
          return;
        }
      }
      if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
        return;
      }
      if (!game) return;
      if (game.phase === "roundclear") {
        if (e.key === "Enter" || e.key === " ") fireRoundTransition(game);
      } else if (game.phase === "won" || game.phase === "lost") {
        if (e.key.toLowerCase() === "r" && choice) newGame(game.mode, choice);
      }
      if (e.key.toLowerCase() === "g") showGhostRef.current = !showGhostRef.current;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newGame, toggleFullscreen, choice, fireRoundTransition]);

  const game = gameRef.current;
  const inGame =
    game &&
    (game.phase === "running" ||
      game.phase === "battle" ||
      game.phase === "roundclear" ||
      game.phase === "won" ||
      game.phase === "lost");
  // the congrats mockup is a clean full screen — hide the chrome behind it
  const inCongrats = !!game && game.phase === "won" && !showStats;
  const inReward = !!game && game.phase === "won" && showStats && showReward;
  const hideChrome = inCongrats || inReward;

  // Auto-save play record + leaderboard once per session when game ends
  if (game && choice && !endSavedRef.current && (game.phase === "won" || game.phase === "lost")) {
    endSavedRef.current = true;
    recordPlay(game, choice.name, choice.hero);
    const entry: LeaderEntry = { name: choice.name, score: game.score, goal: game.map.goalName };
    const b = [...board, entry].sort((a, z) => z.score - a.score).slice(0, 10);
    saveBoard(b);
    // schedule state update out of render to avoid React warning
    setTimeout(() => setBoard(b), 0);
  }

  return (
    <div className="app-shell">
      {/* compact header — hidden during the start flow / congrats for the mockup look */}
      {inGame && !hideChrome && (
        <div className="app-header">
          <div>
            <span className="title" style={{ fontSize: 14 }}>
              ACADÉMON AI
            </span>
            <span className="subtitle" style={{ marginLeft: 10 }}>
              Gotta Pass &rsquo;Em All · {mode.toUpperCase()}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {choice && (
              <span className="chip">
                <b>{choice.name.toUpperCase()}</b> · {choice.hero === "isko" ? "ISKO" : "ISKA"}
              </span>
            )}
            <span className="chip">
              ROUND <b>{game!.round}/{cfg.session.rounds}</b>
            </span>
            <button className="pixel-btn" style={{ padding: "4px 8px", fontSize: 8 }} onClick={toggleFullscreen}>
              ⛶ Fullscreen (F)
            </button>
          </div>
        </div>
      )}

      {inGame && !hideChrome && <Hud game={game!} />}

      {/* the stage fills the rest of the viewport */}
      <div ref={stageRef} className="game-stage scanlines">
        <GameCanvas gameRef={gameRef} showGhostRef={showGhostRef} />

        <div className="toasts">
          {toasts.map((t, i) => (
            <div className="toast" key={`${t.t}-${i}`}>
              {t.msg}
            </div>
          ))}
        </div>

        {/* start flow (title → options → character select → name) — Eval Lab lives here only */}
        {(!game || game.phase === "idle") && (
          <StartFlow
            mode={mode}
            onModeChange={setMode}
            ghostDefault={showGhostRef.current}
            onGhostChange={(v) => {
              showGhostRef.current = v;
              force((x) => x + 1);
            }}
            onStart={(c) => newGame(mode, c)}
          />
        )}

        {/* battle — full-screen Pokémon-style scene */}
        {game && game.phase === "battle" && game.battle && (
          <BattleScene
            game={game}
            apiRef={battleApiRef}
            heroLabel={`${choice?.name ?? (choice?.hero === "iska" ? "Iska" : "Isko")} 3-1N`}
            onFight={() => {
              game.fightChosen();
              force((v) => v + 1);
            }}
            onAnswer={(i) => {
              game.answer(i);
              force((v) => v + 1);
            }}
            onRetreat={() => {
              game.retreat();
              force((v) => v + 1);
            }}
          />
        )}

        {/* round clear banner (auto-irises into the next level) */}
        {game && game.phase === "roundclear" && !trans && (
          <div className="overlay">
            <div className="pixel-panel" style={{ width: 420, textAlign: "center" }}>
              <div className="title" style={{ fontSize: 18, color: "#66bb6a" }}>
                ROUND {game.round} CLEAR!
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BADGE_BY_ROUND[game.round - 1]}
                alt="badge"
                className="round-badge"
              />
              <p className="lead">
                Reached <b>{game.map.goalName}</b> · badge earned · +{cfg.scoring.w_round} score
              </p>
              <p className="lead">
                HP <b>{Math.ceil(game.hp)}</b> carries over · energy refilled for the next level.
              </p>
              <button
                className="pixel-btn primary"
                style={{ marginTop: 8 }}
                onClick={() => fireRoundTransition(game)}
              >
                ▶ Round {game.round + 1} (Enter)
              </button>
            </div>
          </div>
        )}

        {/* congratulations screen (mockup) — arrow leads to the stats panel */}
        {game && game.phase === "won" && !showStats && (
          <div className="congrats-screen">
            <div className="congrats-title">CONGRATULATIONS !!!</div>
            <div className="congrats-saying">{sayingFor(game.correct, game.answered)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/trophy.png" alt="trophy" className="congrats-trophy" />
            <div className="congrats-badges">
              {BADGE_BY_ROUND.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" />
              ))}
            </div>
            <div className="congrats-stats">
              <div>TIME ELAPSED:</div>
              <div className="congrats-val">{fmtElapsed(game.elapsed)}</div>
              <div style={{ marginTop: 14 }}>NO. OF CORRECT QUESTIONS:</div>
              <div className="congrats-val gold">
                {game.correct}/{game.answered}
              </div>
            </div>
            <button className="congrats-next" onClick={() => setShowStats(true)} aria-label="Continue">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ui/arrow_next.png" alt="" />
            </button>
          </div>
        )}

        {/* stats / leaderboard panel (after congrats, or on defeat) */}
        {game && (game.phase === "lost" || (game.phase === "won" && showStats)) && (
          <div className="overlay">
            <div className="pixel-panel stats-panel" style={{ width: 500, textAlign: "center" }}>
              {game.phase === "won" ? (
                <>
                  <div className="end-grade">{game.grade}</div>
                  <div style={{ color: "#66bb6a", marginBottom: 6 }}>
                    ALL {cfg.session.rounds} ROUNDS CLEAR!
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: "#ef5350", fontSize: 14, marginBottom: 6 }}>
                    GAME OVER — {game.failReason}
                  </div>
                  <div className="lead">
                    cleared {game.roundsCleared}/{cfg.session.rounds} rounds
                  </div>
                  <div className="subtitle" style={{ margin: "6px 0", color: "#8d93a8" }}>
                    {sayingFor(game.correct, game.answered)}
                  </div>
                </>
              )}
              <div className="lead">
                Score <b style={{ color: "#ffd54f" }}>{game.score}</b> · correct {game.correct}/
                {game.answered} · fights {game.fights} · retreats {game.retreats} · replans{" "}
                {game.replans}
              </div>
              <div className="lead">
                followed AI {game.followed} · defied {game.defied} · time {fmtElapsed(game.elapsed)}
              </div>

              {/* leaderboard — always visible; populated automatically on game end */}
              <div className="hud-label" style={{ marginTop: 14, marginBottom: 4 }}>
                LEADERBOARD
              </div>
              <ol className="leaderboard">
                {board.length === 0 ? (
                  <li style={{ color: "var(--dim)", listStyle: "none" }}>No scores yet — be the first!</li>
                ) : (
                  board.slice(0, 8).map((e, i) => (
                    <li key={i} className={e.name === choice?.name ? "lb-current" : ""}>
                      {i === 0 && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/ui/crown.png" alt="" className="crown-img" />
                      )}
                      <b>{e.name}</b> — {e.score} <span style={{ color: "var(--dim)" }}>({e.goal})</span>
                    </li>
                  ))
                )}
              </ol>

              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
                {game.phase === "won" && (
                  <button className="pixel-btn primary" onClick={() => setShowReward(true)}>
                    🏆 Claim your reward
                  </button>
                )}
                <button
                  className="pixel-btn"
                  onClick={() => choice && newGame(game.mode, choice)}
                >
                  ▶ Play again (R)
                </button>
                <button className="pixel-btn" onClick={backToTitle}>
                  ⌂ Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* white circular reward ending — directs winners to claim in person */}
        {inReward && (
          <RewardEnding
            score={game!.score}
            grade={game!.grade}
            badges={BADGE_BY_ROUND}
            onPlayAgain={() => choice && newGame(game!.mode, choice)}
            onMenu={backToTitle}
          />
        )}

        {/* circle iris wipe between rounds */}
        {trans && (
          <IrisTransition
            label={trans.label}
            color={trans.color}
            onMid={trans.mid}
            onDone={() => {
              transRef.current = false;
              setTrans(null);
            }}
          />
        )}
      </div>

      <div className="app-footer subtitle">
        {inGame ? (
          <>
            Orange = risk-aware route · dashed gray = naive shortest path · cyan flash = A* explored
            set · <span className="kbd">!</span> = gatekeeper mob
          </>
        ) : (
          <>Group 2 · Intro to AI · Polytechnic University of the Philippines</>
        )}
      </div>
    </div>
  );
}
