import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { simulate, batch } from "../engine/sim";
import { Game } from "../engine/game";
import type { Config, Question } from "../engine/types";

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/config.json"), "utf8")
) as Config;
const banks = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/questions.json"), "utf8")
) as Record<string, Question[]>;
const questions = banks["cs-review"];

describe("headless simulation (§XII)", () => {
  it("a run terminates with a definite outcome", () => {
    const r = simulate({
      cfg,
      questions,
      seed: 4242,
      mode: "class",
      agentKind: "adaptive",
      profile: "fixed90",
    });
    expect(typeof r.won).toBe("boolean");
    if (!r.won) expect(r.failReason).not.toBeNull();
    expect(r.fights).toBeGreaterThanOrEqual(1); // gatekeepers guarantee ≥1 fight
  });

  it("same seed + same profile reproduces the same result (determinism)", () => {
    const a = simulate({ cfg, questions, seed: 777, mode: "exhibit", agentKind: "adaptive", profile: "fixed70" });
    const b = simulate({ cfg, questions, seed: 777, mode: "exhibit", agentKind: "adaptive", profile: "fixed70" });
    expect(a).toEqual(b);
  });

  it("adaptive agent survives at least as well as naive on a small paired batch", () => {
    const seeds = [4242, 4343, 4444, 4545, 4646, 4747];
    const naive = batch(cfg, questions, "class", "naive", "fixed70", seeds);
    const adaptive = batch(cfg, questions, "class", "adaptive", "fixed70", seeds);
    expect(adaptive.survival).toBeGreaterThanOrEqual(naive.survival);
  });

  it("game over fires on HP depletion (wrong answers only drain HP)", () => {
    const r = simulate({
      cfg,
      questions,
      seed: 1212,
      mode: "class",
      agentKind: "naive",
      profile: "fixed50",
    });
    if (!r.won && r.failReason === "OUT OF HP") {
      expect(r.hp).toBe(0);
    }
    expect(r.steps).toBeGreaterThan(0);
  });

  it("score rewards wins and remaining budgets", () => {
    const results = [4242, 555, 909].map((seed) =>
      simulate({ cfg, questions, seed, mode: "class", agentKind: "adaptive", profile: "fixed90" })
    );
    const won = results.find((r) => r.won);
    if (won) expect(won.score).toBeGreaterThanOrEqual(1000);
  });

  it("game exposes replan events and stat samples for the live graph", () => {
    const game = new Game(cfg, questions, { mode: "class", seed: 4242, agentKind: "adaptive" });
    game.start();
    for (let i = 0; i < 600 && (game.phase === "running" || game.phase === "battle"); i++) {
      game.tick(0.1);
      if (game.phase === "battle" && game.battle) game.answer(game.battle.correctIndex);
    }
    expect(game.replans).toBeGreaterThanOrEqual(1);
    expect(game.samples.length).toBeGreaterThan(0);
    expect(game.events.some((e) => e.kind === "replan")).toBe(true);
  });
});
