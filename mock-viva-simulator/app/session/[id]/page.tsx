// Interview loop OR read-only summary — branches on session.status (spec §4).
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { toClient } from "@/lib/sessionFlow";
import Interview from "@/components/Interview";
import Summary from "@/components/Summary";

export const dynamic = "force-dynamic";

export default async function SessionPage(
  props: PageProps<"/session/[id]">,
) {
  const { id } = await props.params;
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!row) notFound();

  const initial = toClient(row);

  if (initial.session.status === "in_progress") {
    return (
      <Interview
        initialSession={initial.session}
        initialRemaining={initial.remainingSeconds}
      />
    );
  }
  return <Summary session={initial.session} />;
}
