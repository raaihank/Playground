// Supported languages for the confirmation call.
//
// SOURCE: ElevenLabs docs (docs/elevenlabs.md quickstart) + the ElevenLabs
//   language-support pages for the models this app uses:
//     - TTS: `eleven_v3`   — https://elevenlabs.io/docs (Models → Eleven v3, 70+ languages)
//     - STT: `scribe_v1`   — https://elevenlabs.io/docs (Speech to Text → Scribe, 99 languages)
// CHECKED: 2026-07-11.
//
// RULE (from the build spec): a language ships here ONLY if BOTH the STT model
// AND the TTS model support it. A language that transcribes but cannot be
// spoken does not belong in this list. The three below are covered by both
// scribe_v1 and eleven_v3.
//
// ⚠️ NOT A SUBSTITUTE FOR EARS. Docs claim support that can still sound robotic.
// Before trusting any language here for a demo, synthesize one sentence in it
// (npm run dev → /setup shows a "Preview voice" affordance) and have a native
// speaker listen. This app was built targeting Bengali (the whole spec demo is
// in Bangla); en/hi are included as reasonable, doc-backed companions but have
// NOT been ear-verified by the author — verify before you rely on them.

export interface Language {
  code: string; // ISO 639-1, passed to STT/TTS languageCode
  label: string; // shown in the dropdown
  native: string; // endonym
}

export const LANGUAGES: readonly Language[] = [
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "en", label: "English", native: "English" },
] as const;

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
