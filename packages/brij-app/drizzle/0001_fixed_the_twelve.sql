-- Catch-up migration: documents all schema changes applied directly to DB
-- between initial scaffold (0000) and this point. All statements are
-- idempotent (IF NOT EXISTS) since these already exist in production.

-- Enums
DO $$ BEGIN CREATE TYPE "public"."attendance_role" AS ENUM('participant', 'coordinator'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."billing_provider" AS ENUM('stripe', 'lemonsqueezy', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Bot API tables
CREATE TABLE IF NOT EXISTS "bot_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "label" text,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform" text NOT NULL,
  "platform_user_id" text NOT NULL,
  "platform_username" text,
  "user_id" uuid,
  "group_id" uuid NOT NULL,
  "unclaimed_attendance_count" integer DEFAULT 0 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "linked_at" timestamp with time zone,
  CONSTRAINT "platform_identities_platform_platform_user_id_group_id_unique" UNIQUE("platform","platform_user_id","group_id")
);--> statement-breakpoint

-- Billing tables
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "tier" "community_plan_tier" DEFAULT 'free' NOT NULL,
  "group_quota" integer DEFAULT 10 NOT NULL,
  "billing_provider" "billing_provider",
  "billing_customer_id" text,
  "billing_subscription_id" text,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "billing_active" boolean DEFAULT true NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "org_memberships_org_id_group_id_unique" UNIQUE("org_id","group_id")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "tier" "community_plan_tier" DEFAULT 'free' NOT NULL,
  "billing_provider" "billing_provider",
  "billing_customer_id" text,
  "billing_subscription_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_plans_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint

-- Bot API columns on existing tables
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "platform_event_id" text;--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "platform_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "attestation_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "role" "attendance_role" DEFAULT 'participant' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "cover_image_url" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "platform" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "platform_guild_id" text;--> statement-breakpoint

-- Billing columns on community_plans
ALTER TABLE "community_plans" ADD COLUMN IF NOT EXISTS "billing_provider" "billing_provider";--> statement-breakpoint
ALTER TABLE "community_plans" ADD COLUMN IF NOT EXISTS "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "community_plans" ADD COLUMN IF NOT EXISTS "billing_subscription_id" text;--> statement-breakpoint

-- Foreign keys (skip if exists)
DO $$ BEGIN ALTER TABLE "bot_api_keys" ADD CONSTRAINT "bot_api_keys_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bot_api_keys" ADD CONSTRAINT "bot_api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "platform_identities" ADD CONSTRAINT "platform_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "platform_identities" ADD CONSTRAINT "platform_identities_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "attendances" ADD CONSTRAINT "attendances_platform_identity_id_platform_identities_id_fk" FOREIGN KEY ("platform_identity_id") REFERENCES "public"."platform_identities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Unique constraint on groups.join_code
ALTER TABLE "groups" ADD CONSTRAINT "groups_join_code_unique" UNIQUE ("join_code");
