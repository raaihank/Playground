// Synthesize one sentence so a human can LISTEN before shipping a language.
// The build spec is emphatic: docs claim support that turns out robotic; a
// native speaker's ear is the only real test.

import { NextResponse } from "next/server";

import { synthesize } from "@/lib/providers/tts";
import type { Config } from "@/lib/types";

export const runtime = "nodejs";

// A neutral confirmation sentence per seeded language.
const SAMPLE: Record<string, string> = {
  bn: "আসসালামু আলাইকুম, আপনার অর্ডারটি নিশ্চিত করতে ফোন করেছি — মোট এক হাজার দুইশত নব্বই টাকা।",
  hi: "नमस्ते, मैं आपका ऑर्डर पक्का करने के लिए कॉल कर रहा हूँ — कुल बारह सौ नब्बे रुपये।",
  en: "Hello, I'm calling to confirm your order — the total comes to twelve hundred ninety.",
};

export async function POST(req: Request) {
  try {
    const { config, text } = (await req.json()) as {
      config: Config;
      text?: string;
    };
    const sample = text?.trim() || SAMPLE[config.language] || SAMPLE.en;
    const audioBase64 = await synthesize({
      text: sample,
      voiceId: config.voiceId,
      ttsModel: config.ttsModel,
      languageCode: config.language,
    });
    return NextResponse.json({ audioBase64, text: sample });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
