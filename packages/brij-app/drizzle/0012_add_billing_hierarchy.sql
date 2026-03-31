-- Billing hierarchy: organizations, org_memberships, user_plans + vendor-agnostic billing fields

CREATE TYPE "public"."billing_provider" AS ENUM('stripe', 'lemonsqueezy', 'manual');

-- Organizations: pure billing containers (no permissions, no member access)
CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "tier" "community_plan_tier" DEFAULT 'free' NOT NULL,
  "group_quota" integer DEFAULT 10 NOT NULL,
  "billing_provider" "billing_provider",
  "billing_customer_id" text,
  "billing_subscription_id" text,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

-- Org memberships: links orgs to groups for billing coverage (billing_active = covered)
CREATE TABLE "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "billing_active" boolean DEFAULT true NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "org_memberships_org_id_group_id_unique" UNIQUE("org_id", "group_id"),
  CONSTRAINT "org_memberships_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "org_memberships_group_id_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action
);

-- User plans: individual billing (same tier system, vendor-agnostic)
CREATE TABLE "user_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "tier" "community_plan_tier" DEFAULT 'free' NOT NULL,
  "billing_provider" "billing_provider",
  "billing_customer_id" text,
  "billing_subscription_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_plans_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "user_plans_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

-- Add vendor-agnostic billing columns to existing community_plans
ALTER TABLE "community_plans" ADD COLUMN "billing_provider" "billing_provider";
ALTER TABLE "community_plans" ADD COLUMN "billing_customer_id" text;
ALTER TABLE "community_plans" ADD COLUMN "billing_subscription_id" text;
