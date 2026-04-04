-- Migration 0020: Add coordinator role mapping + platform initiator for activities
-- Enables Discord role-based coordinator access and tracks who initiated bot-created activities

-- Bot API keys: which Discord roles grant coordinator access
ALTER TABLE bot_api_keys ADD COLUMN coordinator_role_ids jsonb;

-- Activities: track which platform identity initiated a bot-created activity
ALTER TABLE activities ADD COLUMN created_by_platform_identity_id uuid REFERENCES platform_identities(id);
