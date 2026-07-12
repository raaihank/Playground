"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import CallPanel, { type CallStatus } from "@/components/CallPanel";
import ChangeLog, { type LogEntry } from "@/components/ChangeLog";
import CustomerPanel from "@/components/CustomerPanel";
import OrderPanel from "@/components/OrderPanel";
import Transcript from "@/components/Transcript";
import { playBase64Mp3 } from "@/lib/audio";
import { orderTotal } from "@/lib/prompt";
import type {
  CatalogItem,
  Config,
  Customer,
  Order,
  Outcome,
  Rule,
  TranscriptTurn,
  TurnInput,
  TurnResponse,
} from "@/lib/types";

const TERMINAL: Outcome[] = ["confirmed", "cancelled", "handoff_human"];

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export default function SimulatePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [callActive, setCallActive] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lastReasoning, setLastReasoning] = useState<string | null>(null);

  const seed = useRef<{ order: Order; customer: Customer } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setRules(d.rules);
        setCatalog(d.catalog);
        setOrder(d.order);
        setCustomer(d.customer);
        seed.current = { order: d.order, customer: d.customer };
      })
      .catch((e) => setError(String(e)));
  }, []);

  const flashFor = (
    oldO: Order,
    newO: Order,
    oldC: Customer,
    newC: Customer,
  ): Set<string> => {
    const s = new Set<string>();
    const oldMap = new Map(oldO.lines.map((l) => [l.lineId, l]));
    const newMap = new Map(newO.lines.map((l) => [l.lineId, l]));
    for (const [id, l] of newMap) {
      const o = oldMap.get(id);
      if (!o || o.quantity !== l.quantity) s.add(`line:${id}`);
    }
    if (oldO.lines.length !== newO.lines.length) s.add("total");
    if (orderTotal(oldO, catalog) !== orderTotal(newO, catalog))
      s.add("total");
    if (oldO.payment !== newO.payment) s.add("payment");
    if (oldO.courier !== newO.courier) s.add("courier");
    if (oldO.status !== newO.status) s.add("status");
    (["name", "phone", "address", "area"] as const).forEach((k) => {
      if (oldC[k] !== newC[k]) s.add(`cust:${k}`);
    });
    return s;
  };

  const triggerFlash = (keys: Set<string>) => {
    if (keys.size === 0) return;
    setFlash(keys);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(new Set()), 1600);
  };

  async function runTurn(input: TurnInput, youText?: string) {
    if (busy || !config || !order || !customer) return;
    setBusy(true);
    setError(null);
    setStatus("thinking");

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          rules,
          order,
          customer,
          catalog,
          transcript,
          input,
        }),
      });
      const data = (await res.json()) as TurnResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `turn failed (${res.status})`);
      }

      // Build the transcript additions.
      const additions: TranscriptTurn[] = [];
      if (input.type === "text" && youText) {
        additions.push({ role: "you", text: youText });
      } else if (input.type === "audio") {
        additions.push({
          role: "you",
          text: data.transcribedText || "(inaudible)",
        });
      }
      additions.push({
        role: "agent",
        text: data.say,
        rulesApplied: data.rulesApplied,
        tools: data.tools,
      });
      setTranscript((prev) => [...prev, ...additions]);
      setLastReasoning(data.reasoning || null);

      // Flash whatever changed, then commit the new state.
      triggerFlash(flashFor(order, data.order, customer, data.customer));
      setOrder(data.order);
      setCustomer(data.customer);
      if (data.changes.length > 0) {
        setLog((prev) => [
          ...prev,
          ...data.changes.map<LogEntry>((c) => ({ ...c, kind: "mutation" })),
        ]);
      }

      // Speak, then settle.
      if (data.audioBase64) {
        setStatus("speaking");
        await playBase64Mp3(data.audioBase64);
      }

      if (TERMINAL.includes(data.outcome)) {
        setStatus("ended");
        setCallActive(false);
      } else {
        setStatus(callActive ? "listening" : "idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(callActive ? "listening" : "idle");
    } finally {
      setBusy(false);
    }
  }

  const startCall = () => {
    if (!seed.current) return;
    // Fresh call: reset order/customer/transcript/log to seed.
    setOrder(clone(seed.current.order));
    setCustomer(clone(seed.current.customer));
    setTranscript([]);
    setLog([]);
    setLastReasoning(null);
    setError(null);
    setCallActive(true);
    setStartedAt(Date.now());
    setStatus("connecting");
    // Kick the greeting on the next tick so state is committed first.
    setTimeout(() => runTurn({ type: "start" }), 0);
  };

  const hangup = () => {
    setCallActive(false);
    setStatus("ended");
  };

  const undo = (id: string) => {
    const idx = log.findIndex((e) => e.id === id);
    if (idx === -1 || !order || !customer) return;
    const entry = log[idx];
    const snap = entry.undo;

    triggerFlash(flashFor(order, snap.order, customer, snap.customer));
    setOrder(clone(snap.order));
    setCustomer(clone(snap.customer));

    setLog((prev) => {
      const next = prev.map((e, i) =>
        i >= idx && e.kind !== "revert" ? { ...e, reverted: true } : e,
      );
      next.push({
        ...entry,
        id: `rev-${entry.id}-${Date.now()}`,
        kind: "revert",
        ts: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        revertLabel: `reverted ${entry.field} (${entry.after} → ${entry.before})`,
      });
      return next;
    });
  };

  const editCustomer = (next: Customer) => {
    if (!customer) return;
    triggerFlash(flashFor(order!, order!, customer, next));
    setCustomer(next);
  };

  if (!config || !order || !customer) {
    return (
      <div className="wrap">
        <p className="muted">{error ?? "Loading console…"}</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          AI-Agent Demo Call Wizard
        </div>
        <div>
          <Link className="navlink" href="/">
            Home
          </Link>
          <Link className="navlink" href="/setup">
            Settings
          </Link>
        </div>
      </div>

      {error && <div className="errbar">{error}</div>}

      <div className="console">
        <div style={{ display: "grid", gap: 16 }}>
          <CallPanel
            status={status}
            callActive={callActive}
            startedAt={startedAt}
            busy={busy}
            onStart={startCall}
            onHangup={hangup}
            onAudio={(base64, mimeType) =>
              runTurn({ type: "audio", audioBase64: base64, mimeType })
            }
            onText={(text) => runTurn({ type: "text", text }, text)}
          />

          <div className="panel">
            <div className="panel-head">
              <span>Transcript</span>
              {lastReasoning && (
                <span
                  className="mono muted"
                  style={{ fontSize: 11, textTransform: "none", maxWidth: 260, textAlign: "right" }}
                  title="Agent's one-line reasoning for the last turn"
                >
                  {lastReasoning}
                </span>
              )}
            </div>
            <Transcript turns={transcript} rules={rules} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <OrderPanel order={order} catalog={catalog} flash={flash} />
          <CustomerPanel
            customer={customer}
            flash={flash}
            onEdit={editCustomer}
          />
          <ChangeLog entries={log} rules={rules} onUndo={undo} />
        </div>
      </div>
    </div>
  );
}
