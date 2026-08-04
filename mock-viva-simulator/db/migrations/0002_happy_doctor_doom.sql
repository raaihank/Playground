CREATE TYPE "public"."exam_mode" AS ENUM('bcs', 'ielts');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mode" "exam_mode" DEFAULT 'bcs' NOT NULL;