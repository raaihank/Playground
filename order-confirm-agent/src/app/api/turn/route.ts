// THE pipeline. Stateless: the browser sends everything, we return the deltas.
//   1. audio? → STT → text
//   2. build prompt from what the client sent
//   3. Claude + tools → agentic loop until it calls `respond`
//   4. tool calls already applied to a COPY of order/customer
//   5. TTS on `say`
//   6. return { say, audioBase64, order, customer, changes, ... }

import { NextResponse } from "next/server";

import { runAgentTurn } from "@/lib/providers/brain";
import { transcribe } from "@/lib/providers/stt";
import { synthesize } from "@/lib/providers/tts";
import type { TurnRequest, TurnResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: TurnRequest;
  try {
    body = (await req.json()) as TurnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { config, rules, order, customer, catalog, transcript, input } = body;
  if (!config || !order || !customer || !catalog || !input) {
    return NextResponse.json(
      { error: "Missing required fields in turn request." },
      { status: 400 },
    );
  }

  try {
    // 1. Resolve the user's words for this turn.
    let userText: string;
    let transcribedText: string | null = null;

    if (input.type === "start") {
      userText = "<<CALL_STARTED>>";
    } else if (input.type === "text") {
      userText = (input.text ?? "").trim();
      if (!userText) {
        return NextResponse.json(
          { error: "Empty text input." },
          { status: 400 },
        );
      }
    } else if (input.type === "audio") {
      const audioBuf = Buffer.from(input.audioBase64, "base64");
      try {
        transcribedText = await transcribe({
          audio: audioBuf,
          mimeType: input.mimeType || "audio/webm",
          sttModel: config.sttModel,
          languageCode: config.language,
        });
      } catch (err) {
        // A too-short/empty clip (Scribe needs ~100ms) is not a server failure —
        // the customer effectively said nothing. Keep the call alive and let the
        // agent ask them to repeat, in-language. Real STT failures still throw.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/too[_\s-]?short|audio_too_short/i.test(msg)) throw err;
        transcribedText = null;
      }
      // Nothing intelligible → let the agent ask them to repeat, in-language.
      userText =
        (transcribedText ?? "").trim() ||
        "(the customer's audio was inaudible or too short to make out — ask them politely to repeat)";
    } else {
      return NextResponse.json(
        { error: "Unknown input type." },
        { status: 400 },
      );
    }

    // 2–4. Run the agent on a COPY of the state (client remains source of truth).
    const orderCopy = clone(order);
    const customerCopy = clone(customer);

    const result = await runAgentTurn({
      config,
      rules: rules ?? [],
      order: orderCopy,
      customer: customerCopy,
      catalog,
      transcript: transcript ?? [],
      userText,
    });

    // 5. Speak the response.
    let audioBase64: string | null = null;
    try {
      audioBase64 = await synthesize({
        text: result.say,
        voiceId: config.voiceId,
        ttsModel: config.ttsModel,
        languageCode: config.language,
      });
    } catch (err) {
      // TTS failed — still return the turn so the transcript/order update.
      console.error("[turn] TTS failed:", err);
    }

    const payload: TurnResponse = {
      say: result.say,
      audioBase64,
      transcribedText,
      rulesApplied: result.rulesApplied,
      reasoning: result.reasoning,
      customerIntent: result.customerIntent,
      outcome: result.outcome,
      order: result.order,
      customer: result.customer,
      changes: result.changes,
      tools: result.tools,
      latencyMs: Date.now() - started,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[turn] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
