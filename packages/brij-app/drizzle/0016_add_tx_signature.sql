-- Add tx_signature to activities table
-- Stores Solana transaction signature once attestation is confirmed on-chain
ALTER TABLE "activities" ADD COLUMN "tx_signature" text;
