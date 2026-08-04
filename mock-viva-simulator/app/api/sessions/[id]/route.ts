// GET: fetch the full session (spec §6). Used by the read-only review screen and
// for client refreshes.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { toClient } from "@/lib/sessionFlow";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(toClient(row));
}
