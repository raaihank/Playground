"use client";

import { useEffect, useRef } from "react";

import type { Rule, TranscriptTurn } from "@/lib/types";

// Turns in order. Under each agent turn: the rule stamps (hover shows the rule
// body) and any tool calls it made.

export default function Transcript({
  turns,
  rules,
}: {
  turns: TranscriptTurn[];
  rules: Rule[];
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const ruleBody = (id: string) =>
    rules.find((r) => r.id === id)?.body ?? "(rule not found)";

  return (
    <div className="transcript">
      {turns.length === 0 && (
        <div className="empty">
          Start the call — the agent opens per the rules.
        </div>
      )}
      {turns.map((t, i) => (
        <div className={`turn ${t.role}`} key={i}>
          <div className="who">{t.role === "agent" ? "agent" : "you"}</div>
          <div className="text">{t.text}</div>
          {t.role === "agent" &&
            ((t.rulesApplied && t.rulesApplied.length > 0) ||
              (t.tools && t.tools.length > 0)) && (
              <div className="meta">
                {t.rulesApplied?.map((id) => (
                  <span className="rule-tag" key={id} title={ruleBody(id)}>
                    {id}
                  </span>
                ))}
                {t.tools?.map((tool, j) => (
                  <span className="tool-badge" key={j}>
                    🔧 {tool.name}
                    {tool.ruleId ? ` ⟨${tool.ruleId}⟩` : ""}
                  </span>
                ))}
              </div>
            )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
