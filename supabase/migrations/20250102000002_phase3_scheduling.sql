-- Phase 3: Add scheduling and match timing fields
-- Run this migration AFTER Phase 2 migrations

-- Add scheduling fields to divisions
ALTER TABLE bracket_blaze_divisions
ADD COLUMN scheduling_priority INTEGER DEFAULT 5,
ADD COLUMN scheduled_start_time TIMESTAMPTZ,
ADD COLUMN target_completion_time TIMESTAMPTZ;

-- Add timing and assignment fields to matches
ALTER TABLE bracket_blaze_matches
ADD COLUMN assigned_at TIMESTAMPTZ,
ADD COLUMN assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN actual_start_time TIMESTAMPTZ,
ADD COLUMN actual_end_time TIMESTAMPTZ,
ADD COLUMN estimated_duration_minutes INTEGER DEFAULT 30;

-- Create match conflicts table
CREATE TABLE bracket_blaze_match_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES bracket_blaze_matches(id) ON DELETE CASCADE,
    conflict_type TEXT NOT NULL, -- 'player_overlap', 'rest_violation', 'court_unavailable'
    severity TEXT NOT NULL, -- 'warning', 'error'
    details_json JSONB NOT NULL DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create court assignments audit log
CREATE TABLE bracket_blaze_court_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES bracket_blaze_matches(id) ON DELETE CASCADE,
    court_id UUID REFERENCES bracket_blaze_courts(id),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_bracket_blaze_match_conflicts_match
ON bracket_blaze_match_conflicts(match_id);

CREATE INDEX idx_bracket_blaze_match_conflicts_unresolved
ON bracket_blaze_match_conflicts(resolved_at)
WHERE resolved_at IS NULL;

CREATE INDEX idx_bracket_blaze_court_assignments_match
ON bracket_blaze_court_assignments(match_id);

CREATE INDEX idx_bracket_blaze_court_assignments_court
ON bracket_blaze_court_assignments(court_id);

CREATE INDEX idx_bracket_blaze_matches_status
ON bracket_blaze_matches(status);

CREATE INDEX idx_bracket_blaze_matches_court_status
ON bracket_blaze_matches(court_id, status);

-- Add helpful comments
COMMENT ON COLUMN bracket_blaze_divisions.scheduling_priority IS 'Higher priority divisions get courts assigned first (1-10, default 5)';
COMMENT ON COLUMN bracket_blaze_matches.assigned_at IS 'When match was assigned to a court';
COMMENT ON COLUMN bracket_blaze_matches.actual_start_time IS 'When referee started scoring (not scheduled time)';
COMMENT ON COLUMN bracket_blaze_matches.actual_end_time IS 'When match was completed and signed off';
COMMENT ON TABLE bracket_blaze_match_conflicts IS 'Tracks detected conflicts with TD overrides';
COMMENT ON TABLE bracket_blaze_court_assignments IS 'Audit log of all court assignments and reassignments';
