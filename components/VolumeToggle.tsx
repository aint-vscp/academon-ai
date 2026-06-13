"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/audio";

/** Speaker on/off toggle. Persists via the audio manager. */
export default function VolumeToggle({ className = "" }: { className?: string }) {
  const [m, setM] = useState(false);

  useEffect(() => {
    setM(isMuted());
  }, []);

  const toggle = () => {
    const next = !isMuted();
    setMuted(next);
    setM(next);
  };

  return (
    <button
      className={`vol-btn ${className}`}
      onClick={toggle}
      aria-label={m ? "Unmute" : "Mute"}
      title={m ? "Volume off" : "Volume on"}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}
