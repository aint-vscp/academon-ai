"use client";

// Audio manager — looping context music (lobby / per-biome / battle / congrats)
// plus one-shot SFX (button / menu / item). Honors a persisted mute toggle and
// the browser autoplay policy.
//
// Robustness: music is (re)attempted on load, on the first user gesture, AND on
// page restore (visibilitychange → visible, and `pageshow` for the bfcache
// back/forward case) so it never silently "disappears" after a reload or a Back.

export type MusicName = "lobby" | "nature" | "water" | "fire" | "battle" | "congrats";
export type SfxName = "button" | "menu" | "item";

const MUSIC: Record<MusicName, string> = {
  lobby: "/audio/lobby.m4a",
  nature: "/audio/nature.m4a",
  water: "/audio/water.m4a",
  fire: "/audio/fire.m4a",
  battle: "/audio/battle.m4a",
  congrats: "/audio/congrats.m4a",
};

const SFX: Record<SfxName, string> = {
  button: "/audio/sfx_button.mp3",
  menu: "/audio/sfx_menu.mp3",
  item: "/audio/sfx_item.m4a",
};

const MUSIC_VOL = 0.38;
const SFX_VOL = 0.7;

let muted = false;
let currentMusic: MusicName | null = null;
let desiredMusic: MusicName | null = null;
let initialized = false;

const musicEls = new Map<MusicName, HTMLAudioElement>();

function musicEl(name: MusicName): HTMLAudioElement {
  let el = musicEls.get(name);
  if (!el) {
    el = new Audio(MUSIC[name]);
    el.loop = name !== "congrats"; // congrats is a one-shot jingle
    el.volume = MUSIC_VOL;
    el.preload = "auto";
    musicEls.set(name, el);
  }
  return el;
}

function pauseOthers(except: MusicName) {
  for (const [n, el] of musicEls) {
    if (n !== except && !el.paused) el.pause();
  }
}

function play(el: HTMLAudioElement) {
  // play() can reject if a gesture hasn't happened yet — that's fine, a later
  // gesture / pageshow / visibility change retries.
  const p = el.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function switchTo(name: MusicName) {
  if (currentMusic === name) {
    const el = musicEls.get(name);
    if (el && el.paused && !muted) play(el);
    return;
  }
  pauseOthers(name);
  const el = musicEl(name);
  if (name === "congrats") el.currentTime = 0; // restart the jingle each win
  currentMusic = name;
  if (!muted) play(el);
}

/** Request a music context. Switches loops; resumes if it was selected already. */
export function playMusic(name: MusicName) {
  desiredMusic = name;
  switchTo(name);
}

/** Resume the active track (after a tab switch, reload-with-engagement, or bfcache Back). */
function resume() {
  if (muted) return;
  const name = currentMusic ?? desiredMusic;
  if (!name) return;
  pauseOthers(name);
  const el = musicEl(name);
  currentMusic = name;
  play(el);
}

/** Fire a one-shot sound effect (ignored while muted). */
export function playSfx(name: SfxName) {
  if (muted) return;
  const el = new Audio(SFX[name]);
  el.volume = SFX_VOL;
  play(el);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("academon-muted", m ? "1" : "0");
  } catch {}
  if (m) {
    for (const el of musicEls.values()) if (!el.paused) el.pause();
  } else {
    resume();
  }
}

/** Read the saved mute preference, attempt playback, and arm resume hooks. */
export function initAudio() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    muted = localStorage.getItem("academon-muted") === "1";
  } catch {}

  // first user gesture unlocks audio for browsers that block autoplay
  const onGesture = () => {
    resume();
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    window.removeEventListener("touchstart", onGesture);
  };
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);
  window.addEventListener("touchstart", onGesture);

  // resume after tab switches and back/forward (bfcache) restores
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  window.addEventListener("pageshow", () => resume());
  window.addEventListener("focus", () => resume());
}
