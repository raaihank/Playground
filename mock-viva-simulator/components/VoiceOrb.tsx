"use client";

import { useEffect, useRef } from "react";
import type { PersonaColor } from "@/lib/personaStyle";

// A ChatGPT/Claude-style gradient voice orb. While `speaking`, it glows, emits
// concentric ripples, and "breathes" in rough sync with speech — the `pulse`
// prop (a counter that ticks on each spoken word boundary) bumps a `--amp`
// CSS variable that we decay every frame. Where word boundaries never arrive
// (e.g. Safari), a gentle baseline breathe keeps it alive. Purely presentational.
export default function VoiceOrb({
  color,
  speaking,
  pulse = 0,
  size = 96,
  dim = false,
}: {
  color: PersonaColor;
  speaking: boolean;
  pulse?: number;
  size?: number;
  dim?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ampRef = useRef(0);
  const prevPulse = useRef(pulse);

  // Detect reduced-motion once; when set we skip the rAF loop and ripple rings.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Each new word boundary kicks the amplitude up.
  useEffect(() => {
    if (pulse !== prevPulse.current) {
      prevPulse.current = pulse;
      ampRef.current = Math.min(1, 0.7 + Math.random() * 0.3);
    }
  }, [pulse]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!speaking || reduced) {
      ampRef.current = 0;
      el.style.setProperty("--amp", "0");
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      // Decay the last boundary kick, but never let it look dead.
      ampRef.current *= 0.9;
      const breathe = 0.22 + 0.14 * (0.5 + 0.5 * Math.sin(t / 320));
      const amp = Math.max(ampRef.current, breathe);
      el.style.setProperty("--amp", amp.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, reduced]);

  return (
    <div
      ref={rootRef}
      className={`relative shrink-0 transition-opacity duration-500 ${dim ? "opacity-40" : "opacity-100"}`}
      style={{ width: size, height: size, ["--amp" as string]: 0 }}
      aria-hidden="true"
    >
      {/* Expanding ripple rings while speaking. */}
      {speaking && !reduced && (
        <>
          <span
            className="orb-ripple absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color.accent}` }}
          />
          <span
            className="orb-ripple absolute inset-0 rounded-full"
            style={{ border: `2px solid ${color.accent}`, animationDelay: "0.9s" }}
          />
        </>
      )}

      {/* Soft halo. */}
      <span
        className={`absolute inset-0 rounded-full ${speaking && !reduced ? "orb-glow" : ""}`}
        style={{
          background: `radial-gradient(circle, ${color.glow} 0%, transparent 70%)`,
          opacity: speaking ? 0.9 : 0.35,
          filter: "blur(2px)",
        }}
      />

      {/* The orb itself — scales subtly with amplitude. */}
      <span
        className={`absolute inset-[14%] rounded-full ${!speaking && !reduced ? "orb-breathe" : ""}`}
        style={{
          backgroundImage: `radial-gradient(circle at 32% 28%, ${color.from} 0%, ${color.to} 75%)`,
          boxShadow: speaking
            ? `0 0 24px 2px ${color.glow}, inset 0 -8px 18px rgba(0,0,0,0.25)`
            : `inset 0 -8px 18px rgba(0,0,0,0.25)`,
          transform: "scale(calc(1 + var(--amp) * 0.14))",
        }}
      />

      {/* Glossy highlight. */}
      <span
        className="absolute left-[24%] top-[20%] h-[22%] w-[22%] rounded-full bg-white/40 blur-[2px]"
      />
    </div>
  );
}
