// `npm run eval` — §XII batch evaluation. 30 paired-seed runs per condition,
// naive vs adaptive, across bot profiles the agent did not assume.
// Writes eval-results.json + eval-results.csv and prints the summary table.

import fs from "node:fs";
import path from "node:path";
import { batch } from "../engine/sim";
import type { BotProfile, Config, Question } from "../engine/types";

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/config.json"), "utf8")
) as Config;
const banks = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/questions.json"), "utf8")
) as Record<string, Question[]>;

const RUNS = Number(process.env.RUNS ?? 30);
const PROFILES: BotProfile[] = ["fixed50", "fixed70", "fixed90", "fatigue", "subject_skew"];
const seeds = Array.from({ length: RUNS }, (_, i) => 4242 + i * 101);

const rows: ReturnType<typeof batch>[] = [];
for (const profile of PROFILES) {
  for (const agent of ["naive", "adaptive"] as const) {
    const r = batch(cfg, banks["cs-review"], "class", agent, profile, seeds);
    rows.push(r);
    console.log(
      `${profile.padEnd(13)} ${agent.padEnd(9)} survival ${(r.survival * 100)
        .toFixed(0)
        .padStart(3)}%  hp ${r.avgHp.toFixed(0).padStart(3)}  energy ${r.avgEnergy
        .toFixed(0)
        .padStart(3)}  time ${r.avgTimeLeft.toFixed(0).padStart(3)}s  fights ${r.avgFights.toFixed(
        1
      )}  replans ${r.avgReplans.toFixed(1)}`
    );
  }
}

fs.writeFileSync(
  "eval-results.json",
  JSON.stringify(
    rows.map(({ results, ...summary }) => ({ ...summary })),
    null,
    2
  )
);

const csv = [
  "profile,agent,runs,survival,avg_hp,avg_energy,avg_time_left,avg_fights,avg_replans",
  ...rows.map(
    (r) =>
      `${r.profile},${r.agent},${r.runs},${r.survival.toFixed(3)},${r.avgHp.toFixed(1)},${r.avgEnergy.toFixed(
        1
      )},${r.avgTimeLeft.toFixed(1)},${r.avgFights.toFixed(2)},${r.avgReplans.toFixed(2)}`
  ),
].join("\n");
fs.writeFileSync("eval-results.csv", csv);

console.log(`\nWrote eval-results.json and eval-results.csv (${RUNS} paired seeds per condition).`);
console.log("Disclosure: batch results use simulated answer profiles; booth/human results reported separately.");
