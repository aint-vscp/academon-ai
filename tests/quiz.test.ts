import { describe, expect, it } from "vitest";
import { QuestionBank, tierDifficulty } from "../engine/quiz";
import { mulberry32 } from "../engine/rng";
import type { Question } from "../engine/types";

const mk = (id: string, difficulty: Question["difficulty"]): Question => ({
  id,
  subject: "Test",
  difficulty,
  q: `Q ${id}?`,
  choices: ["correct", "wrong1", "wrong2", "wrong3"],
  explain: "because",
});

describe("question bank", () => {
  it("never repeats a question until the pool is exhausted", () => {
    const qs = Array.from({ length: 10 }, (_, i) => mk(`e${i}`, "easy"));
    const bank = new QuestionBank(qs, mulberry32(1));
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const q = bank.draw("easy");
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
    }
  });

  it("recycles after exhaustion instead of crashing", () => {
    const qs = [mk("a", "easy"), mk("b", "easy")];
    const bank = new QuestionBank(qs, mulberry32(2));
    for (let i = 0; i < 6; i++) expect(bank.draw("easy")).toBeTruthy();
  });

  it("spills to other difficulties when one is empty", () => {
    const qs = [mk("a", "easy")];
    const bank = new QuestionBank(qs, mulberry32(3));
    expect(bank.draw("hard").id).toBe("a");
  });

  it("shuffles choices and tracks the correct index", () => {
    const qs = [mk("a", "easy")];
    const bank = new QuestionBank(qs, mulberry32(7));
    const q = bank.draw("easy");
    let movedAtLeastOnce = false;
    for (let i = 0; i < 12; i++) {
      const { choices, correctIndex } = bank.shuffleChoices(q);
      expect(choices[correctIndex]).toBe("correct");
      expect(choices).toHaveLength(4);
      if (correctIndex !== 0) movedAtLeastOnce = true;
    }
    expect(movedAtLeastOnce).toBe(true); // answers are not always slot 1
  });

  it("maps tiers to difficulties", () => {
    expect(tierDifficulty("slime")).toBe("easy");
    expect(tierDifficulty("goblin")).toBe("medium");
    expect(tierDifficulty("wraith")).toBe("hard");
  });
});
