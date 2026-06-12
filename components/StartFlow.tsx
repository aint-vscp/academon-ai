"use client";

// Start flow per the mockups: Title screen (campus BG, GROUP 2 + pokéball logo,
// stone-tablet START / OPTIONS / EVALUATION LAB) → "Choose a character…"
// (Isko / Iska, back arrow, CONFIRM) → "What is your name?" → game.

import { useEffect, useState } from "react";
import type { GameMode } from "@/engine/types";
import { heroPortraitSrc, type HeroVariant } from "@/lib/sprites";

export interface StartChoice {
  hero: HeroVariant;
  name: string;
}

type Step = "title" | "options" | "character" | "name";

export default function StartFlow({
  mode,
  onModeChange,
  ghostDefault,
  onGhostChange,
  onStart,
}: {
  mode: GameMode;
  onModeChange: (m: GameMode) => void;
  ghostDefault: boolean;
  onGhostChange: (v: boolean) => void;
  onStart: (choice: StartChoice) => void;
}) {
  const [step, setStep] = useState<Step>("title");
  const [hero, setHero] = useState<HeroVariant | null>(null);
  const [name, setName] = useState("");

  // dev/booth deep-link: ?screen=character|options|name (set after mount — no SSR mismatch)
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("screen");
    if (s === "character" || s === "options" || s === "name") {
      if (s === "name") setHero("isko");
      setStep(s as Step);
    }
  }, []);

  // ---------- title ----------
  if (step === "title") {
    return (
      <div className="start-bg">
        <div className="title-stack">
          <div className="group2-banner">GROUP 2</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ui/pokeball.png" alt="" className="pokeball" />
          <div className="wordmark">
            ACaDéMoN <span>AI</span>
          </div>
        </div>
        <div className="menu-stack">
          <button className="img-btn" onClick={() => setStep("character")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/btn_start.png" alt="START" />
          </button>
          <button className="img-btn" onClick={() => setStep("options")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/btn_options.png" alt="OPTIONS" />
          </button>
          <a className="img-btn" href="/eval">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/btn_eval.png" alt="EVALUATION LAB" />
          </a>
        </div>
      </div>
    );
  }

  // ---------- options ----------
  if (step === "options") {
    return (
      <div className="start-bg">
        <button className="back-arrow" onClick={() => setStep("title")} aria-label="Back">
          ⬅
        </button>
        <div className="charsel-title" style={{ marginTop: 40 }}>
          Options
        </div>
        <div className="pixel-panel" style={{ width: 380, margin: "24px auto", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="lead">Game mode</span>
            <button
              className="stone-btn small"
              onClick={() => onModeChange(mode === "class" ? "exhibit" : "class")}
            >
              {mode.toUpperCase()}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="lead">Ghost path overlay</span>
            <button className="stone-btn small" onClick={() => onGhostChange(!ghostDefault)}>
              {ghostDefault ? "ON" : "OFF"}
            </button>
          </div>
          <p className="subtitle">
            Class: 150s/round, CS review questions, random events. Exhibit: 90s/round, easy
            trivia, deterministic maps.
          </p>
        </div>
        <div style={{ textAlign: "center" }}>
          <button className="stone-btn" onClick={() => setStep("title")}>
            BACK
          </button>
        </div>
      </div>
    );
  }

  // ---------- character select ----------
  if (step === "character") {
    return (
      <div className="charsel-bg">
        <button className="back-arrow" onClick={() => setStep("title")} aria-label="Back">
          ⬅
        </button>
        <div className="charsel-title">Choose a character…</div>
        <div className="charsel-row">
          {(["isko", "iska"] as HeroVariant[]).map((v) => (
            <button
              key={v}
              className={`char-card ${hero === v ? "selected" : ""}`}
              onClick={() => setHero(v)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroPortraitSrc(v)} alt={v} className="char-portrait idle-bob" />
              <div className="char-name">{v === "isko" ? "Isko" : "Iska"}</div>
              <div className="char-blurb">
                {v === "isko" ? "Brave and focused." : "Smart and determined."}
              </div>
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            className="img-btn confirm"
            disabled={!hero}
            style={{ opacity: hero ? 1 : 0.4 }}
            onClick={() => hero && setStep("name")}
            aria-label="Confirm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/btn_confirm.png" alt="CONFIRM" />
          </button>
        </div>
      </div>
    );
  }

  // ---------- name ----------
  return (
    <div className="charsel-bg">
      <button className="back-arrow" onClick={() => setStep("character")} aria-label="Back">
        ⬅
      </button>
      <div className="charsel-title">Choose a character…</div>
      <div className="name-row">
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroPortraitSrc(hero!)} alt={hero!} className="char-portrait big idle-bob" />
          <div className="char-name">{hero === "isko" ? "Isko" : "Iska"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="lead" style={{ color: "#e9ecff", marginBottom: 12 }}>
            What is your name?
          </div>
          <input
            className="name-input"
            autoFocus
            maxLength={12}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onStart({ hero: hero!, name: name.trim() || (hero === "isko" ? "Isko" : "Iska") });
            }}
          />
          <div style={{ marginTop: 18 }}>
            <button
              className="img-btn confirm"
              onClick={() =>
                onStart({ hero: hero!, name: name.trim() || (hero === "isko" ? "Isko" : "Iska") })
              }
              aria-label="Confirm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ui/btn_confirm.png" alt="CONFIRM" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
