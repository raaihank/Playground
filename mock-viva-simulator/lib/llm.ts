// LLM client wrapper (spec §6, §7, §11). Server-only — the API key must
// never reach the client bundle.
//
// Provider/model are selected with env vars (default: OpenAI):
//   LLM_PROVIDER   "openai" | "anthropic"   (default "openai")
//   OPENAI_MODEL   overrides the OpenAI model for every call (optional)
//   ANTHROPIC_MODEL overrides the Anthropic model for every call (optional)
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  planSystemFor,
  planUserPromptFor,
  followupSystemFor,
  followupUserPrompt,
  feedbackSystemFor,
  feedbackUserPrompt,
} from "@/lib/prompts";
import type {
  CandidateProfile,
  ExamMode,
  Plan,
  Feedback,
  TranscriptTurn,
  TokenUsageEntry,
  SpeechLanguage,
} from "@/lib/types";

type Provider = "openai" | "anthropic";
type CallType = TokenUsageEntry["call"]; // "plan" | "followup" | "feedback"

function provider(): Provider {
  const raw = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (raw !== "openai" && raw !== "anthropic") {
    throw new Error(
      `LLM_PROVIDER must be "openai" or "anthropic" (got "${raw}"). See .env.example.`,
    );
  }
  return raw;
}

// Per-call model choice (spec §7.4). These are the current-generation equivalents
// of the spec's hypothesis — confirm with the side-by-side comparison in §7.4/§15.
const MODELS_ANTHROPIC = {
  plan: "claude-sonnet-4-6", // highest-leverage call for realism
  followup: "claude-sonnet-4-6", // short, called up to ~10x/session
  feedback: "claude-sonnet-4-6", // writes well, one call/session
} as const;

const MODELS_OPENAI = {
  plan: "gpt-5.4", // highest-leverage call for realism
  followup: "gpt-5.4", // short, called up to ~10x/session
  feedback: "gpt-5.4", // writes well, one call/session
} as const;

function modelFor(call: CallType): string {
  if (provider() === "openai") {
    return process.env.OPENAI_MODEL ?? MODELS_OPENAI[call];
  }
  return process.env.ANTHROPIC_MODEL ?? MODELS_ANTHROPIC[call];
}

// Explicit max_tokens per call type (spec §11).
// Bengali in Bangla script costs ~3-4x the tokens of equivalent English text, so
// the feedback budget is raised well above the spec's English-only 900 to avoid
// truncating the JSON mid-object (which surfaces as a parseJson failure).
// IELTS plans run 8-9 questions including a full multi-bullet Part 2 cue card, so
// the plan budget is well above what the 7-8 BCS questions need, to avoid
// truncating the JSON mid-cue-card (which surfaces as a parseJson failure).
const MAX_TOKENS = { plan: 1800, followup: 300, feedback: 3000 } as const;

const globalForLlm = globalThis as unknown as {
  _bcsAnthropic?: Anthropic;
  _bcsOpenai?: OpenAI;
};

function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. See .env.example.");
  }
  globalForLlm._bcsAnthropic ??= new Anthropic();
  return globalForLlm._bcsAnthropic;
}

function openaiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. See .env.example.");
  }
  globalForLlm._bcsOpenai ??= new OpenAI();
  return globalForLlm._bcsOpenai;
}

// Single completion entry point — branches on the configured provider and
// returns the raw text plus a normalized usage entry, so callers don't care
// which SDK answered.
async function complete(
  call: CallType,
  system: string,
  userPrompt: string,
): Promise<{ text: string; usage: TokenUsageEntry }> {
  const model = modelFor(call);
  const at = new Date().toISOString();

  if (provider() === "openai") {
    const completion = await openaiClient().chat.completions.create({
      model,
      max_completion_tokens: MAX_TOKENS[call],
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    return {
      text: completion.choices[0]?.message?.content ?? "",
      usage: {
        call,
        model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        at,
      },
    };
  }

  const message = await anthropicClient().messages.create({
    model,
    max_tokens: MAX_TOKENS[call],
    cache_control: { type: "ephemeral" },
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    usage: {
      call,
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      at,
    },
  };
}

// Speech-to-text for answer dictation. Browsers that can't run the Web Speech
// API (Brave, and third-party browsers on iOS) record audio client-side and post
// it here; we transcribe with OpenAI regardless of the configured LLM provider,
// so OPENAI_API_KEY must be set for the voice fallback to work even when
// LLM_PROVIDER=anthropic. English-only, matching the native dictation path.
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";

export async function transcribeAudio(
  audio: File,
  language = "en",
): Promise<string> {
  const text = await openaiClient().audio.transcriptions.create({
    file: audio,
    model: TRANSCRIBE_MODEL,
    language,
    response_format: "text",
  });
  return typeof text === "string" ? text.trim() : "";
}

// The prompts ask for raw JSON, but be defensive about stray fences/prose.
function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: grab the first {...} span.
    const span = candidate.match(/\{[\s\S]*\}/);
    if (span) return JSON.parse(span[0]) as T;
    throw new Error("Model did not return valid JSON.");
  }
}

export type LlmResult<T> = { data: T; usage: TokenUsageEntry };

// The model is asked for "en"/"bn", but never trust it — coerce anything else to
// English so the TTS layer always gets a valid tag.
function asLanguage(value: unknown): SpeechLanguage {
  return value === "bn" ? "bn" : "en";
}

export async function generatePlan(
  profile: CandidateProfile,
): Promise<LlmResult<Plan>> {
  const { text, usage } = await complete(
    "plan",
    planSystemFor(profile.mode),
    planUserPromptFor(profile.mode, profile),
  );
  const plan = parseJson<Plan>(text);
  for (const q of plan.questions) q.language = asLanguage(q.language);
  return { data: plan, usage };
}

export type FollowupDecision =
  | { action: "followup"; speaker: string; text: string; language: SpeechLanguage }
  | { action: "advance" };

export async function decideFollowup(args: {
  mode: ExamMode;
  personaId: string;
  questionText: string;
  answerText: string;
}): Promise<LlmResult<FollowupDecision>> {
  const { text, usage } = await complete(
    "followup",
    followupSystemFor(args.mode),
    followupUserPrompt(args),
  );
  const decision = parseJson<FollowupDecision>(text);
  if (decision.action === "followup") {
    decision.language = asLanguage(decision.language);
  }
  return { data: decision, usage };
}

export async function generateFeedback(
  mode: ExamMode,
  transcript: TranscriptTurn[],
): Promise<LlmResult<Feedback>> {
  const { text, usage } = await complete(
    "feedback",
    feedbackSystemFor(mode),
    feedbackUserPrompt(transcript),
  );
  return { data: parseJson<Feedback>(text), usage };
}
