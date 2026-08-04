# Mock Viva Simulator — MVP Spec

Status: pre-build spec, derived from a working browser prototype that validated the core interaction loop (plan generation → turn-taking → feedback). This doc is for building the real version in Next.js + TypeScript.

---

## 1. What this is, in one paragraph

A web app where a candidate fills in their background, then sits through a 30-minute simulated BCS oral board (3 AI personas: Chairman, Subject Member, Current-Affairs/Ethics Member) that asks questions, occasionally follows up, and ends with structured feedback. Question content is generated per-candidate from a seeded category bank, it is **not** sourced from real BPSC transcripts, because none are public. The explicit next step after this MVP is getting real BCS cadre officers to review session transcripts for realism before this becomes anything more than a personal validation tool.

---

## 2. Goals for this version

- Prove whether an LLM-run board *feels* realistic enough to be worth building further, as judged by actual cadre officers, not by us.
- Keep the build small enough to finish and get into a reviewer's hands in days, not weeks.
- Capture every session in full so it can be reviewed asynchronously, you don't need a cadre officer live on a call to validate this.

## 3. Explicit non-goals (don't build these yet)

- No voice input/output. Text only.
- No Bangla/code-switched interview mode. English only.
- No live web search grounding for current-affairs questions. The model uses general knowledge; if reviewers flag staleness as a real problem, that's the trigger to add it, not a default.
- No real auth system. A single shared access code is enough while this is just you and a handful of reviewers.
- No payment, no multi-tenant accounts, no public launch surface.
- No claim of predicting real pass/fail outcomes. The feedback prompt must explicitly avoid implying this anywhere in its output.

---

## 4. User flow

1. **Setup** — candidate enters name, preferred cadre, academic background, hometown, optional notes.
2. **Plan generation** — one LLM call builds a panel of 3 personas and ~9-10 questions tagged by category and speaker. Session is created and persisted at this point.
3. **Interview loop** — for each planned question, in order:
   - Show the question, attributed to its persona.
   - Candidate types an answer, submits.
   - One LLM call decides: ask one bounded follow-up, or advance. Max one follow-up per planned question, enforced in code, not left to the model's discretion.
   - Repeat until all questions are covered, or the 30-minute timer expires, or the candidate ends early.
4. **Summary** — one LLM call produces structured feedback (overall impression, strengths, gaps, category notes, one closing tip). Session marked complete.
5. **Review** — anyone with the session link (or the candidate, from a session list) can view the full transcript + feedback read-only. This is the screen you put in front of a cadre officer.

---

## 5. Data model

Use a JSONB-heavy schema for MVP speed. Normalize later only if a real need shows up.

```ts
type Persona = { id: string; name: string; role: string };

type PlannedQuestion = {
  id: number;
  personaId: string;
  category: "self" | "cadre_motivation" | "family_hobbies" | "hometown"
          | "current_affairs" | "history" | "constitution_law" | "academic"
          | "general_knowledge" | "ethics";
  text: string;
};

type Plan = { panel: Persona[]; questions: PlannedQuestion[] };

type TranscriptTurn =
  | { kind: "question" | "followup"; speakerId: string; speakerName: string; speakerRole: string; text: string; createdAt: string }
  | { kind: "answer"; text: string; createdAt: string };

type Feedback = {
  overall: string;
  strengths: string[];
  improvements: string[];
  categoryNotes: { category: string; note: string }[];
  closingAdvice: string;
};

type Session = {
  id: string;                       // uuid
  candidateName: string;
  cadre: string;
  academicBackground: string;
  hometown: string;
  notes?: string;
  plan: Plan;
  transcript: TranscriptTurn[];
  currentQuestionIndex: number;
  followupsUsedOnCurrent: 0 | 1;
  startedAt: string;                 // ISO timestamp, server-set
  endedAt?: string;
  timeLimitSeconds: number;          // 1800
  status: "in_progress" | "completed" | "abandoned";
  feedback?: Feedback;
};
```

**Suggested table**: one `sessions` table, most fields as plain columns (id, candidateName, cadre, status, startedAt, endedAt for queryability), `plan`, `transcript`, `feedback` as JSONB columns. No separate tables needed for v1.

---

## 6. Suggested architecture

```
/app
  /page.tsx                          → setup form + past sessions list
  /session/[id]/page.tsx             → interview loop OR read-only summary, branches on session.status
  /api/sessions/route.ts             → POST: create session + generate plan
  /api/sessions/[id]/answer/route.ts → POST: submit answer, get next turn
  /api/sessions/[id]/end/route.ts    → POST: force-end, generate feedback
  /api/sessions/[id]/route.ts        → GET: fetch full session
/lib
  /llm.ts                            → Anthropic client wrapper, server-only
  /prompts.ts                        → system prompts + seed question bank (below)
  /db.ts                             → DB client singleton
  /timer.ts                          → server-side elapsed-time check (see §9)
/db
  /schema.ts                         → Drizzle schema (see §10)
```

Key principle that's different from the browser prototype: **the Anthropic API key now lives server-side only**, in an env var, called from route handlers. Nothing related to the LLM call should ever reach the client bundle.

---

## 7. The three LLM calls

These prompts were tested in the prototype and produced usable output. Treat them as a starting point, not gospel, your cadre-officer review in §11 is what actually validates or kills these.

### 7.1 Plan generation (once per session)

```
SYSTEM:
You are an experienced senior chairman of a Bangladesh Civil Service (BCS) Public
Service Commission oral board (viva voce), preparing today's interview plan for one
candidate.
Respond with ONLY a single valid JSON object. No markdown fences, no commentary.
Schema:
{
 "panel":[
   {"id":"chair","name":"<plausible Bengali name>","role":"Chairman"},
   {"id":"m1","name":"<plausible Bengali name>","role":"Member - Subject Specialist"},
   {"id":"m2","name":"<plausible Bengali name>","role":"Member - Current Affairs & Ethics"}
 ],
 "questions":[
   {"id":1,"personaId":"chair","category":"self","text":"..."},
   ... 9-10 items total ...
 ]
}
Category coverage required: one "self", one to two "cadre_motivation", one
"family_hobbies", one "hometown", two "current_affairs" (evergreen, not tied to one
headline), one "history", one "academic" (tailored to the candidate's stated
background), one "ethics".
Assign personaId sensibly: chair handles self/cadre_motivation/family/hometown,
m1 handles academic, m2 handles current_affairs/ethics/history.
Write each question the way a board member would actually say it out loud, direct
and natural, not textbook-worded. Use the reference bank only as a style/category
guide, do not copy it, write fresh questions for this specific candidate.

USER:
Candidate profile:
Name: {name}
Preferred cadre: {cadre}
Academic background: {background}
Hometown/district: {hometown}
Additional notes: {notes}

Reference question-category bank (style/category inspiration only):
{seed bank JSON, see §8}
```

### 7.2 Follow-up decision (once per question, only if no follow-up used yet)

```
SYSTEM:
You are simulating a BCS oral board mid-interview. Given the question just asked and
the candidate's answer, decide whether ONE brief natural follow-up is warranted, or
whether the board should move on. Real boards do not follow up on every answer, only
when it was vague, too short, contradictory, evasive, or naturally invites one probe.
Respond with ONLY a JSON object:
{"action":"followup","speaker":"<personaId>","text":"<brief follow-up>"}
or
{"action":"advance"}

USER:
Original question (asked by {personaId}): "{questionText}"
Candidate's answer: "{answerText}"
```

### 7.3 Closing feedback (once, at end of session)

```
SYSTEM:
You are the chairman of a BCS oral board, writing closing feedback notes after a
practice session. This is a self-practice tool, not an official result — never imply
you are predicting a real pass/fail outcome.
Respond with ONLY a JSON object:
{"overall":"2-3 sentences, direct and honest, chairman's voice",
 "strengths":["..."], "improvements":["..."],
 "categoryNotes":[{"category":"...","note":"..."}],
 "closingAdvice":"one practical line for next practice round"}
Be specific, reference what the candidate actually said, not generic praise.

USER:
Full transcript of the mock viva:
{transcript, formatted as "Speaker (Role): text" / "Candidate: text" lines}
```

### 7.4 Model choice

This is now your decision to make per-call, you're not constrained to a single fixed model like the browser prototype was.

| Call | Suggested model | Why |
|---|---|---|
| Plan generation | Claude Opus 4.7, or Sonnet 4.6 if cost-sensitive | This is the highest-leverage call for realism, the one your cadre reviewers will judge hardest. Worth the extra cost/latency to test Opus head-to-head against Sonnet here before committing. |
| Follow-up decision | Claude Haiku 4.5 | Called up to ~10x per session, it's a short binary-ish decision, not worth premium-model cost or latency. |
| Closing feedback | Claude Sonnet 4.6 | One call per session, needs to write well, doesn't need Opus-level depth. |

Run an actual side-by-side comparison on the plan-generation call before locking this in. Don't take this table as settled, it's a starting hypothesis.

---

## 8. Seed question bank

Move this into `/lib/prompts.ts` as a plain object, used only as inspiration text inside the plan-generation prompt (never shown to the candidate, never quoted verbatim by the model).

The live version lives in `/lib/prompts.ts`. It is organised into ten recurring
clusters that show up across real recommended-candidate viva write-ups (there is no
official BPSC bank), mapped onto the category enum: cadre choice → `cadre_motivation`;
constitution/state structure + law & administrative procedure → `constitution_law`;
liberation war & national history → `history`; subject cross-questioning + ICT/
technical → `academic`; district knowledge → `hometown`; personal/family → `self`/
`family_hobbies`; current affairs & IR → `current_affairs`; literature/culture/GK →
`general_knowledge`; plus `ethics`.

```ts
export const SEED_BANK = {
  self: ["Tell us about yourself.", /* … */],
  cadre_motivation: ["Why is [cadre] your first choice, and not Administration?", /* … */],
  family_hobbies: ["What does your father/mother do …?", /* … */],
  hometown: ["Who is the Member of Parliament from your constituency?", /* … */],
  current_affairs: ["What is Bangladesh's position on an ongoing regional crisis?", /* … */],
  history: ["Recite a part of the 7th March speech.", /* … */],
  constitution_law: ["What is Section 144 — when and how is it imposed?", /* … */],
  academic: ["Explain a core concept from your subject as if to a villager.", /* … */],
  general_knowledge: ["Name two of your favourite Tagore or Nazrul works.", /* … */],
  ethics: ["If your minister orders something unlawful, what do you do?", /* … */],
};
```

These clusters are reconstructed from candidate transcripts, **not validated against
real boards**. Expect your cadre reviewers to want to rewrite half of it. That's the
point of getting them involved.

Two design rules the plan-generation prompt encodes so these sets are used
*relevantly* rather than uniformly (see `PLAN_SYSTEM` in `/lib/prompts.ts`):

- **Cadre-/background-conditional mixing.** Admin/Police/Judiciary/Audit choices
  lean toward `constitution_law` + `history`; science/engineering backgrounds get
  `history` + `constitution_law` on purpose (boards assume a gap there) and an
  applied — not textbook — `academic` question. A board mixes 2-4 clusters and
  switches examiner mid-thread, so questions are interleaved, not grouped by persona.
- **Composure over hit-rate.** A clean "I don't know" is acceptable: the follow-up
  prompt won't corner the candidate on it, and the feedback prompt grades composure
  and reasoning under pressure above raw factual accuracy.

---

## 9. Timer rules (must be server-enforced, not just client-side)

The client shows a live countdown for UX, but the server is the source of truth, or a candidate could pause their system clock / reopen the tab and game the 30-minute limit.

On every `answer` or `end` request:

```ts
const elapsedSeconds = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
if (elapsedSeconds >= session.timeLimitSeconds) {
  // force into feedback generation regardless of what the client sent
}
```

Store `timeLimitSeconds = 1800` on the session at creation, don't hardcode it elsewhere, you'll want to experiment with session length later.

---

## 10. Tech stack recommendation

You already run TypeScript, Next.js, Express, FastAPI, Go, and AWS. For this specific app:

- **Framework**: Next.js App Router. Route handlers for the four endpoints in §6, plain React Server/Client Components for the two pages. No need to involve Express/FastAPI/Go for this, it's small enough to live entirely inside the Next.js app.
- **Database/ORM**: As of mid-2026, the default recommendation for new TypeScript/Next.js projects has shifted toward **Drizzle** over Prisma, mainly for smaller bundle size, no codegen step, and better cold-start behavior if you ever deploy to Lambda/edge. Prisma remains a perfectly reasonable choice if your team already has Prisma muscle memory and you're deploying to a warm long-running container rather than serverless, the performance gap mostly only matters on serverless/edge. Either is fine for an MVP this size, pick based on what your team already knows, don't burn time on this decision.
- **DB host**: Postgres on RDS, fits your existing AWS setup. Neon/Supabase work too if you want to skip provisioning RDS just for an MVP.
- **Deployment**: wherever your other Next.js apps already run. No special infra needed for this one.

---

## 11. Cost control & abuse guards (don't skip this, it costs real money per session)

- Rate-limit session creation (e.g. max N new sessions per hour per access code/IP). Each session is ~12 LLM calls, this is not free.
- Cap answer length server-side (e.g. 2000 characters) before it goes into a prompt.
- Set explicit `max_tokens` per call type rather than reusing one number everywhere: plan ~1200, follow-up decision ~300, feedback ~900.
- Log token usage per call (even just to a DB column or CloudWatch) so you can see actual cost per session before deciding whether this is viable to open beyond your validation group.

## 12. Access control for this phase

Don't build real auth yet. A single shared access code (env var, checked via a cookie or simple middleware) is enough while the only people using this are you and the cadre officers you bring in. Build real auth only once you decide to go past private validation.

---

## 13. Validation protocol (the actual point of this MVP)

1. Generate 3-5 sessions yourself across different cadre preferences and academic backgrounds.
2. Give cadre reviewers the read-only session view (§4 step 5), not a live session, so they can review asynchronously on their own time.
3. Ask them this specific rubric, don't just ask "does this look good":
   - Does the 3-person panel structure feel realistic?
   - Are these the kinds of questions actually asked at a real board, by category?
   - Is the follow-up behavior realistic, both when it happens and how it's phrased?
   - Does the closing feedback resemble what a real board would actually note, or does it read as generic AI praise?
   - What's structurally missing that text-only interaction can't capture (document checks, physical presentation, specific cadre protocol questions, etc.)?
4. Use their answers to revise the seed bank (§8) and the three prompts (§7) before investing in any further build, voice input, current-affairs grounding, Bangla support, or anything else.

---

## 14. Build order

| Milestone | Scope |
|---|---|
| M1 | Setup form + plan generation call + session persisted |
| M2 | Interview loop: question display, answer submission, follow-up decision, server-enforced timer |
| M3 | Closing feedback call + read-only session view |
| M4 | Cadre officer validation pass — no new features, just get real reviewers looking at real output |
| M5 | Revise prompts/seed bank based on M4 findings before deciding what (if anything) gets built next |

---

## 15. Open decisions you should confirm before/during build

- **Model choice per call** — §7.4 is a hypothesis, not a decision. Test it.
- **ORM choice** — Drizzle vs Prisma, pick based on team familiarity, not the trend.
- **Whether to add live web search for current-affairs questions** — skip for MVP, revisit only if M4 reviewers specifically flag staleness as a problem.
- **Session length** — 30 minutes is your stated assumption, not something validated against a real board's actual duration. Worth asking your cadre reviewers directly.
- **Voice and Bangla** — explicitly out of scope for this version. Don't let either creep in before M4 is done.