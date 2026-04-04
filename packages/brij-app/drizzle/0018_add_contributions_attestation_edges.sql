-- Migration 0018: Contributions + Peer Attestation + Attestation Edges
-- Renames old event-scoped contributions table, creates new group-scoped
-- contributions system with collaborator tracking and materialized attestation graph.

-- 1. Rename old contributions table (preserves 3 existing rows)
ALTER TABLE contributions RENAME TO event_contributions;

-- 2. New contributions table: group-scoped work contributions
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  evidence_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  attestation_status TEXT DEFAULT 'none', -- 'none' | 'pending' | 'confirmed' | 'failed'
  tx_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Contribution members: collaborator tagging + confirmation
CREATE TABLE contribution_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  UNIQUE(contribution_id, user_id)
);

-- 4. Attestation edges: materialized graph for weight calculations
-- Populated at event-close (co_attendance) and on peer attestation confirmation
CREATE TABLE attestation_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  attestor_id UUID NOT NULL REFERENCES users(id),
  subject_id UUID NOT NULL REFERENCES users(id),
  edge_type TEXT NOT NULL, -- 'co_attendance', 'peer_witness', 'contribution_confirmation'
  source_id UUID NOT NULL, -- activity ID or contribution ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attestor_id, subject_id, edge_type, source_id)
);

-- 5. RLS on all new tables
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attestation_edges ENABLE ROW LEVEL SECURITY;

-- 6. Indexes for common query patterns
CREATE INDEX idx_contributions_group ON contributions(group_id);
CREATE INDEX idx_contributions_created_by ON contributions(created_by);
CREATE INDEX idx_contribution_members_user ON contribution_members(user_id);
CREATE INDEX idx_attestation_edges_group ON attestation_edges(group_id);
CREATE INDEX idx_attestation_edges_subject ON attestation_edges(subject_id);
CREATE INDEX idx_attestation_edges_attestor ON attestation_edges(attestor_id);
