# Order Confirmation Agent

A cash-on-delivery **confirmation call — as a simulator**. No telephony: the
operator's browser mic stands in for the customer's phone. The AI agent, the
speech, and the order changes are all **real**.

- **Brain:** Anthropic Claude (Opus 4.8) with tool use — the agent changes the
  order while the call is happening, and every change carries the rule that
  authorized it.
- **Voice:** ElevenLabs — real speech-to-text (Scribe) and text-to-speech.
- **Stack:** one Next.js app, TypeScript `strict`. No database. State lives in
  the browser; the server is a pure function.

## Run it (3 commands)

```bash
cd order-confirm-agent
npm install
npm run dev
```

Then open **http://localhost:3000** → **Simulate a call** → **start call**.

### Keys

Every call is a real call — nothing runs without keys, and it fails loudly if
one is missing. It reads them from the repo-root `.env` (one level up) or a
local `.env.local`. See [`.env.example`](.env.example):

| Key | Where |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |

> The existing repo-root `.env` spells the Anthropic key `ANTROPIC_API_KEY`
> (missing the **H**). The app accepts both spellings so it runs unchanged, but
> `ANTHROPIC_API_KEY` is the correct name for anything new.

## How it works

```
BROWSER — owns all state (config, rules, order, customer, transcript)
   │  POST /api/turn  { config, rules, order, customer, catalog, transcript, input }
   ▼
/api/turn (nodejs)
   1. audio? → STT → text                              (ElevenLabs Scribe)
   2. build the prompt from everything the client sent
   3. Claude + tools → agentic loop until it calls `respond`
   4. tool calls apply to a COPY of order/customer, with GUARDRAILS
   5. TTS on `say`                                     (ElevenLabs)
   ▼
BROWSER — applies deltas, flashes the order, plays audio, appends to transcript
```

**Guardrails are in code, not the prompt** (`src/lib/tools.ts`): `add_item`
rejects any SKU not in the catalog, quantity is clamped to 1–10 (else a tool
error), there is **no price tool** so the agent has no mechanism to change a
price, every mutation is logged with its rule + before→after, and every change
is reversible from the UI.

## Latency — the real number

The spec targets 2–4s per turn. **Measured on this build it is ~11–14s per
turn** (STT + Claude Opus 4.8 tool loop + TTS, end to end), dominated by Opus.
This is turn-based on purpose — we are testing whether the agent does the
*right* thing, not how fast. If you want it snappier for a live demo, change
`MODEL` in `src/lib/providers/brain.ts` from `claude-opus-4-8` to
`claude-sonnet-5` (roughly halves it) at some cost to rule-following nuance.

## Try these (the point of the build)

| Do this | Watch for |
|---|---|
| "I only want one" (`একটাই লাগবে`) | `set_quantity` fires · total updates on the right · agent reads the new total back (R3) |
| "Give me the red one" | R4 — agent says we don't stock it; it does **not** invent a SKU |
| Ask for a discount | R9 + no price tool — it cannot comply; does it say so, or lie? |
| "No, I don't want it" | R7 — `set_status: cancelled`, no begging, no second ask |
| Edit the address mid-call (Customer → edit) | Agent picks up the new value on its very next turn |
| Undo a change | Order reverts; the change log records the revert |
| **Turn R10 on in /setup, then refuse** | R7 vs R10 — watch it get confused. The breakage is the feature. |

The whole loop: write a rule in **/setup**, play the customer in **/simulate**,
watch the order change in front of you with the rule that allowed it, then edit
the rule and hear the difference.

## Language

The dropdown in `/setup` only lists languages the speech provider supports for
**both** transcription and speech (`src/lib/languages.ts`, with the source doc
and date). Built and verified against **Bengali** (the whole demo is in Bangla).
`/setup` has a **Preview voice** button — the spec is emphatic that docs claim
support that can still sound robotic, so listen with a native speaker before you
trust any language.

## Layout

```
data/            config · catalog · order · customer · rules (JSON seed)
src/app/         page (home) · setup · simulate · api/{turn,config,preview}
src/components/  CallPanel · Waveform · Transcript · OrderPanel · CustomerPanel · ChangeLog · RuleEditor
src/lib/         tools (+guardrails) · prompt · schema · languages · audio · types
src/lib/providers/  stt · tts · brain — the ONLY place vendor SDKs are imported
                    (enforced by an ESLint no-restricted-imports rule)
```

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # production build
pnpm typecheck  # tsc --noEmit (strict)
pnpm lint       # includes the vendor-import boundary rule
```
