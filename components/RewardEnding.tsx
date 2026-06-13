"use client";

// Final reward screen (per the spec): once all rounds are cleared and the score
// is shown, a WHITE circle floods in from the centre, then the message fades in
// directing players to claim their prize in person.

import { useEffect, useRef, useState } from "react";

export default function RewardEnding({
  score,
  grade,
  badges,
  onPlayAgain,
  onMenu,
}: {
  score: number;
  grade: string;
  badges: string[];
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const circleRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const diag = Math.hypot(r.width, r.height) / 2 + 24;
    const step = Math.max(8, diag / 14); // chunky quantized circle (retro feel)
    const DUR = 720;
    let raf = 0;
    const start = performance.now();
    const setR = (rad: number) => {
      const q = Math.round(rad / step) * step;
      el.style.backgroundImage = `radial-gradient(circle at 50% 50%, #fff ${Math.max(
        0,
        q - 1
      )}px, transparent ${q}px)`;
    };
    const tick = (now: number) => {
      const t = now - start;
      if (t < DUR) {
        setR(diag * (t / DUR));
        raf = requestAnimationFrame(tick);
      } else {
        setR(diag * 2);
        setRevealed(true);
      }
    };
    setR(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="reward-overlay">
      <div ref={circleRef} className="reward-circle" />
      <div className={`reward-content ${revealed ? "show" : ""}`}>
        <div className="reward-badges">
          {badges.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" />
          ))}
        </div>
        <div className="reward-head">CONGRATULATIONS, ACADÉMON!</div>
        <div className="reward-grade">
          GRADE <b>{grade}</b> · <b>{score}</b> PTS
        </div>
        <div className="reward-msg">
          FIND US AT
          <br />
          <b>SOUTH 5TH FLOOR, MAIN BLDG.</b>
          <br />
          TO CLAIM YOUR REWARD!
        </div>
        <div className="reward-actions">
          <button className="pixel-btn primary" onClick={onPlayAgain}>
            ▶ Play again
          </button>
          <button className="pixel-btn" onClick={onMenu}>
            ⌂ Menu
          </button>
        </div>
      </div>
    </div>
  );
}
