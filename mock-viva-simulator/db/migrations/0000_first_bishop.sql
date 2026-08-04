CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_name" text NOT NULL,
	"cadre" text NOT NULL,
	"academic_background" text NOT NULL,
	"hometown" text NOT NULL,
	"notes" text,
	"plan" jsonb NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"followups_used_on_current" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"time_limit_seconds" integer DEFAULT 1800 NOT NULL,
	"status" "session_status" DEFAULT 'in_progress' NOT NULL,
	"feedback" jsonb,
	"token_usage" jsonb DEFAULT '[]'::jsonb NOT NULL
);
