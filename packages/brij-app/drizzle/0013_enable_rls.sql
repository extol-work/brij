-- Enable Row Level Security on ALL public tables.
-- We use Auth.js (not Supabase Auth), so all DB access goes through
-- Next.js API routes with the service_role key (which bypasses RLS).
-- Enabling RLS with no policies locks out the anon key completely.

-- Auth.js tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;

-- Group & membership
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;

-- Activity & attendance
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Contributions & attestations
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_attestations ENABLE ROW LEVEL SECURITY;

-- Financial
ALTER TABLE expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_confirmations ENABLE ROW LEVEL SECURITY;

-- Bot & platform integration (sensitive credentials / PII-adjacent)
ALTER TABLE bot_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_identities ENABLE ROW LEVEL SECURITY;

-- Billing & plans
ALTER TABLE community_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

-- Milestones
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
