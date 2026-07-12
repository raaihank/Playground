"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import RuleEditor from "@/components/RuleEditor";
import { playBase64Mp3 } from "@/lib/audio";
import { LANGUAGES } from "@/lib/languages";
import type { Config, Rule } from "@/lib/types";

export default function SetupPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setRules(d.rules);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const persist = useCallback(
    async (nextConfig: Config, nextRules: Rule[]) => {
      setError(null);
      try {
        const res = await fetch("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: nextConfig, rules: nextRules }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1400);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  if (!config) {
    return (
      <div className="wrap">
        <p className="muted">Loading setup…</p>
      </div>
    );
  }

  const setLanguage = (language: string) => {
    const next = { ...config, language };
    setConfig(next);
    persist(next, rules);
  };

  const preview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "preview failed");
      await playBase64Mp3(d.audioBase64);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          Settings
        </div>
        <div>
          <Link className="navlink" href="/">
            Home
          </Link>
          <Link className="navlink" href="/agentic-call">
            Agentic Call
          </Link>
        </div>
      </div>

      {error && <div className="errbar">{error}</div>}

      <div className="setup-grid">
        <div className="panel">
          <div className="panel-head">
            <span>Language</span>
            <span className={`saved-flash ${saved ? "show" : ""}`}>saved</span>
          </div>
          <div style={{ padding: 16 }}>
            <div className="field-label">Call language</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                value={config.language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ maxWidth: 260 }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} — {l.native}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={preview}
                disabled={previewing}
              >
                {previewing ? "Synthesizing…" : "▶ Preview voice"}
              </button>
            </div>
            <p className="hint">
              Only languages the speech provider supports for BOTH transcription
              and speech appear here. Docs claim support that can still sound
              robotic — press Preview and listen with a native speaker before you
              trust a language. STT {config.sttModel} · TTS {config.ttsModel} ·
              voice {config.voiceId}
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span>Rules</span>
            <span className={`saved-flash ${saved ? "show" : ""}`}>saved</span>
          </div>
          <div style={{ padding: 16 }}>
            <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
              Write rules in whatever language you think in. They go into the
              agent&apos;s prompt verbatim — including their ambiguity. Rule IDs
              show up in the call trace.
            </p>
            <RuleEditor
              rules={rules}
              onChange={setRules}
              onCommit={(next) => {
                setRules(next);
                persist(config, next);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
