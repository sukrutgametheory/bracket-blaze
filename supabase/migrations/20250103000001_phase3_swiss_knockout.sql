-- Phase 3 Part 2: Swiss + Knockout support
-- Adds match phase tracking, knockout bracket linkage, round-scoped standings,
-- and RLS policies for Phase 3 tables

-- Match phase tracking (swiss vs knockout)
ALTER TABLE bracket_blaze_matches
ADD COLUMN phase TEXT NOT NULL DEFAULT 'swiss'
    CHECK (phase IN ('swiss', 'knockout'));

-- Knockout bracket linkage (winner of this match feeds into next_match)
ALTER TABLE bracket_blaze_matches
ADD COLUMN next_match_id UUID REFERENCES bracket_blaze_matches(id),
ADD COLUMN next_match_side TEXT CHECK (next_match_side IN ('A', 'B'));

-- Round tracking on standings (enables per-round snapshots)
ALTER TABLE bracket_blaze_standings
ADD COLUMN round INTEGER NOT NULL DEFAULT 1;

-- Update unique constraint to include round
-- Old: UNIQUE(division_id, entry_id) — only one row per entry
-- New: UNIQUE(division_id, entry_id, round) — one row per entry per round
ALTER TABLE bracket_blaze_standings
DROP CONSTRAINT bracket_blaze_standings_division_id_entry_id_key;

ALTER TABLE bracket_blaze_standings
ADD CONSTRAINT bracket_blaze_standings_division_entry_round_key
    UNIQUE (division_id, entry_id, round);

-- Index for phase-based queries
CREATE INDEX idx_bracket_blaze_matches_phase
ON bracket_blaze_matches(division_id, phase);

-- Index for bracket progression lookups
CREATE INDEX idx_bracket_blaze_matches_next_match
ON bracket_blaze_matches(next_match_id)
WHERE next_match_id IS NOT NULL;

-- RLS policies for match_conflicts (missing from Phase 3 Part 1)
ALTER TABLE bracket_blaze_match_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_conflicts_select"
    ON bracket_blaze_match_conflicts FOR SELECT
    USING (true);

CREATE POLICY "match_conflicts_insert"
    ON bracket_blaze_match_conflicts FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "match_conflicts_update"
    ON bracket_blaze_match_conflicts FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- RLS policies for court_assignments
ALTER TABLE bracket_blaze_court_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "court_assignments_select"
    ON bracket_blaze_court_assignments FOR SELECT
    USING (true);

CREATE POLICY "court_assignments_insert"
    ON bracket_blaze_court_assignments FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "court_assignments_update"
    ON bracket_blaze_court_assignments FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Comments
COMMENT ON COLUMN bracket_blaze_matches.phase IS 'Tournament phase: swiss or knockout';
COMMENT ON COLUMN bracket_blaze_matches.next_match_id IS 'Knockout bracket: match the winner advances to';
COMMENT ON COLUMN bracket_blaze_matches.next_match_side IS 'Knockout bracket: which side (A or B) the winner fills in the next match';
COMMENT ON COLUMN bracket_blaze_standings.round IS 'Swiss round number this standings snapshot is for';
