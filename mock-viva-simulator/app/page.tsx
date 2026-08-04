// Setup form + past sessions list (spec §4 step 1, §6).
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import SetupForm from "@/components/SetupForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await db
    .select({
      id: sessions.id,
      candidateName: sessions.candidateName,
      cadre: sessions.cadre,
      status: sessions.status,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .orderBy(desc(sessions.startedAt))
    .limit(25);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Mock Viva Simulator
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          A timed mock interview with an AI panel — either a 3-member BCS oral board
          or a single-examiner IELTS Speaking test. This is a self-practice tool: it
          does not predict real pass/fail outcomes or official band scores, and its
          questions are AI-generated, not sourced from real transcripts.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-medium">Start a new session</h2>
        <SetupForm />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Past sessions</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No sessions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/session/${s.id}`}
                  className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span>
                    <span className="font-medium">{s.candidateName}</span>
                    <span className="text-slate-500 dark:text-slate-400"> — {s.cadre}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <StatusBadge status={s.status} />
                    {new Date(s.startedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress:
      "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    completed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
    abandoned:
      "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
  };
  const label: Record<string, string> = {
    in_progress: "In progress",
    completed: "Completed",
    abandoned: "Abandoned",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium ${styles[status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300"}`}
    >
      {label[status] ?? status}
    </span>
  );
}
