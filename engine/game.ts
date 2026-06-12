// Game state machine — autopilot hero, FIGHT/RETREAT-only player control (§III),
// event-driven replanning (§IX), EP-priced decisions (§IV–VI).

import { accuracy, bandFor, eFight, eRetreat, kappaT, type Band } from "./economy";
import { itemAt, manhattan, mobAt, sameVec, terrainAt } from "./grid";
import { generateMap } from "./mapgen";
import { QuestionBank, tierDifficulty } from "./quiz";
import { mulberry32, type Rng } from "./rng";
import {
  bestItemDetour,
  pathEnergy,
  planRoute,
  search,
  terrainEnergy,
  type CostContext,
  type FeasibilityInput,
  type SearchResult,
} from "./search";
import type {
  AgentKind,
  BattleState,
  Config,
  FailReason,
  GameEvent,
  GameMode,
  MapData,
  Mob,
  Phase,
  Question,
  StatSample,
  Vec,
} from "./types";

export interface GameOptions {
  mode: GameMode;
  seed: number;
  algo?: "astar" | "greedy";
  agentKind?: AgentKind;
  /** Previous run's goal quadrant — anti-repeat rule (§II check 2). */
  avoidQuadrant?: number;
}

export class Game {
  cfg: Config;
  mode: GameMode;
  map: MapData;
  rng: Rng;
  algo: "astar" | "greedy";
  agentKind: AgentKind;

  phase: Phase = "idle";
  failReason: FailReason = null;
  hp: number;
  energy: number;
  timeLeft: number;
  elapsed = 0;

  pos: Vec;
  /** 0..1 tween progress toward route[routeIdx+1]. */
  moveProgress = 0;
  route: Vec[] = [];
  routeIdx = 0;
  plan: "avoid" | "engage" = "avoid";
  ghost: Vec[] = [];
  explored: Vec[] = [];
  exploredFlashUntil = 0;

  battle: BattleState | null = null;
  private bank: QuestionBank;

  answered = 0;
  correct = 0;
  wrong = 0;
  streak = 0;
  streakBonus = 0;
  fights = 0;
  retreats = 0;
  replans = 0;
  steps = 0;
  followed = 0;
  defied = 0;

  band: Band;
  events: GameEvent[] = [];
  samples: StatSample[] = [];
  private lastToastAt = -999;
  private lastToastMsg = "";
  private pendingReplanFlag = false;
  private detourItemId: number | null = null;

  constructor(cfg: Config, questions: Question[], opts: GameOptions) {
    this.cfg = cfg;
    this.mode = opts.mode;
    this.algo = opts.algo ?? "astar";
    this.agentKind = opts.agentKind ?? "adaptive";
    this.rng = mulberry32(opts.seed ^ 0x9e3779b9);
    this.map = generateMap(cfg, opts.seed, opts.mode, opts.avoidQuadrant ?? -1);
    this.bank = new QuestionBank(questions, this.rng);
    this.hp = cfg.resources.hp_max;
    this.energy = cfg.resources.energy_max;
    this.timeLeft = cfg.modes[opts.mode].time_limit;
    this.pos = { ...this.map.spawn };
    this.band = bandFor(cfg, this.hp);
  }

  // ---------- derived ----------

  get timeLimit() {
    return this.cfg.modes[this.mode].time_limit;
  }

  get p(): number {
    const k =
      this.mode === "exhibit"
        ? this.cfg.agent.prior_strength_exhibit
        : this.cfg.agent.prior_strength_class;
    return accuracy(this.correct, this.answered, this.cfg.agent.accuracy_prior, k);
  }

  get questionTimer(): number {
    if (!this.battle) return 0;
    return Math.max(
      0,
      this.cfg.mapgen.question_timer_sec - (this.elapsed - this.battle.questionStartedAt)
    );
  }

  private ctx(): Omit<CostContext, "excludeMobs"> {
    const deterministic = this.cfg.modes[this.mode].deterministic;
    return {
      cfg: this.cfg,
      map: this.map,
      p: this.p,
      hpNow: this.hp,
      timeLimit: this.timeLimit,
      naive: this.agentKind === "naive",
      ambushChance: deterministic ? 0 : this.cfg.mapgen.grass_encounter_chance,
      stepTimeEP: (this.cfg.ui.tween_ms / 1000) * kappaT(this.cfg, this.timeLimit),
    };
  }

  private fi(): FeasibilityInput {
    return {
      energy: this.energy,
      timeLeftSec: this.timeLeft,
      margin: this.cfg.agent.feasibility_margin,
      secPerStep: this.cfg.ui.tween_ms / 1000,
      questionSec: this.cfg.mapgen.question_timer_sec,
    };
  }

  /** Remaining route from the hero's tile. */
  get remainingRoute(): Vec[] {
    return this.route.slice(this.routeIdx);
  }

  /** Spent / projected EP shown on the HUD as g, h, f. */
  get ghf(): { g: number; h: number; f: number } {
    const g =
      this.cfg.resources.energy_max - this.energy; // energy actually spent so far
    const h = manhattan(this.pos, this.map.goal);
    return { g, h, f: g + h };
  }

  // ---------- lifecycle ----------

  start() {
    if (this.phase !== "idle") return;
    this.phase = "running";
    this.replan("Route computed — heading to " + this.map.goalName, true);
  }

  /** Advance the simulation by dt seconds. */
  tick(dt: number) {
    if (this.phase !== "running" && this.phase !== "battle") return;
    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      return this.gameOver("OUT OF TIME");
    }

    if (this.phase === "battle") {
      if (this.battle && this.questionTimer <= 0) {
        this.events.push({ t: this.elapsed, kind: "answer", msg: "Timeout — counted wrong" });
        this.resolveAnswer(false, true);
      }
      return;
    }

    // movement along the route
    if (this.routeIdx >= this.route.length - 1) return; // at end (shouldn't linger)
    this.moveProgress += (dt * 1000) / this.cfg.ui.tween_ms;
    while (this.moveProgress >= 1 && (this.phase as Phase) === "running") {
      this.moveProgress -= 1;
      const next = this.route[this.routeIdx + 1];
      if (!next) break;

      const mob = mobAt(this.map, next.x, next.y);
      if (mob) {
        this.moveProgress = 0;
        this.startBattle(mob, false);
        return;
      }
      this.enterTile(next);
      if ((this.phase as Phase) !== "running") return;
    }
  }

  private enterTile(next: Vec) {
    this.routeIdx++;
    this.pos = { ...next };
    this.steps++;
    const t = terrainAt(this.map, next.x, next.y);
    this.energy -= terrainEnergy(this.cfg, t);
    this.sample(this.pendingReplanFlag);
    this.pendingReplanFlag = false;
    if (this.energy <= 0) {
      this.energy = 0;
      return this.gameOver("OUT OF ENERGY");
    }

    // pickup
    const item = itemAt(this.map, next.x, next.y);
    if (item) {
      item.taken = true;
      if (item.kind === "medkit") {
        this.hp = Math.min(this.cfg.resources.hp_max, this.hp + this.cfg.items.med_kit);
        this.toast(`Med Kit +${this.cfg.items.med_kit} HP`);
      } else if (item.kind === "energydrink") {
        this.energy = Math.min(
          this.cfg.resources.energy_max,
          this.energy + this.cfg.items.energy_drink
        );
        this.toast(`Energy Drink +${this.cfg.items.energy_drink} energy`);
      } else {
        this.timeLeft += this.cfg.items.time_charm;
        this.toast(`Time Charm +${this.cfg.items.time_charm}s`);
      }
      this.events.push({ t: this.elapsed, kind: "pickup", msg: item.kind });
      if (this.detourItemId === item.id) this.detourItemId = null;
      this.replan("Pickup consumed — recomputing route"); // §IX trigger 6
      if ((this.phase as Phase) !== "running") return;
    }

    // goal?
    if (sameVec(next, this.map.goal)) return this.win();

    // grass ambush (non-deterministic modes) — §II/§VII
    const deterministic = this.cfg.modes[this.mode].deterministic;
    if (
      !deterministic &&
      t === "grass" &&
      this.rng() < this.cfg.mapgen.grass_encounter_chance
    ) {
      const ambushMob: Mob = {
        id: -1,
        tier: "slime",
        pos: { ...next },
        hitsLeft: this.cfg.mobs.slime.hits,
        defeated: false,
        retreatedFrom: false,
        gatekeeper: false,
      };
      this.startBattle(ambushMob, true);
      return;
    }

    this.checkFeasibility(); // §IX triggers 3 & 4
    this.checkBand(); // §IX trigger 2
  }

  // ---------- planning ----------

  replan(reasonMsg: string, silent = false) {
    const outcome = planRoute(this.ctx(), this.pos, this.map.goal, this.fi(), this.algo);
    if (!outcome.result.found) {
      return this.gameOver("NO PATH AVAILABLE");
    }
    this.route = outcome.result.path;
    this.routeIdx = 0;
    this.moveProgress = 0;
    this.plan = outcome.plan;
    this.explored = outcome.result.explored;
    this.exploredFlashUntil = this.elapsed + 1;
    this.replans++;
    this.pendingReplanFlag = true;
    this.events.push({ t: this.elapsed, kind: "replan", msg: reasonMsg });
    if (!silent) this.toast(reasonMsg);

    // ghost path: what a risk-blind shortest-path bot would do
    const ghostCtx = { ...this.ctx(), naive: true as const };
    const ghost = search({ ...ghostCtx, excludeMobs: false }, this.pos, this.map.goal, "astar");
    this.ghost = ghost.found ? ghost.path : [];
  }

  /** §IX triggers 3 & 4 — energy/time feasibility with the 1.2× margin. */
  private checkFeasibility() {
    const fi = this.fi();
    const remaining = this.remainingRoute;
    if (remaining.length < 2) return;
    const margin = this.cfg.agent.feasibility_margin;

    const energyNeed = pathEnergy(this.cfg, this.map, remaining);
    if (energyNeed * margin > this.energy && this.detourItemId === null) {
      const detour = bestItemDetour(this.ctx(), this.pos, this.map.goal, ["energydrink"], (k) =>
        k === "energydrink" ? this.cfg.items.energy_drink : 0
      );
      if (detour) {
        this.detourItemId = detour.itemId;
        this.route = detour.path;
        this.routeIdx = 0;
        this.moveProgress = 0;
        this.replans++;
        this.pendingReplanFlag = true;
        this.events.push({ t: this.elapsed, kind: "replan", msg: "energy detour" });
        this.toast("⚠ Energy low — detouring to Energy Drink");
        return;
      }
      this.toast("⚠ Energy critical — taking cheapest route");
      this.replan("Energy feasibility replan", true);
      return;
    }

    const secPerStep = this.cfg.ui.tween_ms / 1000;
    const timeNeed = (remaining.length - 1) * secPerStep;
    if (timeNeed * margin > this.timeLeft) {
      this.toast("⚠ Time is tight — fastest route, skip optional fights");
      this.replan("Time feasibility replan", true);
    }
  }

  /** §IX trigger 2 — band crossing with hysteresis. */
  private lastBandHp: number | null = null;
  private checkBand() {
    const nb = bandFor(this.cfg, this.hp);
    if (nb !== this.band) {
      const hys = this.cfg.agent.hysteresis_hp;
      if (this.lastBandHp === null || Math.abs(this.hp - this.lastBandHp) >= hys) {
        this.band = nb;
        this.lastBandHp = this.hp;
        this.events.push({ t: this.elapsed, kind: "band", msg: nb });
        if (nb === "Survival" || nb === "Defensive") {
          // survival instinct: try a med kit detour
          const detour = bestItemDetour(this.ctx(), this.pos, this.map.goal, ["medkit"], (k) =>
            k === "medkit" ? this.cfg.items.med_kit * 1.5 : 0
          );
          if (detour) {
            this.route = detour.path;
            this.routeIdx = 0;
            this.moveProgress = 0;
            this.replans++;
            this.pendingReplanFlag = true;
            this.toast(`⚠ HP ${nb} — routing via Med Kit`);
            return;
          }
        }
        this.replan(`Risk band → ${nb} — repricing routes`);
      }
    }
  }

  // ---------- battle ----------

  private startBattle(mob: Mob, ambush: boolean) {
    this.fights++;
    const q = this.bank.draw(tierDifficulty(mob.tier));
    const { choices, correctIndex } = this.bank.shuffleChoices(q);

    // E[fight] vs E[retreat] — §VI
    const fight = eFight(this.cfg, mob.tier, this.p, this.hp, this.timeLimit);
    let retreat: number;
    let unavoidable = false;
    if (ambush) {
      // retreating from an ambush doesn't remove the hazard: expected
      // re-ambushes on the remaining grass stretch are priced in
      const grassLeft = this.remainingRoute.filter(
        (v) => terrainAt(this.map, v.x, v.y) === "grass"
      ).length;
      const chance = this.cfg.modes[this.mode].deterministic
        ? 0
        : this.cfg.mapgen.grass_encounter_chance;
      retreat = eRetreat(this.cfg, grassLeft * chance * fight, this.timeLimit);
    } else {
      // detour = best route around this mob (and all others)
      const saveFlag = mob.retreatedFrom;
      mob.retreatedFrom = true;
      const around = search({ ...this.ctx(), excludeMobs: false }, this.pos, this.map.goal);
      mob.retreatedFrom = saveFlag;
      if (around.found) {
        const current = search({ ...this.ctx(), excludeMobs: false }, this.pos, this.map.goal);
        retreat = eRetreat(this.cfg, Math.max(0, around.cost - current.cost), this.timeLimit);
      } else {
        retreat = Number.POSITIVE_INFINITY;
        unavoidable = true;
      }
    }

    const recommendation = fight <= retreat ? "FIGHT" : "RETREAT";
    const reason = unavoidable
      ? "This battle is unavoidable — retreating only spends time."
      : recommendation === "FIGHT"
        ? `est. accuracy ${(this.p * 100).toFixed(0)}%, retreat detour costs ${retreat.toFixed(0)} EP`
        : `detour is cheaper (${retreat.toFixed(0)} EP) than expected fight (${fight.toFixed(0)} EP)`;

    this.battle = {
      mobId: mob.id,
      question: q,
      shuffledChoices: choices,
      correctIndex,
      eFight: fight,
      eRetreat: retreat,
      recommendation,
      reason,
      unavoidable,
      questionStartedAt: this.elapsed,
      ambush,
    };
    if (ambush) this.map.mobs.push(mob); // ambush mob lives on the map while fighting
    this.phase = "battle";
    this.events.push({
      t: this.elapsed,
      kind: "encounter",
      msg: `${mob.tier}${mob.gatekeeper ? " (gatekeeper)" : ""}${ambush ? " (ambush)" : ""}`,
    });
  }

  /** Player (or bot) picks a choice index. */
  answer(i: number) {
    if (!this.battle) return;
    const correct = i === this.battle.correctIndex;
    this.resolveAnswer(correct, false);
  }

  private resolveAnswer(correct: boolean, timeout: boolean) {
    if (!this.battle) return;
    const mob = this.map.mobs.find((m) => m.id === this.battle!.mobId);
    if (!mob) {
      this.battle = null;
      this.phase = "running";
      return;
    }

    // every answer costs attack energy — §III
    this.energy -= this.cfg.costs.attack_energy;
    this.answered++;

    if (correct) {
      this.correct++;
      this.streak++;
      if (this.streak > 0 && this.streak % this.cfg.scoring.streak_len === 0) {
        this.streakBonus += this.cfg.scoring.streak_bonus;
        this.toast(`Combo! +${this.cfg.scoring.streak_bonus} score`);
      }
      mob.hitsLeft--;
      this.events.push({ t: this.elapsed, kind: "answer", msg: "correct" });
      if (mob.hitsLeft <= 0) {
        mob.defeated = true; // blockage removed — NO stat reward (§VII)
        this.events.push({ t: this.elapsed, kind: "defeat", msg: mob.tier });
        this.battle = null;
        this.phase = "running";
        if (this.energy <= 0) {
          this.energy = 0;
          return this.gameOver("OUT OF ENERGY");
        }
        this.toast(`${tierLabel(mob.tier)} defeated — path unblocked`);
        this.replan("Mob defeated — recomputing route", true); // §IX trigger 6
        return;
      }
      // next round vs multi-hit mob
      const q = this.bank.draw(tierDifficulty(mob.tier));
      const { choices, correctIndex } = this.bank.shuffleChoices(q);
      this.battle = {
        ...this.battle,
        question: q,
        shuffledChoices: choices,
        correctIndex,
        questionStartedAt: this.elapsed,
      };
    } else {
      this.wrong++;
      this.streak = 0;
      this.hp -= this.cfg.mobs[mob.tier].hp_loss;
      this.events.push({
        t: this.elapsed,
        kind: "answer",
        msg: timeout ? "timeout" : "wrong",
      });
      if (this.hp <= 0) {
        this.hp = 0;
        return this.gameOver("OUT OF HP");
      }
      if (this.energy <= 0) {
        this.energy = 0;
        return this.gameOver("OUT OF ENERGY");
      }
      // mob persists; fresh question; player can retreat — §VII
      const q = this.bank.draw(tierDifficulty(mob.tier));
      const { choices, correctIndex } = this.bank.shuffleChoices(q);
      const fight = eFight(this.cfg, mob.tier, this.p, this.hp, this.timeLimit);
      this.battle = {
        ...this.battle,
        question: q,
        shuffledChoices: choices,
        correctIndex,
        eFight: fight,
        recommendation: fight <= this.battle.eRetreat ? "FIGHT" : "RETREAT",
        questionStartedAt: this.elapsed,
      };
      this.checkBand();
    }
  }

  retreat() {
    if (!this.battle) return;
    const mob = this.map.mobs.find((m) => m.id === this.battle!.mobId);
    this.timeLeft -= this.cfg.costs.retreat_time;
    this.retreats++;
    this.events.push({ t: this.elapsed, kind: "retreat", msg: mob?.tier ?? "ambush" });
    if (this.battle.recommendation === "RETREAT") this.followed++;
    else this.defied++;
    if (mob) {
      if (this.battle.ambush) {
        this.map.mobs = this.map.mobs.filter((m) => m.id !== mob.id);
      } else {
        mob.retreatedFrom = true; // tile stays blocked for routing — §VII
        // …unless that strands the hero: a retreated gatekeeper on the only
        // path stays engageable instead of forcing NO PATH game over.
        const check = search({ ...this.ctx(), excludeMobs: false }, this.pos, this.map.goal);
        if (!check.found) {
          mob.retreatedFrom = false;
          this.toast("No way around — it still blocks the only path!");
        }
      }
    }
    this.battle = null;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      return this.gameOver("OUT OF TIME");
    }
    this.phase = "running";
    this.replan("Retreated — rerouting around the mob"); // §IX trigger 6
  }

  fightChosen() {
    if (!this.battle) return;
    if (this.battle.recommendation === "FIGHT") this.followed++;
    else this.defied++;
  }

  // ---------- end states ----------

  private win() {
    this.phase = "won";
    this.events.push({ t: this.elapsed, kind: "win", msg: this.map.goalName });
    this.sample(false);
  }

  private gameOver(reason: Exclude<FailReason, null>) {
    this.phase = "lost";
    this.failReason = reason;
    this.events.push({ t: this.elapsed, kind: "gameover", msg: reason });
    this.sample(false);
  }

  get score(): number {
    const s = this.cfg.scoring;
    return Math.max(
      0,
      Math.round(
        (this.phase === "won" ? s.w_goal : 0) +
          s.w_correct * this.correct +
          s.w_time * this.timeLeft +
          s.w_energy * this.energy +
          s.w_hp * this.hp +
          this.streakBonus
      )
    );
  }

  get grade(): "S" | "A" | "B" | "C" | "F" {
    if (this.phase !== "won") return "F";
    const sc = this.score;
    if (sc >= 1500) return "S";
    if (sc >= 1300) return "A";
    if (sc >= 1100) return "B";
    return "C";
  }

  // ---------- misc ----------

  private toast(msg: string) {
    const cd = this.cfg.agent.toast_cooldown_sec;
    if (this.elapsed - this.lastToastAt < cd && msg === this.lastToastMsg) return;
    if (this.elapsed - this.lastToastAt < cd / 2) return; // rate limit
    this.lastToastAt = this.elapsed;
    this.lastToastMsg = msg;
    this.events.push({ t: this.elapsed, kind: "toast", msg });
  }

  private sample(replan: boolean) {
    this.samples.push({
      step: this.steps,
      hp: this.hp,
      energy: this.energy,
      timeLeft: this.timeLeft,
      replan,
    });
  }

  /** Latest toasts for the UI (kind=toast). */
  toasts(sinceT: number): GameEvent[] {
    return this.events.filter((e) => e.kind === "toast" && e.t > sinceT);
  }
}

export function tierLabel(tier: string): string {
  return tier === "slime" ? "Pop-Quiz Slime" : tier === "goblin" ? "Quiz Goblin" : "Essay Wraith";
}
