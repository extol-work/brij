-- Bot API tier system + voting/governance tables
-- Adds tier columns to bot_api_keys, keys_issued_count to groups,
-- and creates proposals, proposal_options, votes tables.
-- Drops legacy governance proposals table (0 rows, old schema).

-- === Drop legacy proposals table + enums ===

DROP TABLE IF EXISTS "proposals" CASCADE;
DROP TYPE IF EXISTS "proposal_type";
DROP TYPE IF EXISTS "proposal_status";

-- === New enums ===

CREATE TYPE "bot_api_key_tier" AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE "proposal_type" AS ENUM ('yes_no', 'multiple_choice');
CREATE TYPE "proposal_mode" AS ENUM ('quick', 'formal');
CREATE TYPE "proposal_status" AS ENUM ('active', 'decided', 'tied', 'inconclusive');

-- === Bot API key tier columns ===

ALTER TABLE "bot_api_keys" ADD COLUMN "tier" "bot_api_key_tier" NOT NULL DEFAULT 'free';
ALTER TABLE "bot_api_keys" ADD COLUMN "daily_request_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "bot_api_keys" ADD COLUMN "daily_request_reset" timestamp with time zone;
ALTER TABLE "bot_api_keys" ADD COLUMN "rate_limit" integer NOT NULL DEFAULT 30;

-- === Groups: anti-gaming counter for key provisioning ===

ALTER TABLE "groups" ADD COLUMN "keys_issued_count" integer NOT NULL DEFAULT 0;

-- === Proposals ===

CREATE TABLE "proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id"),
  "created_by_platform_identity_id" uuid REFERENCES "platform_identities"("id"),
  "title" text NOT NULL,
  "context" text,
  "type" "proposal_type" NOT NULL,
  "mode" "proposal_mode" NOT NULL DEFAULT 'formal',
  "status" "proposal_status" NOT NULL DEFAULT 'active',
  "voting_period_hours" integer NOT NULL DEFAULT 120,
  "quorum" numeric(3,2),
  "closes_at" timestamp with time zone NOT NULL,
  "result" text,
  "decided_at" timestamp with time zone,
  "attestation_status" text DEFAULT 'none',
  "tx_signature" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- === Proposal Options ===

CREATE TABLE "proposal_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0
);

-- === Votes ===

CREATE TABLE "votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "option_id" uuid NOT NULL REFERENCES "proposal_options"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "platform_identity_id" uuid REFERENCES "platform_identities"("id"),
  "reasoning" text,
  "cast_at" timestamp with time zone DEFAULT now() NOT NULL,
  "changed_at" timestamp with time zone,
  UNIQUE("proposal_id", "user_id"),
  UNIQUE("proposal_id", "platform_identity_id")
);

-- === RLS ===
-- Every new table gets RLS enabled. No exceptions.

ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposal_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
