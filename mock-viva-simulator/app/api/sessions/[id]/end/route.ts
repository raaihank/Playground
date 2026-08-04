// POST: force-end the session and generate feedback (spec §4 step 4, §6).
// Used by the candidate's "End early" button and by the expired-timer path.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { finalizeSession, toClient } from "@/lib/sessionFlow";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]/end">,
) {
  const { id } = await ctx.params;
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (row.status !== "in_progress") {
    return NextResponse.json(toClient(row));
  }

  const finalized = await finalizeSession(row);
  return NextResponse.json(toClient(finalized));
}
