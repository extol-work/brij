-- Add invited_by column to group_memberships
-- Distinguishes coordinator-invited members (who need to accept) from self-requested pending members
ALTER TABLE "group_memberships" ADD COLUMN "invited_by" uuid REFERENCES "users"("id");
