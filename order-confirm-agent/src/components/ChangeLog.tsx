"use client";

import type { Change, Rule } from "@/lib/types";

// Changes this call — append-only. Every mutation with timestamp, the rule that
// caused it, before → after, and an undo button. The operator must be able to
// reverse anything the agent did.

export interface LogEntry extends Change {
  reverted?: boolean;
  kind?: "mutation" | "revert";
  revertLabel?: string; // for kind === "revert"
}

export default function ChangeLog({
  entries,
  rules,
  onUndo,
}: {
  entries: LogEntry[];
  rules: Rule[];
  onUndo: (id: string) => void;
}) {
  const ruleBody = (id: string) =>
    rules.find((r) => r.id === id)?.body ?? "(rule not found)";

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Changes this call</span>
        <span className="mono muted">{entries.length}</span>
      </div>
      <div className="changelog">
        {entries.length === 0 && (
          <div className="empty">
            No changes yet. The agent logs every mutation here — with the rule
            that caused it and an undo.
          </div>
        )}
        {entries.map((e) =>
          e.kind === "revert" ? (
            <div className="change-row revert-entry" key={e.id}>
              <span className="ct-time">{e.ts}</span>
              <span className="ct-desc">↩ {e.revertLabel}</span>
              <span />
              <span />
            </div>
          ) : (
            <div
              className={`change-row${e.reverted ? " reverted" : ""}`}
              key={e.id}
            >
              <span className="ct-time">{e.ts}</span>
              <span className="ct-desc">
                {e.field}{" "}
                <span className="arrow">
                  {e.before} → {e.after}
                </span>
              </span>
              <span className="rule-tag" title={ruleBody(e.ruleId)}>
                {e.ruleId}
              </span>
              {e.reverted ? (
                <span className="mono muted" style={{ fontSize: 11 }}>
                  reverted
                </span>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ padding: "2px 9px", fontSize: 12 }}
                  onClick={() => onUndo(e.id)}
                  title="Reverts this change (and anything the agent did after it)"
                >
                  ↩ undo
                </button>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
