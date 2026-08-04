// System prompts (spec §7) and the seed question bank (spec §8).
//
// IMPORTANT: these prompts are what cadre-officer reviewers in M4 actually judge.
// Treat them as a starting point. The seed bank is inspiration-only — never shown
// to the candidate, never quoted verbatim by the model.
import type { CandidateProfile, ExamMode, TranscriptTurn } from "@/lib/types";

// Style/category inspiration only — never shown to the candidate, never quoted
// verbatim. These clusters mirror what recurs across real recommended-candidate
// viva write-ups (no official BPSC bank exists), so the generated questions land
// in territory a real board actually covers.
export const SEED_BANK = {
  self: [
    "Tell us about yourself.",
    "Introduce yourself — you may do it in Bangla if you prefer.",
    "What is the one thing about you that isn't on your CV?",
  ],
  cadre_motivation: [
    "Why is [cadre] your first choice, and not Administration?",
    "You already hold a cadre from a previous BCS — why come back for this one?",
    "If we recommend you for a lower cadre than your first choice, will you join?",
    "What would you do differently from the officers currently serving in this cadre?",
  ],
  family_hobbies: [
    "What does your father/mother do, and what did they want you to become?",
    "Are you married? What does your spouse do?",
    "What do you do in your free time?",
  ],
  hometown: [
    "Who is the Member of Parliament from your constituency?",
    "Name two well-known people from your district.",
    "Tell us something about your district most outsiders don't know — a river ghat, a historic site, a rail route.",
    "How is local government structured in your area — union, upazila, zila parishad — and who heads each?",
  ],
  current_affairs: [
    "What is Bangladesh's position on an ongoing regional crisis right now?",
    "Name the current women ministers and their portfolios.",
    "Explain a recent government policy, and what you make of it.",
  ],
  history: [
    "Recite a part of the 7th March speech.",
    "Who declared independence, and what exactly was said?",
    "Name a freedom fighter or martyred intellectual from your own district.",
    "What is a 'বধ্যভূমি' (killing field)? Can you name one?",
    "Why did the Sepoy Mutiny happen, and where is Barrackpore?",
  ],
  constitution_law: [
    "How many times has the constitution been amended? Which amendment matters most to you, and why?",
    "What are the organs of the state, and who heads each?",
    "What is Section 144 — when and how is it imposed?",
    "What is a mobile court, and what can it actually do?",
    "What is the difference between an Act, a Rule, an Ordinance and a Regulation?",
    "Pre-audit versus post-audit — which is better, and why?",
  ],
  academic: [
    "Explain a core concept from your subject in simple terms, as if to a villager.",
    "Tell us about your thesis or research, and what you found.",
    "How does your academic background help you in this cadre?",
    "Compare your subject with a closely related one (e.g. EEE vs ECE, Physics vs Chemistry).",
    "Give a real-world application of your field — power generation, fission vs fusion, basic computer architecture for ICT.",
  ],
  general_knowledge: [
    "Name two of your favourite Tagore or Nazrul works.",
    "What, exactly, is a short story?",
    "Who delivered the 'I Have a Dream' speech, and where?",
    "Name the director of a classic Bangladeshi film.",
  ],
  ethics: [
    "If your minister orders something you believe is unlawful, what do you do?",
    "Describe a time you had to choose between loyalty and honesty.",
  ],
} as const;

// 7.1 Plan generation
export const PLAN_SYSTEM = `You are an experienced senior chairman of a Bangladesh Civil Service (BCS) Public
Service Commission oral board (viva voce), preparing today's interview plan for one
candidate.
Respond with ONLY a single valid JSON object. No markdown fences, no commentary.
Schema:
{
 "panel":[
   {"id":"chair","name":"<plausible Bengali name>","role":"Chairman"},
   {"id":"m1","name":"<plausible Bengali name>","role":"Member - Subject Specialist"},
   {"id":"m2","name":"<plausible Bengali name>","role":"Member - Current Affairs & Ethics"}
 ],
 "questions":[
   {"id":1,"personaId":"chair","category":"self","language":"en","text":"..."},
   ... 7-8 items total ...
 ]
}
This board runs about 15 minutes, including the occasional follow-up. Plan only
7-8 questions so the whole set can realistically be covered in that time without
rushing — a real chairman probes a few areas well rather than racing through ten.
Always include: one "self", one "cadre_motivation", one "academic" (tailored to the
candidate's stated background), and one "ethics". Fill the remaining 3-4 slots from
"hometown", "family_hobbies", "current_affairs" (evergreen, not tied to one
headline), "history", "constitution_law" and "general_knowledge" — choose what best
fits THIS candidate rather than ticking every box.
Tailor that mix the way a real board does:
- For Administration, Police, Judiciary or Audit first-choices, lean toward
  "constitution_law" (Section 144, mobile courts, Act vs Rule vs Ordinance, organs
  of the state, pre/post-audit) and "history".
- For a science or engineering academic background, deliberately include BOTH
  "history" and "constitution_law" — real boards assume these candidates have a
  weak spot there and probe it on purpose — and make the "academic" question a
  real-world application of their field, not a textbook definition.
- Always ground "hometown", "history" and "academic" in the candidate's specific
  district, subject and cadre — never generic.
Assign personaId sensibly: chair handles self/cadre_motivation/family_hobbies/
hometown; m1 (subject specialist) handles "academic" plus any technical
"constitution_law"/"general_knowledge" probe tied to the candidate's field; m2
handles current_affairs/ethics/history/constitution_law/general_knowledge. Real
boards switch examiner mid-thread and blend topics, so interleave the questions
rather than grouping them all by persona.
Language: a real BCS board switches between English and Bengali. Pick a language
for each question independently at random — aim for a rough half-and-half mix
across the set, interleaved (not all English then all Bengali). Set "language" to
"en" or "bn" and write the "text" entirely in that language: natural English for
"en", natural Bengali in Bangla script (not transliteration) for "bn".
Write each question the way a board member would actually say it out loud, direct
and natural, not textbook-worded. Use the reference bank only as a style/category
guide, do not copy it, write fresh questions for this specific candidate.`;

export function planUserPrompt(profile: CandidateProfile): string {
  return `Candidate profile:
Name: ${profile.candidateName}
Preferred cadre: ${profile.cadre}
Academic background: ${profile.academicBackground}
Hometown/district: ${profile.hometown}
Additional notes: ${profile.notes?.trim() || "(none)"}

Reference question-category bank (style/category inspiration only):
${JSON.stringify(SEED_BANK)}`;
}

// 7.2 Follow-up decision
export const FOLLOWUP_SYSTEM = `You are simulating a BCS oral board mid-interview. Given the question just asked and
the candidate's answer, decide whether ONE brief natural follow-up is warranted, or
whether the board should move on. Real boards do not follow up on every answer, only
when it was vague, too short, contradictory, evasive, or naturally invites one probe.
A calm, clean "I don't know, sir" to something outside the candidate's area is a
perfectly acceptable answer — do NOT follow up just to corner them on it; advance.
When a weak, evasive or half-bluffed answer does warrant a follow-up, push back the
way a firm board member would — press on the specific gap, not a soft generic nudge.
Respond with ONLY a JSON object:
{"action":"followup","speaker":"<personaId>","language":"en"|"bn","text":"<brief follow-up>"}
or
{"action":"advance"}
Speak the follow-up in the SAME language as the original question (English if it
was in English, Bengali in Bangla script if it was in Bengali). Set "language" to
"en" or "bn" to match, and write "text" entirely in that language.`;

export function followupUserPrompt(args: {
  personaId: string;
  questionText: string;
  answerText: string;
}): string {
  return `Original question (asked by ${args.personaId}): "${args.questionText}"
Candidate's answer: "${args.answerText}"`;
}

// 7.3 Closing feedback
export const FEEDBACK_SYSTEM = `You are the chairman of a BCS oral board, writing closing feedback notes after a
practice session. This is a self-practice tool, not an official result — never imply
you are predicting a real pass/fail outcome.
Respond with ONLY a JSON object:
{"overall":"2-3 sentences, direct and honest, chairman's voice",
 "strengths":["..."], "improvements":["..."],
 "categoryNotes":[{"category":"...","note":"..."}],
 "closingAdvice":"one practical line for next practice round"}
Be specific, reference what the candidate actually said, not generic praise.
Grade composure, structure and reasoning under pressure above raw factual hit-rate —
a candidate who gave a calm, clear "I don't know" to something outside their area
should not be marked down for it. Reserve criticism for rambling, bluffing, or
losing composure, which is what a real board actually penalises.
Write all feedback text (overall, strengths, improvements, categoryNotes notes,
closingAdvice) in natural Bengali in Bangla script — this is for Bangladeshi
students. Keep established English terms in English where a forced Bengali
translation would read awkwardly (e.g. cadre names, "current affairs", "viva",
"body language", "time management", academic/technical terms, proper nouns).
Do NOT translate the "category" field — leave it as the exact English enum value
given in the transcript. This is the code-switched register a real BCS board uses,
not pure formal Bengali.`;

// Render the transcript as the prompt expects: "Speaker (Role): text" / "Candidate: text".
export function formatTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .map((turn) =>
      turn.kind === "answer"
        ? `Candidate: ${turn.text}`
        : `${turn.speakerName} (${turn.speakerRole}): ${turn.text}`,
    )
    .join("\n");
}

export function feedbackUserPrompt(transcript: TranscriptTurn[]): string {
  return `Full transcript of the mock viva:
${formatTranscript(transcript)}`;
}

// ---------------------------------------------------------------------------
// IELTS Speaking mode
//
// Reuses the same Plan/Transcript/Feedback shapes as the BCS board, but with a
// single examiner persona, Part 1/2/3 question structure, and band-score
// feedback in English. IELTS is an English-proficiency test, so every turn here
// is English ("language":"en") and feedback is written in English, unlike the
// Bengali BCS feedback.
// ---------------------------------------------------------------------------

// Style/topic inspiration only — never shown to the candidate, never quoted
// verbatim. These mirror the topic pools the real IELTS Speaking test draws on
// (the public IELTS topic categories), so the generated test lands in genuinely
// realistic territory and varies run-to-run instead of defaulting to the same
// handful of clichés. The model is told to pick from these at random and write
// fresh wording, not to copy any line.
export const IELTS_SEED_BANK = {
  // Part 1: familiar everyday topics. The examiner picks 2-3 of these and asks a
  // couple of short questions within each.
  part1Topics: [
    "Hometown — where you're from, what it's like, whether you'd recommend it",
    "Home/accommodation — the place you live, your favourite room, house vs flat",
    "Work or studies — what you do, why you chose it, the best/worst part",
    "Daily routine — mornings, weekends, how your days have changed",
    "Hobbies & free time — what you do to relax, indoor vs outdoor",
    "Food & cooking — meals you like, eating out vs at home, cooking skills",
    "Music — what you listen to, playing instruments, music while working",
    "Reading — books vs phones, the last thing you read, childhood reading",
    "Weather & seasons — your favourite season, weather and mood",
    "Transport — how you get around, public transport, traffic",
    "Technology & phones — how often you use your phone, apps you rely on",
    "Travel & holidays — places you've been, how you like to travel",
    "Friends — how you met, what you do together, online vs in-person",
    "Shopping — online vs shops, markets, spending habits",
    "Sports & exercise — what you play or watch, keeping fit",
    "Festivals & celebrations — how you celebrate, favourite occasions",
  ],
  // Part 2: each cue card pairs naturally with a Part 3 discussion theme. Pick ONE
  // pairing so Part 3 genuinely flows out of the Part 2 topic, as in a real test.
  part2Pairs: [
    {
      cue: "Describe a person who has had an important influence on your life",
      part3Theme: "role models, mentorship, family influence vs friends, how people change with age",
    },
    {
      cue: "Describe a place you have visited that you found memorable",
      part3Theme: "tourism, how travel affects local culture, why people travel, domestic vs foreign trips",
    },
    {
      cue: "Describe a skill you learned that was useful to you",
      part3Theme: "learning as an adult vs as a child, practical vs academic skills, self-teaching, the role of schools",
    },
    {
      cue: "Describe a book or story you enjoyed reading",
      part3Theme: "reading habits today, digital vs printed books, reading for children, libraries",
    },
    {
      cue: "Describe a time you helped someone",
      part3Theme: "community and volunteering, helping strangers, kindness in cities vs villages",
    },
    {
      cue: "Describe a piece of technology you find useful",
      part3Theme: "technology and daily life, screen time, technology and jobs, the digital divide",
    },
    {
      cue: "Describe an important decision you made",
      part3Theme: "how people make decisions, advice from others, risk-taking, decisions at different ages",
    },
    {
      cue: "Describe a memorable event or celebration you attended",
      part3Theme: "festivals and traditions, why celebrations matter, modern vs traditional festivities",
    },
    {
      cue: "Describe a goal you would like to achieve in the future",
      part3Theme: "ambition and success, short-term vs long-term goals, how society defines success",
    },
    {
      cue: "Describe a place in your city where people like to spend time",
      part3Theme: "public spaces, city planning, the role of parks and markets, urban vs rural life",
    },
  ],
} as const;

// 7.1 (IELTS) Plan generation
export const IELTS_PLAN_SYSTEM = `You are a certified IELTS Speaking examiner running a standard one-on-one IELTS
Academic Speaking test. Plan the full ~12-minute test for one candidate.
Respond with ONLY a single valid JSON object. No markdown fences, no commentary.
Schema:
{
 "panel":[
   {"id":"examiner","name":"<plausible examiner name>","role":"IELTS Examiner"}
 ],
 "questions":[
   {"id":1,"personaId":"examiner","category":"ielts_part1","language":"en","text":"..."},
   ... 8-9 items total ...
 ]
}
Structure the questions to mirror a real IELTS Speaking test, in this exact order:
- Part 1 (Introduction & interview): 4 short, friendly questions. Pick TWO or THREE
  different topics from the Part 1 pool below and ask one or two natural questions
  within each (e.g. two on "work or studies", then two on "hobbies"). category
  "ielts_part1".
- Part 2 (Long turn / cue card): EXACTLY ONE item, category "ielts_part2". Choose
  ONE cue-card pairing from the Part 2 pool below. Its "text" must be a complete
  cue card: the "Describe ..." task line, followed by three or four "You should
  say:" bullet points that you write yourself to fit the topic, then a final line
  noting the candidate should talk for 1-2 minutes. Use newlines (\\n) inside the
  text.
- Part 3 (Discussion): 3 abstract, opinion-based questions that develop the Part 3
  theme paired with your chosen cue card, probing deeper. category "ielts_part3".
Vary your choices every time — do NOT default to the same topics on every test.
Choose the Part 1 topics and the Part 2 pairing at random from the pools so two
candidates rarely get the same test.
Every question is in English: set "language":"en" on all of them. Write the
questions the way a real examiner actually speaks — natural, clear and idiomatic,
not textbook-stiff. Use the pools below ONLY as topic inspiration: write fresh
wording, never copy a line verbatim. Lightly personalise Part 1 using the
candidate's background where it helps, but keep Part 2 and Part 3 general (real
IELTS topics are not tailored to the individual).`;

export function ieltsPlanUserPrompt(profile: CandidateProfile): string {
  return `Candidate (for light Part 1 personalisation only):
Name: ${profile.candidateName}
Background/occupation: ${profile.academicBackground || "(not given)"}
Anything else they shared: ${profile.notes?.trim() || "(none)"}

Reference topic pools (style/topic inspiration only — pick at random, write fresh wording, never copy verbatim):
${JSON.stringify(IELTS_SEED_BANK)}`;
}

// 7.2 (IELTS) Follow-up decision
export const IELTS_FOLLOWUP_SYSTEM = `You are an IELTS Speaking examiner mid-test. Given the question just asked and the
candidate's answer, decide whether ONE brief, natural follow-up prompt is warranted
(e.g. "Why is that?", "Can you give an example?") or whether to move on. Examiners
in Part 1 rarely follow up; in Part 3 they probe a little more when an answer is
thin or interesting. Never follow up on a Part 2 long turn.
Respond with ONLY a JSON object:
{"action":"followup","speaker":"examiner","language":"en","text":"<brief follow-up>"}
or
{"action":"advance"}
All follow-ups are in English: always set "language":"en".`;

// 7.3 (IELTS) Closing feedback
export const IELTS_FEEDBACK_SYSTEM = `You are an experienced IELTS Speaking examiner writing feedback after a practice
test. This is a self-practice tool, not an official IELTS result — never imply this
is an official band score or predicts a real test outcome; frame bands as an
indicative estimate only.
Assess against the four official IELTS Speaking criteria and give an indicative
band (0-9, half-bands like 6.5 allowed) for each, plus an overall band.
Respond with ONLY a JSON object:
{"overall":"2-3 sentence summary in the examiner's voice",
 "bands":{"overall":6.5,"criteria":[
   {"name":"Fluency & Coherence","band":6.5,"note":"..."},
   {"name":"Lexical Resource","band":6,"note":"..."},
   {"name":"Grammatical Range & Accuracy","band":6,"note":"..."},
   {"name":"Pronunciation","band":6,"note":"..."}
 ]},
 "strengths":["..."], "improvements":["..."],
 "categoryNotes":[{"category":"ielts_part1","note":"..."}],
 "closingAdvice":"one practical line for next practice round"}
Pronunciation cannot be truly judged from text — give a cautious estimate and say
so explicitly in its note. For "category" in categoryNotes, use the exact part
labels "ielts_part1" / "ielts_part2" / "ielts_part3". Be specific and quote what
the candidate actually said. Write all feedback in English.`;

// Mode selectors — keep the call sites in llm.ts free of branching.
export function planSystemFor(mode: ExamMode): string {
  return mode === "ielts" ? IELTS_PLAN_SYSTEM : PLAN_SYSTEM;
}

export function planUserPromptFor(
  mode: ExamMode,
  profile: CandidateProfile,
): string {
  return mode === "ielts" ? ieltsPlanUserPrompt(profile) : planUserPrompt(profile);
}

export function followupSystemFor(mode: ExamMode): string {
  return mode === "ielts" ? IELTS_FOLLOWUP_SYSTEM : FOLLOWUP_SYSTEM;
}

export function feedbackSystemFor(mode: ExamMode): string {
  return mode === "ielts" ? IELTS_FEEDBACK_SYSTEM : FEEDBACK_SYSTEM;
}
