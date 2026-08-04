// Shared domain types (spec §5). Kept framework-agnostic so both the route
// handlers and the React components can import them.

export type Persona = { id: string; name: string; role: string };

// Which language a panel member speaks a given turn in. Real BCS boards switch
// between English and Bengali, so each interviewer turn carries its own tag and
// the TTS layer reads it in that language.
export type SpeechLanguage = "en" | "bn";

// Which kind of exam a session simulates. "bcs" is the original 3-member oral
// board; "ielts" is a single-examiner IELTS Speaking test (Part 1/2/3).
export type ExamMode = "bcs" | "ielts";

export type Category =
  | "self"
  | "cadre_motivation"
  | "family_hobbies"
  | "hometown"
  | "current_affairs"
  | "history"
  // Constitution, state structure, and administrative/legal procedure
  // (Section 144, mobile courts, Act vs Rule vs Ordinance, pre/post-audit).
  // Recurs heavily for Admin/Police/Judiciary/Audit first-choices.
  | "constitution_law"
  | "academic"
  // Literature, culture, and general knowledge — a board's breadth check and
  // tension-breaker (Tagore/Nazrul, classic films, famous speeches).
  | "general_knowledge"
  | "ethics"
  // IELTS Speaking parts (used only when mode === "ielts")
  | "ielts_part1"
  | "ielts_part2"
  | "ielts_part3";

export type PlannedQuestion = {
  id: number;
  personaId: string;
  category: Category;
  text: string;
  language: SpeechLanguage;
};

export type Plan = { panel: Persona[]; questions: PlannedQuestion[] };

export type TranscriptTurn =
  | {
      kind: "question" | "followup";
      speakerId: string;
      speakerName: string;
      speakerRole: string;
      text: string;
      language: SpeechLanguage;
      createdAt: string;
    }
  | { kind: "answer"; text: string; createdAt: string };

// IELTS band breakdown (0-9, half-bands allowed). Only present on IELTS sessions.
// Pronunciation is included for completeness but flagged as not truly assessable
// in a text-only format inside its note.
export type IeltsBands = {
  overall: number;
  criteria: { name: string; band: number; note: string }[];
};

export type Feedback = {
  overall: string;
  strengths: string[];
  improvements: string[];
  categoryNotes: { category: string; note: string }[];
  closingAdvice: string;
  bands?: IeltsBands;
};

export type SessionStatus = "in_progress" | "completed" | "abandoned";

// One row per LLM call, so per-session cost is auditable (spec §11).
export type TokenUsageEntry = {
  call: "plan" | "followup" | "feedback";
  model: string;
  inputTokens: number;
  outputTokens: number;
  at: string;
};

export type CandidateProfile = {
  mode: ExamMode;
  candidateName: string;
  cadre: string;
  academicBackground: string;
  hometown: string;
  notes?: string;
};

export type Session = {
  id: string;
  mode: ExamMode;
  candidateName: string;
  cadre: string;
  academicBackground: string;
  hometown: string;
  notes?: string | null;
  plan: Plan;
  transcript: TranscriptTurn[];
  currentQuestionIndex: number;
  followupsUsedOnCurrent: number;
  startedAt: string;
  endedAt?: string | null;
  timeLimitSeconds: number;
  status: SessionStatus;
  feedback?: Feedback | null;
  tokenUsage: TokenUsageEntry[];
};
