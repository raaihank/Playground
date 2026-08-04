import Link from "next/link";
import type { IeltsBands, Session } from "@/lib/types";
import Transcript from "@/components/Transcript";

// IELTS part labels render nicer than the raw enum value.
function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    ielts_part1: "Part 1 — Introduction",
    ielts_part2: "Part 2 — Long turn",
    ielts_part3: "Part 3 — Discussion",
  };
  return map[category] ?? category.replace(/_/g, " ");
}

// Read-only review screen (spec §4 step 5). This is the screen put in front of a
// cadre officer for asynchronous review.
export default function Summary({ session }: { session: Session }) {
  const fb = session.feedback;
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.candidateName}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {session.cadre} · {session.academicBackground} · {session.hometown}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Home
        </Link>
      </div>

      <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
        Self-practice tool. This is not an official result and does not predict a
        real pass/fail outcome.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {session.mode === "ielts" ? "The examiner" : "The panel"}
        </h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {session.plan.panel.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="font-medium text-slate-800 dark:text-slate-200">{p.name}</div>
              <div className="text-slate-500 dark:text-slate-400">{p.role}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Transcript
        </h2>
        <div className="mt-3">
          <Transcript turns={session.transcript} />
        </div>
      </section>

      {fb ? (
        <section className="mt-10 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-semibold">Closing feedback</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{fb.overall}</p>
          </div>

          {fb.bands && <BandScores bands={fb.bands} />}

          <FeedbackList title="Strengths" items={fb.strengths} tone="emerald" />
          <FeedbackList
            title="Areas to improve"
            items={fb.improvements}
            tone="amber"
          />

          {fb.categoryNotes?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Notes by category
              </h3>
              <ul className="mt-2 space-y-2">
                {fb.categoryNotes.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium capitalize text-slate-800 dark:text-slate-200">
                      {categoryLabel(c.category)}:
                    </span>{" "}
                    <span className="text-slate-600 dark:text-slate-400">{c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fb.closingAdvice && (
            <p className="border-t border-slate-100 pt-4 text-sm italic text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {fb.closingAdvice}
            </p>
          )}
        </section>
      ) : (
        <p className="mt-10 text-sm text-slate-500 dark:text-slate-400">
          No feedback was generated (the session ended before any answer was
          recorded).
        </p>
      )}
    </main>
  );
}

function BandScores({ bands }: { bands: IeltsBands }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Indicative band
        </h3>
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {bands.overall.toFixed(1)}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">/ 9.0</span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {bands.criteria.map((c, i) => (
          <li
            key={i}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {c.name}
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {c.band.toFixed(1)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Indicative estimate only — not an official IELTS band score.
      </p>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber";
}) {
  if (!items?.length) return null;
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
