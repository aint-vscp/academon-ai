"use client";

// Canvas renderer: pixelated, centered-hero camera (§X.2).
// All art resolves through lib/sprites.ts (PNG drop-in contract).

import { useEffect, useRef } from "react";
import type { Game } from "@/engine/game";
import { terrainAt } from "@/engine/grid";
import { getSprite, type SpriteName } from "@/lib/sprites";

export const TILE = 32;
export const VIEW_W = 720;
export const VIEW_H = 460;

const terrainSprite: Record<string, SpriteName> = {
  path: "terrain_path",
  grass: "terrain_grass",
  mud: "terrain_mud",
  water: "terrain_water",
  wall: "terrain_wall",
  ledge: "terrain_ledge",
};

function heroPixel(game: Game): { x: number; y: number } {
  const cur = game.pos;
  const next = game.route[game.routeIdx + 1];
  let fx = cur.x;
  let fy = cur.y;
  if (game.phase === "running" && next) {
    fx = cur.x + (next.x - cur.x) * game.moveProgress;
    fy = cur.y + (next.y - cur.y) * game.moveProgress;
  }
  return { x: fx * TILE, y: fy * TILE };
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, showGhost: boolean) {
  const m = game.map;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#090b14";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // centered-hero camera, clamped at map edges
  const hp = heroPixel(game);
  const worldW = m.w * TILE;
  const worldH = m.h * TILE;
  const camX = Math.max(0, Math.min(worldW - VIEW_W, hp.x + TILE / 2 - VIEW_W / 2));
  const camY = Math.max(0, Math.min(worldH - VIEW_H, hp.y + TILE / 2 - VIEW_H / 2));
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // terrain
  const x0 = Math.floor(camX / TILE);
  const y0 = Math.floor(camY / TILE);
  const x1 = Math.min(m.w - 1, Math.ceil((camX + VIEW_W) / TILE));
  const y1 = Math.min(m.h - 1, Math.ceil((camY + VIEW_H) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = terrainAt(m, x, y);
      ctx.drawImage(getSprite(terrainSprite[t]), x * TILE, y * TILE, TILE, TILE);
    }
  }

  // explored-set flash (search visualization)
  if (game.elapsed < game.exploredFlashUntil) {
    ctx.fillStyle = "rgba(79,195,247,0.22)";
    for (const v of game.explored) {
      ctx.fillRect(v.x * TILE + 2, v.y * TILE + 2, TILE - 4, TILE - 4);
    }
  }

  // ghost path (naive shortest) — gray dashed
  if (showGhost && game.ghost.length > 1) {
    ctx.strokeStyle = "rgba(220,220,220,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    game.ghost.forEach((v, i) => {
      const px = v.x * TILE + TILE / 2;
      const py = v.y * TILE + TILE / 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // active route — orange (avoid plan) / red-orange (engage plan)
  const remaining = game.remainingRoute;
  if (remaining.length > 1) {
    ctx.strokeStyle = game.plan === "avoid" ? "#ff9800" : "#ff5722";
    ctx.lineWidth = 4;
    ctx.beginPath();
    remaining.forEach((v, i) => {
      const px = v.x * TILE + TILE / 2;
      const py = v.y * TILE + TILE / 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // goal building (+ name plate)
  ctx.drawImage(getSprite("goal_building"), m.goal.x * TILE - 4, m.goal.y * TILE - 8, TILE + 8, TILE + 8);
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54f";
  ctx.fillText("★ " + m.goalName, m.goal.x * TILE + TILE / 2, m.goal.y * TILE - 10);

  // items
  for (const it of m.items) {
    if (it.taken) continue;
    const s: SpriteName =
      it.kind === "medkit" ? "item_medkit" : it.kind === "energydrink" ? "item_energydrink" : "item_timecharm";
    ctx.drawImage(getSprite(s), it.pos.x * TILE + 4, it.pos.y * TILE + 4, TILE - 8, TILE - 8);
  }

  // mobs
  for (const mob of m.mobs) {
    if (mob.defeated) continue;
    const s: SpriteName =
      mob.tier === "slime" ? "mob_slime" : mob.tier === "goblin" ? "mob_goblin" : "mob_wraith";
    ctx.drawImage(getSprite(s), mob.pos.x * TILE + 2, mob.pos.y * TILE + 2, TILE - 4, TILE - 4);
    if (mob.gatekeeper) {
      ctx.fillStyle = "#ffd54f";
      ctx.fillText("!", mob.pos.x * TILE + TILE / 2, mob.pos.y * TILE);
    }
    if (mob.retreatedFrom) {
      ctx.fillStyle = "rgba(239,83,80,0.9)";
      ctx.fillText("✕", mob.pos.x * TILE + TILE / 2, mob.pos.y * TILE + 10);
    }
  }

  // hero (AcadéMon)
  ctx.drawImage(getSprite("hero"), hp.x + 2, hp.y - 4, TILE - 4, TILE + 2);

  ctx.restore();
}

export default function GameCanvas({
  gameRef,
  showGhostRef,
}: {
  gameRef: React.MutableRefObject<Game | null>;
  showGhostRef: React.MutableRefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cv = canvasRef.current;
      const game = gameRef.current;
      if (cv && game) {
        const ctx = cv.getContext("2d");
        if (ctx) drawGame(ctx, game, showGhostRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameRef, showGhostRef]);

  return <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />;
}
