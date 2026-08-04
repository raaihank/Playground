"use client";

import type { Persona } from "@/lib/types";
import { colorForPersona, initialsFor } from "@/lib/personaStyle";
import VoiceOrb from "@/components/VoiceOrb";

type CurrentQuestion = {
  speakerId: string;
  speakerName: string;
  speakerRole: string;
  text: string;
  isFollowup: boolean;
};

// The "stage": the panel rendered as avatars with the active speaker spotlit by
// a large voice orb, and the current question shown large and attributed. When
// the panel is deliberating (`busy`), the orb dims and "thinking" dots appear.
export default function PanelStage({
  panel,
  current,
  activeId,
  speaking,
  pulse,
  muted,
  busy,
}: {
  panel: Persona[];
  current: CurrentQuestion | null;
  activeId: string | null; // who the orb represents right now
  speaking: boolean;
  pulse: number;
  muted: boolean;
  busy: boolean;
}) {
  const active = panel.find((p) => p.id === activeId) ?? panel[0];
  const activeColor = active
    ? colorForPersona(active.id)
    : colorForPersona("chair");
  const single = panel.length <= 1;

  return (
    <section className="flex flex-col items-center text-center">
      {/* Panel avatars — hidden for a single examiner (IELTS). */}
      {!single && (
        <ul className="mb-6 flex items-center justify-center gap-5">
          {panel.map((p) => {
            const c = colorForPersona(p.id);
            const isActive = p.id === active?.id;
            return (
              <li key={p.id} className="flex flex-col items-center gap-1.5">
                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-full text-xs font-semibold text-white transition-all duration-300"
                  style={{
                    backgroundImage: `radial-gradient(circle at 32% 28%, ${c.from} 0%, ${c.to} 80%)`,
                    boxShadow: isActive ? `0 0 0 3px ${c.accent}` : "none",
                    opacity: isActive ? 1 : 0.5,
                    transform: isActive ? "scale(1.08)" : "scale(1)",
                  }}
                >
                  {initialsFor(p.name)}
                  {isActive && speaking && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow dark:bg-slate-900">
                      <span className="flex items-end gap-[1.5px]">
                        <span className="h-1.5 w-[2px] animate-pulse rounded-full" style={{ background: c.accent }} />
                        <span className="h-2.5 w-[2px] animate-pulse rounded-full [animation-delay:120ms]" style={{ background: c.accent }} />
                        <span className="h-1.5 w-[2px] animate-pulse rounded-full [animation-delay:240ms]" style={{ background: c.accent }} />
                      </span>
                    </span>
                  )}
                </div>
                <span
                  className={`max-w-[5.5rem] truncate text-[11px] leading-tight ${isActive ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}`}
                  title={`${p.name} · ${p.role}`}
                >
                  {p.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Spotlight orb. */}
      <div className="relative flex items-center justify-center">
        <VoiceOrb
          color={activeColor}
          speaking={speaking && !busy}
          pulse={pulse}
          size={single ? 132 : 116}
          dim={busy}
        />
        {busy && (
          <span className="absolute flex items-center gap-1.5">
            <span className="think-dot h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
            <span className="think-dot h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
            <span className="think-dot h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
          </span>
        )}
      </div>

      {/* Status / attribution line. */}
      <div className="mt-4 min-h-[1.25rem] text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
        {busy ? (
          "The panel is considering your answer…"
        ) : current ? (
          <span style={{ color: colorForSeedText(current.speakerId) }}>
            {current.speakerName} · {current.speakerRole}
            {speaking && <span className="ml-1.5 text-slate-400 dark:text-slate-500">— speaking</span>}
          </span>
        ) : null}
        {current?.isFollowup && (
          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            follow-up
          </span>
        )}
      </div>

      {/* The current question, large. */}
      {current && !busy && (
        <p
          key={current.text}
          className="turn-in mx-auto mt-2 max-w-xl text-balance text-lg font-medium leading-snug text-slate-900 dark:text-slate-50"
        >
          {current.text}
        </p>
      )}

      {muted && current && !busy && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          🔇 Audio is muted — unmute to hear the panel.
        </p>
      )}
    </section>
  );
}

// Accent color for the attribution text, matching the speaker's orb.
function colorForSeedText(personaId: string): string {
  return colorForPersona(personaId).accent;
}
