"use client";

import { useEffect, useRef, useState } from "react";

import Waveform from "@/components/Waveform";
import { startRecording, type Recording } from "@/lib/audio";

export type CallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";

const STATUS_CLASS: Record<CallStatus, string> = {
  idle: "",
  connecting: "status-live",
  listening: "status-live",
  thinking: "status-thinking",
  speaking: "status-speaking",
  ended: "",
};

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallPanel({
  status,
  callActive,
  startedAt,
  busy,
  onStart,
  onHangup,
  onAudio,
  onText,
}: {
  status: CallStatus;
  callActive: boolean;
  startedAt: number | null;
  busy: boolean;
  onStart: () => void;
  onHangup: () => void;
  onAudio: (base64: string, mimeType: string) => void;
  onText: (text: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const recRef = useRef<Recording | null>(null);
  const holdStart = useRef(0);

  // Scribe rejects clips under ~100ms; require a real hold before we send.
  const MIN_HOLD_MS = 400;

  useEffect(() => {
    if (!callActive || !startedAt) {
      setElapsed(0);
      return;
    }
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [callActive, startedAt]);

  const beginHold = async () => {
    if (busy || !callActive) return;
    setMicError(null);
    try {
      recRef.current = await startRecording();
      holdStart.current = Date.now();
      setRecording(true);
    } catch (e) {
      setMicError(
        e instanceof Error
          ? `Mic unavailable: ${e.message}. Use the text box instead.`
          : "Mic unavailable. Use the text box instead.",
      );
    }
  };

  const endHold = async () => {
    if (!recRef.current) return;
    setRecording(false);
    const rec = recRef.current;
    recRef.current = null;
    const held = Date.now() - holdStart.current;
    if (held < MIN_HOLD_MS) {
      // Too brief — discard rather than send a clip STT will reject.
      rec.cancel();
      setMicError("Hold the button a little longer to record.");
      return;
    }
    const out = await rec.stop();
    if (out) onAudio(out.base64, out.mimeType);
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy || !callActive) return;
    setText("");
    onText(t);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Call</span>
        {callActive ? (
          <button
            className="btn btn-danger"
            style={{ padding: "4px 12px", fontSize: 12 }}
            onClick={onHangup}
          >
            hang up
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ padding: "4px 12px", fontSize: 12 }}
            onClick={onStart}
            disabled={busy}
          >
            {status === "ended" ? "call again" : "start call"}
          </button>
        )}
      </div>

      <div className={`status-row ${STATUS_CLASS[status]}`}>
        <span className="status-dot" />
        <span className="status-label">{status}</span>
        {callActive && <span className="timer">{fmt(elapsed)}</span>}
      </div>

      <div className="waveform-box">
        <Waveform />
        <div className="wave-caption">real — from live mic / agent audio</div>
      </div>

      <div className="talk-row">
        <button
          className={`ptt ${recording ? "recording" : ""}`}
          disabled={busy || !callActive}
          onMouseDown={beginHold}
          onMouseUp={endHold}
          onMouseLeave={() => recording && endHold()}
          onTouchStart={(e) => {
            e.preventDefault();
            beginHold();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            endHold();
          }}
        >
          {recording ? "● release to send" : "HOLD TO TALK"}
        </button>

        <form className="text-input-row" onSubmit={submitText}>
          <input
            value={text}
            placeholder={
              callActive ? "type as the customer…" : "start the call first"
            }
            disabled={busy || !callActive}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn"
            type="submit"
            disabled={busy || !callActive || !text.trim()}
          >
            send
          </button>
        </form>
      </div>
      {micError && (
        <div className="hint" style={{ padding: "0 16px 12px", color: "var(--amber)" }}>
          {micError}
        </div>
      )}
    </div>
  );
}
