// Speech-to-text via ElevenLabs Scribe. Real transcription — no offline mode.
// [VENDOR DOCS] docs/elevenlabs.md + Scribe API. Model id comes from config
// (scribe_v1); languageCode nudges the model toward the configured language.

import { elevenlabs } from "./client";

export async function transcribe(args: {
  audio: Buffer;
  mimeType: string;
  sttModel: string;
  languageCode: string;
}): Promise<string> {
  const { audio, mimeType, sttModel, languageCode } = args;

  // The SDK wants an Uploadable; a File with a matching extension is safest.
  const ext = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp4") || mimeType.includes("mp4a")
      ? "mp4"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";
  const file = new File([new Uint8Array(audio)], `turn.${ext}`, {
    type: mimeType || "audio/webm",
  });

  const result = await elevenlabs().speechToText.convert({
    file,
    modelId: sttModel as "scribe_v1" | "scribe_v2",
    languageCode,
    tagAudioEvents: false,
  });

  // Single-channel response carries `.text`. Guard the union shape.
  const text = (result as { text?: string }).text;
  return typeof text === "string" ? text.trim() : "";
}
