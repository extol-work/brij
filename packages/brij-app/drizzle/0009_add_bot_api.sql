-- Bot API schema: tables + columns for Discord/Telegram bot integration
-- Note: These were applied directly to production DB during dashboard fix session.
-- This migration file documents the changes for migration history consistency.

-- New columns on groups for platform linking
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "cover_image_url" text;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "platform_guild_id" text;

-- New column on activities for platform event dedup
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "platform_event_id" text;

-- New columns on attendances for platform identity + attestation
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "platform_identity_id" uuid REFERENCES "platform_identities"("id");
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "attestation_level" text DEFAULT 'none';

-- Bot API keys table
CREATE TABLE IF NOT EXISTS "bot_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "label" text,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Platform identities table
CREATE TABLE IF NOT EXISTS "platform_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "platform" text NOT NULL,
  "platform_user_id" text NOT NULL,
  "platform_username" text,
  "user_id" uuid REFERENCES "users"("id"),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "unclaimed_attendance_count" integer DEFAULT 0 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "linked_at" timestamp with time zone,
  UNIQUE("platform", "platform_user_id", "group_id")
);
