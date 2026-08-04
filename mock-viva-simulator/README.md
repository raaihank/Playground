# Mock Viva Simulator — MVP

A web app where a candidate enters their background, sits through a 15-minute
simulated BCS oral board (3 AI personas), and gets structured feedback. Built per
[`spec.md`](./spec.md). **Self-practice only** — questions are AI-generated (not real
BPSC transcripts) and the tool does not predict pass/fail outcomes.

## Stack

- **Next.js 16** (App Router, route handlers, `proxy.ts` for access gating)
- **TypeScript + Tailwind v4**
- **Drizzle ORM + Postgres** (JSONB-heavy single `sessions` table, spec §5/§10)
- **Anthropic SDK** — server-only; per-call model choice (spec §7.4):
  - Plan generation → `claude-opus-4-8`
  - Follow-up decision → `claude-haiku-4-5`
  - Closing feedback → `claude-sonnet-4-6`

## Setup

```bash
# 1. Install deps
npm install

# 2. Configure env — copy the example and fill in your Anthropic key + access code
cp .env.example .env.local      # then edit .env.local
#   ANTHROPIC_API_KEY=sk-ant-...   (required for the LLM calls)
#   ACCESS_CODE=...                (shared code for the private validation phase)

# 3. Start Postgres (Docker) and create the schema
npm run db:up        # docker compose up -d
npm run db:push      # drizzle-kit push

# 4. Run
npm run dev          # http://localhost:3000
```

You'll be prompted for the `ACCESS_CODE` on first load (spec §12).

## How it works (spec §4)

1. **Setup** — `/` form collects name, cadre, academic background, hometown, notes.
2. **Plan** — `POST /api/sessions` makes one LLM call to build a 3-persona panel +
   ~9–10 categorized questions, then persists the session.
3. **Interview** — `/session/[id]` runs the loop. Each answer hits
   `POST /api/sessions/[id]/answer`, which makes one follow-up decision. **Max one
   follow-up per planned question, enforced in code** (not left to the model).
4. **Summary** — when questions run out, the timer expires, or the candidate ends
   early (`POST /api/sessions/[id]/end`), one LLM call produces structured feedback.
5. **Review** — `/session/[id]` of a completed session is a read-only transcript +
   feedback screen — the screen to put in front of a cadre reviewer.

## Guardrails (spec §9, §11, §12)

- **Server-enforced timer** — `lib/timer.ts`; the client countdown is UX only.
- **Access code** — `proxy.ts` gates everything behind a cookie (`lib/access.ts`).
- **Rate limit** — `MAX_SESSIONS_PER_HOUR` per IP on session creation
  (`lib/rateLimit.ts`, in-memory — swap for Redis before multi-instance deploy).
- **Answer cap** — 2000 chars server-side.
- **Explicit `max_tokens`** per call (plan 1200 / follow-up 300 / feedback 900).
- **Token logging** — every LLM call's usage is appended to `sessions.token_usage`
  (JSONB) so per-session cost is auditable.

## Open decisions (spec §15)

The model-per-call choices in `lib/llm.ts` are a hypothesis — run the side-by-side
on plan generation before locking them in. Session length (900s) and whether to add
live web search for current-affairs questions are deferred to the M4 cadre review.
