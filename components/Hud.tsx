"use client";

import type { Game } from "@/engine/game";

export default function Hud({ game }: { game: Game }) {
  const cfg = game.cfg;
  const ghf = game.ghf;
  const min = Math.floor(Math.max(0, game.timeLeft) / 60);
  const sec = Math.floor(Math.max(0, game.timeLeft) % 60);

  return (
    <div className="pixel-panel" style={{ marginBottom: 10 }}>
      <div className="hud-grid">
        <div>
          <div className="hud-label">
            HP {Math.ceil(game.hp)}/{cfg.resources.hp_max}
          </div>
          <div className="bar hp">
            <i style={{ width: `${(game.hp / cfg.resources.hp_max) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="hud-label">
            Energy {Math.ceil(game.energy)}/{cfg.resources.energy_max}
          </div>
          <div className="bar energy">
            <i style={{ width: `${(game.energy / cfg.resources.energy_max) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="hud-label">
            Time {min}:{sec.toString().padStart(2, "0")}
          </div>
          <div className="bar time">
            <i style={{ width: `${(game.timeLeft / cfg.modes[game.mode].time_limit) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="stat-chips">
        <span className={`chip band-${game.band}`}>
          BAND <b>{game.band}</b>
        </span>
        <span className="chip">
          PLAN <b>{game.plan === "avoid" ? "AVOID" : "ENGAGE"}</b>
        </span>
        <span className="chip">
          g <b>{ghf.g.toFixed(0)}</b> h <b>{ghf.h}</b> f <b>{ghf.f.toFixed(0)}</b>
        </span>
        <span className="chip">
          acc p <b>{(game.p * 100).toFixed(0)}%</b>
        </span>
        <span className="chip">
          ALGO <b>{game.algo.toUpperCase()}</b>
        </span>
        <span className="chip">
          GOAL <b>{game.map.goalName}</b>
        </span>
        <span className="chip">
          fights <b>{game.fights}</b> · retreats <b>{game.retreats}</b> · replans <b>{game.replans}</b>
        </span>
      </div>
    </div>
  );
}
