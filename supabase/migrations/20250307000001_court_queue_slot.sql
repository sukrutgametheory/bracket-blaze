-- Add one queued "up next" slot per court while preserving current active assignments.

ALTER TABLE bracket_blaze_matches
ADD COLUMN queued_court_id UUID REFERENCES bracket_blaze_courts(id),
ADD COLUMN queued_at TIMESTAMPTZ,
ADD COLUMN queued_by UUID REFERENCES auth.users(id),
ADD CONSTRAINT bracket_blaze_matches_active_or_queued_only
CHECK (court_id IS NULL OR queued_court_id IS NULL);

ALTER TABLE bracket_blaze_court_assignments
ADD COLUMN assignment_kind TEXT NOT NULL DEFAULT 'active';

UPDATE bracket_blaze_court_assignments
SET assignment_kind = 'active'
WHERE assignment_kind IS NULL;

CREATE UNIQUE INDEX idx_bracket_blaze_matches_one_active_per_court
ON bracket_blaze_matches(court_id)
WHERE court_id IS NOT NULL
  AND status IN ('ready', 'on_court', 'pending_signoff');

CREATE UNIQUE INDEX idx_bracket_blaze_matches_one_queue_per_court
ON bracket_blaze_matches(queued_court_id)
WHERE queued_court_id IS NOT NULL;

CREATE INDEX idx_bracket_blaze_matches_queued_court_status
ON bracket_blaze_matches(queued_court_id, status);

COMMENT ON COLUMN bracket_blaze_matches.queued_court_id IS 'Reserved next-up court slot for a match that is not yet actively assigned';
COMMENT ON COLUMN bracket_blaze_matches.queued_at IS 'When the match was placed into a court queue slot';
COMMENT ON COLUMN bracket_blaze_matches.queued_by IS 'User who placed the match into a court queue slot';
COMMENT ON COLUMN bracket_blaze_court_assignments.assignment_kind IS 'Whether the audit row represents an active assignment or queue reservation';
