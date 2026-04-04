-- Migration 0019: Add contribution_type enum and make groupId nullable on contributions
-- Supports published work (personal, no group) and three-tier contribution classification

-- Create the enum
CREATE TYPE "work_contribution_type" AS ENUM ('collaborative', 'published_work', 'solo_self_report');

-- Add contribution_type column with default
ALTER TABLE "contributions" ADD COLUMN "contribution_type" "work_contribution_type" NOT NULL DEFAULT 'solo_self_report';

-- Make group_id nullable (supports personal contributions without a group)
ALTER TABLE "contributions" ALTER COLUMN "group_id" DROP NOT NULL;

-- Backfill existing rows: if they have collaborators, mark collaborative; if evidence only, published_work
UPDATE "contributions" c
SET "contribution_type" = CASE
  WHEN EXISTS (SELECT 1 FROM "contribution_members" cm WHERE cm."contribution_id" = c."id") THEN 'collaborative'::work_contribution_type
  WHEN c."evidence_url" IS NOT NULL THEN 'published_work'::work_contribution_type
  ELSE 'solo_self_report'::work_contribution_type
END;
