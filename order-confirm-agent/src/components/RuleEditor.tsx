"use client";

import { useState } from "react";

import type { Rule } from "@/lib/types";

// One textarea per rule. Plain sentences. IDs are shown to the merchant because
// they appear in the trace. Rules go into the prompt verbatim — we never tidy
// the wording; ambiguous rules produce ambiguous behavior, which is the point.

function nextId(rules: Rule[]): string {
  let n = 1;
  const taken = new Set(rules.map((r) => r.id));
  while (taken.has(`R${n}`)) n += 1;
  return `R${n}`;
}

export default function RuleEditor({
  rules,
  onChange,
  onCommit,
}: {
  rules: Rule[];
  onChange: (rules: Rule[]) => void; // local edits (typing)
  onCommit: (rules: Rule[]) => void; // persist (blur / toggle / add / delete)
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const bodyFor = (r: Rule) => draft[r.id] ?? r.body;

  const editBody = (id: string, body: string) => {
    setDraft((d) => ({ ...d, [id]: body }));
    onChange(rules.map((r) => (r.id === id ? { ...r, body } : r)));
  };

  const commit = () => onCommit(rules);

  const toggle = (id: string) => {
    const next = rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    onChange(next);
    onCommit(next);
  };

  const remove = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    onChange(next);
    onCommit(next);
  };

  const add = () => {
    const next = [
      ...rules,
      { id: nextId(rules), body: "", enabled: true },
    ];
    onChange(next);
    onCommit(next);
  };

  return (
    <div>
      {rules.map((r) => (
        <div className="rule-row" key={r.id}>
          <div className="rule-id">{r.id}</div>
          <textarea
            rows={2}
            value={bodyFor(r)}
            placeholder="Write the rule in your own words…"
            onChange={(e) => editBody(r.id, e.target.value)}
            onBlur={commit}
          />
          <div className="rule-actions">
            <label className="toggle">
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={r.enabled}
                onChange={() => toggle(r.id)}
              />
              {r.enabled ? "on" : "off"}
            </label>
            <button
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => remove(r.id)}
            >
              delete
            </button>
          </div>
        </div>
      ))}
      <button className="btn" onClick={add}>
        + Add rule
      </button>
    </div>
  );
}
