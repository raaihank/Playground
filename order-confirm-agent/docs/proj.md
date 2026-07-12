# Order Confirmation Agent — Build Spec

**For:** Claude Code.
**Stack:** One Next.js app. TypeScript, `strict: true`. No database. No monorepo. No separate services.
**Build it all. There are no phases.**

> **Speech vendor docs are attached separately.** This spec names no model IDs, language lists, or endpoints.
> Every place you need them is marked `[VENDOR DOCS]`. Read the attached docs — do not guess, do not rely on
> memory.

---

## 1. What this is

Merchants sell cash-on-delivery and lose money to orders that come back undelivered. Today they pay humans to
phone every customer: *"Did you really mean to order this? Is the address right? Do you still want two?"*

This is the software that makes that call — as a simulator. No telephony. The operator's browser mic stands
in for the customer's phone. The AI agent, the speech, and the order changes are all real.

**The point:** an LLM, driven by rules a merchant wrote in plain language, holds a confirmation call, safely
changes the order while it's happening, and shows its work.

---

## 2. Out of scope. Do not build.

Telephony. Databases. WebSockets. Streaming STT/TTS. Barge-in. Voice-activity detection. Courier APIs.
Payment gateways. Auth. Multi-tenancy. Monorepo tooling.

If you catch yourself building one of these, stop and ask.

---

## 3. Screens

```
/            Home. Two buttons: [ Setup ]  [ Simulate a call ]
/setup       Language + rules
/simulate    The call console
```

---

## 4. `/setup`

Persists to `data/config.json` and `data/rules.json`.

### Language

A dropdown. **Only list languages the speech provider actually supports** `[VENDOR DOCS]` — and check STT
*and* TTS separately, because their coverage differs, and it differs between models within the same vendor.
A language that transcribes but cannot be spoken is not supported and does not go in the list.

Put the list in `lib/languages.ts` as a hardcoded const, with a comment naming the vendor doc it came from and
the date. **Before shipping a language in that list, actually synthesize one sentence in it and listen.**
Docs claim things that turn out to be robotic or broken. A native speaker's ear is the only real test, and no
script can replace it.

Stores: `{ language, sttModel, ttsModel, voiceId }`

### Rules

One textarea per rule. Plain sentences, in whatever language the merchant thinks in.

Each rule: an ID (`R1`, `R2`…, **shown to the merchant**, because these appear in the trace), a body, an
on/off toggle, delete. Add button. Autosave on blur.

Rules go into the prompt **verbatim**. Do not tidy the merchant's wording. If their rule is ambiguous, the
agent behaves ambiguously — and that is exactly the feedback they need to see.

---

## 5. `/simulate`

```
┌──────────────────────────────────┬──────────────────────────────────┐
│  CALL                            │  ORDER          [live]           │
│                                  │                                  │
│   ● Live · 01:24                 │  ORD-4417        ⬤ pending       │
│                                  │  ─────────────────────────────    │
│   ▁▃▅█▇▅▃▁▂▄▆█▅▃▁  ← waveform    │  Items                           │
│      (real, from live audio)     │   Cotton Panjabi (XL)  ×1  1290  │
│                                  │   ↑ flashes when the agent edits │
│   [ HOLD TO TALK ]   [ hang up ] │  ─────────────────────────────    │
│                                  │  Total            ৳1290          │
│  ────────────────────────────    │  Payment          COD            │
│  TRANSCRIPT                      │  Courier          Pathao         │
│                                  │  ─────────────────────────────    │
│  agent  আসসালামু আলাইকুম…        │  CUSTOMER          [ edit ]      │
│         ⟨R1 R2⟩                  │   Rubel Hossain                  │
│  you    হ্যাঁ, একটাই লাগবে        │   017XXXXXX21                    │
│  agent  ঠিক আছে, নতুন মোট…       │   House 12, Rd 4, Mirpur 10      │
│         ⟨R1 R3⟩  🔧 set_quantity │  ─────────────────────────────    │
│                                  │  CHANGES THIS CALL               │
│                                  │   14:02  qty 2 → 1       ⟨R3⟩ ↩  │
│                                  │   14:03  status confirmed ⟨R2⟩ ↩ │
└──────────────────────────────────┴──────────────────────────────────┘
```

### Call panel (top-left)

- **Status**, always visible: `idle · connecting · agent speaking · listening · thinking · ended`.
- **Waveform — real, not decorative.** Wire a Web Audio `AnalyserNode` to the mic stream while the customer
  talks, and to the audio element while the agent talks. Draw `getByteTimeDomainData` on a canvas in
  `requestAnimationFrame`. **A fake animated sine wave is worse than no waveform** — people trust what they
  see, and a waveform that moves when nothing is happening teaches them to distrust the whole screen.
- **Push to talk:** hold, speak, release. Release fires the turn.
- **A text input beside the mic** that does the same thing without audio. You will use this far more than the
  mic during development. Treat it as a first-class input, not a fallback.

### Transcript (bottom-left)

Turns in order. Under each agent turn: the **rule stamps** (`⟨R1 R3⟩`, hover shows the rule body) and any
**tool calls** it made (`🔧 set_quantity`).

### Order + customer (right)

- Line items, quantities, total, payment, courier, status pill.
- **When the agent changes something, the field flashes and animates to its new value.** This is the demo. If
  the merchant cannot *see* the order changing under the agent's hands, none of this lands.
- **Customer data is editable by the operator, mid-call.** Click edit, change the address, and the agent sees
  the new value on its next turn. This is how you test "customer corrects their address."
- **Changes this call** — append-only log. Every mutation, with timestamp, the rule that caused it, before →
  after, and an **undo** button. The operator must be able to reverse anything the agent did.

---

## 6. Architecture

One Next.js app. Turn-based HTTP. **Stateless server, state lives in the browser.**

```
BROWSER — owns all state (config, rules, order, customer, transcript)
      │
      │  POST /api/turn
      │  { config, rules, order, customer, catalog, transcript, input }
      │      input = { type:'start' } | { type:'text', text } | { type:'audio', blob }
      ▼
/api/turn   (runtime = 'nodejs')
      1. audio? → STT → text                                  [VENDOR DOCS]
      2. build prompt from everything the client sent
      3. Claude + tools → agentic loop until it calls `respond`
      4. apply tool calls to a COPY of order/customer
      5. TTS on `say`                                         [VENDOR DOCS]
      │
      │  { say, audioBase64, rulesApplied, reasoning, outcome,
      │    order, customer, changes: Change[] }
      ▼
BROWSER — apply, animate the right panel, play audio, append to transcript
```

**Why the browser owns state:** the operator can edit customer data mid-call and the agent just sees it next
turn. No sync, no database, no class of bugs. The client is the source of truth; the server is a pure
function.

**Why turn-based:** we are testing whether the agent does the *right* thing, not how fast it does it.
Streaming and barge-in triple the code to answer a question nobody has asked yet. Each turn will take 2–4
seconds. **Measure it, write the number in the README**, and move on.

---

## 7. The agent — tools

**This is the heart of it, and where it will break.** Everything else is scaffolding.

Anthropic tool use. Each turn is an agentic loop: the model may call zero or more mutation tools, then it
**must** call `respond` exactly once, which ends the turn.

```ts
// lib/tools.ts
// Every mutation tool takes `ruleId` and `reason`. That is not decoration:
// if the agent cannot say WHY it is changing someone's order, it does not get to.

set_quantity     { lineId, quantity, ruleId, reason }
remove_item      { lineId, ruleId, reason }
add_item         { sku, quantity, ruleId, reason }      // sku MUST exist in catalog.json
update_address   { address, ruleId, reason }
update_customer  { field: 'name'|'phone'|'address', value, ruleId, reason }
set_payment      { method: 'cod'|'prepaid', ruleId, reason }
set_status       { status: 'confirmed'|'cancelled'|'needs_human'|'awaiting_prepayment',
                   ruleId, reason }

respond          { say, rulesApplied[], reasoning, customerIntent, outcome }   // ends the turn
```

### Guardrails — in the tool handler, not the prompt

**A prompt is a suggestion. Code is a rule.** Anything you care about goes in the handler.

1. `add_item` **rejects any SKU not in `catalog.json`.** The agent cannot invent a product.
2. Quantity is **clamped to 1–10**. Anything else is a tool error.
3. **There is no price tool.** Prices come from the catalog. The agent cannot change a price because it has no
   mechanism to. Do not add one.
4. Every mutation is logged to `changes[]` with `ruleId`, `reason`, before-value, after-value.
5. Every mutation is **reversible from the UI**.
6. A rejected tool call returns a `tool_result` with `is_error: true` and a plain-English message, so the
   model can apologise and recover instead of the call crashing.

### `respond` schema — `lib/schema.ts`, Zod

```ts
z.object({
  say: z.string().min(1),             // what the agent SPEAKS. Max 2 sentences.
                                      // Written to be heard, not read.
  rulesApplied: z.array(z.string()),  // ONLY rules that drove THIS turn. No padding.
  reasoning: z.string(),              // one line, shown to the merchant
  customerIntent: z.enum(['confirm','cancel','hesitant','change_order',
                          'asking_question','wrong_number','angry','unclear','none']),
  outcome: z.enum(['ongoing','confirmed','cancelled','awaiting_prepayment',
                   'reschedule','handoff_human']),
})
```

Parse fails → retry once with a repair instruction. Fails twice → end the call as `handoff_human` and log it.
The customer never hears a parse error.

### The rule trace is the product

The agent **changes people's orders**. *"Why did the bot drop my customer's quantity from 2 to 1?"* is a
question the merchant will ask, and if the answer is a shrug they will switch this off on day two.

Every mutation carries the rule that caused it. Surface it everywhere: in the transcript, in the change log,
in the undo row.

---

## 8. Prompt — `lib/prompt.ts`

Rebuilt from what the client sent, every turn. Never cached, never mutated in place.

```
system:
  You are an order-confirmation agent for {merchant}.
  Speak ONLY in {config.language}.

  ORDER      ← injected verbatim. Your only source of truth about this order.
  CUSTOMER   ← injected verbatim.
  CATALOG    ← the only products that exist. You cannot invent one.
  HISTORY    ← what already happened before this call (prior SMS, failed calls)

  RULES — the merchant wrote these. Follow them.
    R1: …
    R3: …

  You may change the order using the tools, but every change needs a ruleId and a reason.
  Never invent a price, a product, or a fact about this order.
  If asked something not in the record: say you will check, and set_status needs_human.
  End every turn by calling `respond`.

messages: alternating user/assistant, replayed from the transcript
```

Two hard rules for whoever writes this file:
- **Facts are injected, never remembered.** The agent must have no reason to guess a price or an address.
- **Merchant rules go in verbatim.** Do not clean them up.

Keep the system prompt tight. Every token is latency on every turn.

---

## 9. Data — `data/`

**`catalog.json`** — five products. The only things that exist in the world.

| sku | name | price |
|---|---|---|
| `PJ-XL` | Cotton Panjabi (XL) | 1290 |
| `PJ-L` | Cotton Panjabi (L) | 1290 |
| `SR-30` | Skin Serum 30ml | 1400 |
| `FW-100` | Face Wash 100ml | 650 |
| `EB-01` | Bluetooth Earbuds | 2100 |

**`order.json`**

```jsonc
{
  "id": "ORD-4417",
  "lines": [{ "lineId": "L1", "sku": "PJ-XL", "quantity": 2 }],
  "payment": "cod",
  "courier": "Pathao",
  "status": "pending",
  "riskFlags": ["first_time_buyer"],
  "history": [
    { "who": "system", "text": "Order placed from Facebook page" },
    { "who": "agent",  "text": "SMS sent, no reply after 2h" }
  ]
}
```

**`customer.json`** — `{ name, phone, address, area }`. Editable in the UI.

**`rules.json`** — seeded, written by `/setup`. These cover order *changes*, not just confirmation:

| id | on | body |
|---|---|---|
| R1 | ✅ | Speak only in the configured language. Be polite and brief. Ask one question per turn. |
| R2 | ✅ | Greet, name the shop, read back the items and total, then ask them to confirm. |
| R3 | ✅ | If the customer wants a different quantity, change it — then read the new total back and get them to confirm it. |
| R4 | ✅ | If the customer wants a product we don't stock, say so plainly. Never invent a product or a price. |
| R5 | ✅ | Orders over 3000 need a prepaid advance. If they refuse, keep it COD but flag the order. |
| R6 | ✅ | Outside the main city: ask for a landmark and say delivery takes 3–5 days. |
| R7 | ✅ | If they say no clearly, cancel. Do not offer a discount and do not ask twice. |
| R8 | ✅ | If they get angry or ask for a human, hand off immediately. |
| R9 | ✅ | Never change the price. Never change anything you weren't asked to change. |
| R10 | ❌ | If they try to cancel, offer 10% off. |

**R10 is seeded off on purpose.** It contradicts R7. Turning it on is the first thing a merchant will try, and
watching the agent get confused is the fastest way to teach them why rule hygiene matters.

---

## 10. Files

```
.
├── README.md              # 3 commands to run it. Keep it true.
├── SPEC.md
├── .env.example           # every key + where to get it
│
├── data/
│   └── config.json  catalog.json  order.json  customer.json  rules.json
│
└── src/
    ├── app/
    │   ├── page.tsx                 # home — two buttons
    │   ├── setup/page.tsx
    │   ├── simulate/page.tsx
    │   └── api/
    │       ├── turn/route.ts        # THE pipeline. runtime = 'nodejs'
    │       └── config/route.ts      # GET/PUT config.json + rules.json
    │
    ├── components/
    │   ├── CallPanel.tsx            # status + waveform + push-to-talk + text input
    │   ├── Waveform.tsx             # real AnalyserNode. Not decorative.
    │   ├── Transcript.tsx           # turns + rule stamps + tool badges
    │   ├── OrderPanel.tsx           # live, animates on change
    │   ├── CustomerPanel.tsx        # editable mid-call
    │   ├── ChangeLog.tsx            # mutation + rule + before→after + undo
    │   └── RuleEditor.tsx
    │
    └── lib/
        ├── tools.ts                 # tool defs + handlers + GUARDRAILS
        ├── prompt.ts
        ├── schema.ts                # zod
        ├── languages.ts             # supported list [VENDOR DOCS] + source + date
        ├── audio.ts                 # MediaRecorder, AnalyserNode, playback
        └── providers/
            ├── stt.ts               # [VENDOR DOCS]
            ├── tts.ts               # [VENDOR DOCS]
            └── brain.ts             # Anthropic + tool loop
```

Every call is a real call: real STT, real Claude, real TTS. There is no canned mode and no offline mode.
Nothing runs without API keys — `.env.example` lists every one and where to get it. Fail loudly and early on a
missing key; do not silently degrade.

Everything the agent touches goes through `lib/providers`. **No vendor SDK is imported anywhere else.**
Enforce it with an ESLint `no-restricted-imports` rule — if a vendor type leaks into a component, swapping the
provider later becomes a rewrite.

---

## 11. It works when

Hand-test each of these. They are the point of the build.

| Do this | Watch for |
|---|---|
| "I only want one" | `set_quantity` fires · total updates on the right · agent reads the new total back (R3) |
| "Give me the red one" | R4 — agent says we don't stock it. It must **not** invent a SKU. |
| Ask for a discount | R9, and there is no price tool. It cannot comply. Does it say so, or does it lie? |
| Build an order over ৳3000 | R5 — asks for prepayment, calls `set_status: awaiting_prepayment` |
| "No, I don't want it" | R7 — `set_status: cancelled`, no begging, no second ask |
| **Turn R10 on, then refuse** | R7 vs R10. Watch it break. **The breakage is a feature** — it's what you show the merchant. |
| Edit the address mid-call | Agent picks up the new value on its very next turn |
| Undo a change | Order reverts. Change log records the revert. |

And the whole loop, end to end:

1. A merchant writes a rule in their own words, in Setup.
2. They play the customer and ask to change the quantity.
3. The agent changes it, **the order updates in front of them**, and it shows which rule let it.
4. They say *"it shouldn't be allowed to do that"*, edit the rule, run it again, and hear the difference.

---

## 12. Ask a human. Do not guess.

1. **Does TTS in the target language actually sound acceptable?** Synthesize one sentence and put it in front
   of a native speaker before you commit to a provider. Vendor docs claim language support that turns out to
   be robotic or unusable, and the fastest models usually cover the fewest languages — the exact trade-off a
   voice agent cannot afford.
2. **Should the agent change orders autonomously, or propose changes for approval?** This build lets it change
   them, with a rule trace and undo. That is a real product decision and it is not mine to make. Ask a
   merchant.
3. **Is one fixed language enough?** If customers code-switch mid-sentence, a single `config.language` will
   not survive contact. Find out early.