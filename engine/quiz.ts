// Question bank: tagged, no-repeat (used-id set), shuffled choices — §VII.

import { shuffled, type Rng } from "./rng";
import type { EncounterSet, Question } from "./types";

export class QuestionBank {
  private byDifficulty: Record<string, Question[]> = {};
  private used = new Set<string>();

  constructor(questions: Question[], private rng: Rng) {
    for (const q of questions) {
      (this.byDifficulty[q.difficulty] ??= []).push(q);
    }
  }

  /** Draw a not-yet-used question of the difficulty; recycle pool when exhausted. */
  draw(difficulty: "easy" | "medium" | "hard"): Question {
    let pool = (this.byDifficulty[difficulty] ?? []).filter(
      (q) => !this.used.has(q.id)
    );
    if (!pool.length) {
      // difficulty exhausted: spill into any unused question
      pool = Object.values(this.byDifficulty)
        .flat()
        .filter((q) => !this.used.has(q.id));
    }
    if (!pool.length) {
      // everything used: recycle this difficulty
      for (const q of this.byDifficulty[difficulty] ?? []) this.used.delete(q.id);
      pool = this.byDifficulty[difficulty] ?? Object.values(this.byDifficulty).flat();
    }
    const q = pool[Math.floor(this.rng() * pool.length)];
    this.used.add(q.id);
    return q;
  }

  /** Shuffle choices; return the shuffled list and the new correct index. */
  shuffleChoices(q: Question): { choices: string[]; correctIndex: number } {
    const correct = q.choices[0];
    const choices = shuffled(this.rng, q.choices);
    return { choices, correctIndex: choices.indexOf(correct) };
  }

  get usedCount() {
    return this.used.size;
  }
}

export function tierDifficulty(tier: "slime" | "goblin" | "wraith") {
  return tier === "slime" ? "easy" : tier === "goblin" ? "medium" : "hard";
}

/**
 * Sequential encounter sets for multi-hit mobs (§VII). A Goblin/Ghost fight
 * draws ONE set and asks its rounds in order, one per hit — keeping the two/three
 * questions thematically coherent rather than random per hit. No-repeat until the
 * difficulty pool is exhausted, then the used set is recycled.
 */
export class EncounterDeck {
  private byDifficulty: Record<string, EncounterSet[]> = {};
  private used = new Set<string>();

  constructor(sets: EncounterSet[], private rng: Rng) {
    for (const s of sets) (this.byDifficulty[s.difficulty] ??= []).push(s);
  }

  has(difficulty: "medium" | "hard"): boolean {
    return (this.byDifficulty[difficulty]?.length ?? 0) > 0;
  }

  draw(difficulty: "medium" | "hard"): EncounterSet | null {
    const all = this.byDifficulty[difficulty] ?? [];
    if (!all.length) return null;
    let pool = all.filter((s) => !this.used.has(s.id));
    if (!pool.length) {
      for (const s of all) this.used.delete(s.id);
      pool = all;
    }
    const set = pool[Math.floor(this.rng() * pool.length)];
    this.used.add(set.id);
    return set;
  }
}
