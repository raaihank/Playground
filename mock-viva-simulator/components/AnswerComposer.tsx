"use client";

import type { FormEvent } from "react";
import MicWaveform from "@/components/MicWaveform";

// Mic-first answer composer. Same behaviour as the old inline form (replay,
// dictation toggle, editable textarea, char limit, submit) — restyled into a
// card and given a live mic waveform while dictating.
export default function AnswerComposer({
  answer,
  onAnswerChange,
  maxChars,
  busy,
  onSubmit,
  ttsSupported,
  speaking,
  onReplay,
  dictationSupported,
  listening,
  transcribing,
  recording,
  onToggleMic,
  error,
}: {
  answer: string;
  onAnswerChange: (value: string) => void;
  maxChars: number;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  ttsSupported: boolean;
  speaking: boolean;
  onReplay: () => void;
  dictationSupported: boolean;
  listening: boolean;
  transcribing: boolean;
  recording: boolean;
  onToggleMic: () => void;
  error: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        {ttsSupported ? (
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            🔊 {speaking ? "Speaking…" : "Replay question"}
          </button>
        ) : (
          <span />
        )}
        {dictationSupported && (
          <button
            type="button"
            onClick={onToggleMic}
            disabled={busy || transcribing}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              listening
                ? "bg-red-600 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {transcribing
              ? "Transcribing…"
              : listening
                ? recording
                  ? "● Recording — tap to stop"
                  : "● Listening — tap to stop"
                : "🎙 Speak answer"}
          </button>
        )}
      </div>

      {listening && (
        <div className="mb-2 rounded-xl bg-red-50 py-2 dark:bg-red-950/30">
          <MicWaveform active={listening} />
        </div>
      )}

      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value.slice(0, maxChars))}
        placeholder={
          dictationSupported
            ? "Tap “Speak answer” and talk, or type here…"
            : "Type your answer…"
        }
        rows={4}
        disabled={busy}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700 dark:disabled:bg-slate-900"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {answer.length}/{maxChars}
        </span>
        <button
          type="submit"
          disabled={busy || !answer.trim()}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {busy ? "Submitting…" : "Submit answer"}
        </button>
      </div>

      {!dictationSupported && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Voice input isn’t supported in this browser — type your answer instead.
          (Chrome/Edge/Safari work best.)
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{error}</p>
      )}
    </form>
  );
}
