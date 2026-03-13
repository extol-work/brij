CREATE TYPE "public"."attendance_status" AS ENUM('coming', 'checked_in');--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "status" "attendance_status" DEFAULT 'coming' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "rsvp_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Migrate existing rows: they were check-ins, so mark as checked_in and copy timestamp
UPDATE "attendances" SET "status" = 'checked_in', "rsvp_at" = "checked_in_at";--> statement-breakpoint
-- Make checked_in_at nullable (it's null until someone actually checks in)
ALTER TABLE "attendances" ALTER COLUMN "checked_in_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendances" ALTER COLUMN "checked_in_at" DROP DEFAULT;--> statement-breakpoint
-- Drop the old checked_out column (replaced by status)
ALTER TABLE "attendances" DROP COLUMN "checked_out";
