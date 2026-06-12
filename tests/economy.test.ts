import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { accuracy, bandFor, cRound, eFight, kappaT, vHP } from "../engine/economy";
import type { Config } from "../engine/types";

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/config.json"), "utf8")
) as Config;

describe("EP currency (§IV — derived, not hand-picked)", () => {
  it("κ_t is the ratio of starting budgets", () => {
    expect(kappaT(cfg, 150)).toBeCloseTo(100 / 150);
    expect(kappaT(cfg, 90)).toBeCloseTo(100 / 90); // time scarcer in exhibit ⇒ EP/s higher
  });

  it("V_HP scales with scarcity", () => {
    expect(vHP(20, 100)).toBeCloseTo(20);
    expect(vHP(20, 40)).toBeCloseTo(50); // same hit hurts 2.5× more at 40 HP
    expect(vHP(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("C_round = attack energy + expected answer time (half the timer) in EP", () => {
    expect(cRound(cfg, 150)).toBeCloseTo(6 + (15 / 2) * (100 / 150));
  });

  it("E[fight] rises for harder tiers and lower accuracy", () => {
    const easyGood = eFight(cfg, "slime", 0.9, 100, 150);
    const easyBad = eFight(cfg, "slime", 0.4, 100, 150);
    const hardGood = eFight(cfg, "wraith", 0.9, 100, 150);
    expect(easyBad).toBeGreaterThan(easyGood);
    expect(hardGood).toBeGreaterThan(easyGood);
  });

  it("E[fight] explodes at low HP (survival mode emerges from the math)", () => {
    const healthy = eFight(cfg, "goblin", 0.7, 100, 150);
    const dying = eFight(cfg, "goblin", 0.7, 25, 150);
    expect(dying).toBeGreaterThan(healthy * 1.8);
  });

  it("Laplace accuracy starts at the prior and tracks evidence", () => {
    expect(accuracy(0, 0, 0.7, 10)).toBeCloseTo(0.7);
    expect(accuracy(10, 10, 0.7, 10)).toBeGreaterThan(0.8);
    expect(accuracy(0, 10, 0.7, 10)).toBeLessThan(0.4);
  });

  it("bands cover every HP value with no gaps", () => {
    for (let hp = 1; hp <= 100; hp++) {
      expect(["Confident", "Cautious", "Defensive", "Survival"]).toContain(bandFor(cfg, hp));
    }
    expect(bandFor(cfg, 100)).toBe("Confident");
    expect(bandFor(cfg, 55)).toBe("Cautious");
    expect(bandFor(cfg, 30)).toBe("Defensive");
    expect(bandFor(cfg, 10)).toBe("Survival");
  });
});
