"use client";

// Audio manager — looping context music (lobby / per-biome / battle / congrats)
// plus one-shot SFX (button / menu / item). Honors a persisted mute toggle and
// the browser autoplay policy (music starts on the first user gesture).

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
let unlocked = false;
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

function switchTo(name: MusicName) {
  if (currentMusic === name && name !== "congrats") return;
  for (const [n, el] of musicEls) {
    if (n !== name && !el.paused) el.pause();
  }
  const el = musicEl(name);
  if (name === "congrats") el.currentTime = 0; // restart the jingle each win
  el.play().catch(() => {});
  currentMusic = name;
}

/** Request a music context. Switches loops; no-op if already playing it. */
export function playMusic(name: MusicName) {
  desiredMusic = name;
  if (!unlocked || muted) return;
  switchTo(name);
}

/** Fire a one-shot sound effect (ignored while muted / before unlock). */
export function playSfx(name: SfxName) {
  if (muted || !unlocked) return;
  const el = new Audio(SFX[name]);
  el.volume = SFX_VOL;
  el.play().catch(() => {});
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
    for (const el of musicEls.values()) el.pause();
  } else if (unlocked && desiredMusic) {
    switchTo(desiredMusic);
  }
}

/** Read the saved mute preference and arm first-gesture autoplay unlock. */
export function initAudio() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    muted = localStorage.getItem("academon-muted") === "1";
  } catch {}
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    if (!muted && desiredMusic) switchTo(desiredMusic);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
  window.addEventListener("touchstart", unlock, { once: false });
}
