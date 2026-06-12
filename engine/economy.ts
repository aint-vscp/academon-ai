// The EP (Energy Point) cost currency — §IV of the mechanics doc.
// Every exchange rate is DERIVED from the starting budgets, not hand-picked.

import type { Config, MobTier } from "./types";

/** Time → EP: ratio of starting budgets. κ_t = E_max / T_limit. */
export function kappaT(cfg: Config, timeLimit: number): number {
  return cfg.resources.energy_max / timeLimit;
}

/**
 * HP loss → EP, scarcity-scaled: V_HP(Δ) = (Δ / HP_now) × 100.
 * Losing 20 HP at 40 HP costs 50 EP — half your remaining survival budget.
 */
export function vHP(deltaHp: number, hpNow: number): number {
  if (hpNow <= 0) return Number.POSITIVE_INFINITY;
  return (deltaHp / hpNow) * 100;
}

/**
 * One battle round in EP: attack energy + expected answer time (half the
 * timer — the cap would overprice fights vs steps).
 */
export function cRound(cfg: Config, timeLimit: number): number {
  return (
    cfg.costs.attack_energy +
    (cfg.mapgen.question_timer_sec / 2) * kappaT(cfg, timeLimit)
  );
}

/**
 * Expected cost of fighting a mob of the given tier (in EP).
 * E[fight] = hits × C_round + misses_expected × V_HP(hit)
 * misses_expected = hits × (1−p)/p (geometric approximation, p clamped ≥ 0.2).
 */
export function eFight(
  cfg: Config,
  tier: MobTier,
  p: number,
  hpNow: number,
  timeLimit: number
): number {
  const hits = cfg.mobs[tier].hits;
  const hpLoss = cfg.mobs[tier].hp_loss;
  const pc = Math.min(0.99, Math.max(0.2, p));
  const missesExpected = (hits * (1 - pc)) / pc;
  return hits * cRound(cfg, timeLimit) + missesExpected * vHP(hpLoss, hpNow);
}

/** Expected cost of retreating: lost retreat time + detour extra path cost. */
export function eRetreat(cfg: Config, detourDelta: number, timeLimit: number): number {
  return cfg.costs.retreat_time * kappaT(cfg, timeLimit) + detourDelta;
}

/** Laplace-smoothed running accuracy. p = (correct + prior×k) / (answered + k). */
export function accuracy(
  correct: number,
  answered: number,
  prior: number,
  strength: number
): number {
  return (correct + prior * strength) / (answered + strength);
}

export type Band = "Confident" | "Cautious" | "Defensive" | "Survival";

export function bandFor(cfg: Config, hp: number): Band {
  const pct = (hp / cfg.resources.hp_max) * 100;
  for (const [min, name] of cfg.agent.bands) {
    if (pct >= min) return name as Band;
  }
  return "Survival";
}
