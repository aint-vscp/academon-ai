"use client";

// Canvas renderer: pixelated, centered-hero camera (§X.2).
// All art resolves through lib/sprites.ts (PNG drop-in contract).

import { useEffect, useRef } from "react";
import type { Game } from "@/engine/game";
import { getHeroVariant, getMobSprite, getSprite, type SpriteName } from "@/lib/sprites";
import { drawTerrainTile, preloadTiles } from "@/lib/tiles";
import { getHeroFrame, preloadHeroFrames, type Facing } from "@/lib/heroFrames";

export const TILE = 32;

/** Last facing per game instance so the hero keeps orientation when idle. */
const lastFacing = new WeakMap<Game, Facing>();

/** Aspect-preserving drawImage into a box (high-res PNGs aren't square). */
function drawFit(
  ctx: CanvasRenderingContext2D,
  spr: HTMLCanvasElement | HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: "center" | "bottom"
) {
  const sw = spr.width || 16;
  const sh = spr.height || 16;
  const k = Math.min(w / sw, h / sh);
  const dw = sw * k;
  const dh = sh * k;
  const dx = x + (w - dw) / 2;
  const dy = anchor === "bottom" ? y + h - dh : y + (h - dh) / 2;
  ctx.drawImage(spr, dx, dy, dw, dh);
}

function heroPixel(game: Game): {
  x: number;
  y: number;
  dx: number;
  dy: number;
  walking: boolean;
} {
  const cur = game.pos;
  const next = game.route[game.routeIdx + 1];
  let fx = cur.x;
  let fy = cur.y;
  let dx = 0;
  let dy = 0;
  let walking = false;
  if (game.phase === "running" && next) {
    fx = cur.x + (next.x - cur.x) * game.moveProgress;
    fy = cur.y + (next.y - cur.y) * game.moveProgress;
    dx = next.x - cur.x;
    dy = next.y - cur.y;
    walking = true;
  }
  return { x: fx * TILE, y: fy * TILE, dx, dy, walking };
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, showGhost: boolean) {
  const m = game.map;
  const VIEW_W = ctx.canvas.width;
  const VIEW_H = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#090b14";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // centered-hero camera, clamped at map edges (centers small maps)
  const hp = heroPixel(game);
  const worldW = m.w * TILE;
  const worldH = m.h * TILE;
  const camX =
    worldW <= VIEW_W
      ? (worldW - VIEW_W) / 2
      : Math.max(0, Math.min(worldW - VIEW_W, hp.x + TILE / 2 - VIEW_W / 2));
  const camY =
    worldH <= VIEW_H
      ? (worldH - VIEW_H) / 2
      : Math.max(0, Math.min(worldH - VIEW_H, hp.y + TILE / 2 - VIEW_H / 2));
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // terrain — themed PNG tilesets (L1 Nature / L2 Water) with path autotiling
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(m.w - 1, Math.ceil((camX + VIEW_W) / TILE));
  const y1 = Math.min(m.h - 1, Math.ceil((camY + VIEW_H) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      drawTerrainTile(ctx, m, game.theme, x, y, x * TILE, y * TILE, TILE);
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
    drawFit(ctx, getSprite(s), it.pos.x * TILE + 4, it.pos.y * TILE + 4, TILE - 8, TILE - 8, "center");
  }

  // mobs
  for (const mob of m.mobs) {
    if (mob.defeated) continue;
    drawFit(ctx, getMobSprite(mob.tier, game.theme), mob.pos.x * TILE + 2, mob.pos.y * TILE + 2, TILE - 4, TILE - 4, "bottom");
    if (mob.gatekeeper) {
      ctx.fillStyle = "#ffd54f";
      ctx.fillText("!", mob.pos.x * TILE + TILE / 2, mob.pos.y * TILE);
    }
    if (mob.retreatedFrom) {
      ctx.fillStyle = "rgba(239,83,80,0.9)";
      ctx.fillText("✕", mob.pos.x * TILE + TILE / 2, mob.pos.y * TILE + 10);
    }
  }

  // hero (Isko / Iska) — 4-direction walk cycle from the frame registry
  let facing = lastFacing.get(game) ?? "front";
  if (hp.walking) {
    facing = hp.dy < 0 ? "back" : hp.dy > 0 ? "front" : hp.dx < 0 ? "left" : "right";
    lastFacing.set(game, facing);
  }
  const stepPhase = game.steps + game.moveProgress;
  const frame = getHeroFrame(getHeroVariant(), facing, hp.walking, stepPhase);
  const natW = "naturalWidth" in frame ? frame.naturalWidth || 16 : frame.width;
  const natH = "naturalHeight" in frame ? frame.naturalHeight || 16 : frame.height;
  const drawH = TILE * 1.4;
  const drawW = Math.min(TILE * 1.15, (drawH * natW) / natH);
  const bob = hp.walking ? Math.abs(Math.sin(stepPhase * Math.PI)) * 2 : 0;
  const cxp = hp.x + TILE / 2;
  const footY = hp.y + TILE - 2;
  // tiny shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cxp, footY, drawW / 2.4, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(frame, cxp - drawW / 2, footY - drawH - bob, drawW, drawH);

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
  const wrapRef = useRef<HTMLDivElement>(null);

  // resize the canvas's internal resolution to fill its container (fullscreen-ready)
  useEffect(() => {
    preloadTiles();
    preloadHeroFrames("isko");
    preloadHeroFrames("iska");
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(320, Math.floor(r.width));
      const h = Math.max(240, Math.floor(r.height));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

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

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
