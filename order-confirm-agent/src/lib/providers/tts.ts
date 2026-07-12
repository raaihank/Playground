// Text-to-speech via ElevenLabs. Real audio — no offline mode.
// [VENDOR DOCS] docs/elevenlabs.md: textToSpeech.convert(voiceId, {...}),
// model eleven_v3, outputFormat mp3_44100_128, voiceId from docs/elevenlab-voice-id.txt.

import { elevenlabs } from "./client";

async function collect(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  if (typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } else {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// Returns an mp3 as base64 (data-URI-ready for an <audio> element).
export async function synthesize(args: {
  text: string;
  voiceId: string;
  ttsModel: string;
  languageCode: string;
}): Promise<string> {
  const { text, voiceId, ttsModel, languageCode } = args;

  const audio = await elevenlabs().textToSpeech.convert(voiceId, {
    text,
    modelId: ttsModel,
    outputFormat: "mp3_44100_128",
    languageCode,
  });

  const buf = await collect(audio);
  return buf.toString("base64");
}
