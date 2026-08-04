// POST: create a session + generate the plan (spec §4 step 1-2, §6).
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { generatePlan } from "@/lib/llm";
import { allowSessionCreate, clientIp } from "@/lib/rateLimit";
import { toClient } from "@/lib/sessionFlow";
import type { CandidateProfile, TranscriptTurn } from "@/lib/types";

// BCS needs the full candidate profile; IELTS Speaking is a general English test,
// so only the name is required and the cadre/hometown fields don't apply.
const BodySchema = z
  .object({
    mode: z.enum(["bcs", "ielts"]).default("bcs"),
    candidateName: z.string().trim().min(1).max(120),
    cadre: z.string().trim().max(120).optional(),
    academicBackground: z.string().trim().max(500).optional(),
    hometown: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "bcs") {
      for (const field of ["cadre", "academicBackground", "hometown"] as const) {
        if (!data[field]?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Required for BCS viva.",
          });
        }
      }
    }
  });

const TIME_LIMIT_SECONDS = 900; // 15 minutes (spec §9; was 1800)

export async function POST(request: Request) {
  if (!allowSessionCreate(clientIp(request))) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again later." },
      { status: 429 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // Normalise into a complete profile. For IELTS the cadre/hometown fields are
  // not collected, so fill DB-required columns with sensible labels — the cadre
  // column doubles as the human-readable mode label across the existing UI.
  const d = parsed.data;
  const profile: CandidateProfile = {
    mode: d.mode,
    candidateName: d.candidateName,
    cadre: d.mode === "ielts" ? "IELTS Speaking" : d.cadre!.trim(),
    academicBackground:
      d.academicBackground?.trim() || (d.mode === "ielts" ? "—" : ""),
    hometown: d.mode === "ielts" ? "—" : d.hometown!.trim(),
    notes: d.notes,
  };

  let plan;
  let planUsage;
  try {
    const result = await generatePlan(profile);
    plan = result.data;
    planUsage = result.usage;
  } catch (err) {
    console.error("Plan generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate interview plan." },
      { status: 502 },
    );
  }

  if (!plan?.questions?.length || !plan?.panel?.length) {
    return NextResponse.json(
      { error: "Plan came back malformed." },
      { status: 502 },
    );
  }

  // Seed the transcript with the first question so the candidate sees it immediately.
  const firstQ = plan.questions[0];
  const speaker = plan.panel.find((p) => p.id === firstQ.personaId) ?? plan.panel[0];
  const firstTurn: TranscriptTurn = {
    kind: "question",
    speakerId: speaker.id,
    speakerName: speaker.name,
    speakerRole: speaker.role,
    text: firstQ.text,
    language: firstQ.language,
    createdAt: new Date().toISOString(),
  };

  const [row] = await db
    .insert(sessions)
    .values({
      mode: profile.mode,
      candidateName: profile.candidateName,
      cadre: profile.cadre,
      academicBackground: profile.academicBackground,
      hometown: profile.hometown,
      notes: profile.notes,
      plan,
      transcript: [firstTurn],
      currentQuestionIndex: 0,
      followupsUsedOnCurrent: 0,
      timeLimitSeconds: TIME_LIMIT_SECONDS,
      tokenUsage: [planUsage],
    })
    .returning();

  return NextResponse.json(toClient(row), { status: 201 });
}
