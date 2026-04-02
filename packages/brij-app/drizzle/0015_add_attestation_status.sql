-- Add attestation_status to activities table
-- Tracks on-chain confirmation state: none → pending → confirmed | failed
ALTER TABLE "activities" ADD COLUMN "attestation_status" text DEFAULT 'none';
