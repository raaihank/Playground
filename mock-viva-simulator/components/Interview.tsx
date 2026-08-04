"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/types";
import Transcript from "@/components/Transcript";
import PanelStage from "@/components/PanelStage";
import AnswerComposer from "@/components/AnswerComposer";
import { useSpeak, useDictation, seedForPersona } from "@/lib/useSpeech";

type ApiResult = { session: Session; remainingSeconds: number };

const MAX_ANSWER_CHARS = 2000;

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Interview({
  initialSession,
  initialRemaining,
}: {
  initialSession: Session;
  initialRemaining: number;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endingRef = useRef(false);

  const tts = useSpeak();

  // Dictation writes into the answer box; text stays editable so the candidate
  // can correct transcription before submitting.
  const baseRef = useRef("");
  const dictation = useDictation({
    onStart: () => {
      baseRef.current = answer;
    },
    onResult: (text) => {
      const merged = (baseRef.current ? baseRef.current + " " : "") + text;
      setAnswer(merged.slice(0, MAX_ANSWER_CHARS));
    },
  });

  const pending = session.transcript[session.transcript.length - 1];
  const pendingPrompt = pending && pending.kind !== "answer" ? pending : null;
  const answeredQuestions = session.transcript.filter(
    (t) => t.kind === "question",
  ).length;
  const totalQuestions = session.plan.questions.length;

  // The stage spotlights the current question's speaker; while the panel is
  // deliberating we keep the last panelist lit so the orb doesn't jump.
  const lastPanelSpeakerId = (() => {
    for (let i = session.transcript.length - 1; i >= 0; i--) {
      const t = session.transcript[i];
      if (t.kind !== "answer") return t.speakerId;
    }
    return session.plan.panel[0]?.id ?? null;
  })();
  const spotlightId = pendingPrompt?.speakerId ?? lastPanelSpeakerId;

  // Older turns shown below the stage. The current pending question lives in the
  // stage itself, so drop it from the history to avoid showing it twice.
  const historyTurns = pendingPrompt
    ? session.transcript.slice(0, -1)
    : session.transcript;

  // Read each new panel turn aloud (unless muted). Keyed so it speaks once.
  const spokenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingPrompt || !tts.supported || tts.muted) return;
    const key = `${session.transcript.length}:${pendingPrompt.text}`;
    if (spokenKeyRef.current === key) return;
    spokenKeyRef.current = key;
    tts.speak(
      pendingPrompt.text,
      seedForPersona(pendingPrompt.speakerId),
      pendingPrompt.language,
    );
  }, [pendingPrompt, session.transcript.length, tts]);

  // Auto-scroll the history strip to the latest turn as the conversation grows.
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.transcript.length]);

  const endSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setBusy(true);
    tts.cancel();
    dictation.stop();
    try {
      await fetch(`/api/sessions/${session.id}/end`, { method: "POST" });
    } finally {
      router.refresh();
    }
  }, [router, session.id, tts, dictation]);

  // Live countdown, advisory only. The timer NEVER ends the session — it just
  // paces it. When it runs out the panel wraps up gracefully after the current
  // answer (handled server-side), so the candidate is never cut off mid-question
  // or mid-sentence. The plan is sized to land near this budget on its own.
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || busy) return;
    dictation.stop();
    tts.cancel();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not submit your answer.");
        return;
      }
      const data: ApiResult = await res.json();
      setAnswer("");
      if (data.session.status !== "in_progress") {
        router.refresh();
        return;
      }
      setSession(data.session);
      setRemaining(data.remainingSeconds);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function replayQuestion() {
    if (pendingPrompt) {
      tts.speak(
        pendingPrompt.text,
        seedForPersona(pendingPrompt.speakerId),
        pendingPrompt.language,
      );
    }
  }

  function toggleMic() {
    tts.cancel(); // don't dictate over the panel's voice
    dictation.toggle();
  }

  const overTime = remaining <= 0;
  const lowTime = !overTime && remaining <= 120;

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <header className="sticky top-0 z-10 -mx-6 mb-6 border-b border-slate-200 bg-slate-50/90 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">
              {session.candidateName}
              <span className="font-normal text-slate-500 dark:text-slate-400"> · {session.cadre}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Question {Math.min(answeredQuestions, totalQuestions)} of{" "}
              {totalQuestions}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`tabular-nums text-sm font-medium ${overTime ? "text-amber-600 dark:text-amber-400" : lowTime ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}
              title={
                overTime
                  ? "Time's up — the panel will wrap up after your current answer"
                  : undefined
              }
            >
              ⏱ {overTime ? "wrapping up" : formatClock(remaining)}
            </span>
            {tts.supported && (
              <button
                onClick={() => tts.setMuted(!tts.muted)}
                title={tts.muted ? "Unmute panel" : "Mute panel"}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {tts.muted ? "🔇" : "🔊"}
              </button>
            )}
            <button
              onClick={endSession}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              End early
            </button>
          </div>
        </div>
      </header>

      {/* The stage: panel presence, active speaker orb, current question. */}
      <PanelStage
        panel={session.plan.panel}
        current={
          pendingPrompt
            ? {
                speakerId: pendingPrompt.speakerId,
                speakerName: pendingPrompt.speakerName,
                speakerRole: pendingPrompt.speakerRole,
                text: pendingPrompt.text,
                isFollowup: pendingPrompt.kind === "followup",
              }
            : null
        }
        activeId={spotlightId}
        speaking={tts.speaking}
        pulse={tts.pulse}
        muted={tts.muted}
        busy={busy}
      />

      {overTime && pendingPrompt && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Time’s up — finish answering this question and the panel will close with
          your feedback. Take your time; you won’t be cut off.
        </p>
      )}

      {pendingPrompt && (
        <div className="mt-6">
          <AnswerComposer
            answer={answer}
            onAnswerChange={setAnswer}
            maxChars={MAX_ANSWER_CHARS}
            busy={busy}
            onSubmit={submitAnswer}
            ttsSupported={tts.supported}
            speaking={tts.speaking}
            onReplay={replayQuestion}
            dictationSupported={dictation.supported}
            listening={dictation.listening}
            transcribing={dictation.transcribing}
            recording={dictation.recording}
            onToggleMic={toggleMic}
            error={dictation.error || tts.error}
          />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Earlier turns, for reference, below the active exchange. */}
      {historyTurns.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Earlier in this interview
          </p>
          <div
            ref={historyRef}
            className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <Transcript turns={historyTurns} />
          </div>
        </div>
      )}
    </main>
  );
}
