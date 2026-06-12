// Headless simulation — powers `npm run eval`, the /eval page, and tests (§XII).
// Bot answer profiles deliberately DIFFER from the agent's Laplace assumption
// (kills evaluation circularity).

import { Game } from "./game";
import type { AgentKind, BotProfile, Config, GameMode, Question, RunResult } from "./types";
import { mulberry32 } from "./rng";

export interface SimOptions {
  cfg: Config;
  questions: Question[];
  seed: number;
  mode: GameMode;
  agentKind: AgentKind;
  profile: BotProfile;
  maxSeconds?: number;
}

function botAccuracy(profile: BotProfile, answered: number, subject: string): number {
  switch (profile) {
    case "fixed50":
      return 0.5;
    case "fixed70":
      return 0.7;
    case "fixed90":
      return 0.9;
    case "fatigue":
      // starts sharp, tires: 0.9 → 0.4 over 12 questions
      return Math.max(0.4, 0.9 - 0.042 * answered);
    case "subject_skew":
      // strong in CS fundamentals, weak elsewhere
      return subject.toLowerCase().includes("algorithm") ||
        subject.toLowerCase().includes("data")
        ? 0.9
        : 0.55;
  }
}

/** Run one full game headlessly at a fixed timestep. */
export function simulate(opts: SimOptions): RunResult {
  const game = new Game(opts.cfg, opts.questions, {
    mode: opts.mode,
    seed: opts.seed,
    agentKind: opts.agentKind,
    algo: "astar",
  });
  const botRng = mulberry32(opts.seed ^ 0x5f3759df);
  game.start();

  const dt = 0.1;
  const maxSeconds =
    opts.maxSeconds ??
    opts.cfg.session.rounds * (opts.cfg.modes[opts.mode].time_limit + 30);
  let simTime = 0;

  while (
    (game.phase === "running" || game.phase === "battle" || game.phase === "roundclear") &&
    simTime < maxSeconds
  ) {
    if (game.phase === "roundclear") {
      game.nextRound();
      continue;
    }
    game.tick(dt);
    simTime += dt;

    if (game.phase === "battle" && game.battle) {
      if (game.battle.stage === "choice") {
        const naive = game.agentKind === "naive";
        // naive agent always fights; adaptive bot follows the recommendation
        if (!naive && game.battle.recommendation === "RETREAT" && !game.battle.unavoidable) {
          game.retreat();
          continue;
        }
        game.fightChosen(); // FIGHT → quiz round starts
      } else {
        // bot thinks for ~2s then answers
        const thinkUntil = game.battle.questionStartedAt + 2;
        if (game.elapsed >= thinkUntil) {
          const acc = botAccuracy(opts.profile, game.answered, game.battle.question.subject);
          const roll = botRng();
          if (roll < acc) {
            game.answer(game.battle.correctIndex);
          } else {
            const wrongIdx = (game.battle.correctIndex + 1) % game.battle.shuffledChoices.length;
            game.answer(wrongIdx);
          }
        }
      }
    }
  }

  return {
    won: game.phase === "won",
    failReason: game.failReason,
    roundsCleared: game.roundsCleared,
    steps: game.steps,
    fights: game.fights,
    correct: game.correct,
    wrong: game.wrong,
    retreats: game.retreats,
    hp: Math.round(game.hp),
    energy: Math.round(game.energy),
    timeLeft: Math.round(game.timeLeft),
    score: game.score,
    replans: game.replans,
    seed: opts.seed,
  };
}

export interface BatchSummary {
  agent: AgentKind;
  profile: BotProfile;
  runs: number;
  survival: number; // 0..1
  avgRounds: number;
  avgHp: number;
  avgEnergy: number;
  avgTimeLeft: number;
  avgFights: number;
  avgReplans: number;
  results: RunResult[];
}

/** Paired-seed batch: same seeds across agents for a fair A/B (§XII). */
export function batch(
  cfg: Config,
  questions: Question[],
  mode: GameMode,
  agent: AgentKind,
  profile: BotProfile,
  seeds: number[]
): BatchSummary {
  const results = seeds.map((seed) =>
    simulate({ cfg, questions, seed, mode, agentKind: agent, profile })
  );
  const n = results.length;
  const mean = (f: (r: RunResult) => number) => results.reduce((a, r) => a + f(r), 0) / n;
  return {
    agent,
    profile,
    runs: n,
    survival: results.filter((r) => r.won).length / n,
    avgRounds: mean((r) => r.roundsCleared),
    avgHp: mean((r) => r.hp),
    avgEnergy: mean((r) => r.energy),
    avgTimeLeft: mean((r) => r.timeLeft),
    avgFights: mean((r) => r.fights),
    avgReplans: mean((r) => r.replans),
    results,
  };
}
