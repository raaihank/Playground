"use client";

import { useEffect, useRef } from "react";

import { getAudioBus } from "@/lib/audio";

// REAL waveform, not decorative. It reads getByteTimeDomainData off the shared
// AnalyserNode every animation frame and draws it. When nothing is making sound
// the line is flat — because that is the truth. We never fake motion; a wave
// that moves when nothing is happening teaches people to distrust the screen.

export default function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bus = getAudioBus();
    const buf = new Uint8Array(bus.waveSize);
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      bus.readWave(buf);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Baseline
      ctx.strokeStyle = "rgba(86,97,120,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform
      ctx.strokeStyle = "#35d0a5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const step = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] / 128 - 1; // -1..1, 0 = silence
        const y = h / 2 + v * (h / 2) * 0.9;
        const x = i * step;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="waveform" />;
}
