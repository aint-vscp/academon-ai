// AcadéMon AI engine — pure TypeScript, zero DOM/React imports.
// Shared types for grid, mobs, items, game state and events.

export type Terrain =
  | "path"
  | "grass"
  | "mud"
  | "bush" // walkable thicket — highest soft-obstacle energy cost
  | "wall"
  | "water" // blocking pond (nature) / deep water (water theme)
  | "boulder" // blocking scatter rock
  | "ledge";

/** Visual theme per round; terrain semantics stay identical across themes. */
export type MapTheme = "nature" | "water" | "fire";

export type MobTier = "slime" | "goblin" | "wraith";

export interface Vec {
  x: number;
  y: number;
}

export interface Mob {
  id: number;
  tier: MobTier;
  pos: Vec;
  hitsLeft: number;
  defeated: boolean;
  /** Player retreated from it — permanently avoided for routing this run. */
  retreatedFrom: boolean;
  gatekeeper: boolean;
}

export type ItemKind = "medkit" | "energydrink" | "timecharm";

export interface Item {
  id: number;
  kind: ItemKind;
  pos: Vec;
  taken: boolean;
}

export interface MapData {
  w: number;
  h: number;
  terrain: Terrain[]; // index y*w+x
  spawn: Vec;
  goal: Vec;
  goalName: string;
  mobs: Mob[];
  items: Item[];
  seed: number;
}

export interface Question {
  id: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  q: string;
  choices: string[]; // first entry is the correct one in source data; engine shuffles
  explain: string;
}

/**
 * A coherent multi-round fight: a Goblin (2 rounds) or Ghost (3 rounds) asks the
 * rounds of ONE set sequentially, one per hit — §VII. `rounds[i]` is hit i+1.
 */
export interface EncounterSet {
  id: string;
  difficulty: "medium" | "hard";
  label: string; // e.g. "Physics & Math"
  rounds: Question[];
}

/** Structured question data: singles drawn by difficulty + sequential encounter sets. */
export interface QuestionData {
  questions: Question[];
  sets: EncounterSet[];
}

export type BotProfile =
  | "fixed50"
  | "fixed70"
  | "fixed90"
  | "fatigue"
  | "subject_skew";

export type AgentKind = "naive" | "adaptive";

export type Phase = "idle" | "running" | "battle" | "roundclear" | "won" | "lost";

export type FailReason =
  | "OUT OF HP"
  | "OUT OF ENERGY"
  | "OUT OF TIME"
  | "NO PATH AVAILABLE"
  | null;

export interface BattleState {
  mobId: number;
  /** Pokémon-style flow: "choice" = What will you do? (FIGHT/RUN); "question" = quiz round. */
  stage: "choice" | "question";
  question: Question;
  shuffledChoices: string[];
  correctIndex: number;
  /** 1-based round/hit number within this fight (Slime 1, Goblin 1–2, Ghost 1–3). */
  questionNo: number;
  /** Encounter-set theme label for multi-hit mobs (e.g. "Physics & Math"). */
  setLabel: string;
  /** EP analysis shown to the player. */
  eFight: number;
  eRetreat: number;
  recommendation: "FIGHT" | "RETREAT";
  reason: string;
  /** Was this fight unavoidable (no feasible mob-free plan)? */
  unavoidable: boolean;
  questionStartedAt: number; // elapsed game seconds when the question appeared
  ambush: boolean;
}

export interface GameEvent {
  t: number; // game time (s elapsed)
  kind:
    | "replan"
    | "encounter"
    | "answer"
    | "retreat"
    | "pickup"
    | "defeat"
    | "gameover"
    | "win"
    | "toast"
    | "band";
  msg: string;
}

export interface StatSample {
  step: number;
  hp: number;
  energy: number;
  timeLeft: number;
  replan: boolean;
}

export interface RunResult {
  won: boolean;
  failReason: FailReason;
  roundsCleared: number;
  steps: number;
  fights: number;
  correct: number;
  wrong: number;
  retreats: number;
  hp: number;
  energy: number;
  timeLeft: number;
  score: number;
  replans: number;
  seed: number;
}

export interface ModeConfig {
  time_limit: number;
  deterministic: boolean;
  bank: string;
}

export interface Config {
  resources: { hp_max: number; energy_max: number; time_limit: number };
  modes: { class: ModeConfig; exhibit: ModeConfig };
  costs: {
    path: number;
    grass: number;
    mud: number;
    bush: number;
    move_energy: number;
    attack_energy: number;
    round_time: number;
    retreat_time: number;
  };
  mobs: Record<MobTier, { hits: number; hp_loss: number }>;
  items: { med_kit: number; energy_drink: number; time_charm: number };
  agent: {
    avoidance_first: boolean;
    avoidance_bias?: number;
    feasibility_margin: number;
    accuracy_prior: number;
    prior_strength_class: number;
    prior_strength_exhibit: number;
    bands: [number, string][];
    hysteresis_hp: number;
    toast_cooldown_sec: number;
  };
  ui: { camera: string; tween_ms: number };
  session: { rounds: number };
  mapgen: {
    spawn: string;
    min_goal_dist_pct: number;
    anti_repeat_quadrant: boolean;
    gatekeepers: string;
    fights: { class: [number, number]; exhibit: [number, number] };
    optional_mobs: number;
    grid: [number, number];
    grass_encounter_chance: number;
    question_timer_sec: number;
  };
  scoring: {
    w_goal: number;
    w_round: number;
    w_correct: number;
    w_time: number;
    w_energy: number;
    w_hp: number;
    streak_len: number;
    streak_bonus: number;
  };
}

export type GameMode = "class" | "exhibit";
