-- EXT-145: Add track + entity metadata to groups
-- Tracks determine product variant (governance-only vs credit economy vs full economic)
-- Entity metadata captures legal/organizational structure

-- Create enums
CREATE TYPE "track" AS ENUM ('governance_only', 'credit_economy', 'full_economic');
CREATE TYPE "entity_type" AS ENUM ('informal', 'una', 'duna', 'nonprofit_corp', 'llc', 'fiscal_sponsored');
CREATE TYPE "tax_exempt_status" AS ENUM ('501c3', '501c4', '501c6', '501c7', 'pending', 'none');

-- Add columns to groups
ALTER TABLE "groups" ADD COLUMN "track" "track" NOT NULL DEFAULT 'governance_only';
ALTER TABLE "groups" ADD COLUMN "entity_type" "entity_type";
ALTER TABLE "groups" ADD COLUMN "ein" text;
ALTER TABLE "groups" ADD COLUMN "tax_exempt_status" "tax_exempt_status";
ALTER TABLE "groups" ADD COLUMN "state_of_incorporation" text;
ALTER TABLE "groups" ADD COLUMN "fiscal_sponsor_id" uuid REFERENCES "organizations"("id");
