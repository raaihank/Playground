// POST: submit an answer, get the next turn (spec §4 step 3).
// One bounded follow-up per planned question, enforced here in code — not left to
// the model's discretion.
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, type SessionRow } from "@/db/schema";
import { decideFollowup } from "@/lib/llm";
import { isExpired } from "@/lib/timer";
import { finalizeSession, resolvePersona, toClient } from "@/lib/sessionFlow";
import type { TranscriptTurn, TokenUsageEntry } from "@/lib/types";

const MAX_ANSWER_CHARS = 2000; // spec §11

const BodySchema = z.object({ answer: z.string().min(1) });

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[id]/answer">,
) {
  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const answerText = parsed.data.answer.slice(0, MAX_ANSWER_CHARS).trim();

  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.status !== "in_progress") {
    return NextResponse.json(
      { error: "Session is not in progress." },
      { status: 409 },
    );
  }

  // Record the answer first so it's never lost.
  const transcript: TranscriptTurn[] = [
    ...row.transcript,
    { kind: "answer", text: answerText, createdAt: new Date().toISOString() },
  ];

  // Soft wrap-up (spec §9): the timer never cuts a turn short. The candidate's
  // answer above is already recorded; once they're over the budget we simply stop
  // issuing new questions/follow-ups and close gracefully with feedback — so the
  // session winds down between turns, never mid-question or mid-sentence.
  if (isExpired(row.startedAt, row.timeLimitSeconds)) {
    await persistTranscript(row.id, transcript, row);
    const finalized = await finalizeSession({ ...row, transcript });
    return NextResponse.json(toClient(finalized));
  }

  const questions = row.plan.questions;
  const currentQ = questions[row.currentQuestionIndex];
  const usage: TokenUsageEntry[] = [...row.tokenUsage];

  // Decide whether to ask the single allowed follow-up.
  if (currentQ && row.followupsUsedOnCurrent === 0) {
    try {
      const decision = await decideFollowup({
        mode: row.mode,
        personaId: currentQ.personaId,
        questionText: currentQ.text,
        answerText,
      });
      usage.push(decision.usage);

      if (decision.data.action === "followup") {
        const persona =
          resolvePersona(row.plan, decision.data.speaker) ??
          resolvePersona(row.plan, currentQ.personaId) ??
          row.plan.panel[0];
        transcript.push({
          kind: "followup",
          speakerId: persona.id,
          speakerName: persona.name,
          speakerRole: persona.role,
          text: decision.data.text,
          language: decision.data.language,
          createdAt: new Date().toISOString(),
        });
        const [updated] = await db
          .update(sessions)
          .set({ transcript, followupsUsedOnCurrent: 1, tokenUsage: usage })
          .where(eq(sessions.id, row.id))
          .returning();
        return NextResponse.json(toClient(updated));
      }
    } catch (err) {
      // If the follow-up call fails, don't block the interview — just advance.
      console.error("Follow-up decision failed; advancing:", err);
    }
  }

  // Advance to the next planned question, or finalize if we're out of questions.
  const nextIndex = row.currentQuestionIndex + 1;
  if (nextIndex < questions.length) {
    const nextQ = questions[nextIndex];
    const persona =
      resolvePersona(row.plan, nextQ.personaId) ?? row.plan.panel[0];
    transcript.push({
      kind: "question",
      speakerId: persona.id,
      speakerName: persona.name,
      speakerRole: persona.role,
      text: nextQ.text,
      language: nextQ.language,
      createdAt: new Date().toISOString(),
    });
    const [updated] = await db
      .update(sessions)
      .set({
        transcript,
        currentQuestionIndex: nextIndex,
        followupsUsedOnCurrent: 0,
        tokenUsage: usage,
      })
      .where(eq(sessions.id, row.id))
      .returning();
    return NextResponse.json(toClient(updated));
  }

  // No more questions — close out the session with feedback.
  await db
    .update(sessions)
    .set({ transcript, tokenUsage: usage })
    .where(eq(sessions.id, row.id));
  const finalized = await finalizeSession({ ...row, transcript, tokenUsage: usage });
  return NextResponse.json(toClient(finalized));
}

async function persistTranscript(
  id: string,
  transcript: TranscriptTurn[],
  _row: SessionRow,
): Promise<void> {
  await db.update(sessions).set({ transcript }).where(eq(sessions.id, id));
}
