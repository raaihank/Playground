import type { TranscriptTurn } from "@/lib/types";
import { colorForPersona, initialsFor } from "@/lib/personaStyle";

// Shared transcript renderer used by both the live interview and the read-only
// summary. Panel turns are left-aligned, attributed, and prefixed with the
// speaker's color avatar so each member reads as a consistent person; candidate
// answers sit on the right. Purely presentational — no live speaking state, so
// it renders identically in the Summary view.
export default function Transcript({ turns }: { turns: TranscriptTurn[] }) {
  return (
    <ol className="space-y-4">
      {turns.map((turn, i) => {
        if (turn.kind === "answer") {
          return (
            <li key={i} className="turn-in flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-4 py-3 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
                {turn.text}
              </div>
            </li>
          );
        }
        const c = colorForPersona(turn.speakerId);
        return (
          <li key={i} className="turn-in flex justify-start gap-2.5">
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{
                backgroundImage: `radial-gradient(circle at 32% 28%, ${c.from} 0%, ${c.to} 80%)`,
              }}
              title={`${turn.speakerName} · ${turn.speakerRole}`}
            >
              {initialsFor(turn.speakerName)}
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {turn.speakerName} · {turn.speakerRole}
                {turn.kind === "followup" && (
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                    follow-up
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{turn.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
