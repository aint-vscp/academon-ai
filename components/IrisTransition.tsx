"use client";

// Circle iris wipe between rounds (per the transition mockups):
// the visible game shrinks to a dot (black floods in from the edges),
// the LEVEL card shows on black, then the circle reopens from the middle.
// Radius is quantized into chunky steps for the retro film-reel feel.

import { useEffect, useRef } from "react";

const CLOSE_MS = 650;
const HOLD_MS = 1500;
const OPEN_MS = 650;

export default function IrisTransition({
  label,
  color,
  onMid,
  onDone,
}: {
  label: string;
  color: string;
  /** Fired once at full black — swap the world behind the curtain here. */
  onMid: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onMid, onDone });
  cbs.current = { onMid, onDone };

  useEffect(() => {
    const el = ref.current;
    const lab = labelRef.current;
    if (!el || !lab) return;
    const r0 = el.getBoundingClientRect();
    const diag = Math.hypot(r0.width, r0.height) / 2 + 24;
    const step = Math.max(8, diag / 14); // chunky quantized iris
    let midFired = false;
    let raf = 0;
    const start = performance.now();

    const setR = (r: number) => {
      const q = Math.round(r / step) * step;
      el.style.backgroundImage = `radial-gradient(circle at 50% 50%, transparent ${Math.max(
        0,
        q - 1
      )}px, #000 ${q}px)`;
    };

    const tick = (now: number) => {
      const t = now - start;
      if (t < CLOSE_MS) {
        setR(diag * (1 - t / CLOSE_MS));
      } else if (t < CLOSE_MS + HOLD_MS) {
        setR(0);
        if (!midFired) {
          midFired = true;
          lab.classList.add("show");
          cbs.current.onMid();
        }
      } else if (t < CLOSE_MS + HOLD_MS + OPEN_MS) {
        lab.classList.remove("show");
        setR(diag * ((t - CLOSE_MS - HOLD_MS) / OPEN_MS));
      } else {
        cbs.current.onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    setR(diag);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="iris-overlay">
      <div ref={labelRef} className="iris-label" style={{ color }}>
        {label}
      </div>
    </div>
  );
}
