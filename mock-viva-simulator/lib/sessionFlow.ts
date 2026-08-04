// Shared interview-flow helpers used by the answer/end routes (spec §4 step 3-4).
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, type SessionRow } from "@/db/schema";
import { generateFeedback } from "@/lib/llm";
import { remainingSeconds } from "@/lib/timer";
import type { Persona, Plan, Session, TokenUsageEntry } from "@/lib/types";

export function resolvePersona(
  plan: Plan,
  personaId: string,
): Persona | undefined {
  return plan.panel.find((p) => p.id === personaId);
}

// Map a DB row to the client-facing Session shape (timestamps as ISO strings),
// plus the authoritative remaining time computed on the server.
export function toClient(row: SessionRow): {
  session: Session;
  remainingSeconds: number;
} {
  const session: Session = {
    id: row.id,
    mode: row.mode,
    candidateName: row.candidateName,
    cadre: row.cadre,
    academicBackground: row.academicBackground,
    hometown: row.hometown,
    notes: row.notes,
    plan: row.plan,
    transcript: row.transcript,
    currentQuestionIndex: row.currentQuestionIndex,
    followupsUsedOnCurrent: row.followupsUsedOnCurrent,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    timeLimitSeconds: row.timeLimitSeconds,
    status: row.status,
    feedback: row.feedback,
    tokenUsage: row.tokenUsage,
  };
  return {
    session,
    remainingSeconds:
      row.status === "in_progress"
        ? remainingSeconds(row.startedAt, row.timeLimitSeconds)
        : 0,
  };
}

// Generate closing feedback and mark the session complete. Idempotent-ish: if
// already completed, returns the row unchanged.
export async function finalizeSession(row: SessionRow): Promise<SessionRow> {
  if (row.status !== "in_progress") return row;

  let feedback = row.feedback;
  const usage: TokenUsageEntry[] = [...row.tokenUsage];

  // Only attempt feedback if there's something to grade.
  const hasAnswer = row.transcript.some((t) => t.kind === "answer");
  if (hasAnswer) {
    const result = await generateFeedback(row.mode, row.transcript);
    feedback = result.data;
    usage.push(result.usage);
  }

  const [updated] = await db
    .update(sessions)
    .set({
      status: "completed",
      endedAt: new Date(),
      feedback,
      tokenUsage: usage,
    })
    .where(eq(sessions.id, row.id))
    .returning();
  return updated;
}
