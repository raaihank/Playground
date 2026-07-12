// The one place vendor SDKs are constructed. Keys resolved here, loudly.
//
// NOTE on the Anthropic key: the repo-root .env spells it ANTROPIC_API_KEY
// (missing the H). We accept both that and the correct ANTHROPIC_API_KEY so the
// demo runs against the existing .env without editing it.

import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

function requireKey(names: string[], where: string): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(
    `Missing API key. Set ${names[0]} (${where}). See .env.example. This app fails loudly on a missing key — there is no offline mode.`,
  );
}

let _anthropic: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = requireKey(
    ["ANTHROPIC_API_KEY", "ANTROPIC_API_KEY"],
    "https://console.anthropic.com/settings/keys",
  );
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

let _eleven: ElevenLabsClient | null = null;
export function elevenlabs(): ElevenLabsClient {
  if (_eleven) return _eleven;
  const apiKey = requireKey(
    ["ELEVENLABS_API_KEY"],
    "https://elevenlabs.io/app/settings/api-keys",
  );
  _eleven = new ElevenLabsClient({ apiKey });
  return _eleven;
}
