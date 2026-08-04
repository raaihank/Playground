// Drizzle schema (spec §5/§10). JSONB-heavy for MVP speed: query-relevant fields
// are plain columns; plan/transcript/feedback/tokenUsage are JSONB blobs.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import type {
  ExamMode,
  Plan,
  TranscriptTurn,
  Feedback,
  TokenUsageEntry,
} from "@/lib/types";

export const sessionStatus = pgEnum("session_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

export const examMode = pgEnum("exam_mode", ["bcs", "ielts"]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Which exam this session simulates. Existing rows default to "bcs".
  mode: examMode("mode").notNull().default("bcs"),
  candidateName: text("candidate_name").notNull(),
  cadre: text("cadre").notNull(),
  academicBackground: text("academic_background").notNull(),
  hometown: text("hometown").notNull(),
  notes: text("notes"),
  plan: jsonb("plan").$type<Plan>().notNull(),
  transcript: jsonb("transcript")
    .$type<TranscriptTurn[]>()
    .notNull()
    .default([]),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  followupsUsedOnCurrent: integer("followups_used_on_current")
    .notNull()
    .default(0),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  timeLimitSeconds: integer("time_limit_seconds").notNull().default(900),
  status: sessionStatus("status").notNull().default("in_progress"),
  feedback: jsonb("feedback").$type<Feedback>(),
  tokenUsage: jsonb("token_usage")
    .$type<TokenUsageEntry[]>()
    .notNull()
    .default([]),
});

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
