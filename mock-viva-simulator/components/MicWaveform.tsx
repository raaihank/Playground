"use client";

import { useEffect, useRef } from "react";

const NUM_BARS = 28;

// A live equalizer driven by REAL microphone amplitude (Web Audio AnalyserNode)
// while the candidate is dictating. Unlike the panel's TTS orb, this is genuine
// audio data. Opens its own getUserMedia stream so it works alongside the Speech
// Recognition mic; tears everything down when `active` flips off or on unmount.
// If mic permission is denied we fail silently — the candidate can still type.
export default function MicWaveform({ active }: { active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    const reset = () => {
      for (const bar of barsRef.current) {
        if (bar) bar.style.transform = "scaleY(0.08)";
      }
    };

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctx();
        const src = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64; // -> 32 frequency bins
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          for (let i = 0; i < NUM_BARS; i++) {
            const v = (data[i] ?? 0) / 255; // 0..1
            const bar = barsRef.current[i];
            if (bar) bar.style.transform = `scaleY(${Math.max(0.08, v).toFixed(3)})`;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        /* denied / no mic — silently ignore; typing still works */
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      reset();
    };
  }, [active]);

  return (
    <div className="flex h-8 items-center justify-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: NUM_BARS }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-[3px] origin-center rounded-full bg-red-500 transition-transform duration-75 dark:bg-red-400"
          style={{ transform: "scaleY(0.08)" }}
        />
      ))}
    </div>
  );
}
