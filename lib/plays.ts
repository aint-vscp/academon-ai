"use client";

// Play-record persistence for the Eval Lab — global (shared across all players)
// when a KV store is configured, with a localStorage cache/fallback otherwise.

import type { PlayRecord } from "@/components/Game";

const LOCAL_KEY = "academon-plays";

export function loadLocalPlays(): PlayRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLocalPlays(p: PlayRecord[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(p.slice(-100)));
  } catch {}
}

export function recordLocalPlay(rec: PlayRecord) {
  const p = loadLocalPlays();
  p.push(rec);
  saveLocalPlays(p);
}

/** Cache locally and submit to the global play log (best-effort). */
export async function submitPlay(rec: PlayRecord) {
  recordLocalPlay(rec);
  try {
    await fetch("/api/plays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });
  } catch {}
}

/** All play records merged across players (global), else the local cache. */
export async function fetchGlobalPlays(): Promise<{ plays: PlayRecord[]; global: boolean }> {
  try {
    const r = await fetch("/api/plays", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { global?: boolean; plays?: PlayRecord[] };
      if (j.global && Array.isArray(j.plays)) return { plays: j.plays, global: true };
    }
  } catch {}
  return { plays: loadLocalPlays(), global: false };
}

/** Clear only this device's local cache (the global log is shared and untouched). */
export function clearLocalData() {
  try {
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem("academon-board");
  } catch {}
}
