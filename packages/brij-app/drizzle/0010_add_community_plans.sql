-- Community plans table for tier-based limits and attestation routing
-- Tiers: free (brij default), starter, team, organization, league (Extol paid tiers)

CREATE TYPE "community_plan_tier" AS ENUM('free', 'starter', 'team', 'organization', 'league');

CREATE TABLE IF NOT EXISTS "community_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE UNIQUE,
  "tier" "community_plan_tier" DEFAULT 'free' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
