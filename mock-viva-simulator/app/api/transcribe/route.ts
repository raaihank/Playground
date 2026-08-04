// POST: transcribe a recorded answer to text. Universal speech-to-text fallback
// for browsers where the native Web Speech API can't run (Brave; third-party
// browsers on iOS). The client records audio with MediaRecorder and posts it
// here as multipart/form-data under the "audio" field.
//
// Transcription always goes through OpenAI (see lib/llm.ts), so OPENAI_API_KEY
// must be set for voice input to work in those browsers even when
// LLM_PROVIDER=anthropic.
import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/llm";

// OpenAI caps upload size at 25 MB; reject earlier so a stray large blob doesn't
// burn an API call.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio is too large." }, { status: 413 });
  }

  try {
    const text = await transcribeAudio(audio);
    return NextResponse.json({ text });
  } catch (err) {
    // Most likely a missing OPENAI_API_KEY or an upstream failure — log the
    // detail server-side and keep the client message generic.
    console.error("Transcription failed:", err);
    return NextResponse.json(
      { error: "Couldn't transcribe the recording." },
      { status: 502 },
    );
  }
}
